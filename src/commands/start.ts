import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const startCommand = new Command('start')
  .description('Start a refinio instance with filer support')
  .option('-s, --secret <secret>', 'Instance secret', 'test123')
  .option('-d, --directory <dir>', 'Data directory')
  .option('-p, --port <port>', 'Port number', '8080')
  .option('--filer', 'Enable filer filesystem')
  .option('--filer-mount-point <path>', 'Filer mount point (Linux/WSL)')
  .option('--filer-projfs-root <path>', 'ProjFS root path (Windows)')
  .option('--comm-server-url <url>', 'Communication server URL', 'wss://comm10.dev.refinio.one')
  .option('--iom-mode <mode>', 'IoM mode (full or light)', 'light')
  .option('--log-calls', 'Enable call logging')
  .option('--background', 'Run in background')
  .action(async (options) => {
    const spinner = ora('Starting refinio instance...').start();
    
    try {
      // Determine platform
      const platform = process.platform === 'win32' ? 'windows' : 'linux';
      
      // Set up data directory
      const dataDir = options.directory || path.join(process.cwd(), `refinio-data-${Date.now()}`);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Build arguments for starting the refinio.api server via CLI wrapper
      const refinioApiPath = path.join(__dirname, '../../../refinio.api/dist/cli.js');
      const args = [
        refinioApiPath,
        '--secret', options.secret,
        '--directory', dataDir,
        '--port', options.port
      ];
      
      // Note: filer, commServerUrl, iomMode options are CLI-specific
      // and not passed to refinio.api server directly
      // They would be handled by the CLI if needed
      
      const env = {
        ...process.env,
        ONE_INSTANCE_PORT: options.port
      };
      
      console.log(chalk.gray(`Command: node ${args.join(' ')}`));
      console.log(chalk.gray(`Data directory: ${dataDir}`));
      console.log(chalk.gray(`Platform: ${platform}`));
      
      const child = spawn('node', args, {
        stdio: options.background ? 'pipe' : 'inherit',
        env,
        detached: options.background
      });
      
      if (options.background) {
        child.unref();
        spinner.succeed(`Instance started in background (PID: ${child.pid})`);
        
        console.log(chalk.green('\n✓ Instance Details:'));
        console.log(chalk.gray(`  PID: ${child.pid}`));
        console.log(chalk.gray(`  Port: ${options.port}`));
        console.log(chalk.gray(`  Data: ${dataDir}`));
        console.log(chalk.gray(`  Secret: ${options.secret}`));
        
        if (options.filer) {
          const mountPoint = platform === 'windows' 
            ? options.filerProjfsRoot 
            : options.filerMountPoint;
          if (mountPoint) {
            console.log(chalk.gray(`  Mount: ${mountPoint}`));
          }
        }
        
        console.log(chalk.yellow('\nTo stop: kill -TERM ' + child.pid));
        
        // Write PID file for easier management
        const pidFile = path.join(dataDir, 'instance.pid');
        fs.writeFileSync(pidFile, child.pid!.toString());
        console.log(chalk.gray(`PID file: ${pidFile}`));
        
      } else {
        spinner.succeed('Instance started in foreground');
        
        child.on('exit', (code) => {
          if (code === 0) {
            console.log(chalk.green('Instance stopped gracefully'));
          } else {
            console.log(chalk.red(`Instance exited with code ${code}`));
          }
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\nShutting down instance...'));
          child.kill('SIGTERM');
        });
        
        process.on('SIGTERM', () => {
          console.log(chalk.yellow('\nShutting down instance...'));
          child.kill('SIGTERM');
        });
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to start instance: ${error.message}`);
      process.exit(1);
    }
  });

// Stop command
export const stopCommand = new Command('stop')
  .description('Stop a running refinio instance')
  .option('-d, --directory <dir>', 'Data directory containing PID file')
  .option('--pid <pid>', 'Process ID to stop')
  .option('--all', 'Stop all refinio instances')
  .action(async (options) => {
    const spinner = ora('Stopping instance(s)...').start();
    
    try {
      if (options.all) {
        // Kill all node processes that look like refinio instances
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        if (process.platform === 'win32') {
          await execAsync(`wmic process where "name='node.exe' and commandline like '%refinio%'" delete`);
        } else {
          await execAsync(`pkill -f "node.*refinio"`);
        }
        
        spinner.succeed('All refinio instances stopped');
        
      } else if (options.pid) {
        // Kill specific PID
        try {
          process.kill(parseInt(options.pid), 'SIGTERM');
          spinner.succeed(`Instance ${options.pid} stopped`);
        } catch (err) {
          throw new Error(`Could not stop process ${options.pid}: ${err}`);
        }
        
      } else if (options.directory) {
        // Read PID from file
        const pidFile = path.join(options.directory, 'instance.pid');
        if (fs.existsSync(pidFile)) {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
          try {
            process.kill(pid, 'SIGTERM');
            fs.unlinkSync(pidFile);
            spinner.succeed(`Instance ${pid} stopped`);
          } catch (err) {
            throw new Error(`Could not stop process ${pid}: ${err}`);
          }
        } else {
          throw new Error(`PID file not found: ${pidFile}`);
        }
        
      } else {
        throw new Error('Must specify --directory, --pid, or --all');
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to stop instance: ${error.message}`);
      process.exit(1);
    }
  });

// List running instances
export const listCommand = new Command('list')
  .description('List running refinio instances')
  .action(async () => {
    const spinner = ora('Finding running instances...').start();
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      let processes: string;
      
      if (process.platform === 'win32') {
        const result = await execAsync(`wmic process where "name='node.exe'" get processid,commandline /format:csv`);
        processes = result.stdout;
      } else {
        const result = await execAsync(`ps aux | grep node | grep -v grep`);
        processes = result.stdout;
      }
      
      const reefinioProcesses = processes
        .split('\n')
        .filter(line => line.includes('refinio') || line.includes('one.filer'))
        .filter(line => line.trim().length > 0);
      
      spinner.succeed(`Found ${reefinioProcesses.length} running instances`);
      
      if (reefinioProcesses.length === 0) {
        console.log(chalk.yellow('No refinio instances running'));
      } else {
        console.log(chalk.bold('\nRunning Instances:'));
        reefinioProcesses.forEach((proc, i) => {
          console.log(chalk.gray(`${i + 1}. ${proc.trim()}`));
        });
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to list instances: ${error.message}`);
      process.exit(1);
    }
  });