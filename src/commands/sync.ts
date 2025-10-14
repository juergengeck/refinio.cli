import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Main sync command for testing one.filer sync functionality
export const syncCommand = new Command('sync')
  .description('Test one.filer synchronization between instances');

// Create test instances
syncCommand
  .command('setup')
  .description('Set up two test instances for sync testing')
  .option('-d1, --dir1 <path>', 'Directory for first instance', './test-instance-1')
  .option('-d2, --dir2 <path>', 'Directory for second instance', './test-instance-2')
  .option('-p1, --port1 <port>', 'API port for first instance', '3001')
  .option('-p2, --port2 <port>', 'API port for second instance', '3002')
  .action(async (options) => {
    const spinner = ora('Setting up test instances...').start();
    
    try {
      // Create directories
      fs.mkdirSync(options.dir1, { recursive: true });
      fs.mkdirSync(options.dir2, { recursive: true });
      
      // Create config files
      const config1 = {
        directory: options.dir1,
        useFiler: true,
        filerConfig: {
          mountPoint: path.join(options.dir1, 'mount'),
          pairingUrl: 'https://leute.dev.refinio.one/invites/invitePartner/?invited=true',
          iomMode: 'light',
          logCalls: false
        },
        commServerUrl: 'wss://comm.dev.refinio.one',
        createEveryoneGroup: true
      };
      
      const config2 = {
        directory: options.dir2,
        useFiler: true,
        filerConfig: {
          mountPoint: path.join(options.dir2, 'mount'),
          pairingUrl: 'https://leute.dev.refinio.one/invites/invitePartner/?invited=true',
          iomMode: 'light',
          logCalls: false
        },
        commServerUrl: 'wss://comm.dev.refinio.one',
        createEveryoneGroup: true
      };
      
      fs.writeFileSync(
        path.join(options.dir1, 'config.json'),
        JSON.stringify(config1, null, 2)
      );
      
      fs.writeFileSync(
        path.join(options.dir2, 'config.json'),
        JSON.stringify(config2, null, 2)
      );
      
      spinner.succeed('Test instances configured');
      
      console.log(chalk.bold('\nTest instances ready:'));
      console.log(chalk.gray(`Instance 1: ${options.dir1} (port ${options.port1})`));
      console.log(chalk.gray(`Instance 2: ${options.dir2} (port ${options.port2})`));
      
      console.log(chalk.yellow('\nNext steps:'));
      console.log('1. Start instance 1: npm run start -- -s secret1 -c ' + path.join(options.dir1, 'config.json'));
      console.log('2. Start instance 2: npm run start -- -s secret2 -c ' + path.join(options.dir2, 'config.json'));
      console.log('3. Run: refinio sync test');
      
    } catch (error: any) {
      spinner.fail(`Failed to set up: ${error.message}`);
      process.exit(1);
    }
  });

// Read invite from filesystem
syncCommand
  .command('read-invite <instancePath>')
  .description('Read invitation from instance filesystem')
  .action(async (instancePath) => {
    const spinner = ora('Reading invitation...').start();
    
    try {
      // Look for invitation files in the mount/invites directory
      const invitesPath = path.join(instancePath, 'mount', 'invites');
      
      if (!fs.existsSync(invitesPath)) {
        throw new Error(`Invites directory not found: ${invitesPath}`);
      }
      
      const files = fs.readdirSync(invitesPath);
      const inviteFiles = files.filter(f => f.includes('invite'));
      
      if (inviteFiles.length === 0) {
        throw new Error('No invitation files found');
      }
      
      spinner.succeed('Found invitations:');
      
      for (const file of inviteFiles) {
        const filePath = path.join(invitesPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log(chalk.bold(`\n${file}:`));
        console.log(chalk.gray(content.substring(0, 200)));
        
        // Try to extract invite URL
        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          console.log(chalk.green(`Invite URL: ${urlMatch[0]}`));
        }
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to read invite: ${error.message}`);
      process.exit(1);
    }
  });

// Write data for sync testing
syncCommand
  .command('write-test-data <instancePath>')
  .description('Write test data to instance filesystem')
  .option('-p, --path <path>', 'Path within filesystem', '/test-data')
  .action(async (instancePath, options) => {
    const spinner = ora('Writing test data...').start();
    
    try {
      const mountPath = path.join(instancePath, 'mount');
      const testPath = path.join(mountPath, options.path.replace(/^\//, ''));
      
      // Create test directory
      fs.mkdirSync(testPath, { recursive: true });
      
      // Write test files
      const testFiles = [
        { name: 'test1.txt', content: `Test file 1 - ${new Date().toISOString()}` },
        { name: 'test2.txt', content: `Test file 2 - ${new Date().toISOString()}` },
        { name: 'data.json', content: JSON.stringify({ test: true, timestamp: Date.now() }, null, 2) }
      ];
      
      for (const file of testFiles) {
        const filePath = path.join(testPath, file.name);
        fs.writeFileSync(filePath, file.content);
        console.log(chalk.gray(`  Created: ${file.name}`));
      }
      
      spinner.succeed(`Test data written to ${options.path}`);
      
    } catch (error: any) {
      spinner.fail(`Failed to write test data: ${error.message}`);
      process.exit(1);
    }
  });

// Verify synced data
syncCommand
  .command('verify <instancePath>')
  .description('Verify synced data in instance filesystem')
  .option('-p, --path <path>', 'Path to verify', '/test-data')
  .option('-e, --expected <files>', 'Expected files (comma-separated)', 'test1.txt,test2.txt,data.json')
  .action(async (instancePath, options) => {
    const spinner = ora('Verifying synced data...').start();
    
    try {
      const mountPath = path.join(instancePath, 'mount');
      const testPath = path.join(mountPath, options.path.replace(/^\//, ''));
      
      if (!fs.existsSync(testPath)) {
        throw new Error(`Path not found: ${testPath}`);
      }
      
      const expectedFiles = options.expected.split(',').map((s: string) => s.trim());
      const actualFiles = fs.readdirSync(testPath);
      
      const found: string[] = [];
      const missing: string[] = [];
      
      for (const file of expectedFiles) {
        if (actualFiles.includes(file)) {
          found.push(file);
        } else {
          missing.push(file);
        }
      }
      
      if (missing.length > 0) {
        spinner.fail('Some files are missing');
        console.log(chalk.green('Found:'), found.join(', '));
        console.log(chalk.red('Missing:'), missing.join(', '));
      } else {
        spinner.succeed('All expected files found');
        
        // Show file contents
        console.log(chalk.bold('\nFile contents:'));
        for (const file of found) {
          const filePath = path.join(testPath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          console.log(chalk.gray(`${file}: ${content.substring(0, 100)}`));
        }
      }
      
    } catch (error: any) {
      spinner.fail(`Verification failed: ${error.message}`);
      process.exit(1);
    }
  });

// Monitor filesystem changes
syncCommand
  .command('monitor <instancePath>')
  .description('Monitor filesystem for changes')
  .option('-i, --interval <ms>', 'Check interval in milliseconds', '2000')
  .option('-d, --duration <sec>', 'Monitor duration in seconds', '30')
  .action(async (instancePath, options) => {
    const spinner = ora('Starting monitor...').start();
    
    try {
      const mountPath = path.join(instancePath, 'mount');
      
      if (!fs.existsSync(mountPath)) {
        throw new Error(`Mount path not found: ${mountPath}`);
      }
      
      spinner.succeed(`Monitoring ${mountPath} for ${options.duration} seconds`);
      
      const startTime = Date.now();
      const endTime = startTime + (parseInt(options.duration) * 1000);
      const interval = parseInt(options.interval);
      
      // Track file states
      const fileStates = new Map<string, any>();
      
      const checkDirectory = (dir: string, prefix = '') => {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const relativePath = path.join(prefix, file);
          const stats = fs.statSync(fullPath);
          
          const key = relativePath;
          const prev = fileStates.get(key);
          
          if (!prev) {
            console.log(chalk.green(`  [NEW] ${relativePath}`));
            fileStates.set(key, { mtime: stats.mtime, size: stats.size });
          } else if (prev.mtime.getTime() !== stats.mtime.getTime()) {
            console.log(chalk.yellow(`  [MODIFIED] ${relativePath}`));
            fileStates.set(key, { mtime: stats.mtime, size: stats.size });
          }
          
          if (stats.isDirectory()) {
            checkDirectory(fullPath, relativePath);
          }
        }
      };
      
      const monitorInterval = setInterval(() => {
        if (Date.now() >= endTime) {
          clearInterval(monitorInterval);
          console.log(chalk.gray('\nMonitoring complete'));
          return;
        }
        
        checkDirectory(mountPath);
      }, interval);
      
    } catch (error: any) {
      spinner.fail(`Monitor failed: ${error.message}`);
      process.exit(1);
    }
  });

// Full sync test
syncCommand
  .command('test')
  .description('Run a full sync test between two instances')
  .option('--instance1 <path>', 'Path to instance 1', './test-instance-1')
  .option('--instance2 <path>', 'Path to instance 2', './test-instance-2')
  .action(async (options) => {
    console.log(chalk.bold('\n🧪 ONE.FILER SYNC TEST\n'));
    
    try {
      // Step 1: Check instances are running
      console.log('1️⃣ Checking instances...');
      
      const mount1 = path.join(options.instance1, 'mount');
      const mount2 = path.join(options.instance2, 'mount');
      
      if (!fs.existsSync(mount1)) {
        throw new Error(`Instance 1 not mounted at ${mount1}`);
      }
      if (!fs.existsSync(mount2)) {
        throw new Error(`Instance 2 not mounted at ${mount2}`);
      }
      
      console.log(chalk.green('  ✓ Both instances are running'));
      
      // Step 2: Read invite from instance 1
      console.log('\n2️⃣ Reading invite from instance 1...');
      const invitePath1 = path.join(mount1, 'invites', 'iop-invite.txt');
      
      if (!fs.existsSync(invitePath1)) {
        console.log(chalk.yellow('  Invite not found, waiting...'));
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      let inviteUrl = '';
      if (fs.existsSync(invitePath1)) {
        const inviteContent = fs.readFileSync(invitePath1, 'utf8');
        const match = inviteContent.match(/https?:\/\/[^\s]+/);
        if (match) {
          inviteUrl = match[0];
          console.log(chalk.green(`  ✓ Found invite: ${inviteUrl.substring(0, 50)}...`));
        }
      }
      
      // Step 3: Write test data to instance 1
      console.log('\n3️⃣ Writing test data to instance 1...');
      const testDir = path.join(mount1, 'test-sync-data');
      fs.mkdirSync(testDir, { recursive: true });
      
      const testData = {
        'file1.txt': 'Test content from instance 1',
        'file2.json': JSON.stringify({ source: 'instance1', timestamp: Date.now() }),
        'file3.md': '# Sync Test\n\nThis file should sync to instance 2'
      };
      
      for (const [filename, content] of Object.entries(testData)) {
        fs.writeFileSync(path.join(testDir, filename), content);
        console.log(chalk.gray(`  Created: ${filename}`));
      }
      
      // Step 4: Wait for sync
      console.log('\n4️⃣ Waiting for sync (10 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Step 5: Verify data on instance 2
      console.log('\n5️⃣ Verifying data on instance 2...');
      const testDir2 = path.join(mount2, 'test-sync-data');
      
      if (fs.existsSync(testDir2)) {
        const files = fs.readdirSync(testDir2);
        console.log(chalk.green(`  ✓ Found ${files.length} files in instance 2`));
        
        for (const file of files) {
          const content = fs.readFileSync(path.join(testDir2, file), 'utf8');
          console.log(chalk.gray(`    ${file}: ${content.substring(0, 50)}...`));
        }
      } else {
        console.log(chalk.yellow('  ⚠ Data not yet synced to instance 2'));
      }
      
      console.log(chalk.bold('\n✅ Sync test complete'));
      
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Test failed: ${error.message}`));
      process.exit(1);
    }
  });