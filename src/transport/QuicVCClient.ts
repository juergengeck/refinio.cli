/**
 * QUICVC Client Implementation
 * 
 * Implements QUIC with Verifiable Credentials for local connections
 * Based on patterns from lama.electron's QuicVCConnectionManager
 */

import * as dgram from 'dgram';
import * as tweetnacl from 'tweetnacl';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

const debug = (msg: string, ...args: any[]) => {
    if (process.env.DEBUG?.includes('refinio:cli:quicvc')) {
        console.log(`[QuicVCClient] ${msg}`, ...args);
    }
};

// QUICVC packet types (from QuicVCConnectionManager)
export enum QuicVCPacketType {
    INITIAL = 0x00,      // Contains VC_INIT frame
    HANDSHAKE = 0x01,    // Contains VC_RESPONSE frame
    PROTECTED = 0x02,    // Regular data packets (encrypted)
    RETRY = 0x03         // Retry with different parameters
}

// QUICVC frame types
export enum QuicVCFrameType {
    VC_INIT = 0x10,      // Client credential presentation
    VC_RESPONSE = 0x11,  // Server credential response
    VC_ACK = 0x12,       // Acknowledge VC exchange
    STREAM = 0x08,       // Stream data (QUIC standard)
    ACK = 0x02,          // Acknowledgment (QUIC standard)
    HEARTBEAT = 0x20     // Custom heartbeat frame
}

export interface QuicVCCredential {
    id: string;
    type: string[];
    issuer: string;
    issuanceDate: string;
    credentialSubject: {
        id: string;
        deviceId: string;
        publicKeyHex: string;
        type: 'Device';
    };
    proof?: {
        type: string;
        created: string;
        proofPurpose: string;
        proofValue: string;
    };
}

export interface QuicVCConnection {
    deviceId: string;
    dcid: Uint8Array;    // Destination Connection ID
    scid: Uint8Array;    // Source Connection ID
    address: string;
    port: number;
    state: 'initial' | 'handshake' | 'established' | 'closed';
    nextPacketNumber: bigint;
    highestReceivedPacket: bigint;
    localVC: QuicVCCredential | null;
    remoteVC: any | null;
    challenge: string;
    keys: CryptoKeys | null;
    socket: dgram.Socket | null;
}

interface CryptoKeys {
    encryptionKey: Uint8Array;
    decryptionKey: Uint8Array;
    sendIV: Uint8Array;
    receiveIV: Uint8Array;
    sendHMAC: Uint8Array;
    receiveHMAC: Uint8Array;
}

export class QuicVCClient extends EventEmitter {
    private connections: Map<string, QuicVCConnection> = new Map();
    private readonly CONNECTION_ID_LENGTH = 16;
    private readonly QUICVC_VERSION = 0x00000001;
    private readonly QUICVC_PORT = 49497;
    private keypair: tweetnacl.BoxKeyPair | null = null;
    private signKeypair: tweetnacl.SignKeyPair | null = null;
    
    constructor() {
        super();
        this.generateKeypairs();
    }
    
    private generateKeypairs(): void {
        // Generate encryption keypair
        this.keypair = tweetnacl.box.keyPair();
        // Generate signing keypair
        this.signKeypair = tweetnacl.sign.keyPair();
        
        debug('Generated keypairs for QUICVC');
    }
    
    /**
     * Connect to a local QUICVC server
     */
    async connect(address: string = '127.0.0.1', port: number = this.QUICVC_PORT): Promise<QuicVCConnection> {
        console.log(`[QuicVCClient] Connecting to ${address}:${port} via QUICVC`);
        
        // Generate connection IDs
        const dcid = tweetnacl.randomBytes(this.CONNECTION_ID_LENGTH);
        const scid = tweetnacl.randomBytes(this.CONNECTION_ID_LENGTH);
        
        // Create UDP socket
        const socket = dgram.createSocket('udp4');
        
        // Create connection state
        const connection: QuicVCConnection = {
            deviceId: `local-${Date.now()}`,
            dcid,
            scid,
            address,
            port,
            state: 'initial',
            nextPacketNumber: 0n,
            highestReceivedPacket: -1n,
            localVC: this.createLocalCredential(),
            remoteVC: null,
            challenge: this.generateChallenge(),
            keys: null,
            socket
        };
        
        const connId = this.getConnectionId(dcid);
        this.connections.set(connId, connection);
        
        // Setup socket handlers
        socket.on('message', (msg, rinfo) => {
            this.handlePacket(connection, msg, rinfo);
        });
        
        socket.on('error', (err) => {
            console.error('[QuicVCClient] Socket error:', err);
            this.emit('error', err);
        });
        
        socket.on('close', () => {
            console.log('[QuicVCClient] Socket closed');
            connection.state = 'closed';
            this.emit('close', connection.deviceId);
        });
        
        // Bind socket to any available port
        await new Promise<void>((resolve, reject) => {
            socket.bind(0, '0.0.0.0', () => {
                resolve();
            });
            socket.once('error', reject);
        });
        
        const localPort = socket.address().port;
        console.log(`[QuicVCClient] Socket bound to port ${localPort}`);
        
        // Send initial packet
        await this.sendInitialPacket(connection);
        
        // Wait for handshake to complete
        await this.waitForHandshake(connection);
        
        return connection;
    }
    
    /**
     * Create a local credential for authentication
     */
    protected createLocalCredential(): QuicVCCredential {
        if (!this.keypair || !this.signKeypair) {
            throw new Error('Keypairs not generated');
        }
        
        const deviceId = `cli-${Date.now()}`;
        const publicKeyHex = Buffer.from(this.keypair.publicKey).toString('hex');
        
        const credential: QuicVCCredential = {
            id: `urn:uuid:${this.generateUUID()}`,
            type: ['VerifiableCredential', 'DeviceIdentityCredential'],
            issuer: 'did:refinio:cli',
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
                id: `did:refinio:device:${deviceId}`,
                deviceId,
                publicKeyHex,
                type: 'Device'
            }
        };
        
        // Sign the credential
        const message = JSON.stringify(credential.credentialSubject);
        const signature = tweetnacl.sign.detached(
            Buffer.from(message),
            this.signKeypair.secretKey
        );
        
        credential.proof = {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(),
            proofPurpose: 'assertionMethod',
            proofValue: Buffer.from(signature).toString('hex')
        };
        
        return credential;
    }
    
    /**
     * Send initial packet with credential
     */
    private async sendInitialPacket(connection: QuicVCConnection): Promise<void> {
        if (!connection.localVC) {
            throw new Error('No local credential available');
        }
        
        // Create VC_INIT frame
        const vcInitFrame = {
            type: QuicVCFrameType.VC_INIT,
            credential: connection.localVC,
            challenge: connection.challenge,
            timestamp: Date.now()
        };
        
        // Create initial packet
        const packet = this.createPacket(
            QuicVCPacketType.INITIAL,
            connection,
            JSON.stringify(vcInitFrame)
        );
        
        // Send packet
        await this.sendPacket(connection, packet);
        
        console.log(`[QuicVCClient] Sent INITIAL packet with VC_INIT frame`);
    }
    
    /**
     * Handle incoming packets
     */
    private async handlePacket(connection: QuicVCConnection, data: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
        try {
            // Parse packet header
            const header = this.parsePacketHeader(data);
            if (!header) {
                debug('Invalid packet header');
                return;
            }
            
            // Update activity
            connection.highestReceivedPacket = header.packetNumber;
            
            // Process packet based on type
            switch (header.type) {
                case QuicVCPacketType.INITIAL:
                    await this.handleInitialPacket(connection, data, header);
                    break;
                case QuicVCPacketType.HANDSHAKE:
                    await this.handleHandshakePacket(connection, data, header);
                    break;
                case QuicVCPacketType.PROTECTED:
                    await this.handleProtectedPacket(connection, data, header);
                    break;
                default:
                    debug(`Unknown packet type: ${header.type}`);
            }
        } catch (error) {
            console.error('[QuicVCClient] Error handling packet:', error);
        }
    }
    
    /**
     * Handle HANDSHAKE packet from server
     */
    private async handleHandshakePacket(connection: QuicVCConnection, data: Buffer, header: any): Promise<void> {
        const payload = this.extractPayload(data, header);
        const frame = JSON.parse(payload.toString());
        
        if (frame.type !== QuicVCFrameType.VC_RESPONSE) {
            debug('Expected VC_RESPONSE frame in HANDSHAKE packet');
            return;
        }
        
        console.log('[QuicVCClient] Received VC_RESPONSE from server');
        
        // Store remote credential
        connection.remoteVC = frame.credential;
        
        // Derive application keys
        connection.keys = await this.deriveApplicationKeys(connection);
        
        // Complete handshake
        connection.state = 'established';
        this.emit('connected', connection.deviceId);
        
        console.log('[QuicVCClient] QUICVC handshake complete');
        
        // Send ACK
        await this.sendAckPacket(connection);
    }
    
    /**
     * Send ACK packet
     */
    private async sendAckPacket(connection: QuicVCConnection): Promise<void> {
        const ackFrame = {
            type: QuicVCFrameType.VC_ACK,
            timestamp: Date.now()
        };
        
        const packet = this.createPacket(
            QuicVCPacketType.PROTECTED,
            connection,
            JSON.stringify([ackFrame])
        );
        
        await this.sendPacket(connection, packet);
        debug('Sent VC_ACK');
    }
    
    /**
     * Handle protected (encrypted) packets
     */
    private async handleProtectedPacket(connection: QuicVCConnection, data: Buffer, header: any): Promise<void> {
        if (connection.state !== 'established' || !connection.keys) {
            debug('Cannot handle protected packet - connection not established');
            return;
        }
        
        // Extract and parse payload (simplified - no encryption for now)
        const payload = this.extractPayload(data, header);
        
        try {
            const frames = JSON.parse(payload.toString());
            
            for (const frame of frames) {
                switch (frame.type) {
                    case QuicVCFrameType.HEARTBEAT:
                        debug('Received heartbeat');
                        await this.sendHeartbeatResponse(connection);
                        break;
                    case QuicVCFrameType.STREAM:
                        this.emit('data', connection.deviceId, frame.data);
                        break;
                    case QuicVCFrameType.ACK:
                        debug('Received ACK');
                        break;
                }
            }
        } catch (error) {
            debug('Failed to parse protected packet frames:', error);
        }
    }
    
    /**
     * Send heartbeat response
     */
    private async sendHeartbeatResponse(connection: QuicVCConnection): Promise<void> {
        const heartbeatFrame = {
            type: QuicVCFrameType.HEARTBEAT,
            timestamp: Date.now(),
            sequence: Number(connection.nextPacketNumber)
        };
        
        await this.sendProtectedPacket(connection, [heartbeatFrame]);
        debug('Sent heartbeat response');
    }
    
    /**
     * Send data over established connection
     */
    async send(connectionId: string, data: any): Promise<void> {
        const connection = Array.from(this.connections.values())
            .find(c => c.deviceId === connectionId);
        
        if (!connection || connection.state !== 'established') {
            throw new Error(`No established connection: ${connectionId}`);
        }
        
        const streamFrame = {
            type: QuicVCFrameType.STREAM,
            streamId: 0,
            offset: 0,
            data: data
        };
        
        await this.sendProtectedPacket(connection, [streamFrame]);
    }
    
    /**
     * Send protected packet
     */
    private async sendProtectedPacket(connection: QuicVCConnection, frames: any[]): Promise<void> {
        const packet = this.createPacket(
            QuicVCPacketType.PROTECTED,
            connection,
            JSON.stringify(frames)
        );
        
        await this.sendPacket(connection, packet);
    }
    
    /**
     * Create packet with header
     */
    private createPacket(type: QuicVCPacketType, connection: QuicVCConnection, payload: string): Buffer {
        const header = {
            type,
            version: this.QUICVC_VERSION,
            dcid: connection.dcid,
            scid: connection.scid,
            packetNumber: connection.nextPacketNumber++
        };
        
        // Serialize header
        const headerBytes = this.serializeHeader(header);
        const payloadBytes = Buffer.from(payload);
        
        // Combine
        return Buffer.concat([headerBytes, payloadBytes]);
    }
    
    /**
     * Serialize packet header
     */
    private serializeHeader(header: any): Buffer {
        const buffer = Buffer.alloc(1 + 4 + 1 + 1 + header.dcid.length + header.scid.length + 8);
        let offset = 0;
        
        buffer.writeUInt8(header.type, offset++);
        buffer.writeUInt32BE(header.version, offset); offset += 4;
        buffer.writeUInt8(header.dcid.length, offset++);
        buffer.writeUInt8(header.scid.length, offset++);
        
        // Copy Uint8Array to Buffer
        Buffer.from(header.dcid).copy(buffer, offset);
        offset += header.dcid.length;
        
        Buffer.from(header.scid).copy(buffer, offset);
        offset += header.scid.length;
        
        buffer.writeBigUInt64BE(header.packetNumber, offset);
        
        return buffer;
    }
    
    /**
     * Parse packet header
     */
    private parsePacketHeader(data: Buffer): any {
        if (data.length < 15) return null;
        
        let offset = 0;
        
        const type = data.readUInt8(offset++);
        const version = data.readUInt32BE(offset); offset += 4;
        const dcidLen = data.readUInt8(offset++);
        const scidLen = data.readUInt8(offset++);
        
        if (data.length < offset + dcidLen + scidLen + 8) return null;
        
        const dcid = data.slice(offset, offset + dcidLen);
        offset += dcidLen;
        
        const scid = data.slice(offset, offset + scidLen);
        offset += scidLen;
        
        const packetNumber = data.readBigUInt64BE(offset);
        
        return { type, version, dcid, scid, packetNumber };
    }
    
    /**
     * Extract payload from packet
     */
    private extractPayload(data: Buffer, header: any): Buffer {
        const headerSize = 1 + 4 + 1 + 1 + header.dcid.length + header.scid.length + 8;
        return data.slice(headerSize);
    }
    
    /**
     * Send packet via UDP
     */
    private async sendPacket(connection: QuicVCConnection, packet: Buffer): Promise<void> {
        if (!connection.socket) {
            throw new Error('Socket not available');
        }
        
        return new Promise((resolve, reject) => {
            connection.socket!.send(packet, connection.port, connection.address, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    
    /**
     * Wait for handshake to complete
     */
    private async waitForHandshake(connection: QuicVCConnection, timeout: number = 5000): Promise<void> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (connection.state !== 'established') {
                    reject(new Error('Handshake timeout'));
                }
            }, timeout);
            
            const checkState = () => {
                if (connection.state === 'established') {
                    clearTimeout(timer);
                    resolve();
                } else if (connection.state === 'closed') {
                    clearTimeout(timer);
                    reject(new Error('Connection closed during handshake'));
                } else {
                    setTimeout(checkState, 100);
                }
            };
            
            checkState();
        });
    }
    
    /**
     * Derive application keys from credentials
     */
    protected async deriveApplicationKeys(connection: QuicVCConnection): Promise<CryptoKeys> {
        const salt = Buffer.from('quicvc-application-salt-v1');
        
        // Use public keys from credentials
        const info = Buffer.concat([
            Buffer.from(connection.localVC?.credentialSubject.publicKeyHex || ''),
            Buffer.from(connection.remoteVC?.credentialSubject?.publicKeyHex || '')
        ]);
        
        // Simple key derivation (should use proper HKDF)
        const combined = Buffer.concat([salt, info]);
        const hash1 = createHash('sha256').update(combined).digest();
        const hash2 = createHash('sha256').update(hash1).digest();
        const keyMaterial = Buffer.concat([hash1, hash2]).slice(0, 192);
        
        return {
            encryptionKey: new Uint8Array(keyMaterial.slice(0, 32)),
            decryptionKey: new Uint8Array(keyMaterial.slice(32, 64)),
            sendIV: new Uint8Array(keyMaterial.slice(64, 80)),
            receiveIV: new Uint8Array(keyMaterial.slice(80, 96)),
            sendHMAC: new Uint8Array(keyMaterial.slice(96, 128)),
            receiveHMAC: new Uint8Array(keyMaterial.slice(128, 160))
        };
    }
    
    /**
     * Handle INITIAL packet (server role)
     */
    private async handleInitialPacket(connection: QuicVCConnection, data: Buffer, header: any): Promise<void> {
        // Client doesn't typically receive INITIAL packets
        debug('Received unexpected INITIAL packet as client');
    }
    
    /**
     * Helper methods
     */
    
    private getConnectionId(dcid: Uint8Array): string {
        return Array.from(dcid).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    private generateChallenge(): string {
        return Buffer.from(tweetnacl.randomBytes(32)).toString('hex');
    }
    
    protected generateUUID(): string {
        const bytes = tweetnacl.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20, 32)
        ].join('-');
    }
    
    /**
     * Close connection
     */
    async close(connectionId: string): Promise<void> {
        const connection = Array.from(this.connections.values())
            .find(c => c.deviceId === connectionId);
        
        if (!connection) return;
        
        connection.state = 'closed';
        
        if (connection.socket) {
            connection.socket.close();
            connection.socket = null;
        }
        
        this.connections.delete(this.getConnectionId(connection.dcid));
        this.emit('close', connectionId);
    }
    
    /**
     * Close all connections
     */
    async closeAll(): Promise<void> {
        for (const connection of this.connections.values()) {
            await this.close(connection.deviceId);
        }
    }
}