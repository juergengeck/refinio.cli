export interface Message {
  id: string;
  type: MessageType;
  timestamp: number;
  payload: any;
}

export enum MessageType {
  // Authentication
  AUTH_CHALLENGE = 'auth.challenge',
  AUTH_REQUEST = 'auth.request',
  AUTH_RESPONSE = 'auth.response',
  
  // CRUD Operations
  CREATE_REQUEST = 'crud.create.request',
  CREATE_RESPONSE = 'crud.create.response',
  READ_REQUEST = 'crud.read.request',
  READ_RESPONSE = 'crud.read.response',
  UPDATE_REQUEST = 'crud.update.request',
  UPDATE_RESPONSE = 'crud.update.response',
  DELETE_REQUEST = 'crud.delete.request',
  DELETE_RESPONSE = 'crud.delete.response',
  
  // Recipe Operations
  RECIPE_EXECUTE = 'recipe.execute',
  RECIPE_RESULT = 'recipe.result',
  
  // Streaming
  STREAM_SUBSCRIBE = 'stream.subscribe',
  STREAM_EVENT = 'stream.event',
  STREAM_UNSUBSCRIBE = 'stream.unsubscribe'
}

export interface PersonKeys {
  personId: string;
  publicKey: string;
  privateKey: string;
  signPublicKey: string;
  signPrivateKey: string;
}

export interface ClientConfig {
  client: {
    serverUrl: string;
    timeout: number;
    retries: number;
  };
  keys: {
    path: string;  // Path to Person's keys file
    personId?: string;  // Can be provided directly
  };
  output: {
    format: 'json' | 'text';
    color: boolean;
  };
}