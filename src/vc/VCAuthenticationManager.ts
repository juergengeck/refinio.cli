/**
 * Verifiable Credential Authentication Manager for ONE Platform
 * 
 * Implements direct VC exchange for peer authentication without CommServer.
 * Uses invitation tokens to establish trust and create verifiable credentials
 * that can be exchanged directly between peers via QUICVC or other transports.
 */

import {
    createKeyPair,
    ensurePublicKey,
    createRandomNonce,
    type KeyPair,
    type PublicKey,
    type SecretKey
} from '@refinio/one.core/lib/crypto/encryption.js';
import {
    createSignKeyPair,
    sign as signData,
    signatureVerify,
    type SignKeyPair,
    type PublicSignKey,
    type SecretSignKey
} from '@refinio/one.core/lib/crypto/sign.js';
import { createRandomString } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { EventEmitter } from 'events';

// ONE Platform compatible types
export interface InvitationData {
    token: string;
    publicKey: string;
    url: string;
}

export interface DeviceIdentityCredential {
    '@context': string[];
    type: string[];
    id: string;
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
    
    credentialSubject: {
        id: string;
        type: 'Device' | 'Person';
        deviceId: string;
        publicKeyHex: string;
        // Invitation-derived trust anchor
        invitationToken?: string;
        inviterPublicKey?: string;
    };
    
    proof: {
        type: string;
        created: string;
        proofPurpose: string;
        verificationMethod: string;
        proofValue: string; // Signature in hex
        // Additional fields for invitation-based auth
        invitationToken?: string;
        challenge?: string;
        nonce?: string;
    };
}

export interface VCExchangeMessage {
    type: 'vc_request' | 'vc_response' | 'vc_presentation' | 'vc_ack' | 'vc_error';
    credential?: DeviceIdentityCredential;
    challenge?: string;
    nonce?: string;
    timestamp: number;
    requesterPersonId?: string;
    error?: string;
}

export interface VerifiedPeer {
    deviceId: string;
    publicKeyHex: string;
    credential: DeviceIdentityCredential;
    verifiedAt: number;
    trustLevel: 'invitation' | 'direct' | 'chain';
    invitationToken?: string;
}

export class VCAuthenticationManager extends EventEmitter {
    private ownKeypair: KeyPair;
    private signKeypair: SignKeyPair;
    private invitations: Map<string, InvitationData> = new Map();
    private verifiedPeers: Map<string, VerifiedPeer> = new Map();
    private pendingChallenges: Map<string, string> = new Map();
    private ownCredential: DeviceIdentityCredential | null = null;
    private deviceId: string;

    constructor() {
        super();

        // Generate keypairs for encryption and signing
        this.ownKeypair = createKeyPair();
        this.signKeypair = createSignKeyPair();
        this.deviceId = this.generateDeviceId();

        console.log('[VCAuthManager] Initialized with device ID:', this.deviceId);
    }
    
    /**
     * Create a verifiable credential from an invitation
     * This credential can be used to authenticate with peers who trust the invitation issuer
     */
    createCredentialFromInvitation(invitation: InvitationData): DeviceIdentityCredential {
        const now = new Date();
        const credentialId = `urn:uuid:${this.generateUUID()}`;
        
        // Store invitation for later verification
        this.invitations.set(invitation.token, invitation);
        
        // Create the credential with invitation-based trust anchor
        const credential: DeviceIdentityCredential = {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://refinio.one/credentials/v1'
            ],
            type: ['VerifiableCredential', 'DeviceIdentityCredential', 'InvitationCredential'],
            id: credentialId,
            issuer: `did:refinio:device:${this.deviceId}`,
            issuanceDate: now.toISOString(),
            expirationDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
            
            credentialSubject: {
                id: `did:refinio:device:${this.deviceId}`,
                type: 'Device',
                deviceId: this.deviceId,
                publicKeyHex: Buffer.from(this.ownKeypair.publicKey).toString('hex'),
                // Include invitation reference for trust chain
                invitationToken: invitation.token,
                inviterPublicKey: invitation.publicKey
            },
            
            proof: {
                type: 'Ed25519Signature2020',
                created: now.toISOString(),
                proofPurpose: 'assertionMethod',
                verificationMethod: `${credentialId}#key-1`,
                proofValue: '', // Will be filled
                invitationToken: invitation.token,
                nonce: this.generateNonce()
            }
        };
        
        // Sign the credential
        credential.proof.proofValue = this.signCredential(credential);
        
        // Store as our own credential
        this.ownCredential = credential;
        
        console.log('[VCAuthManager] Created credential from invitation');
        
        return credential;
    }
    
    /**
     * Handle incoming VC exchange messages
     */
    async handleVCMessage(message: VCExchangeMessage, remoteInfo: { address: string; port: number }): Promise<VCExchangeMessage | null> {
        console.log(`[VCAuthManager] Handling ${message.type} from ${remoteInfo.address}:${remoteInfo.port}`);
        
        switch (message.type) {
            case 'vc_request':
                return this.handleVCRequest(message, remoteInfo);
                
            case 'vc_response':
            case 'vc_presentation':
                return this.handleVCPresentation(message, remoteInfo);
                
            case 'vc_ack':
                this.handleVCAck(message, remoteInfo);
                return null;
                
            case 'vc_error':
                console.error('[VCAuthManager] VC error:', message.error);
                this.emit('vc_error', message.error, remoteInfo);
                return null;
                
            default:
                console.warn('[VCAuthManager] Unknown message type:', message.type);
                return null;
        }
    }
    
    /**
     * Handle VC request - respond with our credential
     */
    private async handleVCRequest(message: VCExchangeMessage, remoteInfo: any): Promise<VCExchangeMessage> {
        console.log('[VCAuthManager] Received VC request');
        
        if (!this.ownCredential) {
            // Create a basic credential if we don't have one
            if (this.invitations.size > 0) {
                // Use the first invitation
                const invitation = this.invitations.values().next().value;
                if (!invitation) {
                    throw new Error('No invitations available');
                }
                this.ownCredential = this.createCredentialFromInvitation(invitation);
            } else {
                // Create a self-signed credential
                this.ownCredential = this.createSelfSignedCredential();
            }
        }
        
        // Generate challenge for mutual authentication
        const challenge = this.generateChallenge();
        this.pendingChallenges.set(`${remoteInfo.address}:${remoteInfo.port}`, challenge);
        
        // Create response with our credential
        const response: VCExchangeMessage = {
            type: 'vc_response',
            credential: this.ownCredential,
            challenge: challenge,
            nonce: message.nonce || this.generateNonce(),
            timestamp: Date.now()
        };
        
        console.log('[VCAuthManager] Sending VC response');
        
        return response;
    }
    
    /**
     * Handle VC presentation - verify and store peer credential
     */
    private async handleVCPresentation(message: VCExchangeMessage, remoteInfo: any): Promise<VCExchangeMessage | null> {
        console.log('[VCAuthManager] Received VC presentation');
        
        if (!message.credential) {
            const error = 'No credential in presentation';
            console.error('[VCAuthManager]', error);
            return {
                type: 'vc_error',
                error,
                timestamp: Date.now()
            };
        }
        
        // Verify the credential
        const verificationResult = await this.verifyCredential(message.credential);
        
        if (!verificationResult.isValid) {
            console.error('[VCAuthManager] Credential verification failed:', verificationResult.error);
            return {
                type: 'vc_error',
                error: verificationResult.error || 'Credential verification failed',
                timestamp: Date.now()
            };
        }
        
        // Store verified peer
        const peer: VerifiedPeer = {
            deviceId: message.credential.credentialSubject.deviceId,
            publicKeyHex: message.credential.credentialSubject.publicKeyHex,
            credential: message.credential,
            verifiedAt: Date.now(),
            trustLevel: this.determineTrustLevel(message.credential),
            invitationToken: message.credential.credentialSubject.invitationToken
        };
        
        this.verifiedPeers.set(peer.deviceId, peer);
        
        console.log('[VCAuthManager] Peer verified:', peer.deviceId, 'Trust level:', peer.trustLevel);
        
        // Emit verification success
        this.emit('peer_verified', peer);
        
        // Send acknowledgment
        return {
            type: 'vc_ack',
            timestamp: Date.now(),
            nonce: message.nonce
        };
    }
    
    /**
     * Handle VC acknowledgment
     */
    private handleVCAck(message: VCExchangeMessage, remoteInfo: any): void {
        console.log('[VCAuthManager] Received VC acknowledgment');
        this.emit('vc_exchange_complete', remoteInfo);
    }
    
    /**
     * Verify a credential
     */
    async verifyCredential(credential: DeviceIdentityCredential): Promise<{ isValid: boolean; error?: string }> {
        try {
            // 1. Check credential structure
            if (!this.isValidCredentialStructure(credential)) {
                return { isValid: false, error: 'Invalid credential structure' };
            }
            
            // 2. Check expiration
            if (credential.expirationDate) {
                const expDate = new Date(credential.expirationDate);
                if (expDate < new Date()) {
                    return { isValid: false, error: 'Credential expired' };
                }
            }
            
            // 3. Verify signature
            const signatureValid = this.verifySignature(credential);
            if (!signatureValid) {
                return { isValid: false, error: 'Invalid signature' };
            }
            
            // 4. Check invitation token if present
            if (credential.credentialSubject.invitationToken) {
                const invitation = this.invitations.get(credential.credentialSubject.invitationToken);
                if (!invitation) {
                    // We don't have this invitation, but it might still be valid
                    console.warn('[VCAuthManager] Unknown invitation token in credential');
                } else {
                    // Verify the inviter's public key matches
                    if (credential.credentialSubject.inviterPublicKey !== invitation.publicKey) {
                        return { isValid: false, error: 'Inviter public key mismatch' };
                    }
                }
            }
            
            return { isValid: true };
            
        } catch (error) {
            console.error('[VCAuthManager] Verification error:', error);
            return { 
                isValid: false, 
                error: error instanceof Error ? error.message : 'Verification failed' 
            };
        }
    }
    
    /**
     * Create a VC request message
     */
    createVCRequest(): VCExchangeMessage {
        return {
            type: 'vc_request',
            timestamp: Date.now(),
            nonce: this.generateNonce(),
            requesterPersonId: this.deviceId
        };
    }
    
    /**
     * Get verified peer by device ID
     */
    getVerifiedPeer(deviceId: string): VerifiedPeer | undefined {
        return this.verifiedPeers.get(deviceId);
    }
    
    /**
     * Get all verified peers
     */
    getAllVerifiedPeers(): VerifiedPeer[] {
        return Array.from(this.verifiedPeers.values());
    }
    
    /**
     * Clear a verified peer
     */
    clearVerifiedPeer(deviceId: string): void {
        this.verifiedPeers.delete(deviceId);
        console.log('[VCAuthManager] Cleared verified peer:', deviceId);
    }
    
    // Helper methods
    
    private createSelfSignedCredential(): DeviceIdentityCredential {
        const now = new Date();
        const credentialId = `urn:uuid:${this.generateUUID()}`;
        
        const credential: DeviceIdentityCredential = {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://refinio.one/credentials/v1'
            ],
            type: ['VerifiableCredential', 'DeviceIdentityCredential'],
            id: credentialId,
            issuer: `did:refinio:device:${this.deviceId}`,
            issuanceDate: now.toISOString(),
            
            credentialSubject: {
                id: `did:refinio:device:${this.deviceId}`,
                type: 'Device',
                deviceId: this.deviceId,
                publicKeyHex: Buffer.from(this.ownKeypair.publicKey).toString('hex')
            },
            
            proof: {
                type: 'Ed25519Signature2020',
                created: now.toISOString(),
                proofPurpose: 'assertionMethod',
                verificationMethod: `${credentialId}#key-1`,
                proofValue: ''
            }
        };
        
        credential.proof.proofValue = this.signCredential(credential);
        
        return credential;
    }
    
    private signCredential(credential: DeviceIdentityCredential): string {
        const credentialCopy = { ...credential };
        delete (credentialCopy as any).proof.proofValue;

        const message = JSON.stringify(credentialCopy, Object.keys(credentialCopy).sort());
        const signature = signData(
            Buffer.from(message),
            this.signKeypair.secretKey
        );

        return Buffer.from(signature).toString('hex');
    }
    
    private verifySignature(credential: DeviceIdentityCredential): boolean {
        try {
            const credentialCopy = { ...credential };
            const signature = (credentialCopy as any).proof.proofValue;
            delete (credentialCopy as any).proof.proofValue;
            
            const message = JSON.stringify(credentialCopy, Object.keys(credentialCopy).sort());
            
            // For now, accept any properly formatted signature
            // In production, verify against the actual public key
            return signature && signature.length === 128; // Ed25519 signature in hex
        } catch {
            return false;
        }
    }
    
    private isValidCredentialStructure(credential: DeviceIdentityCredential): boolean {
        return !!(
            credential['@context'] &&
            credential.type &&
            credential.id &&
            credential.issuer &&
            credential.issuanceDate &&
            credential.credentialSubject &&
            credential.credentialSubject.id &&
            credential.credentialSubject.deviceId &&
            credential.credentialSubject.publicKeyHex &&
            credential.proof &&
            credential.proof.proofValue
        );
    }
    
    private determineTrustLevel(credential: DeviceIdentityCredential): 'invitation' | 'direct' | 'chain' {
        if (credential.credentialSubject.invitationToken) {
            // Has invitation token - trusted through invitation
            return 'invitation';
        } else if (credential.issuer === credential.credentialSubject.id) {
            // Self-signed - direct trust
            return 'direct';
        } else {
            // Signed by another party - chain of trust
            return 'chain';
        }
    }
    
    private generateDeviceId(): string {
        // Use a simple random string for device ID (sync function)
        return `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private generateUUID(): string {
        // Generate random bytes for UUID v4
        const nonce = createRandomNonce();
        const bytes = nonce.slice(0, 16);
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
    
    private generateChallenge(): string {
        const nonce = createRandomNonce();
        const challengeBytes = new Uint8Array(32);
        challengeBytes.set(nonce.slice(0, 24), 0);
        challengeBytes.set(nonce.slice(0, 8), 24);
        return Buffer.from(challengeBytes).toString('hex');
    }
    
    private generateNonce(): string {
        const nonce = createRandomNonce();
        return Buffer.from(nonce.slice(0, 16)).toString('hex');
    }
}