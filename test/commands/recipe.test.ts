import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalCredentials } from '../../src/credentials/LocalCredentials';
import { createProfileClient } from '../../src/client/ProfileAwareClient';

// Mock dependencies
jest.mock('../../src/credentials/LocalCredentials');
jest.mock('../../src/client/ProfileAwareClient');
jest.mock('fs/promises');
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

describe('Recipe Commands', () => {
  let mockLocalCreds: jest.Mocked<LocalCredentials>;
  let mockClient: any;
  let mockProcessExit: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockFs: any;

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
      registerRecipe: jest.fn(),
      getRecipe: jest.fn(),
      listRecipes: jest.fn(),
      disconnect: jest.fn(),
    };

    (createProfileClient as jest.Mock).mockResolvedValue(mockClient);

    // Mock fs/promises
    mockFs = require('fs/promises');
    mockFs.readFile = jest.fn();

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

  describe('recipe register command', () => {
    it('should register recipe from file successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockRecipe = {
        $type$: 'CustomMessage',
        $recipe$: 'Recipe',
        properties: {
          content: { type: 'string', required: true },
          timestamp: { type: 'number' },
        },
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRecipe));
      mockClient.registerRecipe.mockResolvedValue({
        success: true,
        recipeName: 'CustomMessage',
        recipeType: 'Recipe',
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const registerCommand = recipeCommand.commands.find(cmd => cmd.name() === 'register');

      const mockOptions = { instance: undefined };

      await registerCommand!.action('/path/to/recipe.json', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.getInstance).toHaveBeenCalledWith(undefined);
      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/recipe.json', 'utf-8');
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.registerRecipe).toHaveBeenCalledWith(mockRecipe);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Recipe registered successfully')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle file read errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const { recipeCommand } = await import('../../src/commands/recipe');
      const registerCommand = recipeCommand.commands.find(cmd => cmd.name() === 'register');

      const mockOptions = {};

      await registerCommand!.action('/path/to/nonexistent.json', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'ENOENT: no such file or directory'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid JSON in recipe file', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockResolvedValue('invalid json');

      const { recipeCommand } = await import('../../src/commands/recipe');
      const registerCommand = recipeCommand.commands.find(cmd => cmd.name() === 'register');

      const mockOptions = {};

      await registerCommand!.action('/path/to/invalid.json', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle registration failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockRecipe = {
        $type$: 'CustomMessage',
        $recipe$: 'Recipe',
        properties: { content: { type: 'string' } },
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRecipe));
      mockClient.registerRecipe.mockRejectedValue(new Error('Recipe registration failed'));

      const { recipeCommand } = await import('../../src/commands/recipe');
      const registerCommand = recipeCommand.commands.find(cmd => cmd.name() === 'register');

      const mockOptions = {};

      await registerCommand!.action('/path/to/recipe.json', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Recipe registration failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle missing instance connection', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      const { recipeCommand } = await import('../../src/commands/recipe');
      const registerCommand = recipeCommand.commands.find(cmd => cmd.name() === 'register');

      const mockOptions = {};

      await registerCommand!.action('/path/to/recipe.json', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'No instance connection found. Use "refinio connect" first.'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('recipe get command', () => {
    it('should get recipe successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockRecipe = {
        $type$: 'Person',
        $recipe$: 'Recipe',
        properties: {
          name: { type: 'string', required: true },
          email: { type: 'string' },
        },
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getRecipe.mockResolvedValue({
        success: true,
        recipe: mockRecipe,
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const getCommand = recipeCommand.commands.find(cmd => cmd.name() === 'get');

      const mockOptions = { instance: undefined };

      await getCommand!.action('Person', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.getRecipe).toHaveBeenCalledWith('Person');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Recipe: Person')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Type: Recipe')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle recipe not found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getRecipe.mockResolvedValue({
        success: false,
        error: 'Recipe not found',
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const getCommand = recipeCommand.commands.find(cmd => cmd.name() === 'get');

      const mockOptions = {};

      await getCommand!.action('NonexistentRecipe', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        "Recipe 'NonexistentRecipe' not found"
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle client errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.getRecipe.mockRejectedValue(new Error('Connection failed'));

      const { recipeCommand } = await import('../../src/commands/recipe');
      const getCommand = recipeCommand.commands.find(cmd => cmd.name() === 'get');

      const mockOptions = {};

      await getCommand!.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Connection failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('recipe list command', () => {
    it('should list all recipes successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockRecipes = [
        {
          $type$: 'Person',
          $recipe$: 'Recipe',
          properties: { name: { type: 'string' } },
        },
        {
          $type$: 'Profile',
          $recipe$: 'Recipe',
          properties: { nickname: { type: 'string' } },
        },
        {
          $type$: 'CustomMessage',
          $recipe$: 'Message',
          properties: { content: { type: 'string' } },
        },
      ];

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listRecipes.mockResolvedValue({
        success: true,
        count: 3,
        recipes: mockRecipes,
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = { type: undefined, instance: undefined };

      await listCommand!.action(mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.listRecipes).toHaveBeenCalledWith(undefined);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Recipes (3)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Person (Recipe)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Profile (Recipe)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('CustomMessage (Message)')
      );
    });

    it('should filter recipes by type', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockRecipes = [
        {
          $type$: 'Person',
          $recipe$: 'Recipe',
          properties: { name: { type: 'string' } },
        },
        {
          $type$: 'Profile',
          $recipe$: 'Recipe',
          properties: { nickname: { type: 'string' } },
        },
      ];

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listRecipes.mockResolvedValue({
        success: true,
        count: 2,
        recipes: mockRecipes,
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = { type: 'Recipe', instance: undefined };

      await listCommand!.action(mockOptions);

      expect(mockClient.listRecipes).toHaveBeenCalledWith('Recipe');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Recipes of type "Recipe" (2)')
      );
    });

    it('should handle no recipes found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listRecipes.mockResolvedValue({
        success: true,
        count: 0,
        recipes: [],
      });

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = { type: undefined };

      await listCommand!.action(mockOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No recipes found')
      );
    });

    it('should handle list operation failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listRecipes.mockRejectedValue(new Error('Failed to list recipes'));

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

      const mockOptions = {};

      await listCommand!.action(mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Failed to list recipes'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle LocalCredentials load errors', async () => {
      mockLocalCreds.load.mockRejectedValue(new Error('Failed to load credentials'));

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

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

      const { recipeCommand } = await import('../../src/commands/recipe');
      const listCommand = recipeCommand.commands.find(cmd => cmd.name() === 'list');

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