import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ClientConfig, PersonKeys } from './types.js';

const defaultConfig: ClientConfig = {
  client: {
    serverUrl: 'quic://localhost:49498',
    timeout: 30000,
    retries: 3
  },
  keys: {
    path: path.join(os.homedir(), '.refinio', 'keys.json')
  },
  output: {
    format: 'text',
    color: true
  }
};

export async function loadConfig(configPath?: string): Promise<ClientConfig> {
  const paths = [
    configPath,
    path.join(process.cwd(), 'refinio-cli.config.json'),
    path.join(os.homedir(), '.refinio', 'cli.config.json')
  ].filter(Boolean) as string[];

  for (const p of paths) {
    try {
      const content = await fs.readFile(p, 'utf-8');
      const config = JSON.parse(content);
      return { ...defaultConfig, ...config };
    } catch (error) {
      // Config file not found, try next
    }
  }

  // Use environment variables if available
  const envConfig = { ...defaultConfig };
  
  if (process.env.REFINIO_SERVER_URL) {
    envConfig.client.serverUrl = process.env.REFINIO_SERVER_URL;
  }
  
  if (process.env.REFINIO_TIMEOUT) {
    envConfig.client.timeout = parseInt(process.env.REFINIO_TIMEOUT, 10);
  }
  
  if (process.env.REFINIO_KEYS_PATH) {
    envConfig.keys.path = process.env.REFINIO_KEYS_PATH;
  }
  
  if (process.env.REFINIO_PERSON_ID) {
    envConfig.keys.personId = process.env.REFINIO_PERSON_ID;
  }
  
  if (process.env.REFINIO_OUTPUT_FORMAT) {
    envConfig.output.format = process.env.REFINIO_OUTPUT_FORMAT as any;
  }

  return envConfig;
}

export async function saveConfig(config: ClientConfig, configPath?: string) {
  const targetPath = configPath || path.join(os.homedir(), '.refinio', 'cli.config.json');
  
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(config, null, 2));
}

export async function loadPersonKeys(keysPath?: string): Promise<PersonKeys> {
  const config = await loadConfig();
  const keyPath = keysPath || config.keys.path;
  
  try {
    const content = await fs.readFile(keyPath, 'utf-8');
    return JSON.parse(content) as PersonKeys;
  } catch (error) {
    throw new Error(`Failed to load Person keys from ${keyPath}`);
  }
}

export async function savePersonKeys(keys: PersonKeys, keysPath?: string) {
  const config = await loadConfig();
  const targetPath = keysPath || config.keys.path;
  
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(keys, null, 2));
}

/**
 * Generate Person keys for a new identity
 * In production, this should use proper ONE platform key generation
 */
export async function generatePersonKeys(email: string): Promise<PersonKeys> {
  // In production, use ONE platform's Person.create and key generation
  const personId = crypto.createHash('sha256').update(email).digest('hex');
  
  return {
    personId,
    publicKey: crypto.randomBytes(32).toString('hex'),
    privateKey: crypto.randomBytes(32).toString('hex'),
    signPublicKey: crypto.randomBytes(32).toString('hex'),
    signPrivateKey: crypto.randomBytes(32).toString('hex')
  };
}