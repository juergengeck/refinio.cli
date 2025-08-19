/**
 * QUICVC Client with Direct VC Authentication
 * 
 * Implements QUIC with Verifiable Credentials for direct peer authentication
 * without requiring CommServer. Uses invitation tokens to establish trust.
 */

import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { VCAuthenticationManager, InvitationData, VCExchangeMessage } from '../vc/VCAuthenticationManager';

// Service types for ONE platform compatibility
enum NetworkServiceType {
    DISCOVERY_SERVICE = 1,
    HEARTBEAT_SERVICE = 4,
    VC_EXCHANGE_SERVICE = 7
}

export interface DirectAuthConnection {
    deviceId: string;
    address: string;
    port: number;
    socket: dgram.Socket | null;
    state: 'connecting' | 'authenticating' | 'authenticated' | 'ready' | 'closed';
    vcManager: VCAuthenticationManager;
    lastActivity: number;
}

export class QuicVCWithDirectAuth extends EventEmitter {
    private connections: Map<string, DirectAuthConnection> = new Map();
    private vcManager: VCAuthenticationManager;
    private invitation: InvitationData | null = null;
    
    constructor() {
        super();
        this.vcManager = new VCAuthenticationManager();
        
        // Set up VC manager event handlers
        this.vcManager.on('peer_verified', (peer) => {
            console.log('[QuicVCDirectAuth] Peer verified:', peer.deviceId);
            this.emit('peer_authenticated', peer);
        });
        
        this.vcManager.on('vc_exchange_complete', (remoteInfo) => {
            console.log('[QuicVCDirectAuth] VC exchange complete with', remoteInfo);
            this.emit('authentication_complete', remoteInfo);
        });
        
        this.vcManager.on('vc_error', (error, remoteInfo) => {
            console.error('[QuicVCDirectAuth] VC error:', error);
            this.emit('authentication_error', error, remoteInfo);
        });
    }
    
    /**
     * Set invitation for authentication
     */
    setInvitation(invitation: InvitationData): void {
        this.invitation = invitation;
        // Create credential from invitation
        this.vcManager.createCredentialFromInvitation(invitation);
        console.log('[QuicVCDirectAuth] Invitation set and credential created');
    }
    
    /**
     * Connect to a peer with direct VC authentication
     */
    async connectWithVCAuth(address: string, port: number = 49497): Promise<DirectAuthConnection> {
        console.log(`[QuicVCDirectAuth] Connecting to ${address}:${port} with VC authentication`);
        
        // Create UDP socket
        const socket = dgram.createSocket('udp4');
        
        // Create connection object
        const connection: DirectAuthConnection = {
            deviceId: `peer-${Date.now()}`,
            address,
            port,
            socket,
            state: 'connecting',
            vcManager: this.vcManager,
            lastActivity: Date.now()
        };
        
        // Set up socket handlers
        socket.on('message', (msg, rinfo) => {
            this.handleMessage(connection, msg, rinfo);
        });
        
        socket.on('error', (err) => {
            console.error('[QuicVCDirectAuth] Socket error:', err);
            this.emit('error', err);
        });
        
        socket.on('close', () => {
            console.log('[QuicVCDirectAuth] Socket closed');
            connection.state = 'closed';
            this.emit('close', connection.deviceId);
        });
        
        // Bind socket
        await new Promise<void>((resolve, reject) => {
            socket.bind(0, '0.0.0.0', () => {
                resolve();
            });
            socket.once('error', reject);
        });
        
        const localPort = socket.address().port;
        console.log(`[QuicVCDirectAuth] Socket bound to port ${localPort}`);
        
        // Store connection
        this.connections.set(connection.deviceId, connection);
        
        // Start authentication by sending VC request
        connection.state = 'authenticating';
        await this.sendVCRequest(connection);
        
        // Wait for authentication to complete
        await this.waitForAuthentication(connection);
        
        return connection;
    }
    
    /**
     * Send VC request to initiate authentication
     */
    private async sendVCRequest(connection: DirectAuthConnection): Promise<void> {
        const vcRequest = this.vcManager.createVCRequest();
        await this.sendVCMessage(connection, vcRequest);
        console.log('[QuicVCDirectAuth] Sent VC request');
    }
    
    /**
     * Send VC message
     */
    private async sendVCMessage(connection: DirectAuthConnection, message: VCExchangeMessage): Promise<void> {
        if (!connection.socket) {
            throw new Error('Socket not available');
        }
        
        // Encode message
        const messageData = Buffer.from(JSON.stringify(message));
        
        // Add service type byte for ONE platform compatibility
        const packet = Buffer.alloc(1 + messageData.length);
        packet[0] = NetworkServiceType.VC_EXCHANGE_SERVICE;
        messageData.copy(packet, 1);
        
        // Send packet
        return new Promise((resolve, reject) => {
            connection.socket!.send(packet, connection.port, connection.address, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    
    /**
     * Handle incoming messages
     */
    private async handleMessage(connection: DirectAuthConnection, data: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
        connection.lastActivity = Date.now();
        
        // Check service type
        const serviceType = data[0];
        const messageData = data.slice(1);
        
        console.log(`[QuicVCDirectAuth] Received service type ${serviceType} from ${rinfo.address}:${rinfo.port}`);
        
        switch (serviceType) {
            case NetworkServiceType.VC_EXCHANGE_SERVICE:
                await this.handleVCExchange(connection, messageData, rinfo);
                break;
                
            case NetworkServiceType.HEARTBEAT_SERVICE:
                this.handleHeartbeat(connection, messageData, rinfo);
                break;
                
            case NetworkServiceType.DISCOVERY_SERVICE:
                this.handleDiscovery(connection, messageData, rinfo);
                break;
                
            default:
                console.log('[QuicVCDirectAuth] Unknown service type:', serviceType);
                this.emit('data', connection.deviceId, messageData);
        }
    }
    
    /**
     * Handle VC exchange messages
     */
    private async handleVCExchange(connection: DirectAuthConnection, data: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
        try {
            const message = JSON.parse(data.toString()) as VCExchangeMessage;
            console.log(`[QuicVCDirectAuth] Handling VC message type: ${message.type}`);
            
            // Process through VC manager
            const response = await this.vcManager.handleVCMessage(message, rinfo);
            
            if (response) {
                // Send response
                await this.sendVCMessage(connection, response);
            }
            
            // Check if authentication is complete
            if (message.type === 'vc_ack' || message.type === 'vc_response') {
                const peer = this.vcManager.getAllVerifiedPeers().find(p => 
                    p.deviceId === message.credential?.credentialSubject.deviceId
                );
                
                if (peer) {
                    connection.deviceId = peer.deviceId;
                    connection.state = 'authenticated';
                    console.log('[QuicVCDirectAuth] Authentication successful with', peer.deviceId);
                    this.emit('authenticated', connection);
                    
                    // Move to ready state
                    connection.state = 'ready';
                    this.emit('ready', connection);
                }
            }
            
        } catch (error) {
            console.error('[QuicVCDirectAuth] Error handling VC exchange:', error);
        }
    }
    
    /**
     * Handle heartbeat messages
     */
    private handleHeartbeat(connection: DirectAuthConnection, data: Buffer, rinfo: dgram.RemoteInfo): void {
        console.log('[QuicVCDirectAuth] Received heartbeat');
        // Send heartbeat response
        this.sendHeartbeatResponse(connection);
    }
    
    /**
     * Handle discovery messages
     */
    private handleDiscovery(connection: DirectAuthConnection, data: Buffer, rinfo: dgram.RemoteInfo): void {
        console.log('[QuicVCDirectAuth] Received discovery message');
        this.emit('discovery', connection.deviceId, data);
    }
    
    /**
     * Send heartbeat response
     */
    private async sendHeartbeatResponse(connection: DirectAuthConnection): Promise<void> {
        if (!connection.socket) return;
        
        const response = JSON.stringify({
            type: 'heartbeat_response',
            timestamp: Date.now(),
            deviceId: connection.deviceId
        });
        
        const packet = Buffer.alloc(1 + Buffer.byteLength(response));
        packet[0] = NetworkServiceType.HEARTBEAT_SERVICE;
        Buffer.from(response).copy(packet, 1);
        
        connection.socket.send(packet, connection.port, connection.address);
    }
    
    /**
     * Wait for authentication to complete
     */
    private async waitForAuthentication(connection: DirectAuthConnection, timeout: number = 10000): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkAuth = () => {
                if (connection.state === 'authenticated' || connection.state === 'ready') {
                    resolve();
                } else if (connection.state === 'closed') {
                    reject(new Error('Connection closed during authentication'));
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Authentication timeout'));
                } else {
                    setTimeout(checkAuth, 100);
                }
            };
            
            checkAuth();
        });
    }
    
    /**
     * Send data to authenticated peer
     */
    async send(deviceId: string, data: any): Promise<void> {
        const connection = this.connections.get(deviceId);
        
        if (!connection) {
            throw new Error(`No connection to ${deviceId}`);
        }
        
        if (connection.state !== 'ready') {
            throw new Error(`Connection to ${deviceId} not ready (state: ${connection.state})`);
        }
        
        if (!connection.socket) {
            throw new Error('Socket not available');
        }
        
        const message = JSON.stringify(data);
        const packet = Buffer.from(message);
        
        return new Promise((resolve, reject) => {
            connection.socket!.send(packet, connection.port, connection.address, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    
    /**
     * Close connection
     */
    async close(deviceId: string): Promise<void> {
        const connection = this.connections.get(deviceId);
        
        if (!connection) return;
        
        connection.state = 'closed';
        
        if (connection.socket) {
            connection.socket.close();
            connection.socket = null;
        }
        
        this.connections.delete(deviceId);
        this.emit('close', deviceId);
        
        console.log('[QuicVCDirectAuth] Connection closed:', deviceId);
    }
    
    /**
     * Get all connections
     */
    getConnections(): DirectAuthConnection[] {
        return Array.from(this.connections.values());
    }
    
    /**
     * Get verified peers
     */
    getVerifiedPeers() {
        return this.vcManager.getAllVerifiedPeers();
    }
}