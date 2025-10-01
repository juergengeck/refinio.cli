// Stub types for @refinio packages to allow compilation without actual dependencies

export type SHA256Hash<T = any> = string;
export type SHA256IdHash<T = any> = string;

export interface StoredInvitation {
  id: string;
  code: string;
  url: string;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: any;
}

export interface PersonKeys {
  personId: string;
  privateKey: string;
  publicKey?: string;
}

// Mock implementations for development
export const mockStoredInvitation: StoredInvitation = {
  id: 'mock-id',
  code: 'mock-code',
  url: 'https://mock-url.com',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  metadata: {}
};

export const mockPersonKeys: PersonKeys = {
  personId: 'mock-person-id',
  privateKey: 'mock-private-key',
  publicKey: 'mock-public-key'
};