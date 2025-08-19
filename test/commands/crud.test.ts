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

describe('CRUD Commands', () => {
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
      createObject: jest.fn(),
      readObject: jest.fn(),
      updateObject: jest.fn(),
      deleteObject: jest.fn(),
      listObjects: jest.fn(),
      disconnect: jest.fn(),
    };

    (createProfileClient as jest.Mock).mockResolvedValue(mockClient);

    // Mock fs/promises
    mockFs = require('fs/promises');
    mockFs.readFile = jest.fn();
    mockFs.writeFile = jest.fn();

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

  describe('create command', () => {
    it('should create object from inline data successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      
      mockClient.createObject.mockResolvedValue({
        success: true,
        id: 'created-object-123',
        version: '1.0.0',
      });

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"name":"John Doe","email":"john@example.com"}',
        file: undefined,
        instance: undefined,
      };

      await createCommand.action('Person', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(mockLocalCreds.getInstance).toHaveBeenCalledWith(undefined);
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.createObject).toHaveBeenCalledWith('Person', {
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object created successfully')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('ID: created-object-123')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should create object from file successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const objectData = { name: 'Jane Doe', email: 'jane@example.com' };
      
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockResolvedValue(JSON.stringify(objectData));
      mockClient.createObject.mockResolvedValue({
        success: true,
        id: 'created-object-456',
        version: '1.0.0',
      });

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: undefined,
        file: '/path/to/data.json',
        instance: undefined,
      };

      await createCommand.action('Person', mockOptions);

      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/data.json', 'utf-8');
      expect(mockClient.createObject).toHaveBeenCalledWith('Person', objectData);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object created successfully')
      );
    });

    it('should handle missing data and file options', async () => {
      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: undefined,
        file: undefined,
      };

      await createCommand.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Either --data or --file must be provided'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid JSON in data option', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: 'invalid json',
        file: undefined,
      };

      await createCommand.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle file read errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: undefined,
        file: '/path/to/nonexistent.json',
      };

      await createCommand.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'ENOENT: no such file or directory'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle creation failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.createObject.mockRejectedValue(new Error('Creation failed'));

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"name":"Test"}',
        file: undefined,
      };

      await createCommand.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Creation failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('read command', () => {
    it('should read object successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockObjectData = {
        name: 'John Doe',
        email: 'john@example.com',
        created: Date.now(),
      };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.readObject.mockResolvedValue({
        success: true,
        data: mockObjectData,
        version: '1.0.0',
      });

      const { readCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        version: undefined,
        output: undefined,
        instance: undefined,
      };

      await readCommand.action('object-123', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.readObject).toHaveBeenCalledWith('object-123', undefined);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object ID: object-123')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Version: 1.0.0')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should read specific version of object', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.readObject.mockResolvedValue({
        success: true,
        data: { name: 'Test' },
        version: '2.0.0',
      });

      const { readCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        version: '2.0.0',
        output: undefined,
      };

      await readCommand.action('object-123', mockOptions);

      expect(mockClient.readObject).toHaveBeenCalledWith('object-123', '2.0.0');
    });

    it('should save object data to file', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockObjectData = { name: 'John Doe' };

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.readObject.mockResolvedValue({
        success: true,
        data: mockObjectData,
        version: '1.0.0',
      });

      const { readCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        version: undefined,
        output: '/path/to/output.json',
      };

      await readCommand.action('object-123', mockOptions);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/path/to/output.json',
        JSON.stringify(mockObjectData, null, 2),
        'utf-8'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object data saved to /path/to/output.json')
      );
    });

    it('should handle object not found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.readObject.mockResolvedValue({
        success: false,
        error: 'Object not found',
      });

      const { readCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await readCommand.action('nonexistent-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        "Object 'nonexistent-123' not found"
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle read operation failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.readObject.mockRejectedValue(new Error('Read failed'));

      const { readCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await readCommand.action('object-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Read failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('update command', () => {
    it('should update object with inline data successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      
      mockClient.updateObject.mockResolvedValue({
        success: true,
        version: '2.0.0',
        modified: Date.now(),
      });

      const { updateCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"email":"newemail@example.com"}',
        file: undefined,
      };

      await updateCommand.action('object-123', mockOptions);

      expect(mockClient.updateObject).toHaveBeenCalledWith('object-123', {
        email: 'newemail@example.com',
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object updated successfully')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('New version: 2.0.0')
      );
    });

    it('should update object from file successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const updateData = { status: 'active', lastModified: Date.now() };
      
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockFs.readFile.mockResolvedValue(JSON.stringify(updateData));
      mockClient.updateObject.mockResolvedValue({
        success: true,
        version: '2.1.0',
        modified: Date.now(),
      });

      const { updateCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: undefined,
        file: '/path/to/updates.json',
      };

      await updateCommand.action('object-123', mockOptions);

      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/updates.json', 'utf-8');
      expect(mockClient.updateObject).toHaveBeenCalledWith('object-123', updateData);
    });

    it('should handle missing data and file options', async () => {
      const { updateCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: undefined,
        file: undefined,
      };

      await updateCommand.action('object-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Either --data or --file must be provided'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle update failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.updateObject.mockRejectedValue(new Error('Update failed'));

      const { updateCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"status":"updated"}',
        file: undefined,
      };

      await updateCommand.action('object-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Update failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('delete command', () => {
    it('should delete object successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      
      mockClient.deleteObject.mockResolvedValue({
        success: true,
        message: 'Object deleted successfully',
      });

      const { deleteCommand } = await import('../../src/commands/crud');

      const mockOptions = { instance: undefined };

      await deleteCommand.action('object-123', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.deleteObject).toHaveBeenCalledWith('object-123');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Object deleted successfully')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle delete operation failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.deleteObject.mockRejectedValue(new Error('Delete failed'));

      const { deleteCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await deleteCommand.action('object-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Delete failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle object not found for deletion', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.deleteObject.mockResolvedValue({
        success: false,
        error: 'Object not found',
      });

      const { deleteCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await deleteCommand.action('nonexistent-123', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        "Failed to delete object: Object not found"
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('list command', () => {
    it('should list objects successfully', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      const mockObjects = [
        { id: 'obj-1', type: 'Person', name: 'John Doe' },
        { id: 'obj-2', type: 'Person', name: 'Jane Doe' },
        { id: 'obj-3', type: 'Person', name: 'Bob Smith' },
      ];

      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listObjects.mockResolvedValue({
        success: true,
        count: 3,
        objects: mockObjects,
      });

      const { listCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        limit: undefined,
        offset: undefined,
        instance: undefined,
      };

      await listCommand.action('Person', mockOptions);

      expect(mockLocalCreds.load).toHaveBeenCalled();
      expect(createProfileClient).toHaveBeenCalledWith(mockInstance.instanceUrl);
      expect(mockClient.listObjects).toHaveBeenCalledWith('Person', {});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Objects of type "Person" (3)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('obj-1')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('John Doe')
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should apply limit and offset options', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listObjects.mockResolvedValue({
        success: true,
        count: 1,
        objects: [{ id: 'obj-21', type: 'Person', name: 'Person 21' }],
      });

      const { listCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        limit: 10,
        offset: 20,
      };

      await listCommand.action('Person', mockOptions);

      expect(mockClient.listObjects).toHaveBeenCalledWith('Person', {
        limit: 10,
        offset: 20,
      });
    });

    it('should handle no objects found', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listObjects.mockResolvedValue({
        success: true,
        count: 0,
        objects: [],
      });

      const { listCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await listCommand.action('NonexistentType', mockOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No objects of type "NonexistentType" found')
      );
    });

    it('should handle list operation failure', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      mockClient.listObjects.mockRejectedValue(new Error('List operation failed'));

      const { listCommand } = await import('../../src/commands/crud');

      const mockOptions = {};

      await listCommand.action('Person', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'List operation failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle LocalCredentials load errors', async () => {
      mockLocalCreds.load.mockRejectedValue(new Error('Failed to load credentials'));

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"test":"data"}',
      };

      await createCommand.action('TestType', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Failed to load credentials'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle missing instance connection', async () => {
      mockLocalCreds.getInstance.mockReturnValue(null);

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"test":"data"}',
      };

      await createCommand.action('TestType', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'No instance connection found. Use "refinio connect" first.'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle client connection errors', async () => {
      const mockInstance = (global as any).testHelpers.mockInstance;
      mockLocalCreds.getInstance.mockReturnValue(mockInstance);
      (createProfileClient as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const { createCommand } = await import('../../src/commands/crud');

      const mockOptions = {
        data: '{"test":"data"}',
      };

      await createCommand.action('TestType', mockOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.anything(),
        'Connection failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});