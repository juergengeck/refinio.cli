import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';
import { createProfileClient } from '../../src/client/ProfileAwareClient';

// Mock dependencies
jest.mock('../../src/credentials/LocalCredentials');
jest.mock('../../src/client/ProfileAwareClient');
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

describe('Profile Commands', () => {
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockClient: any;
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

    // Mock ProfileAwareClient
    mockClient = {
      createProfile: jest.fn(),
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      deleteProfile: jest.fn(),
      listProfiles: jest.fn(),
      disconnect: jest.fn(),
    };

    (createProfileClient as jest.Mock).mockResolvedValue(mockClient);

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

  describe('profile create command', () => {
    it('should create a new profile successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.createProfile.mockResolvedValue({
        success: true,
        profile: { id: 'profile-hash-123', ...mockProfile },
      });

      // Import and execute the command
      const { profileCommand } = await import('../../src/commands/profile');
      
      // Simulate command execution: profile create test-profile --name "Test Profile"
      const createCommand = profileCommand.commands.find(cmd => cmd.name() === 'create');
      expect(createCommand).toBeDefined();

      // Mock command options
      const mockOptions = {
        name: 'Test Profile',
        description: 'A test profile',
        instance: undefined,
      };

      // Execute the command action
      await createCommand!.action('test-profile', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.getInstance).toHaveBeenCalledWith(undefined);
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.createProfile).toHaveBeenCalledWith({
        nickname: 'test-profile',
        personId: mockInstance.personKeys.personId,
        owner: mockInstance.personKeys.personId,
        profileId: expect.any(String),
        communicationEndpoint: [],
        personDescription: [],
      });
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        mockInstance.instanceUrl,
        mockInstance.personKeys,
        'test-profile'
      );
    });

    it('should handle missing instance connection', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      const { profileCommand } = await import('../../src/commands/profile');
      const createCommand = profileCommand.commands.find(cmd => cmd.name() === 'create');

      const mockOptions = { name: 'Test Profile' };

      await createCommand!.action('test-profile', mockOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle profile creation errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.createProfile.mockRejectedValue(new Error('Profile creation failed'));

      const { profileCommand } = await import('../../src/commands/profile');
      const createCommand = profileCommand.commands.find(cmd => cmd.name() === 'create');

      const mockOptions = { name: 'Test Profile' };

      await createCommand!.action('test-profile', mockOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('profile list command', () => {
    it('should list all profiles successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfiles = [
        { ...((global as any).testHelpers.mockProfile), nickname: 'profile1' },
        { ...((global as any).testHelpers.mockProfile), nickname: 'profile2', personId: 'different-person' },
      ];

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listProfiles.mockResolvedValue({
        success: true,
        count: 2,
        profiles: mockProfiles,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = { my: false };

      await listCommand!.action(mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.listProfiles).toHaveBeenCalledWith({});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(`Profiles in ${mockInstance.instanceUrl}`)
      );
    });

    it('should filter profiles with --my flag', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listProfiles.mockResolvedValue({
        success: true,
        count: 1,
        profiles: [(global as any).testHelpers.mockProfile],
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = { my: true };

      await listCommand!.action(mockOptions);

      expect(mockClient.listProfiles).toHaveBeenCalledWith({
        personId: mockInstance.personKeys.personId,
      });
    });

    it('should handle no profiles found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listProfiles.mockResolvedValue({
        success: true,
        count: 0,
        profiles: [],
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = {};

      await listCommand!.action(mockOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No profiles found')
      );
    });

    it('should handle missing instance connection', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = {};

      await listCommand!.action(mockOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No instance connection found')
      );
    });
  });

  describe('profile use command', () => {
    it('should set default profile successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const useCommand = profileCommand.commands.find(cmd => cmd.name() === 'use');

      const mockOptions = {};

      await useCommand!.action('test-profile', mockOptions);

      expect(mockClient.getProfile).toHaveBeenCalledWith({ nickname: 'test-profile' });
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        mockInstance.instanceUrl,
        mockInstance.personKeys,
        'test-profile'
      );
    });

    it('should handle profile not found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: false,
        profile: null,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const useCommand = profileCommand.commands.find(cmd => cmd.name() === 'use');

      const mockOptions = {};

      await useCommand!.action('nonexistent-profile', mockOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('profile show command', () => {
    it('should show profile details', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = {
        ...(global as any).testHelpers.mockProfile,
        nickname: 'detailed-profile',
        communicationEndpoint: ['endpoint-hash-1'],
        personDescription: ['description-hash-1'],
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const showCommand = profileCommand.commands.find(cmd => cmd.name() === 'show');

      const mockOptions = {};

      await showCommand!.action('detailed-profile', mockOptions);

      expect(mockClient.getProfile).toHaveBeenCalledWith({ nickname: 'detailed-profile' });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Profile Details')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('detailed-profile')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Communication Endpoints: 1 endpoint(s)')
      );
    });

    it('should use default profile when no alias provided', async () => {
      const mockInstance = {
        ...(global as any).testHelpers.mockInstance,
        defaultProfileAlias: 'default-profile',
      };
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const showCommand = profileCommand.commands.find(cmd => cmd.name() === 'show');

      const mockOptions = {};

      await showCommand!.action(undefined, mockOptions);

      expect(mockClient.getProfile).toHaveBeenCalledWith({ nickname: 'default-profile' });
    });

    it('should handle no profile specified and no default', async () => {
      const mockInstance = {
        ...(global as any).testHelpers.mockInstance,
        defaultProfileAlias: undefined,
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      const { profileCommand } = await import('../../src/commands/profile');
      const showCommand = profileCommand.commands.find(cmd => cmd.name() === 'show');

      const mockOptions = {};

      await showCommand!.action(undefined, mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'No profile specified and no default set'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('profile update command', () => {
    it('should update profile successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      });
      mockClient.updateProfile.mockResolvedValue({
        success: true,
        profile: { ...mockProfile, nickname: 'updated-profile' },
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const updateCommand = profileCommand.commands.find(cmd => cmd.name() === 'update');

      const mockOptions = { name: 'updated-profile' };

      await updateCommand!.action('test-profile', mockOptions);

      expect(mockClient.getProfile).toHaveBeenCalledWith({ nickname: 'test-profile' });
      expect(mockClient.updateProfile).toHaveBeenCalledWith({
        profileId: mockProfile.profileId,
        updates: { nickname: 'updated-profile' },
      });
    });

    it('should handle profile not found for update', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: false,
        profile: null,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const updateCommand = profileCommand.commands.find(cmd => cmd.name() === 'update');

      const mockOptions = { name: 'new-name' };

      await updateCommand!.action('nonexistent-profile', mockOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('profile delete command', () => {
    it('should delete profile after confirmation', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: true });

      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockProfile = (global as any).testHelpers.mockProfile;

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      });
      mockClient.deleteProfile.mockResolvedValue({
        success: true,
        message: 'Profile deleted successfully',
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const deleteCommand = profileCommand.commands.find(cmd => cmd.name() === 'delete');

      const mockOptions = {};

      await deleteCommand!.action('test-profile', mockOptions);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirm',
        message: "Are you sure you want to delete profile 'test-profile'?",
        default: false,
      }]);
      expect(mockClient.deleteProfile).toHaveBeenCalledWith(mockProfile.profileId);
      expect(mockLocalCreds.addInstance).toHaveBeenCalledWith(
        mockInstance.instanceUrl,
        mockInstance.personKeys,
        undefined
      );
    });

    it('should cancel delete when not confirmed', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: false });

      const { profileCommand } = await import('../../src/commands/profile');
      const deleteCommand = profileCommand.commands.find(cmd => cmd.name() === 'delete');

      const mockOptions = {};

      await deleteCommand!.action('test-profile', mockOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith('Cancelled');
      expect(createProfileClient).not.toHaveBeenCalled();
    });

    it('should handle profile not found for deletion', async () => {
      const mockInquirer = require('inquirer');
      mockInquirer.prompt.mockResolvedValue({ confirm: true });

      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getProfile.mockResolvedValue({
        success: false,
        profile: null,
      });

      const { profileCommand } = await import('../../src/commands/profile');
      const deleteCommand = profileCommand.commands.find(cmd => cmd.name() === 'delete');

      const mockOptions = {};

      await deleteCommand!.action('nonexistent-profile', mockOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle LocalCredentials load errors', async () => {
      mockLocalCreds.load.mockRejectedValue(new Error('Failed to load credentials'));

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = {};

      await listCommand!.action(mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Failed to load credentials'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle client connection errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      (createProfileClient as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const { profileCommand } = await import('../../src/commands/profile');
      const listCommand = profileCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = {};

      await listCommand!.action(mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Connection failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});