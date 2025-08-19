import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { QuicClient } from '../client/QuicClient';
import { loadConfig, savePersonKeys, loadPersonKeys, generatePersonKeys } from '../config';

export const authCommand = new Command('auth')
  .description('Authentication commands');

authCommand
  .command('login')
  .description('Authenticate with the API server')
  .option('-k, --keys <path>', 'Path to Person keys file')
  .option('-p, --person-id <id>', 'Person ID')
  .action(async (options) => {
    const spinner = ora('Authenticating...').start();
    
    try {
      let personKeys;
      
      if (options.keys) {
        const content = await fs.readFile(options.keys, 'utf-8');
        personKeys = JSON.parse(content);
      } else {
        personKeys = await loadPersonKeys();
      }
      
      const config = await loadConfig();
      const client = new QuicClient(config.client);
      await client.connect();
      await client.authenticate(personKeys);
      await client.disconnect();
      
      spinner.succeed('Authentication successful');
      
      // Save keys for future use
      await savePersonKeys(personKeys);
      
      console.log(chalk.green('✓'), 'Person keys saved to', config.keys.path);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

authCommand
  .command('logout')
  .description('Remove stored keys')
  .action(async () => {
    const spinner = ora('Logging out...').start();
    
    try {
      const config = await loadConfig();
      await fs.unlink(config.keys.path);
      
      spinner.succeed('Logged out successfully');
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    try {
      const personKeys = await loadPersonKeys();
      const config = await loadConfig();
      
      console.log(chalk.green('✓'), 'Person keys loaded');
      console.log('  Person ID:', personKeys.personId);
      console.log('  Public Key:', personKeys.publicKey.substring(0, 20) + '...');
      console.log('  Server:', config.client.serverUrl);
      
      // Try to connect and check permissions
      try {
        const client = new QuicClient(config.client);
        await client.connect();
        await client.authenticate(personKeys);
        await client.disconnect();
        console.log(chalk.green('✓'), 'Server connection successful');
      } catch (error) {
        console.log(chalk.yellow('⚠'), 'Could not connect to server');
      }
    } catch (error: any) {
      console.log(chalk.red('✗'), 'No Person keys found');
      console.log('  Run "refinio auth generate" to create new keys');
      console.log('  Run "refinio auth login" with existing keys');
    }
  });

authCommand
  .command('generate')
  .description('Generate new Person keys')
  .argument('<email>', 'Email address for the new identity')
  .option('-o, --output <path>', 'Output path for keys file')
  .action(async (email, options) => {
    const spinner = ora('Generating Person keys...').start();
    
    try {
      // Generate new Person keys
      const personKeys = await generatePersonKeys(email);
      
      // Save keys
      const outputPath = options.output || undefined;
      await savePersonKeys(personKeys, outputPath);
      
      const config = await loadConfig();
      const savePath = outputPath || config.keys.path;
      
      spinner.succeed('Person keys generated successfully');
      console.log(chalk.green('✓'), 'Keys saved to', savePath);
      console.log('  Person ID:', personKeys.personId);
      console.log('  Public Key:', personKeys.publicKey.substring(0, 20) + '...');
      console.log('');
      console.log(chalk.yellow('⚠'), 'Keep your private keys secure!');
      console.log('  These keys control your identity and data access');
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });