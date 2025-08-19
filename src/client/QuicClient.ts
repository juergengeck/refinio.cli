import '@refinio/one.core/lib/system/load-nodejs.js';
import { getQuicTransport } from '@refinio/one.core/lib/system/quic-transport.js';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Message, MessageType } from '../types';
import { PersonKeys } from '../types';

export interface QuicClientOptions {
  serverUrl: string;
  timeout?: number;
  retries?: number;
}

export class QuicClient extends EventEmitter {
  private options: QuicClientOptions;
  private quicTransport: any;
  private connection: any;
  private pendingRequests: Map<string, any> = new Map();
  private session: any = null;
  private personKeys: PersonKeys | null = null;
  private serverAddress: string;
  private serverPort: number;

  constructor(options: QuicClientOptions) {
    super();
    this.options = options;
    
    // Parse server URL
    const url = new URL(this.options.serverUrl.replace('quic://', 'http://'));
    this.serverAddress = url.hostname;
    this.serverPort = parseInt(url.port) || 49498;
  }

  async connect() {
    // Get QUIC transport from one.core
    this.quicTransport = getQuicTransport();
    if (!this.quicTransport) {
      throw new Error('QUIC transport not initialized');
    }
    
    // Connect to server
    this.connection = await this.quicTransport.connect({
      host: this.serverAddress,
      port: this.serverPort
    });
    
    // Handle incoming messages
    this.connection.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
    
    // Handle connection errors
    this.connection.on('error', (err: Error) => {
      console.error('Connection error:', err);
      this.emit('error', err);
    });
  }

  private handleMessage(message: Message) {
    const request = this.pendingRequests.get(message.id);
    
    if (request) {
      if ((message as any).type === 'error') {
        request.reject(new Error((message.payload as any).error.message));
      } else {
        request.resolve(message);
      }
      
      this.pendingRequests.delete(message.id);
    }
    
    // Handle streaming events
    if (message.type === MessageType.STREAM_EVENT) {
      this.emit('stream-event', message.payload);
    }
  }

  async sendRequest(type: MessageType, payload: any): Promise<any> {
    if (!this.connection) {
      throw new Error('Client not connected');
    }

    const id = crypto.randomBytes(16).toString('hex');
    const message: Message = {
      id,
      type,
      timestamp: Date.now(),
      payload
    };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.options.timeout || 30000);

      // Store pending request
      this.pendingRequests.set(id, {
        resolve: (response: Message) => {
          clearTimeout(timeout);
          resolve(response.payload);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send message via QUIC connection
      this.connection.send(JSON.stringify(message));
    });
  }

  /**
   * Authenticate using Person's keys
   * @param personKeys The Person's encryption and signing keys
   */
  async authenticate(personKeys: PersonKeys): Promise<void> {
    this.personKeys = personKeys;
    
    // Send initial auth request with Person ID
    const authChallenge = await this.sendRequest(MessageType.AUTH_REQUEST, {
      personId: personKeys.personId
    });

    // Sign the challenge with the Person's private key
    if (authChallenge.challenge) {
      // In production, use proper Ed25519 signing
      // For now, simplified signature
      const signature = crypto
        .createHash('sha256')
        .update(authChallenge.challenge + personKeys.publicKey)
        .digest('hex');

      const response = await this.sendRequest(MessageType.AUTH_RESPONSE, {
        personId: personKeys.personId,
        signature,
        publicKey: personKeys.publicKey
      });

      this.session = response;
      
      if (response.authenticated) {
        console.log(`Authenticated as ${response.personId}`);
        if (response.isOwner) {
          console.log('You have admin privileges');
        }
        console.log('Permissions:', response.permissions.join(', '));
      } else {
        throw new Error('Authentication failed');
      }
    }
  }

  async createObject(type: string, data: any): Promise<any> {
    return this.sendRequest(MessageType.CREATE_REQUEST, {
      type,
      data
    });
  }

  async readObject(id: string, version?: string): Promise<any> {
    return this.sendRequest(MessageType.READ_REQUEST, {
      id,
      version
    });
  }

  async updateObject(id: string, data: any): Promise<any> {
    return this.sendRequest(MessageType.UPDATE_REQUEST, {
      id,
      data
    });
  }

  async deleteObject(id: string): Promise<any> {
    return this.sendRequest(MessageType.DELETE_REQUEST, {
      id
    });
  }

  async listObjects(type: string, options?: { filter?: string; limit?: number; offset?: number }): Promise<any> {
    return this.sendRequest(MessageType.LIST_REQUEST, {
      type,
      ...options
    });
  }

  async registerRecipe(recipe: any): Promise<any> {
    return this.sendRequest(MessageType.RECIPE_REGISTER, {
      recipe
    });
  }

  async getRecipe(name: string): Promise<any> {
    return this.sendRequest(MessageType.RECIPE_GET, {
      name
    });
  }

  async listRecipes(recipeType?: string): Promise<any> {
    return this.sendRequest(MessageType.RECIPE_LIST, {
      recipeType
    });
  }

  async subscribe(eventType?: string): Promise<void> {
    await this.sendRequest(MessageType.STREAM_SUBSCRIBE, {
      eventType
    });
  }

  async unsubscribe(): Promise<void> {
    await this.sendRequest(MessageType.STREAM_UNSUBSCRIBE, {});
  }

  async createProfile(profile: any): Promise<any> {
    return this.sendRequest(MessageType.PROFILE_CREATE, profile);
  }

  async getProfile(query: { profileId?: string; alias?: string }): Promise<any> {
    return this.sendRequest(MessageType.PROFILE_GET, query);
  }

  async updateProfile(request: any): Promise<any> {
    return this.sendRequest(MessageType.PROFILE_UPDATE, request);
  }

  async deleteProfile(profileId: string): Promise<any> {
    return this.sendRequest(MessageType.PROFILE_DELETE, { profileId });
  }

  async listProfiles(filter?: any): Promise<any> {
    return this.sendRequest(MessageType.PROFILE_LIST, filter || {});
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}