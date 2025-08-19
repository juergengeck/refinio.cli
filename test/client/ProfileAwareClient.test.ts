import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProfileAwareClient, createProfileClient } from '../../src/client/ProfileAwareClient';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';

// Mock dependencies
jest.mock('../../src/credentials/LocalCredentials');
jest.mock('@refinio/one.core/lib/system/load-nodejs.js', () => ({}));
jest.mock('@refinio/one.core/lib/system/quic-transport.js', () => ({
  getQuicTransport: jest.fn(),
}));

describe('ProfileAwareClient', () => {
  let client: ProfileAwareClient;
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockQuicTransport: any;
  let mockConnection: any;

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

    const { getQuicTransport } = require('@refinio/one.core/lib/system/quic-transport.js');
    (getQuicTransport as jest.Mock).mockReturnValue(mockQuicTransport);

    // Mock LocalCredentials
    mockLocalCreds = {
      load: jest.fn(),
      getInstance: jest.fn(),
      save: jest.fn(),
      addInstance: jest.fn(),
      setDefaultInstance: jest.fn(),
      removeInstance: jest.fn(),
      listInstances: jest.fn(),
      generatePersonKeys: jest.fn(),
      importPersonKeys: jest.fn(),
    } as any;

    (LocalCredentials as jest.Mock).mockImplementation(() => mockLocalCreds);

    client = new ProfileAwareClient('quic://test.example.com:49498');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connectWithProfile', () => {
    it('should connect to instance and load default profile', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      // Setup message handler for authentication
      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      // Start connection
      const connectPromise = client.connectWithProfile();

      // Simulate auth challenge response
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-1',
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      // Simulate auth success response
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-2',
          payload: { authenticated: true, personId: 'test-person-123' },
        })));
      }, 10);

      // Simulate profile fetch response
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'profile-1',
          payload: { success: true, profile: mockProfile },
        })));
      }, 20);

      await connectPromise;

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.getInstance).toHaveBeenCalledWith(undefined);
      expect(mockQuicTransport.connect).toHaveBeenCalledWith({
        host: 'test.example.com',
        port: 49498,
      });
      expect(client.getProfile()).toEqual(mockProfile);
    });

    it('should connect with specific profile alias', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = { ...(global as any).testHelpers.mockProfile, nickname: 'custom-profile' };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const connectPromise = client.connectWithProfile('custom-profile');

      // Simulate responses
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-1',
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-2',
          payload: { authenticated: true, personId: 'test-person-123' },
        })));
      }, 10);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'profile-1',
          payload: { success: true, profile: mockProfile },
        })));
      }, 20);

      await connectPromise;

      expect(client.getProfile()).toEqual(mockProfile);
    });

    it('should continue without profile if profile not found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const connectPromise = client.connectWithProfile('nonexistent-profile');

      // Simulate auth responses
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-1',
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-2',
          payload: { authenticated: true, personId: 'test-person-123' },
        })));
      }, 10);

      // Simulate profile not found
      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'profile-1',
          payload: { success: false, error: 'Profile not found' },
        })));
      }, 20);

      await connectPromise;

      expect(warnSpy).toHaveBeenCalledWith(
        "Profile 'nonexistent-profile' not found, continuing without profile"
      );
      expect(client.getProfile()).toBeNull();

      warnSpy.mockRestore();
    });

    it('should throw error when instance connection not found', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      await expect(client.connectWithProfile()).rejects.toThrow(
        'No connection found for instance: quic://test.example.com:49498'
      );
    });

    it('should handle instance URL from constructor', async () => {
      const specificClient = new ProfileAwareClient('quic://specific.example.com:49498');
      const mockInstance = {
        ...(global as any).testHelpers.mockInstance,
        instanceUrl: 'quic://specific.example.com:49498',
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const connectPromise = specificClient.connectWithProfile();

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-1',
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-2',
          payload: { authenticated: true, personId: 'test-person-123' },
        })));
      }, 10);

      await connectPromise;

      expect(mockLocalCreds.getInstance).toHaveBeenCalledWith('quic://specific.example.com:49498');
    });
  });

  describe('getProfile', () => {
    it('should return null when no profile loaded', () => {
      expect(client.getProfile()).toBeNull();
    });

    it('should return loaded profile', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      let messageHandler: (data: any) => void;
      mockConnection.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      const connectPromise = client.connectWithProfile();

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-1',
          payload: { challenge: 'test-challenge' },
        })));
      }, 0);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'auth-2',
          payload: { authenticated: true, personId: 'test-person-123' },
        })));
      }, 10);

      setTimeout(() => {
        messageHandler(Buffer.from(JSON.stringify({
          id: 'profile-1',
          payload: { success: true, profile: mockProfile },
        })));
      }, 20);

      await connectPromise;

      expect(client.getProfile()).toEqual(mockProfile);
    });
  });
});

describe('createProfileClient factory function', () => {
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockQuicTransport: any;
  let mockConnection: any;

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

    const { getQuicTransport } = require('@refinio/one.core/lib/system/quic-transport.js');
    (getQuicTransport as jest.Mock).mockReturnValue(mockQuicTransport);

    mockLocalCreds = {
      load: jest.fn(),
      getInstance: jest.fn(),
      save: jest.fn(),
      addInstance: jest.fn(),
      setDefaultInstance: jest.fn(),
      removeInstance: jest.fn(),
      listInstances: jest.fn(),
      generatePersonKeys: jest.fn(),
      importPersonKeys: jest.fn(),
    } as any;

    (LocalCredentials as jest.Mock).mockImplementation(() => mockLocalCreds);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create and connect ProfileAwareClient', async () => {
    const mockInstance = (global as any).testHelpers.mockInstance;
    mockLocalCreds.getInstance.mockReturnValue(mockInstance);

    let messageHandler: (data: any) => void;
    mockConnection.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    const clientPromise = createProfileClient('quic://test.example.com:49498', 'test-profile');

    setTimeout(() => {
      messageHandler(Buffer.from(JSON.stringify({
        id: 'auth-1',
        payload: { challenge: 'test-challenge' },
      })));
    }, 0);

    setTimeout(() => {
      messageHandler(Buffer.from(JSON.stringify({
        id: 'auth-2',
        payload: { authenticated: true, personId: 'test-person-123' },
      })));
    }, 10);

    const client = await clientPromise;

    expect(client).toBeInstanceOf(ProfileAwareClient);
    expect(mockQuicTransport.connect).toHaveBeenCalled();
  });

  it('should work without specific instance URL', async () => {
    const mockInstance = (global as any).testHelpers.mockInstance;
    mockLocalCreds.getInstance.mockReturnValue(mockInstance);

    let messageHandler: (data: any) => void;
    mockConnection.on.mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    const clientPromise = createProfileClient(undefined, 'test-profile');

    setTimeout(() => {
      messageHandler(Buffer.from(JSON.stringify({
        id: 'auth-1',
        payload: { challenge: 'test-challenge' },
      })));
    }, 0);

    setTimeout(() => {
      messageHandler(Buffer.from(JSON.stringify({
        id: 'auth-2',
        payload: { authenticated: true, personId: 'test-person-123' },
      })));
    }, 10);

    const client = await clientPromise;

    expect(client).toBeInstanceOf(ProfileAwareClient);
    expect(mockLocalCreds.getInstance).toHaveBeenCalledWith(undefined);
  });
});