import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { LocalCredentials } from '../credentials/LocalCredentials';
import { QuicClient } from '../client/QuicClient';

const localCreds = new LocalCredentials();

export const connectCommand = new Command('connect')
  .description('Connect to a ONE instance')
  .argument('<url>', 'Instance QUIC URL (e.g., quic://instance.example.com:49498)')
  .option('-k, --keys <path>', 'Path to existing Person keys JSON file')
  .option('-e, --email <email>', 'Email to generate new Person keys')
  .option('--set-default', 'Set as default instance')
  .action(async (url, options) => {
    const spinner = ora('Connecting to instance...').start();
    
    try {
      await localCreds.load();
      
      // Generate or import Person keys
      let personKeys;
      
      if (options.keys) {
        spinner.text = 'Importing Person keys...';
        personKeys = await localCreds.importPersonKeys(options.keys);
      } else if (options.email) {
        spinner.text = 'Generating new Person keys...';
        personKeys = await localCreds.generatePersonKeys(options.email);
      } else {
        // Check if we already have keys for this instance
        const existing = localCreds.getInstance(url);
        if (existing) {
          personKeys = existing.personKeys;
          spinner.text = 'Using existing Person keys...';
        } else {
          spinner.fail('Must provide either --keys or --email for new connection');
          
          const { choice } = await inquirer.prompt([{
            type: 'list',
            name: 'choice',
            message: 'How would you like to authenticate?',
            choices: [
              { name: 'Generate new Person keys', value: 'generate' },
              { name: 'Import existing Person keys', value: 'import' }
            ]
          }]);
          
          if (choice === 'generate') {
            const { email } = await inquirer.prompt([{
              type: 'input',
              name: 'email',
              message: 'Enter email for new Person:',
              validate: (input) => input.includes('@') || 'Please enter a valid email'
            }]);
            personKeys = await localCreds.generatePersonKeys(email);
          } else {
            const { keysPath } = await inquirer.prompt([{
              type: 'input',
              name: 'keysPath',
              message: 'Path to Person keys JSON file:',
              default: '~/.refinio/keys.json'
            }]);
            personKeys = await localCreds.importPersonKeys(keysPath);
          }
        }
      }
      
      // Test connection
      spinner.text = 'Testing connection...';
      
      const client = new QuicClient({ serverUrl: url });
      await client.connect();
      await client.authenticate(personKeys);
      
      // Get instance info if available
      spinner.text = 'Getting instance information...';
      
      // Save the connection
      await localCreds.addInstance(url, personKeys);
      
      if (options.setDefault) {
        await localCreds.setDefaultInstance(url);
      }
      
      await client.disconnect();
      
      spinner.succeed(`Connected to ${url}`);
      console.log(chalk.gray(`Person ID: ${personKeys.personId}`));
      
      if (options.setDefault) {
        console.log(chalk.green('✓ Set as default instance'));
      }
      
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.gray('  Create a profile: refinio profile create <alias>'));
      console.log(chalk.gray('  List profiles: refinio profile list'));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

export const disconnectCommand = new Command('disconnect')
  .description('Remove connection to a ONE instance')
  .argument('<url>', 'Instance URL')
  .action(async (url) => {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Remove connection to ${url}?`,
      default: false
    }]);
    
    if (!confirm) {
      console.log('Cancelled');
      return;
    }
    
    const spinner = ora('Removing connection...').start();
    
    try {
      await localCreds.load();
      await localCreds.removeInstance(url);
      
      spinner.succeed(`Disconnected from ${url}`);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

export const instancesCommand = new Command('instances')
  .description('List connected instances')
  .alias('ls-instances')
  .action(async () => {
    try {
      await localCreds.load();
      const instances = localCreds.listInstances();
      
      if (instances.length === 0) {
        console.log(chalk.yellow('No instance connections'));
        console.log(chalk.gray('Connect to an instance with: refinio connect <url>'));
        return;
      }
      
      console.log(chalk.cyan('Connected Instances:\n'));
      
      instances.forEach(inst => {
        const defaultMark = inst.isDefault ? chalk.green(' (default)') : '';
        const profileMark = inst.hasProfile ? chalk.blue(' [has profile]') : '';
        
        console.log(`  ${inst.url}${defaultMark}${profileMark}`);
      });
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });