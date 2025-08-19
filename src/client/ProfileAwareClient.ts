import '@refinio/one.core/lib/system/load-nodejs.js';
import { QuicClient } from './QuicClient';
import { LocalCredentials } from '../credentials/LocalCredentials';

export class ProfileAwareClient extends QuicClient {
  private localCreds: LocalCredentials;
  private instanceUrl: string | null = null;
  private profile: any = null;
  
  constructor(instanceUrl?: string) {
    // Dummy URL, will be replaced when connecting
    super({ serverUrl: instanceUrl || 'quic://localhost:49498' });
    this.localCreds = new LocalCredentials();
    this.instanceUrl = instanceUrl || null;
  }
  
  /**
   * Connect using instance URL and optional profile
   */
  async connectWithProfile(profileAlias?: string): Promise<void> {
    // Load local credentials
    await this.localCreds.load();
    
    // Get the instance connection
    const instance = this.localCreds.getInstance(this.instanceUrl || undefined);
    
    if (!instance) {
      throw new Error(`No connection found for instance: ${this.instanceUrl || 'default'}`);
    }
    
    // Update connection details
    this.options.serverUrl = instance.instanceUrl;
    const url = new URL(instance.instanceUrl.replace('quic://', 'http://'));
    this.serverAddress = url.hostname;
    this.serverPort = parseInt(url.port) || 49498;
    
    // Connect to the instance
    await this.connect();
    
    // Authenticate with Person keys
    await this.authenticate(instance.personKeys);
    
    // Load profile if specified or use default
    const targetAlias = profileAlias || instance.defaultProfileAlias;
    if (targetAlias) {
      try {
        const result = await this.getProfile({ alias: targetAlias });
        if (result.profile) {
          this.profile = result.profile;
          
          // Touch the profile to update last used
          await this.touchProfile(result.profile.id);
        }
      } catch (error) {
        console.warn(`Profile '${targetAlias}' not found, continuing without profile`);
      }
    }
  }
  
  /**
   * Get current profile
   */
  getProfile(): any {
    return this.profile;
  }
  
  /**
   * Touch profile to update last used timestamp
   */
  private async touchProfile(profileId: string): Promise<void> {
    try {
      // This is a best-effort operation, ignore errors
      await this.sendRequest('profile.touch', { profileId });
    } catch (error) {
      // Ignore
    }
  }
}

/**
 * Factory function to create a client with profile support
 */
export async function createProfileClient(instanceUrl?: string, profileAlias?: string): Promise<ProfileAwareClient> {
  const client = new ProfileAwareClient(instanceUrl);
  await client.connectWithProfile(profileAlias);
  return client;
}