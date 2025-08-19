import '@refinio/one.core/lib/system/load-nodejs.js';
import { 
  createEncryptionKeypair,
  createSigningKeypair,
  encrypt,
  decrypt
} from '@refinio/one.core';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Local credentials for connecting to ONE instances
 * Only stores connection info and keys, profiles are stored in the instance
 */
export interface LocalCredential {
  instanceUrl: string;
  personKeys: {
    personId: string;
    publicKey: string;
    privateKey: string;
    signPublicKey: string;
    signPrivateKey: string;
  };
  defaultProfileAlias?: string;  // Default profile to use for this instance
}

export class LocalCredentials {
  private storePath: string;
  private credentials: Map<string, LocalCredential> = new Map();
  private defaultInstance?: string;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(os.homedir(), '.refinio', 'connections.json');
  }

  async load(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      
      const data = await fs.readFile(this.storePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      this.credentials = new Map(Object.entries(parsed.credentials || {}));
      this.defaultInstance = parsed.defaultInstance;
    } catch (error) {
      // File doesn't exist, start fresh
      this.credentials = new Map();
    }
  }

  async save(): Promise<void> {
    const data = {
      version: '2.0.0',
      defaultInstance: this.defaultInstance,
      credentials: Object.fromEntries(this.credentials)
    };
    
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(data, null, 2));
  }

  /**
   * Add or update instance connection
   */
  async addInstance(
    instanceUrl: string,
    personKeys: LocalCredential['personKeys'],
    defaultProfileAlias?: string
  ): Promise<void> {
    this.credentials.set(instanceUrl, {
      instanceUrl,
      personKeys,
      defaultProfileAlias
    });
    
    // Set as default if it's the first
    if (this.credentials.size === 1) {
      this.defaultInstance = instanceUrl;
    }
    
    await this.save();
  }

  /**
   * Get instance connection info
   */
  getInstance(instanceUrl?: string): LocalCredential | null {
    const url = instanceUrl || this.defaultInstance;
    if (!url) return null;
    
    return this.credentials.get(url) || null;
  }

  /**
   * List all instances
   */
  listInstances(): Array<{ url: string; isDefault: boolean; hasProfile: boolean }> {
    return Array.from(this.credentials.entries()).map(([url, cred]) => ({
      url,
      isDefault: url === this.defaultInstance,
      hasProfile: !!cred.defaultProfileAlias
    }));
  }

  /**
   * Set default instance
   */
  async setDefaultInstance(instanceUrl: string): Promise<void> {
    if (!this.credentials.has(instanceUrl)) {
      throw new Error(`No connection found for instance: ${instanceUrl}`);
    }
    
    this.defaultInstance = instanceUrl;
    await this.save();
  }

  /**
   * Remove instance
   */
  async removeInstance(instanceUrl: string): Promise<void> {
    this.credentials.delete(instanceUrl);
    
    if (this.defaultInstance === instanceUrl) {
      const remaining = Array.from(this.credentials.keys());
      this.defaultInstance = remaining[0];
    }
    
    await this.save();
  }

  /**
   * Generate new Person keys
   */
  async generatePersonKeys(email: string): Promise<LocalCredential['personKeys']> {
    const encryptionKeys = await createEncryptionKeypair();
    const signingKeys = await createSigningKeypair();

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
      privateKey: Buffer.from(encryptionKeys.privateKey).toString('hex'),
      signPublicKey: Buffer.from(signingKeys.publicKey).toString('hex'),
      signPrivateKey: Buffer.from(signingKeys.privateKey).toString('hex')
    };
  }

  /**
   * Import existing Person keys
   */
  async importPersonKeys(keysPath: string): Promise<LocalCredential['personKeys']> {
    const keysJson = await fs.readFile(keysPath, 'utf-8');
    const keys = JSON.parse(keysJson);

    const required = ['personId', 'publicKey', 'privateKey', 'signPublicKey', 'signPrivateKey'];
    for (const field of required) {
      if (!keys[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return keys;
  }
}