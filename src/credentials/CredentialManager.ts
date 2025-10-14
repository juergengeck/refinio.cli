import '@refinio/one.core/lib/system/load-nodejs.js';
import { 
  createKeyPair,
  encrypt,
  decrypt
} from '@refinio/one.core/lib/crypto/encryption.js';
import {
  createSignKeyPair
} from '@refinio/one.core/lib/crypto/sign.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface InstanceCredential {
  alias: string;
  instanceUrl: string;  // QUIC URL of the ONE instance
  instanceId?: SHA256Hash;  // Instance ID (optional, discovered on first connect)
  personKeys: {
    personId: string;
    publicKey: string;
    privateKey: string;
    signPublicKey: string;
    signPrivateKey: string;
  };
  metadata?: {
    createdAt: number;
    lastUsed?: number;
    instanceName?: string;
    description?: string;
  };
}

export interface CredentialStore {
  version: string;
  defaultAlias?: string;
  credentials: Record<string, InstanceCredential>;  // Keyed by alias
  encrypted: boolean;
}

export class CredentialManager {
  private storePath: string;
  private masterKey: Uint8Array | null = null;
  private store: CredentialStore | null = null;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(os.homedir(), '.refinio', 'credentials.enc');
  }

  /**
   * Initialize the credential store with encryption
   */
  async initialize(masterPassword?: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });

    // Derive master key from password or use system key
    if (masterPassword) {
      this.masterKey = await this.deriveMasterKey(masterPassword);
    } else {
      this.masterKey = await this.getSystemKey();
    }

    // Load or create store
    try {
      await this.loadStore();
    } catch (error) {
      // Create new store if doesn't exist
      this.store = {
        version: '1.0.0',
        credentials: {},
        encrypted: true
      };
      await this.saveStore();
    }
  }

  /**
   * Derive master key from password using PBKDF2
   */
  private async deriveMasterKey(password: string): Promise<Uint8Array> {
    const salt = 'refinio-cli-credential-salt';  // In production, use random salt stored separately
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(new Uint8Array(derivedKey));
      });
    });
  }

  /**
   * Get system-specific key (for passwordless operation)
   */
  private async getSystemKey(): Promise<Uint8Array> {
    // Use machine ID or user-specific data
    const systemId = os.hostname() + os.userInfo().username;
    const hash = crypto.createHash('sha256').update(systemId).digest();
    return new Uint8Array(hash);
  }

  /**
   * Load and decrypt the credential store
   */
  private async loadStore(): Promise<void> {
    const data = await fs.readFile(this.storePath, 'utf-8');
    const parsed = JSON.parse(data);

    if (parsed.encrypted && this.masterKey) {
      // Decrypt the credentials
      const decrypted = await decrypt(
        Buffer.from(parsed.encryptedData, 'base64'),
        this.masterKey
      );
      this.store = JSON.parse(decrypted.toString());
    } else {
      this.store = parsed;
    }
  }

  /**
   * Encrypt and save the credential store
   */
  private async saveStore(): Promise<void> {
    if (!this.store) return;

    if (this.masterKey) {
      // Encrypt the store
      const storeJson = JSON.stringify(this.store);
      const encrypted = await encrypt(
        Buffer.from(storeJson),
        this.masterKey
      );

      const wrapper = {
        encrypted: true,
        encryptedData: encrypted.toString('base64')
      };

      await fs.writeFile(this.storePath, JSON.stringify(wrapper, null, 2));
    } else {
      // Save unencrypted (not recommended)
      await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2));
    }
  }

  /**
   * Add a new credential with an alias
   */
  async addCredential(
    alias: string,
    instanceUrl: string,
    personKeys: InstanceCredential['personKeys'],
    metadata?: Partial<InstanceCredential['metadata']>
  ): Promise<void> {
    if (!this.store) throw new Error('Store not initialized');

    if (this.store.credentials[alias]) {
      throw new Error(`Credential with alias '${alias}' already exists`);
    }

    const credential: InstanceCredential = {
      alias,
      instanceUrl,
      personKeys,
      metadata: {
        createdAt: Date.now(),
        ...metadata
      }
    };

    this.store.credentials[alias] = credential;

    // Set as default if it's the first credential
    if (Object.keys(this.store.credentials).length === 1) {
      this.store.defaultAlias = alias;
    }

    await this.saveStore();
  }

  /**
   * Get a credential by alias
   */
  async getCredential(alias?: string): Promise<InstanceCredential | null> {
    if (!this.store) throw new Error('Store not initialized');

    // Use provided alias or default
    const targetAlias = alias || this.store.defaultAlias;
    if (!targetAlias) {
      throw new Error('No alias provided and no default set');
    }

    const credential = this.store.credentials[targetAlias];
    if (!credential) {
      throw new Error(`No credential found for alias '${targetAlias}'`);
    }

    // Update last used timestamp
    if (credential.metadata) {
      credential.metadata.lastUsed = Date.now();
      await this.saveStore();
    }

    return credential;
  }

  /**
   * List all credential aliases
   */
  async listAliases(): Promise<Array<{
    alias: string;
    instanceUrl: string;
    isDefault: boolean;
    lastUsed?: number;
    description?: string;
  }>> {
    if (!this.store) throw new Error('Store not initialized');

    return Object.values(this.store.credentials).map(cred => ({
      alias: cred.alias,
      instanceUrl: cred.instanceUrl,
      isDefault: cred.alias === this.store!.defaultAlias,
      lastUsed: cred.metadata?.lastUsed,
      description: cred.metadata?.description
    }));
  }

  /**
   * Remove a credential
   */
  async removeCredential(alias: string): Promise<void> {
    if (!this.store) throw new Error('Store not initialized');

    if (!this.store.credentials[alias]) {
      throw new Error(`No credential found for alias '${alias}'`);
    }

    delete this.store.credentials[alias];

    // Update default if needed
    if (this.store.defaultAlias === alias) {
      const remaining = Object.keys(this.store.credentials);
      this.store.defaultAlias = remaining.length > 0 ? remaining[0] : undefined;
    }

    await this.saveStore();
  }

  /**
   * Set the default credential alias
   */
  async setDefault(alias: string): Promise<void> {
    if (!this.store) throw new Error('Store not initialized');

    if (!this.store.credentials[alias]) {
      throw new Error(`No credential found for alias '${alias}'`);
    }

    this.store.defaultAlias = alias;
    await this.saveStore();
  }

  /**
   * Generate new Person keys for a credential
   */
  async generatePersonKeys(email: string): Promise<InstanceCredential['personKeys']> {
    // Generate encryption keypair
    const encryptionKeys = await createKeyPair();
    
    // Generate signing keypair
    const signingKeys = await createSignKeyPair();

    // Create Person ID from public key
    const personData = {
      email,
      publicKey: encryptionKeys.publicKey,
      signPublicKey: signingKeys.publicKey
    };
    
    const personId = crypto
      .createHash('sha256')
      .update(JSON.stringify(personData))
      .digest('hex');

    return {
      personId,
      publicKey: Buffer.from(encryptionKeys.publicKey).toString('hex'),
      privateKey: Buffer.from(encryptionKeys.secretKey).toString('hex'),
      signPublicKey: Buffer.from(signingKeys.publicKey).toString('hex'),
      signPrivateKey: Buffer.from(signingKeys.secretKey).toString('hex')
    };
  }

  /**
   * Import existing Person keys
   */
  async importPersonKeys(keysPath: string): Promise<InstanceCredential['personKeys']> {
    const keysJson = await fs.readFile(keysPath, 'utf-8');
    const keys = JSON.parse(keysJson);

    // Validate required fields
    const required = ['personId', 'publicKey', 'privateKey', 'signPublicKey', 'signPrivateKey'];
    for (const field of required) {
      if (!keys[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return keys;
  }

  /**
   * Export a credential (without private keys by default)
   */
  async exportCredential(
    alias: string,
    includePrivateKeys: boolean = false
  ): Promise<string> {
    const credential = await this.getCredential(alias);
    if (!credential) {
      throw new Error(`No credential found for alias '${alias}'`);
    }

    const exported: any = {
      alias: credential.alias,
      instanceUrl: credential.instanceUrl,
      instanceId: credential.instanceId,
      personId: credential.personKeys.personId,
      publicKey: credential.personKeys.publicKey,
      signPublicKey: credential.personKeys.signPublicKey,
      metadata: credential.metadata
    };

    if (includePrivateKeys) {
      exported.privateKey = credential.personKeys.privateKey;
      exported.signPrivateKey = credential.personKeys.signPrivateKey;
    }

    return JSON.stringify(exported, null, 2);
  }
}