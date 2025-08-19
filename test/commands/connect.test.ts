import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';
import { QuicClient } from '../../src/client/QuicClient';

// Mock dependencies
jest.mock('../../src/credentials/LocalCredentials');
jest.mock('../../src/client/QuicClient');
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));
jest.mock('ora', () => {
  return jest.fn().mockImplementation(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});
jest.mock('chalk', () => ({
  cyan: jest.fn((text) => text),
  green: jest.fn((text) => text),
  red: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  bold: jest.fn((text) => text),
  blue: jest.fn((text) => text),
}));

describe('Connect Commands', () => {
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockClient: jest.Mocked<QuicClient>;
  let mockProcessExit: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;

  beforeEach(() => {
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

    // Mock QuicClient
    mockClient = {
      connect: jest.fn(),
      authenticate: jest.fn(),
      disconnect: jest.fn(),
      createObject: jest.fn(),
      readObject: jest.fn(),
      updateObject: jest.fn(),
      deleteObject: jest.fn(),
      listObjects: jest.fn(),
      createProfile: jest.fn(),
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      deleteProfile: jest.fn(),
      listProfiles: jest.fn(),
      registerRecipe: jest.fn(),
      getRecipe: jest.fn(),
      listRecipes: jest.fn(),
      on: jest.fn(),
    } as any;

    (QuicClient as jest.Mock).mockImplementation(() => mockClient);

    // Mock console and process
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockProcessExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('connect command', () => {
    it('should connect to instance with existing keys', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: mockPersonKeys,
        defaultProfileAlias: undefined,
      });

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockResolvedValue({
        authenticated: true,
        personId: mockPersonKeys.personId,
        permissions: ['read', 'write'],
      });

      // Import and execute the command
      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: false,
        import: undefined,
        setDefault: false,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.authenticate).toHaveBeenCalledWith(mockPersonKeys);
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498',
        mockPersonKeys,
        undefined
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Successfully connected')
      );
    });

    it('should generate new keys when --generate flag is used', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ email: 'test@example.com' });

      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.generatePersonKeys.mockResolvedValue(mockPersonKeys);
      mockLocalCreds.getInstance.mockReturnValue(null);

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockResolvedValue({
        authenticated: true,
        personId: mockPersonKeys.personId,
        permissions: ['read', 'write'],
      });

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: true,
        import: undefined,
        setDefault: false,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([{
        type: 'input',
        name: 'email',
        message: 'Enter your email address for key generation:',
        validate: expect.any(Function),
      }]);
      expect(mockLocalCreds.generatePersonKeys).toHaveBeenCalledWith('test@example.com');
      expect(mockClient.authenticate).toHaveBeenCalledWith(mockPersonKeys);
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498',
        mockPersonKeys,
        undefined
      );
    });

    it('should import keys from file when --import flag is used', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.importPersonKeys.mockResolvedValue(mockPersonKeys);
      mockLocalCreds.getInstance.mockReturnValue(null);

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockResolvedValue({
        authenticated: true,
        personId: mockPersonKeys.personId,
        permissions: ['read', 'write'],
      });

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: false,
        import: '/path/to/keys.json',
        setDefault: false,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockLocalCreds.importPersonKeys).toHaveBeenCalledWith('/path/to/keys.json');
      expect(mockClient.authenticate).toHaveBeenCalledWith(mockPersonKeys);
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498',
        mockPersonKeys,
        undefined
      );
    });

    it('should set instance as default when --set-default flag is used', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: mockPersonKeys,
        defaultProfileAlias: undefined,
      });

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockResolvedValue({
        authenticated: true,
        personId: mockPersonKeys.personId,
        permissions: ['read', 'write'],
      });

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: false,
        import: undefined,
        setDefault: true,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockLocalCreds.setDefaultInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498'
      );
    });

    it('should handle connection failure', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: mockPersonKeys,
        defaultProfileAlias: undefined,
      });

      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: false,
        import: undefined,
        setDefault: false,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Connection failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle authentication failure', async () => {
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: mockPersonKeys,
        defaultProfileAlias: undefined,
      });

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockRejectedValue(new Error('Authentication failed'));

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: false,
        import: undefined,
        setDefault: false,
      };

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Authentication failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate email format for key generation', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ email: 'test@example.com' });

      const { connectCommand } = await import('../../src/commands/connect');
      
      const mockOptions = {
        generate: true,
        import: undefined,
        setDefault: false,
      };

      // Mock the key generation process
      const mockPersonKeys = (global as any).testHelpers.mockPersonKeys;
      mockLocalCreds.generatePersonKeys.mockResolvedValue(mockPersonKeys);
      mockLocalCreds.getInstance.mockReturnValue(null);
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.authenticate.mockResolvedValue({
        authenticated: true,
        personId: mockPersonKeys.personId,
      });

      await connectCommand.action('quic://test.example.com:49498', mockOptions);

      // Verify email validation function was provided
      const promptCall = mockInquirer.prompt.mock.calls[0][0][0];
      const validateFn = promptCall.validate;
      
      expect(validateFn('test@example.com')).toBe(true);
      expect(validateFn('invalid-email')).toBe('Please enter a valid email address');
      expect(validateFn('')).toBe('Please enter a valid email address');
    });
  });

  describe('list command', () => {
    it('should list all connected instances', async () => {
      const mockInstances = [
        {
          url: 'quic://test1.example.com:49498',
          isDefault: true,
          hasProfile: true,
        },
        {
          url: 'quic://test2.example.com:49498',
          isDefault: false,
          hasProfile: false,
        },
      ];

      mockLocalCreds.listInstances.mockReturnValue(mockInstances);

      const { listCommand } = await import('../../src/commands/connect');

      await listCommand.action();

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.listInstances).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Connected Instances')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('quic://test1.example.com:49498')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('(default)')
      );
    });

    it('should handle no connected instances', async () => {
      mockLocalCreds.listInstances.mockReturnValue([]);

      const { listCommand } = await import('../../src/commands/connect');

      await listCommand.action();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No connected instances found')
      );
    });

    it('should handle credentials load error', async () => {
      mockLocalCreds.load.mockRejectedValue(new Error('Failed to load credentials'));

      const { listCommand } = await import('../../src/commands/connect');

      await listCommand.action();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Failed to load credentials'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('remove command', () => {
    it('should remove instance after confirmation', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: true });

      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: (global as any).testHelpers.mockPersonKeys,
      });

      const { removeCommand } = await import('../../src/commands/connect');

      await removeCommand.action('quic://test.example.com:49498');

      expect(mockInquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirm',
        message: "Are you sure you want to remove connection to 'quic://test.example.com:49498'?",
        default: false,
      }]);
      expect(mockLocalCreds.removeInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Connection removed successfully')
      );
    });

    it('should cancel removal when not confirmed', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: false });

      const { removeCommand } = await import('../../src/commands/connect');

      await removeCommand.action('quic://test.example.com:49498');

      expect(mockConsoleLog).toHaveBeenCalledWith('Cancelled');
      expect(mockLocalCreds.removeInstance).not.toHaveBeenCalled();
    });

    it('should handle non-existent instance', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: true });

      mockLocalCreds.getInstance.mockReturnValue(null);

      const { removeCommand } = await import('../../src/commands/connect');

      await removeCommand.action('quic://nonexistent.example.com:49498');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'No connection found for instance: quic://nonexistent.example.com:49498'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('set-default command', () => {
    it('should set instance as default', async () => {
      mockLocalCreds.getInstance.mockReturnValue({
        instanceUrl: 'quic://test.example.com:49498',
        personKeys: (global as any).testHelpers.mockPersonKeys,
      });

      const { setDefaultCommand } = await import('../../src/commands/connect');

      await setDefaultCommand.action('quic://test.example.com:49498');

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.setDefaultInstance).toHaveBeenCalledWith(
        'quic://test.example.com:49498'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Default instance set')
      );
    });

    it('should handle non-existent instance', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      const { setDefaultCommand } = await import('../../src/commands/connect');

      await setDefaultCommand.action('quic://nonexistent.example.com:49498');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'No connection found for instance: quic://nonexistent.example.com:49498'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});