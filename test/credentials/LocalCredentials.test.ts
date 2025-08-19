import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('@refinio/one.core/lib/system/load-nodejs.js', () => ({}));
jest.mock('@refinio/one.core', () => ({
  createEncryptionKeypair: jest.fn(),
  createSigningKeypair: jest.fn(),
}));

describe('LocalCredentials', () => {
  let localCreds: LocalCredentials;
  let mockFs: jest.Mocked<typeof fs>;
  let mockCreateEncryptionKeypair: jest.Mock;
  let mockCreateSigningKeypair: jest.Mock;

  const mockStorePath = path.join(os.homedir(), '.refinio', 'connections.json');

  beforeEach(() => {
    mockFs = fs as jest.Mocked<typeof fs>;
    
    const oneCore = require('@refinio/one.core');
    mockCreateEncryptionKeypair = oneCore.createEncryptionKeypair;
    mockCreateSigningKeypair = oneCore.createSigningKeypair;

    localCreds = new LocalCredentials();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('load', () => {
    it('should load existing credentials file', async () => {
      const mockData = {
        version: '2.0.0',
        defaultInstance: 'quic://test.example.com:49498',
        credentials: {
          'quic://test.example.com:49498': {
            instanceUrl: 'quic://test.example.com:49498',
            personKeys: (global as any).testHelpers.mockPersonKeys,
            defaultProfileAlias: 'test-profile',
          },
        },
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockData));

      await localCreds.load();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(mockStorePath),
        { recursive: true }
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(mockStorePath, 'utf-8');
    });

    it('should handle missing credentials file', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await localCreds.load();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(mockStorePath),
        { recursive: true }
      );
      // Should not throw and should initialize empty credentials
      expect(localCreds.listInstances()).toEqual([]);
    });

    it('should handle malformed JSON in credentials file', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await localCreds.load();

      // Should not throw and should initialize empty credentials
      expect(localCreds.listInstances()).toEqual([]);
    });
  });

  describe('save', () => {
    it('should save credentials to file', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      
      await localCreds.load();
      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'test-profile'
      );

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(mockStorePath),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        mockStorePath,
        expect.stringContaining('quic://test.example.com:49498'),
        undefined
      );
    });

    it('should create proper JSON structure', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      
      await localCreds.load();
      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'test-profile'
      );

      const writeCall = mockFs.writeFile.mock.calls.find(call => 
        call[0] === mockStorePath
      );
      expect(writeCall).toBeDefined();
      
      const savedData = JSON.parse(writeCall![1] as string);
      expect(savedData).toEqual({
        version: '2.0.0',
        defaultInstance: 'quic://test.example.com:49498',
        credentials: {
          'quic://test.example.com:49498': {
            instanceUrl: 'quic://test.example.com:49498',
            personKeys: mockPersonKeys,
            defaultProfileAlias: 'test-profile',
          },
        },
      });
    });
  });

  describe('addInstance', () => {
    beforeEach(async () => {
      await localCreds.load();
    });

    it('should add new instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'test-profile'
      );

      const instance = localCreds.getInstance('quic://test.example.com:49498');
      expect(instance).toEqual({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: mockPersonKeys,
        defaultProfileAlias: 'test-profile',
      });
    });

    it('should set first instance as default', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys
      );

      const instances = localCreds.listInstances();
      expect(instances[0].isDefault).toBe(true);
    });

    it('should update existing instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      const updatedKeys = { ...mockPersonKeys, personId: 'updated-person-456' };

      // Add initial instance
      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'original-profile'
      );

      // Update same instance
      await localCreds.addInstance(
        'quic://test.example.com:49498',
        updatedKeys,
        'updated-profile'
      );

      const instance = localCreds.getInstance('quic://test.example.com:49498');
      expect(instance?.personKeys.personId).toBe('updated-person-456');
      expect(instance?.defaultProfileAlias).toBe('updated-profile');
    });
  });

  describe('getInstance', () => {
    beforeEach(async () => {
      await localCreds.load();
    });

    it('should return specific instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'test-profile'
      );

      const instance = localCreds.getInstance('quic://test.example.com:49498');
      expect(instance).toBeDefined();
      expect(instance?.instanceUrl).toBe('quic://test.example.com:49498');
      expect(instance?.defaultProfileAlias).toBe('test-profile');
    });

    it('should return default instance when no URL specified', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys,
        'test-profile'
      );

      const instance = localCreds.getInstance();
      expect(instance).toBeDefined();
      expect(instance?.instanceUrl).toBe('quic://test.example.com:49498');
    });

    it('should return null for non-existent instance', async () => {
      const instance = localCreds.getInstance('quic://nonexistent.example.com:49498');
      expect(instance).toBeNull();
    });

    it('should return null when no default set', async () => {
      const instance = localCreds.getInstance();
      expect(instance).toBeNull();
    });
  });

  describe('listInstances', () => {
    beforeEach(async () => {
      await localCreds.load();
    });

    it('should return empty array when no instances', () => {
      const instances = localCreds.listInstances();
      expect(instances).toEqual([]);
    });

    it('should list all instances with metadata', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test1.example.com:49498',
        mockPersonKeys,
        'profile1'
      );
      await localCreds.addInstance(
        'quic://test2.example.com:49498',
        mockPersonKeys,
        'profile2'
      );

      const instances = localCreds.listInstances();
      
      expect(instances).toHaveLength(2);
      expect(instances[0]).toEqual({
        url: 'quic://test1.example.com:49498',
        isDefault: true,
        hasProfile: true,
      });
      expect(instances[1]).toEqual({
        url: 'quic://test2.example.com:49498',
        isDefault: false,
        hasProfile: true,
      });
    });

    it('should mark instances without profile alias correctly', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys
        // No defaultProfileAlias provided
      );

      const instances = localCreds.listInstances();
      
      expect(instances[0].hasProfile).toBe(false);
    });
  });

  describe('setDefaultInstance', () => {
    beforeEach(async () => {
      await localCreds.load();
    });

    it('should set default instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test1.example.com:49498',
        mockPersonKeys
      );
      await localCreds.addInstance(
        'quic://test2.example.com:49498',
        mockPersonKeys
      );

      await localCreds.setDefaultInstance('quic://test2.example.com:49498');

      const instances = localCreds.listInstances();
      expect(instances[0].isDefault).toBe(false);
      expect(instances[1].isDefault).toBe(true);
    });

    it('should throw error for non-existent instance', async () => {
      await expect(
        localCreds.setDefaultInstance('quic://nonexistent.example.com:49498')
      ).rejects.toThrow('No connection found for instance: quic://nonexistent.example.com:49498');
    });
  });

  describe('removeInstance', () => {
    beforeEach(async () => {
      await localCreds.load();
    });

    it('should remove instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys
      );

      await localCreds.removeInstance('quic://test.example.com:49498');

      expect(localCreds.getInstance('quic://test.example.com:49498')).toBeNull();
    });

    it('should update default when removing default instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test1.example.com:49498',
        mockPersonKeys
      );
      await localCreds.addInstance(
        'quic://test2.example.com:49498',
        mockPersonKeys
      );

      // Remove default instance (first one)
      await localCreds.removeInstance('quic://test1.example.com:49498');

      const instances = localCreds.listInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].isDefault).toBe(true);
      expect(instances[0].url).toBe('quic://test2.example.com:49498');
    });

    it('should clear default when removing last instance', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

      await localCreds.addInstance(
        'quic://test.example.com:49498',
        mockPersonKeys
      );

      await localCreds.removeInstance('quic://test.example.com:49498');

      expect(localCreds.getInstance()).toBeNull();
      expect(localCreds.listInstances()).toHaveLength(0);
    });
  });

  describe('generatePersonKeys', () => {
    it('should generate new Person keys', async () => {
      const mockEncryptionKeys = {
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6]),
      };
      const mockSigningKeys = {
        publicKey: new Uint8Array([7, 8, 9]),
        privateKey: new Uint8Array([10, 11, 12]),
      };

      mockCreateEncryptionKeypair.mockResolvedValue(mockEncryptionKeys);
      mockCreateSigningKeypair.mockResolvedValue(mockSigningKeys);

      const keys = await localCreds.generatePersonKeys('test@example.com');

      expect(mockCreateEncryptionKeypair).toHaveBeenCalled();
      expect(mockCreateSigningKeypair).toHaveBeenCalled();

      expect(keys).toEqual({
        personId: expect.any(String),
        publicKey: '010203',
        privateKey: '040506',
        signPublicKey: '070809',
        signPrivateKey: '0a0b0c',
      });

      // Person ID should be a hash of the person data
      expect(keys.personId).toHaveLength(64); // SHA256 hex length
    });

    it('should generate consistent personId for same email and keys', async () => {
      const mockEncryptionKeys = {
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6]),
      };
      const mockSigningKeys = {
        publicKey: new Uint8Array([7, 8, 9]),
        privateKey: new Uint8Array([10, 11, 12]),
      };

      mockCreateEncryptionKeypair.mockResolvedValue(mockEncryptionKeys);
      mockCreateSigningKeypair.mockResolvedValue(mockSigningKeys);

      const keys1 = await localCreds.generatePersonKeys('test@example.com');
      
      // Reset mocks and generate again with same data
      mockCreateEncryptionKeypair.mockResolvedValue(mockEncryptionKeys);
      mockCreateSigningKeypair.mockResolvedValue(mockSigningKeys);
      
      const keys2 = await localCreds.generatePersonKeys('test@example.com');

      expect(keys1.personId).toBe(keys2.personId);
    });
  });

  describe('importPersonKeys', () => {
    it('should import valid Person keys', async () => {
      const mockKeys = (global as any).testHelpers.mockPersonKeys;
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockKeys));

      const keys = await localCreds.importPersonKeys('/path/to/keys.json');

      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/keys.json', 'utf-8');
      expect(keys).toEqual(mockKeys);
    });

    it('should validate required fields', async () => {
      const incompleteKeys = {
        personId: 'test-person-123',
        publicKey: 'public-key',
        // Missing other required fields
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(incompleteKeys));

      await expect(
        localCreds.importPersonKeys('/path/to/keys.json')
      ).rejects.toThrow('Missing required field: privateKey');
    });

    it('should handle file read errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(
        localCreds.importPersonKeys('/path/to/nonexistent.json')
      ).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should handle invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(
        localCreds.importPersonKeys('/path/to/invalid.json')
      ).rejects.toThrow();
    });
  });

  describe('custom storage path', () => {
    it('should use custom storage path', async () => {
      const customPath = '/custom/path/credentials.json';
      const customCreds = new LocalCredentials(customPath);

      await customCreds.load();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(customPath),
        { recursive: true }
      );
    });
  });
});