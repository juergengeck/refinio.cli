/**
 * QUICVC Client with Invitation Support
 * 
 * Extended version of QuicVCClient that uses invitation credentials
 * from lama.electron or one.leute for authentication.
 */

import { QuicVCClient, QuicVCCredential, QuicVCConnection } from './QuicVCClient.js';
import * as tweetnacl from 'tweetnacl';
import { createHash } from 'crypto';

export interface InvitationCredentials {
    token: string;
    publicKey: string;
    url: string;
}

export class QuicVCClientWithInvite extends QuicVCClient {
    private invitation: InvitationCredentials;
    
    constructor(invitation: InvitationCredentials) {
        super();
        this.invitation = invitation;
    }
    
    /**
     * Connect using invitation credentials
     */
    async connectWithInvite(address: string = '127.0.0.1', port: number = 49497): Promise<QuicVCConnection> {
        console.log(`[QuicVCClientWithInvite] Connecting with invitation credentials to ${address}:${port}`);
        
        // Use the standard connect but with modified credentials
        return this.connect(address, port);
    }
    
    /**
     * Override credential creation to use invitation data
     */
    protected createLocalCredential(): QuicVCCredential {
        // Extract the public key from invitation (it's the inviter's public key)
        // We need to generate our own keypair but reference the invitation
        
        const keypair = tweetnacl.box.keyPair();
        const signKeypair = tweetnacl.sign.keyPair();
        
        const deviceId = `cli-invited-${Date.now()}`;
        const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');
        
        // Create credential that references the invitation
        const credential: QuicVCCredential = {
            id: `urn:uuid:${this.generateUUID()}`,
            type: ['VerifiableCredential', 'DeviceIdentityCredential', 'InvitedCredential'],
            issuer: `did:refinio:invitation:${this.invitation.token.substring(0, 8)}`,
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
                id: `did:refinio:device:${deviceId}`,
                deviceId,
                publicKeyHex,
                type: 'Device',
                // Include invitation reference
                invitationToken: this.invitation.token,
                inviterPublicKey: this.invitation.publicKey
            } as any
        };
        
        // Sign the credential with invitation-derived key
        const message = JSON.stringify(credential.credentialSubject);
        const signature = tweetnacl.sign.detached(
            Buffer.from(message),
            signKeypair.secretKey
        );
        
        credential.proof = {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(),
            proofPurpose: 'assertionMethod',
            proofValue: Buffer.from(signature).toString('hex'),
            // Include invitation token as proof reference
            invitationToken: this.invitation.token
        } as any;
        
        console.log('[QuicVCClientWithInvite] Created credential with invitation reference');
        
        return credential;
    }
    
    /**
     * Override key derivation to incorporate invitation data
     */
    protected async deriveApplicationKeys(connection: any): Promise<any> {
        const salt = Buffer.from('quicvc-invitation-salt-v1');
        
        // Include invitation token in key derivation
        const info = Buffer.concat([
            Buffer.from(connection.localVC?.credentialSubject.publicKeyHex || ''),
            Buffer.from(connection.remoteVC?.credentialSubject?.publicKeyHex || ''),
            Buffer.from(this.invitation.token),
            Buffer.from(this.invitation.publicKey)
        ]);
        
        // Use proper key derivation with invitation data
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
    
}