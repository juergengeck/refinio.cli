const { spawn } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { promisify } = require('util');

const sleep = promisify(setTimeout);

describe('Refinio CLI Connection Test', () => {
  let serverProcess;
  let serverPort = 49498;

  beforeAll(async () => {
    console.log('Starting refinio.api server...');

    // Start the refinio.api server using refinio CLI
    serverProcess = spawn('refinio', [
      'start',
      '--port', String(serverPort),
      '--secret', 'test-secret-123',
      '--directory', 'C:\\temp\\refinio-test-storage'
    ], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start in 30 seconds'));
      }, 30000);

      serverProcess.stdout.on('data', (data) => {
        console.log('Server:', data.toString());
        if (data.toString().includes('Refinio API server listening') ||
            data.toString().includes('started on port')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString());
      });

      serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server: ${err.message}`));
      });
    });

    console.log('Server is ready!');
    // Give it a bit more time to fully initialize
    await sleep(2000);
  });

  afterAll(async () => {
    console.log('Cleaning up...');

    if (serverProcess) {
      // Stop the server gracefully
      try {
        spawn('refinio', ['stop'], { shell: true });
        await sleep(1000);
      } catch (e) {
        console.log('Error stopping server:', e.message);
      }

      // Force kill if still running
      if (!serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await sleep(500);
        if (!serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }
    }
  });

  test('should connect to ONE instance using invitation', async () => {
    // Read the invitation from OneFiler\invites
    const invitePath = 'C:\\OneFiler\\invites\\iop_invite.txt';

    if (!existsSync(invitePath)) {
      throw new Error(`Invitation file not found at ${invitePath}. Make sure ONE Filer is running and has generated an invitation.`);
    }

    const inviteUrl = readFileSync(invitePath, 'utf8').trim();
    console.log('Read invitation:', inviteUrl);

    // Accept the invitation using refinio CLI
    const acceptResult = await new Promise((resolve, reject) => {
      const acceptProcess = spawn('refinio', [
        'invite',
        'accept',
        inviteUrl
      ], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      acceptProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Accept output:', data.toString());
      });

      acceptProcess.stderr.on('data', (data) => {
        error += data.toString();
        console.error('Accept error:', data.toString());
      });

      acceptProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Failed to accept invitation: ${error || output}`));
        }
      });
    });

    expect(acceptResult).toContain('Invitation accepted');

    // Now connect using the stored invitation
    const connectResult = await new Promise((resolve, reject) => {
      const connectProcess = spawn('refinio', [
        'connect-vc',
        '--timeout', '30000'
      ], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      connectProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Connect output:', data.toString());
      });

      connectProcess.stderr.on('data', (data) => {
        error += data.toString();
        console.error('Connect error:', data.toString());
      });

      connectProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Failed to connect: ${error || output}`));
        }
      });
    });

    // Verify connection was successful
    expect(connectResult).toContain('Connection established');
    expect(connectResult).toContain('successfully');

    // List connections to verify
    const listResult = await new Promise((resolve, reject) => {
      const listProcess = spawn('refinio', [
        'instances'
      ], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';

      listProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('Failed to list instances'));
        }
      });
    });

    console.log('Connected instances:', listResult);
    expect(listResult).toBeTruthy();
  });
});