import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { ProfileAwareClient } from '../../src/client/ProfileAwareClient';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';
import { MessageType } from '../../src/types';

// Mock dependencies
jest.mock('../../src/credentials/LocalCredentials');
jest.mock('@refinio/one.core/lib/system/load-nodejs.js', () => ({}));
jest.mock('@refinio/one.core/lib/system/quic-transport.js', () => ({
  getQuicTransport: jest.fn(),
}));

/**
 * Integration tests for Profile operations
 * These tests simulate complete workflows involving multiple API calls
 */
describe('Profile Operations Integration', () => {
  let client: ProfileAwareClient;
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockQuicTransport: any;
  let mockConnection: any;
  let messageHandler: (data: any) => void;

  const mockInstance = (global as any).testHelpers.mockInstance;
  const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;

  beforeAll(() => {
    // Setup global mocks
    mockConnection = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    mockQuicTransport = {
      connect: jest.fn().mockResolvedValue(mockConnection),
    };

    const { getQuicTransport } = require('@refinio/one.core/lib/system/quic-transport.js');
    (getQuicTransport as jest.Mock).mockReturnValue(mockQuicTransport);
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock LocalCredentials
    mockLocalCreds = {
      load: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockInstance),
      save: jest.fn(),
      addInstance: jest.fn(),
      setDefaultInstance: jest.fn(),
      removeInstance: jest.fn(),
      listInstances: jest.fn(),
      generatePersonKeys: jest.fn(),
      importPersonKeys: jest.fn(),
    } as any;

    (LocalCredentials as jest.Mock).mockImplementation(() => mockLocalCreds);

    // Setup message handler
    mockConnection.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    client = new ProfileAwareClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper function to simulate server responses
   */
  const simulateServerResponse = (responses: Array<{ delay: number; response: any }>) => {
    responses.forEach(({ delay, response }) => {
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify(response)));
      }, delay);
    });
  };

  describe('Complete Profile Lifecycle', () => {
    it('should create, use, update, and delete a Profile', async () => {
      // Step 1: Connect and authenticate
      const connectPromise = client.connectWithProfile();

      simulateServerResponse([
        {
          delay: 0,
          response: {
            id: 'auth-1',
            type: MessageType.AUTH_RESPONSE,
            payload: { challenge: 'test-challenge' },
          },
        },
        {
          delay: 10,
          response: {
            id: 'auth-2',
            type: MessageType.AUTH_RESPONSE,
            payload: {
              authenticated: true,
              personId: mockPersonKeys.personId,
              isOwner: true,
              permissions: ['read', 'write', 'admin'],
            },
          },
        },
      ]);

      await connectPromise;
      expect(client['session']).toBeDefined();
      expect(client['session'].authenticated).toBe(true);

      // Step 2: Create a new Profile
      const newProfile = {
        nickname: 'test-integration-profile',
        personId: mockPersonKeys.personId,
        owner: mockPersonKeys.personId,
        profileId: 'integration-profile-123',
        communicationEndpoint: [],
        personDescription: [],
      };

      const createPromise = client.createProfile(newProfile);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'create-1',
          type: MessageType.PROFILE_CREATE,
          payload: {
            success: true,
            profile: { id: 'profile-hash-123', ...newProfile },
          },
        })));
      }, 0);

      const createResult = await createPromise;
      
      expect(createResult.success).toBe(true);
      expect(createResult.profile.nickname).toBe('test-integration-profile');

      // Step 3: Fetch the created Profile
      const getPromise = client.getProfile({ nickname: 'test-integration-profile' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'get-1',
          type: MessageType.PROFILE_GET,
          payload: {
            success: true,
            profile: newProfile,
          },
        })));
      }, 0);

      const getResult = await getPromise;
      
      expect(getResult.success).toBe(true);
      expect(getResult.profile.nickname).toBe('test-integration-profile');

      // Step 4: Update the Profile
      const updatePromise = client.updateProfile({
        profileId: 'integration-profile-123',
        updates: { nickname: 'updated-integration-profile' },
      });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'update-1',
          type: MessageType.PROFILE_UPDATE,
          payload: {
            success: true,
            profile: { ...newProfile, nickname: 'updated-integration-profile' },
          },
        })));
      }, 0);

      const updateResult = await updatePromise;
      
      expect(updateResult.success).toBe(true);
      expect(updateResult.profile.nickname).toBe('updated-integration-profile');

      // Step 5: List Profiles to verify update
      const listPromise = client.listProfiles({ personId: mockPersonKeys.personId });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'list-1',
          type: MessageType.PROFILE_LIST,
          payload: {
            success: true,
            count: 1,
            profiles: [{ ...newProfile, nickname: 'updated-integration-profile' }],
          },
        })));
      }, 0);

      const listResult = await listPromise;
      
      expect(listResult.success).toBe(true);
      expect(listResult.count).toBe(1);
      expect(listResult.profiles[0].nickname).toBe('updated-integration-profile');

      // Step 6: Delete the Profile
      const deletePromise = client.deleteProfile('integration-profile-123');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'delete-1',
          type: MessageType.PROFILE_DELETE,
          payload: {
            success: true,
            message: 'Profile deleted successfully',
          },
        })));
      }, 0);

      const deleteResult = await deletePromise;
      
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.message).toBe('Profile deleted successfully');

      // Step 7: Verify Profile is deleted
      const verifyPromise = client.getProfile({ nickname: 'updated-integration-profile' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'verify-1',
          type: 'error',
          payload: {
            error: {
              code: 404,
              message: 'Profile not found',
            },
          },
        })));
      }, 0);

      await expect(verifyPromise).rejects.toThrow('Profile not found');
    });
  });

  describe('Multi-Profile Management', () => {
    it('should manage multiple Profiles simultaneously', async () => {
      // Connect first
      const connectPromise = client.connectWithProfile();

      simulateServerResponse([
        {
          delay: 0,
          response: {
            id: 'auth-1',
            type: MessageType.AUTH_RESPONSE,
            payload: { challenge: 'test-challenge' },
          },
        },
        {
          delay: 10,
          response: {
            id: 'auth-2',
            type: MessageType.AUTH_RESPONSE,
            payload: {
              authenticated: true,
              personId: mockPersonKeys.personId,
              isOwner: true,
              permissions: ['read', 'write', 'admin'],
            },
          },
        },
      ]);

      await connectPromise;

      // Create multiple Profiles
      const profiles = [
        {
          nickname: 'dev-profile',
          personId: mockPersonKeys.personId,
          owner: mockPersonKeys.personId,
          profileId: 'dev-profile-123',
          communicationEndpoint: [],
          personDescription: [],
        },
        {
          nickname: 'prod-profile',
          personId: mockPersonKeys.personId,
          owner: mockPersonKeys.personId,
          profileId: 'prod-profile-456',
          communicationEndpoint: [],
          personDescription: [],
        },
        {
          nickname: 'test-profile',
          personId: mockPersonKeys.personId,
          owner: mockPersonKeys.personId,
          profileId: 'test-profile-789',
          communicationEndpoint: [],
          personDescription: [],
        },
      ];

      // Create all profiles
      const createPromises = profiles.map((profile, index) => {
        const promise = client.createProfile(profile);
        
        setTimeout(() => {
          messageHandler(Buffer.from(JSON.stringify({
            id: `create-${index}`,
            type: MessageType.PROFILE_CREATE,
            payload: {
              success: true,
              profile: { id: `profile-hash-${index}`, ...profile },
            },
          })));
        }, index * 10);

        return promise;
      });

      const createResults = await Promise.all(createPromises);
      
      createResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.profile.nickname).toBe(profiles[index].nickname);
      });

      // List all Profiles
      const listPromise = client.listProfiles();

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'list-all',
          type: MessageType.PROFILE_LIST,
          payload: {
            success: true,
            count: 3,
            profiles: profiles,
          },
        })));
      }, 0);

      const listResult = await listPromise;
      
      expect(listResult.success).toBe(true);
      expect(listResult.count).toBe(3);
      expect(listResult.profiles.map((p: any) => p.nickname)).toEqual([
        'dev-profile',
        'prod-profile',
        'test-profile',
      ]);

      // Get specific Profiles by nickname
      const getPromises = profiles.map((profile, index) => {
        const promise = client.getProfile({ nickname: profile.nickname });
        
        setTimeout(() => {
          messageHandler(Buffer.from(JSON.stringify({
            id: `get-${index}`,
            type: MessageType.PROFILE_GET,
            payload: {
              success: true,
              profile: profile,
            },
          })));
        }, index * 5);

        return promise;
      });

      const getResults = await Promise.all(getPromises);
      
      getResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.profile.nickname).toBe(profiles[index].nickname);
      });
    });
  });

  describe('Profile Error Scenarios', () => {
    beforeEach(async () => {
      // Connect for each test
      const connectPromise = client.connectWithProfile();

      simulateServerResponse([
        {
          delay: 0,
          response: {
            id: 'auth-1',
            type: MessageType.AUTH_RESPONSE,
            payload: { challenge: 'test-challenge' },
          },
        },
        {
          delay: 10,
          response: {
            id: 'auth-2',
            type: MessageType.AUTH_RESPONSE,
            payload: {
              authenticated: true,
              personId: mockPersonKeys.personId,
              permissions: ['read', 'write'],
            },
          },
        },
      ]);

      await connectPromise;
    });

    it('should handle Profile creation conflicts', async () => {
      const duplicateProfile = {
        nickname: 'existing-profile',
        personId: mockPersonKeys.personId,
        owner: mockPersonKeys.personId,
        profileId: 'existing-profile-123',
        communicationEndpoint: [],
        personDescription: [],
      };

      const createPromise = client.createProfile(duplicateProfile);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'create-conflict',
          type: 'error',
          payload: {
            error: {
              code: 409,
              message: "Profile with nickname 'existing-profile' already exists",
            },
          },
        })));
      }, 0);

      await expect(createPromise).rejects.toThrow(
        "Profile with nickname 'existing-profile' already exists"
      );
    });

    it('should handle Profile not found errors', async () => {
      const getPromise = client.getProfile({ nickname: 'nonexistent-profile' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'get-not-found',
          type: 'error',
          payload: {
            error: {
              code: 404,
              message: 'Profile not found',
            },
          },
        })));
      }, 0);

      await expect(getPromise).rejects.toThrow('Profile not found');
    });

    it('should handle unauthorized Profile operations', async () => {
      const updatePromise = client.updateProfile({
        profileId: 'unauthorized-profile-123',
        updates: { nickname: 'hacked-profile' },
      });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'update-unauthorized',
          type: 'error',
          payload: {
            error: {
              code: 403,
              message: 'Not authorized to update this profile',
            },
          },
        })));
      }, 0);

      await expect(updatePromise).rejects.toThrow('Not authorized to update this profile');
    });

    it('should handle server errors gracefully', async () => {
      const listPromise = client.listProfiles();

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'list-server-error',
          type: 'error',
          payload: {
            error: {
              code: 500,
              message: 'Internal server error',
            },
          },
        })));
      }, 0);

      await expect(listPromise).rejects.toThrow('Internal server error');
    });
  });

  describe('Profile with CRUD Operations', () => {
    it('should use Profile context for CRUD operations', async () => {
      // Connect with specific profile
      const connectPromise = client.connectWithProfile('test-profile');

      simulateServerResponse([
        {
          delay: 0,
          response: {
            id: 'auth-1',
            type: MessageType.AUTH_RESPONSE,
            payload: { challenge: 'test-challenge' },
          },
        },
        {
          delay: 10,
          response: {
            id: 'auth-2',
            type: MessageType.AUTH_RESPONSE,
            payload: {
              authenticated: true,
              personId: mockPersonKeys.personId,
              permissions: ['read', 'write'],
            },
          },
        },
        {
          delay: 20,
          response: {
            id: 'profile-1',
            type: MessageType.PROFILE_GET,
            payload: {
              success: true,
              profile: (global as any).testHelpers.mockProfile,
            },
          },
        },
      ]);

      await connectPromise;

      // Verify profile is loaded
      expect(client.getProfile()).toEqual((global as any).testHelpers.mockProfile);

      // Perform CRUD operation with Profile context
      const createPromise = client.createObject('Person', {
        name: 'John Doe',
        email: 'john@example.com',
      });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'crud-create',
          type: MessageType.CREATE_RESPONSE,
          payload: {
            success: true,
            id: 'person-123',
            version: '1.0.0',
          },
        })));
      }, 0);

      const createResult = await createPromise;

      expect(createResult.success).toBe(true);
      expect(createResult.id).toBe('person-123');

      // Verify the request included Profile context
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[mockConnection.send.mock.calls.length - 1][0]);
      expect(sentMessage.type).toBe(MessageType.CREATE_REQUEST);
      expect(sentMessage.payload.type).toBe('Person');
      expect(sentMessage.payload.data.name).toBe('John Doe');
    });
  });

  describe('Connection Recovery', () => {
    it('should handle connection failures during Profile operations', async () => {
      // Connect first
      const connectPromise = client.connectWithProfile();

      simulateServerResponse([
        {
          delay: 0,
          response: {
            id: 'auth-1',
            type: MessageType.AUTH_RESPONSE,
            payload: { challenge: 'test-challenge' },
          },
        },
        {
          delay: 10,
          response: {
            id: 'auth-2',
            type: MessageType.AUTH_RESPONSE,
            payload: {
              authenticated: true,
              personId: mockPersonKeys.personId,
            },
          },
        },
      ]);

      await connectPromise;

      // Simulate connection error during Profile operation
      let errorHandler: (error: Error) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
        }
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const errorSpy = jest.fn();
      client.on('error', errorSpy);

      // Trigger connection error
      const connectionError = new Error('Connection lost');
      errorHandler(connectionError);

      expect(errorSpy).toHaveBeenCalledWith(connectionError);
    });
  });
});