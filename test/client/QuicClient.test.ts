import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QuicClient, QuicClientOptions } from '../../src/client/QuicClient';
import { MessageType, PersonKeys } from '../../src/types';

// Mock one.core
jest.mock('@refinio/one.core/lib/system/load-nodejs.js', () => ({}));
jest.mock('@refinio/one.core/lib/system/quic-transport.js', () => ({
  getQuicTransport: jest.fn(),
}));

describe('QuicClient', () => {
  let client: QuicClient;
  let mockQuicTransport: any;
  let mockConnection: any;
  let options: QuicClientOptions;

  beforeEach(() => {
    // Setup mocks
    mockConnection = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    mockQuicTransport = {
      connect: jest.fn().mockResolvedValue(mockConnection),
    };

    // Mock getQuicTransport
    const { getQuicTransport } = require('@refinio/one.core/lib/system/quic-transport.js');
    (getQuicTransport as jest.Mock).mockReturnValue(mockQuicTransport);

    options = {
      serverUrl: 'quic://test.example.com:49498',
      timeout: 5000,
      retries: 3,
    };

    client = new QuicClient(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should parse server URL correctly', () => {
      expect(client['serverAddress']).toBe('test.example.com');
      expect(client['serverPort']).toBe(49498);
    });

    it('should use default port when not specified', () => {
      const clientWithoutPort = new QuicClient({ serverUrl: 'quic://example.com' });
      expect(clientWithoutPort['serverPort']).toBe(49498);
    });
  });

  describe('connect', () => {
    it('should establish QUIC connection successfully', async () => {
      await client.connect();

      expect(mockQuicTransport.connect).toHaveBeenCalledWith({
        host: 'test.example.com',
        port: 49498,
      });
      expect(mockConnection.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should throw error when QUIC transport is not available', async () => {
      const { getQuicTransport } = require('@refinio/one.core/lib/system/quic-transport.js');
      (getQuicTransport as jest.Mock).mockReturnValue(null);

      await expect(client.connect()).rejects.toThrow('QUIC transport not initialized');
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockQuicTransport.connect.mockRejectedValue(error);

      await expect(client.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('authentication', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should authenticate successfully with Person keys', async () => {
      const personKeys: PersonKeys = (global as any).testHelpers.mockPersonKeys;
      
      // Mock auth challenge response
      const mockAuthResponse = { challenge: 'test-challenge-123' };
      const mockAuthResult = {
        authenticated: true,
        personId: personKeys.personId,
        isOwner: true,
        permissions: ['read', 'write'],
      };

      // Setup message handler to simulate server responses
      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      // Start authentication
      const authPromise = client.authenticate(personKeys);

      // Simulate challenge response
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.AUTH_RESPONSE,
          payload: mockAuthResponse,
        })));
      }, 0);

      // Simulate final auth response after a second call
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.AUTH_RESPONSE,
          payload: mockAuthResult,
        })));
      }, 10);

      await authPromise;

      expect(mockConnection.send).toHaveBeenCalledTimes(2);
      
      // Check auth request was sent
      const authRequest = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(authRequest.type).toBe(MessageType.AUTH_REQUEST);
      expect(authRequest.payload.personId).toBe(personKeys.personId);

      // Check challenge response was sent
      const challengeResponse = JSON.parse(mockConnection.send.mock.calls[1][0]);
      expect(challengeResponse.type).toBe(MessageType.AUTH_RESPONSE);
      expect(challengeResponse.payload.personId).toBe(personKeys.personId);
      expect(challengeResponse.payload.signature).toBeDefined();
    });

    it('should throw error when authentication fails', async () => {
      const personKeys: PersonKeys = (global as any).testHelpers.mockPersonKeys;
      
      // Mock failed auth response
      const mockAuthResult = {
        authenticated: false,
        error: 'Invalid signature',
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const authPromise = client.authenticate(personKeys);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.AUTH_RESPONSE,
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.AUTH_RESPONSE,
          payload: mockAuthResult,
        })));
      }, 10);

      await expect(authPromise).rejects.toThrow('Authentication failed');
    });
  });

  describe('CRUD operations', () => {
    beforeEach(async () => {
      await client.connect();
      // Mock successful authentication
      client['session'] = { authenticated: true };
    });

    it('should create object successfully', async () => {
      const mockResponse = {
        success: true,
        id: 'created-object-123',
        version: '1.0.0',
      };

      // Setup response handler
      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const createPromise = client.createObject('Person', { name: 'John Doe' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.CREATE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await createPromise;

      expect(result).toEqual(mockResponse);
      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.stringContaining(MessageType.CREATE_REQUEST)
      );

      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({
        type: 'Person',
        data: { name: 'John Doe' },
      });
    });

    it('should read object successfully', async () => {
      const mockResponse = {
        success: true,
        data: { name: 'John Doe' },
        version: '1.0.0',
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const readPromise = client.readObject('object-123');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.READ_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await readPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({
        id: 'object-123',
        version: undefined,
      });
    });

    it('should update object successfully', async () => {
      const mockResponse = {
        success: true,
        version: '2.0.0',
        modified: Date.now(),
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const updatePromise = client.updateObject('object-123', { name: 'Jane Doe' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.UPDATE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await updatePromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({
        id: 'object-123',
        data: { name: 'Jane Doe' },
      });
    });

    it('should delete object successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Object deleted successfully',
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const deletePromise = client.deleteObject('object-123');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.DELETE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await deletePromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({
        id: 'object-123',
      });
    });

    it('should list objects successfully', async () => {
      const mockResponse = {
        success: true,
        count: 2,
        objects: [
          { id: 'obj-1', type: 'Person', name: 'John' },
          { id: 'obj-2', type: 'Person', name: 'Jane' },
        ],
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const listPromise = client.listObjects('Person', { limit: 10 });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.LIST_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await listPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({
        type: 'Person',
        limit: 10,
      });
    });
  });

  describe('Profile operations', () => {
    beforeEach(async () => {
      await client.connect();
      client['session'] = { authenticated: true };
    });

    it('should create profile successfully', async () => {
      const profile = (global as any).testHelpers.mockProfile;
      const mockResponse = {
        success: true,
        profile: { id: 'profile-hash-123', ...profile },
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const createPromise = client.createProfile(profile);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.PROFILE_CREATE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await createPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual(profile);
    });

    it('should get profile by nickname successfully', async () => {
      const mockResponse = {
        success: true,
        profile: (global as any).testHelpers.mockProfile,
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const getPromise = client.getProfile({ nickname: 'test-profile' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.PROFILE_GET,
          payload: mockResponse,
        })));
      }, 0);

      const result = await getPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ nickname: 'test-profile' });
    });

    it('should list profiles successfully', async () => {
      const mockResponse = {
        success: true,
        count: 1,
        profiles: [(global as any).testHelpers.mockProfile],
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const listPromise = client.listProfiles({ personId: 'test-person-123' });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.PROFILE_LIST,
          payload: mockResponse,
        })));
      }, 0);

      const result = await listPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ personId: 'test-person-123' });
    });

    it('should update profile successfully', async () => {
      const mockResponse = {
        success: true,
        profile: { ...((global as any).testHelpers.mockProfile), nickname: 'updated-name' },
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const updatePromise = client.updateProfile({
        profileId: 'test-profile-123',
        updates: { nickname: 'updated-name' },
      });

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.PROFILE_UPDATE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await updatePromise;

      expect(result).toEqual(mockResponse);
    });

    it('should delete profile successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Profile deleted successfully',
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const deletePromise = client.deleteProfile('test-profile-123');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.PROFILE_DELETE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await deletePromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ profileId: 'test-profile-123' });
    });
  });

  describe('Recipe operations', () => {
    beforeEach(async () => {
      await client.connect();
      client['session'] = { authenticated: true };
    });

    it('should register recipe successfully', async () => {
      const recipe = {
        $type$: 'CustomMessage',
        $recipe$: 'Recipe',
        properties: { content: { type: 'string', required: true } },
      };

      const mockResponse = {
        success: true,
        recipeName: 'CustomMessage',
        recipeType: 'Recipe',
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const registerPromise = client.registerRecipe(recipe);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.RECIPE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await registerPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ recipe });
    });

    it('should get recipe successfully', async () => {
      const mockResponse = {
        success: true,
        recipe: {
          $type$: 'Person',
          $recipe$: 'Recipe',
          properties: { name: { type: 'string' } },
        },
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const getPromise = client.getRecipe('Person');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.RECIPE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await getPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ name: 'Person' });
    });

    it('should list recipes successfully', async () => {
      const mockResponse = {
        success: true,
        count: 2,
        recipes: [
          { $type$: 'Person', $recipe$: 'Recipe' },
          { $type$: 'Profile', $recipe$: 'Recipe' },
        ],
      };

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const listPromise = client.listRecipes('Recipe');

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: expect.any(String),
          type: MessageType.RECIPE_RESPONSE,
          payload: mockResponse,
        })));
      }, 0);

      const result = await listPromise;

      expect(result).toEqual(mockResponse);
      
      const sentMessage = JSON.parse(mockConnection.send.mock.calls[0][0]);
      expect(sentMessage.payload).toEqual({ recipeType: 'Recipe' });
    });
  });

  describe('request timeout handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should timeout requests after configured timeout', async () => {
      const shortTimeoutClient = new QuicClient({
        serverUrl: 'quic://test.example.com:49498',
        timeout: 100,
      });

      await shortTimeoutClient.connect();

      // Don't setup message handler so request times out
      mockConnection.on.mockImplementation(() => {});

      await expect(
        shortTimeoutClient.createObject('Person', { name: 'Test' })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('disconnect', () => {
    it('should close connection properly', async () => {
      await client.connect();
      await client.disconnect();

      expect(mockConnection.close).toHaveBeenCalled();
      expect(client['connection']).toBeNull();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle malformed server messages', async () => {
      await client.connect();

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Send malformed JSON
      messageHandler(Buffer.from('invalid json'));

      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse message:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should emit error events from connection', async () => {
      await client.connect();

      let errorHandler: (error: Error) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
        }
      });

      const errorSpy = jest.fn();
      client.on('error', errorSpy);

      const testError = new Error('Connection lost');
      errorHandler(testError);

      expect(errorSpy).toHaveBeenCalledWith(testError);
    });

    it('should throw error for requests when not connected', async () => {
      await expect(
        client.createObject('Person', { name: 'Test' })
      ).rejects.toThrow('Client not connected');
    });
  });
});