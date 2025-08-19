// Global test setup
import { jest } from '@jest/globals';

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.fn();
Object.defineProperty(process, 'exit', {
  value: mockExit,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockExit.mockClear();
});

// Global test helpers
global.testHelpers = {
  mockPersonKeys: {
    personId: 'test-person-123',
    publicKey: 'mock-public-key-hex',
    privateKey: 'mock-private-key-hex',
    signPublicKey: 'mock-sign-public-key-hex',
    signPrivateKey: 'mock-sign-private-key-hex',
  },
  mockProfile: {
    $type$: 'Profile',
    profileId: 'test-profile-123',
    nickname: 'test-profile',
    personId: 'test-person-123',
    owner: 'test-person-123',
    communicationEndpoint: [],
    personDescription: [],
  },
  mockInstance: {
    instanceUrl: 'quic://test.example.com:49498',
    personKeys: {
      personId: 'test-person-123',
      publicKey: 'mock-public-key-hex',
      privateKey: 'mock-private-key-hex',
      signPublicKey: 'mock-sign-public-key-hex',
      signPrivateKey: 'mock-sign-private-key-hex',
    },
    defaultProfileAlias: 'test-profile',
  },
};

export {};