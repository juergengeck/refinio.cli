import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createProfileClient } from '../client/ProfileAwareClient';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Main filer command
export const filerCommand = new Command('filer')
  .description('Manage one.filer filesystem')
  .alias('fs');

// Mount command
filerCommand
  .command('mount')
  .description('Mount the filer filesystem')
  .option('-m, --mount-point <path>', 'Mount point path', 'mnt')
  .option('-u, --pairing-url <url>', 'Pairing URL')
  .option('--iom-mode <mode>', 'IoM mode (full or light)', 'light')
  .option('--log-calls', 'Enable call logging')
  .action(async (options) => {
    const spinner = ora('Mounting filer filesystem...').start();
    
    try {
      const profile = options.parent?.opts()?.profile;
      const client = await createProfileClient(profile);
      
      const config: any = {
        mountPoint: options.mountPoint,
        iomMode: options.iomMode,
        logCalls: options.logCalls
      };
      
      if (options.pairingUrl) {
        config.pairingUrl = options.pairingUrl;
      }
      
      const result = await client.request('filer', {
        operation: 'mount',
        config
      });
      
      spinner.succeed(`Filer mounted at ${result.mountPoint}`);
      console.log(chalk.gray(`Platform: ${result.platform}`));
      console.log(chalk.gray(`Mode: ${result.mode}`));
      
      if (result.fileSystems) {
        console.log(chalk.gray('File systems:'));
        result.fileSystems.forEach((fs: string) => {
          console.log(chalk.gray(`  - ${fs}`));
        });
      }
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to mount filer: ${error.message}`);
      process.exit(1);
    }
  });

// Unmount command
filerCommand
  .command('unmount')
  .description('Unmount the filer filesystem')
  .alias('umount')
  .action(async () => {
    const spinner = ora('Unmounting filer filesystem...').start();
    
    try {
      const profile = process.argv.includes('--profile') 
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const result = await client.request('filer', {
        operation: 'unmount'
      });
      
      spinner.succeed('Filer unmounted');
      console.log(chalk.gray(`Mounted: ${result.mounted}`));
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to unmount filer: ${error.message}`);
      process.exit(1);
    }
  });

// Status command
filerCommand
  .command('status')
  .description('Get filer filesystem status')
  .action(async () => {
    const spinner = ora('Getting filer status...').start();
    
    try {
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const result = await client.request('filer', {
        operation: 'status'
      });
      
      spinner.succeed('Filer status retrieved');
      
      console.log(chalk.bold('\nFiler Status:'));
      console.log(chalk.gray(`Mounted: ${result.mounted ? chalk.green('Yes') : chalk.red('No')}`));
      
      if (result.mounted) {
        console.log(chalk.gray(`Mount point: ${result.mountPoint}`));
        console.log(chalk.gray(`Platform: ${result.platform}`));
        console.log(chalk.gray(`Mode: ${result.mode}`));
        
        if (result.fileSystems) {
          console.log(chalk.gray('\nMounted file systems:'));
          result.fileSystems.forEach((fs: string) => {
            console.log(chalk.gray(`  - ${fs}`));
          });
        }
        
        if (result.config) {
          console.log(chalk.gray('\nConfiguration:'));
          Object.entries(result.config).forEach(([key, value]) => {
            console.log(chalk.gray(`  ${key}: ${JSON.stringify(value)}`));
          });
        }
      }
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to get filer status: ${error.message}`);
      process.exit(1);
    }
  });

// Config command
filerCommand
  .command('config')
  .description('View or update filer configuration')
  .option('-s, --set <key=value>', 'Set a configuration value')
  .option('-g, --get <key>', 'Get a configuration value')
  .action(async (options) => {
    const spinner = ora('Managing filer configuration...').start();
    
    try {
      const profile = options.parent?.parent?.opts()?.profile;
      const client = await createProfileClient(profile);
      
      let config: any = {};
      
      if (options.set) {
        const [key, value] = options.set.split('=');
        config[key] = value === 'true' ? true : value === 'false' ? false : value;
      }
      
      const result = await client.request('filer', {
        operation: 'config',
        config: Object.keys(config).length > 0 ? config : undefined
      });
      
      spinner.succeed('Configuration retrieved');
      
      if (options.get) {
        console.log(`${options.get}: ${JSON.stringify(result[options.get])}`);
      } else {
        console.log(chalk.bold('\nCurrent Configuration:'));
        Object.entries(result).forEach(([key, value]) => {
          console.log(chalk.gray(`  ${key}: ${JSON.stringify(value)}`));
        });
      }
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to manage configuration: ${error.message}`);
      process.exit(1);
    }
  });

// Refresh command
filerCommand
  .command('refresh')
  .description('Refresh the filer filesystem (remount)')
  .action(async () => {
    const spinner = ora('Refreshing filer filesystem...').start();
    
    try {
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const result = await client.request('filer', {
        operation: 'refresh'
      });
      
      spinner.succeed('Filer refreshed');
      console.log(chalk.gray(`Mounted at: ${result.mountPoint}`));
      console.log(chalk.gray(`Platform: ${result.platform}`));
      console.log(chalk.gray(`Mode: ${result.mode}`));
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to refresh filer: ${error.message}`);
      process.exit(1);
    }
  });

// List filesystems command
filerCommand
  .command('list-fs')
  .description('List all mounted filesystems')
  .alias('ls-fs')
  .action(async () => {
    const spinner = ora('Listing filesystems...').start();
    
    try {
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const result = await client.request('filer', {
        operation: 'listFileSystems'
      });
      
      spinner.succeed('Filesystems listed');
      
      console.log(chalk.bold('\nMounted Filesystems:'));
      if (Array.isArray(result)) {
        result.forEach((fs: string) => {
          console.log(chalk.gray(`  - ${fs}`));
        });
      } else {
        console.log(chalk.yellow('No filesystems mounted'));
      }
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to list filesystems: ${error.message}`);
      process.exit(1);
    }
  });

// Filesystem info command  
filerCommand
  .command('fs-info <path>')
  .description('Get information about a specific filesystem')
  .action(async (path) => {
    const spinner = ora(`Getting info for filesystem ${path}...`).start();
    
    try {
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const result = await client.request('filer', {
        operation: 'fileSystemInfo',
        path
      });
      
      spinner.succeed(`Filesystem info for ${path}`);
      
      console.log(chalk.bold(`\nFilesystem: ${result.path}`));
      console.log(chalk.gray(`Description: ${result.description}`));
      console.log(chalk.gray(`Mounted: ${result.mounted ? chalk.green('Yes') : chalk.red('No')}`));
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to get filesystem info: ${error.message}`);
      process.exit(1);
    }
  });

// Clear cache command
filerCommand
  .command('clear-cache [filesystem]')
  .description('Clear cache for a filesystem or all filesystems')
  .action(async (filesystem) => {
    const spinner = ora(
      filesystem 
        ? `Clearing cache for ${filesystem}...`
        : 'Clearing all caches...'
    ).start();
    
    try {
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      await client.request('filer', {
        operation: 'clearCache',
        fsPath: filesystem
      });
      
      spinner.succeed(
        filesystem
          ? `Cache cleared for ${filesystem}`
          : 'All caches cleared'
      );
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(`Failed to clear cache: ${error.message}`);
      process.exit(1);
    }
  });

// Profile management for filer start command
const PROFILES_DIR = path.join(os.homedir(), '.refinio-cli', 'filer-profiles');
const DEFAULT_PROFILE = 'default';

interface FilerProfile {
  secret: string;
  directory: string;
  mountPoint?: string;
  commServerUrl?: string;
  pairingUrl?: string;
  iomMode?: string;
  logCalls?: boolean;
  filer?: boolean;
}

function ensureProfilesDir(): void {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function getProfilePath(profileName: string): string {
  return path.join(PROFILES_DIR, `${profileName}.json`);
}

function loadProfile(profileName: string): FilerProfile | null {
  const profilePath = getProfilePath(profileName);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (err) {
    console.error(`Error loading profile ${profileName}:`, err);
    return null;
  }
}

function saveProfile(profileName: string, profile: FilerProfile): void {
  ensureProfilesDir();
  const profilePath = getProfilePath(profileName);
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
}

function createDefaultProfile(): void {
  const platform = process.platform === 'win32' ? 'windows' : 'linux';
  const defaultProfile: FilerProfile = {
    secret: 'test123',
    directory: platform === 'windows' ? 'C:\\OneFiler' : path.join(os.homedir(), 'OneFiler'),
    mountPoint: platform === 'windows' ? 'C:\\OneFiler\\mount' : path.join(os.homedir(), 'OneFiler', 'mount'),
    commServerUrl: 'wss://comm10.dev.refinio.one',
    pairingUrl: 'https://leute.dev.refinio.one/invites/invitePartner/?invited=true',
    iomMode: 'light',
    filer: true,
    logCalls: false
  };
  
  saveProfile(DEFAULT_PROFILE, defaultProfile);
  console.log(chalk.green(`Default profile created at ${getProfilePath(DEFAULT_PROFILE)}`));
}

// Start filer service using profiles
filerCommand
  .command('start')
  .description('Start the filer service using a profile')
  .option('-p, --profile <name>', 'Profile name to use', DEFAULT_PROFILE)
  .option('--create-default', 'Create default profile if it does not exist')
  .option('--background', 'Run in background')
  .action(async (options) => {
    const spinner = ora('Starting filer service...').start();
    
    try {
      // Create default profile if requested and it doesn't exist
      if (options.createDefault && !loadProfile(DEFAULT_PROFILE)) {
        createDefaultProfile();
        spinner.text = 'Starting filer service with new default profile...';
      }

      // Load profile
      const profile = loadProfile(options.profile);
      if (!profile) {
        if (options.profile === DEFAULT_PROFILE) {
          spinner.info(`Default profile not found. Creating it...`);
          createDefaultProfile();
          const newProfile = loadProfile(DEFAULT_PROFILE);
          if (!newProfile) {
            throw new Error('Failed to create default profile');
          }
          spinner.start('Starting filer service with new default profile...');
        } else {
          spinner.fail(`Profile '${options.profile}' not found.`);
          console.log(chalk.yellow(`Available profiles:`));
          ensureProfilesDir();
          const profiles = fs.readdirSync(PROFILES_DIR)
            .filter((f: string) => f.endsWith('.json'))
            .map((f: string) => f.replace('.json', ''));
          if (profiles.length === 0) {
            console.log(chalk.gray('  No profiles found. Use --create-default to create one.'));
          } else {
            profiles.forEach((p: string) => console.log(chalk.gray(`  - ${p}`)));
          }
          return;
        }
      }

      const profileToUse = profile || loadProfile(DEFAULT_PROFILE)!;
      
      console.log(chalk.blue(`Starting filer with profile: ${options.profile}`));
      
      // Determine platform
      const platform = process.platform === 'win32' ? 'windows' : 'linux';
      
      // Set up data directory
      if (!fs.existsSync(profileToUse.directory)) {
        fs.mkdirSync(profileToUse.directory, { recursive: true });
      }
      
      // Build arguments for the main application  
      const args = [
        path.join(__dirname, '../../../lib/index.js'), // Path to main one.filer entry point
        'start',
        '-s', profileToUse.secret,
        '-d', profileToUse.directory
      ];
      
      if (profileToUse.filer !== false) {
        args.push('--filer', 'true');
        
        if (profileToUse.mountPoint) {
          if (platform === 'windows') {
            args.push('--filer-projfs-root', profileToUse.mountPoint);
          } else {
            args.push('--filer-mount-point', profileToUse.mountPoint);
          }
        }
      }
      
      if (profileToUse.commServerUrl) {
        args.push('--commServerUrl', profileToUse.commServerUrl);
      }
      
      if (profileToUse.pairingUrl) {
        args.push('--pairing-url', profileToUse.pairingUrl);
      }
      
      if (profileToUse.iomMode) {
        args.push('--pairing-iom-mode', profileToUse.iomMode);
      }
      
      if (profileToUse.logCalls) {
        args.push('--filer-log-calls', 'true');
      }

      spinner.text = 'Launching filer process...';
      
      console.log(chalk.gray(`Command: node ${args.join(' ')}`));
      console.log(chalk.gray(`Data directory: ${profileToUse.directory}`));
      console.log(chalk.gray(`Mount point: ${profileToUse.mountPoint}`));
      console.log(chalk.gray(`Platform: ${platform}`));
      
      const child = spawn('node', args, {
        stdio: options.background ? 'pipe' : 'inherit',
        env: process.env,
        detached: options.background
      });
      
      if (options.background) {
        child.unref();
        spinner.succeed(`Filer started in background (PID: ${child.pid})`);
        
        console.log(chalk.green('\n✓ Filer Instance Details:'));
        console.log(chalk.gray(`  Profile: ${options.profile}`));
        console.log(chalk.gray(`  PID: ${child.pid}`));
        console.log(chalk.gray(`  Data: ${profileToUse.directory}`));
        console.log(chalk.gray(`  Mount: ${profileToUse.mountPoint}`));
        console.log(chalk.gray(`  Secret: ${profileToUse.secret}`));
        
        console.log(chalk.yellow('\nTo stop: kill -TERM ' + child.pid));
        
        // Write PID file for easier management
        const pidFile = path.join(profileToUse.directory, 'filer.pid');
        fs.writeFileSync(pidFile, child.pid!.toString());
        console.log(chalk.gray(`PID file: ${pidFile}`));
        
      } else {
        spinner.succeed('Filer started in foreground');
        
        child.on('exit', (code) => {
          if (code === 0) {
            console.log(chalk.green('Filer stopped gracefully'));
          } else {
            console.log(chalk.red(`Filer exited with code ${code}`));
          }
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\nShutting down filer...'));
          child.kill('SIGTERM');
        });
        
        process.on('SIGTERM', () => {
          console.log(chalk.yellow('\nShutting down filer...'));
          child.kill('SIGTERM');
        });
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to start filer: ${error.message}`);
      process.exit(1);
    }
  });

// Profile management commands
const profileCmd = new Command('profile')
  .description('Manage filer profiles');

profileCmd
  .command('create <name>')
  .description('Create a new filer profile')
  .requiredOption('-s, --secret <string>', 'Secret for the profile')
  .requiredOption('-d, --directory <string>', 'Data directory path')
  .option('--mount-point <string>', 'Filer mount point')
  .option('--comm-server <string>', 'Communication server URL')
  .option('--pairing-url <string>', 'Pairing URL')
  .option('--iom-mode <string>', 'IoM mode (full|light)', 'light')
  .option('--no-filer', 'Disable filer')
  .option('--log-calls', 'Enable call logging')
  .action(async (name, options) => {
    const profile: FilerProfile = {
      secret: options.secret,
      directory: options.directory,
      mountPoint: options.mountPoint,
      commServerUrl: options.commServer,
      pairingUrl: options.pairingUrl,
      iomMode: options.iomMode,
      filer: options.filer !== false,
      logCalls: options.logCalls || false
    };

    saveProfile(name, profile);
    console.log(chalk.green(`Profile '${name}' created successfully`));
    console.log(chalk.gray(`Profile saved to: ${getProfilePath(name)}`));
  });

profileCmd
  .command('list')
  .description('List available filer profiles')
  .action(() => {
    ensureProfilesDir();
    try {
      const profiles = fs.readdirSync(PROFILES_DIR)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace('.json', ''));
      
      if (profiles.length === 0) {
        console.log(chalk.yellow('No profiles found.'));
        console.log(chalk.gray(`Create a profile with: refinio filer profile create <name> -s <secret> -d <directory>`));
        return;
      }

      console.log(chalk.bold('Available filer profiles:'));
      profiles.forEach((profileName: string) => {
        const profile = loadProfile(profileName);
        const isDefault = profileName === DEFAULT_PROFILE ? ' (default)' : '';
        console.log(`  ${profileName}${isDefault}: ${profile?.directory || 'unknown'}`);
      });
    } catch (err) {
      console.error(chalk.red('Error listing profiles:'), err);
    }
  });

profileCmd
  .command('show <name>')
  .description('Show filer profile details')
  .action((name) => {
    const profile = loadProfile(name);
    if (!profile) {
      console.error(chalk.red(`Profile '${name}' not found.`));
      return;
    }

    console.log(chalk.bold(`Profile: ${name}`));
    console.log(chalk.gray(`  Secret: ${profile.secret ? '[SET]' : '[NOT SET]'}`));
    console.log(chalk.gray(`  Directory: ${profile.directory}`));
    console.log(chalk.gray(`  Mount Point: ${profile.mountPoint || 'default'}`));
    console.log(chalk.gray(`  Communication Server: ${profile.commServerUrl || 'default'}`));
    console.log(chalk.gray(`  Pairing URL: ${profile.pairingUrl || 'default'}`));
    console.log(chalk.gray(`  IoM Mode: ${profile.iomMode || 'light'}`));
    console.log(chalk.gray(`  Filer Enabled: ${profile.filer !== false}`));
    console.log(chalk.gray(`  Log Calls: ${profile.logCalls || false}`));
  });

filerCommand.addCommand(profileCmd);

// Interactive mount wizard
filerCommand
  .command('setup')
  .description('Interactive setup wizard for mounting filer')
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'mountPoint',
          message: 'Enter mount point:',
          default: 'mnt'
        },
        {
          type: 'list',
          name: 'iomMode',
          message: 'Select IoM mode:',
          choices: ['light', 'full'],
          default: 'light'
        },
        {
          type: 'confirm',
          name: 'logCalls',
          message: 'Enable call logging?',
          default: false
        },
        {
          type: 'input',
          name: 'pairingUrl',
          message: 'Enter pairing URL (optional):',
          default: ''
        }
      ]);
      
      const spinner = ora('Mounting filer with your configuration...').start();
      
      const profile = process.argv.includes('--profile')
        ? process.argv[process.argv.indexOf('--profile') + 1]
        : undefined;
      const client = await createProfileClient(profile);
      
      const config: any = {
        mountPoint: answers.mountPoint,
        iomMode: answers.iomMode,
        logCalls: answers.logCalls
      };
      
      if (answers.pairingUrl) {
        config.pairingUrl = answers.pairingUrl;
      }
      
      const result = await client.request('filer', {
        operation: 'mount',
        config
      });
      
      spinner.succeed('Filer mounted successfully!');
      
      console.log(chalk.green('\n✓ Filer Setup Complete'));
      console.log(chalk.gray(`Mount point: ${result.mountPoint}`));
      console.log(chalk.gray(`Platform: ${result.platform}`));
      console.log(chalk.gray(`Mode: ${result.mode}`));
      
      await client.disconnect();
    } catch (error: any) {
      console.error(chalk.red(`Setup failed: ${error.message}`));
      process.exit(1);
    }
  });