/**
 * Storage Commands
 *
 * Convenience commands for ONE storage operations via one.storage Plan
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const storageCommand = new Command('storage')
  .description('ONE storage operations');

/**
 * Store versioned object
 */
storageCommand
  .command('store')
  .description('Store a versioned object')
  .argument('<data>', 'Object data as JSON string')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, options) => {
    const spinner = ora('Storing object...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const obj = JSON.parse(data);

      // Ensure $type$ is present
      if (!obj.$type$) {
        throw new Error('Object must have $type$ field');
      }

      const story = await client.execute('one.storage', 'storeVersionedObject', obj);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to store object');
      }

      spinner.succeed('Object stored');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nID Hash: ${story.data.idHash}`));
        console.log(chalk.gray(`Hash: ${story.data.hash}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to store object');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Get object by ID hash
 */
storageCommand
  .command('get')
  .description('Get object by ID hash (latest version)')
  .argument('<idHash>', 'Object ID hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (idHash: string, options) => {
    const spinner = ora('Fetching object...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.storage', 'getObjectByIdHash', idHash);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch object');
      }

      spinner.succeed('Object retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.bold('\nObject:\n'));
        console.log(JSON.stringify(story.data.obj, null, 2));
        console.log(chalk.gray(`\nID Hash: ${story.data.idHash}`));
        console.log(chalk.gray(`Hash: ${story.data.hash}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch object');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Get object by specific version hash
 */
storageCommand
  .command('get-version')
  .description('Get object by specific version hash')
  .argument('<hash>', 'Version hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (hash: string, options) => {
    const spinner = ora('Fetching object version...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.storage', 'getVersionedObjectByHash', hash);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch object version');
      }

      spinner.succeed('Object version retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.bold('\nObject:\n'));
        console.log(JSON.stringify(story.data, null, 2));
        console.log();
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch object version');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Store unversioned object
 */
storageCommand
  .command('store-unversioned')
  .description('Store an unversioned object')
  .argument('<data>', 'Object data as JSON string')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, options) => {
    const spinner = ora('Storing unversioned object...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const obj = JSON.parse(data);

      // Ensure $type$ is present
      if (!obj.$type$) {
        throw new Error('Object must have $type$ field');
      }

      const story = await client.execute('one.storage', 'storeUnversionedObject', obj);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to store object');
      }

      spinner.succeed('Unversioned object stored');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nHash: ${story.data.hash}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to store unversioned object');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });
