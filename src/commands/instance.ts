/**
 * Instance Commands
 *
 * Convenience commands for ONE instance operations via one.instance Plan
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const instanceCommand = new Command('instance')
  .description('ONE instance operations');

/**
 * Get instance info
 */
instanceCommand
  .command('info')
  .description('Get instance information')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching instance info...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.instance', 'getInfo', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch instance info');
      }

      spinner.succeed('Instance info retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.bold('\nInstance Information:\n'));
        console.log(JSON.stringify(story.data, null, 2));
        console.log();
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch instance info');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Get instance ID
 */
instanceCommand
  .command('id')
  .description('Get instance ID hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching instance ID...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.instance', 'getInstanceId', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch instance ID');
      }

      spinner.succeed('Instance ID retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nInstance ID: ${story.data.instanceId || story.data}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch instance ID');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Get instance owner
 */
instanceCommand
  .command('owner')
  .description('Get instance owner')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching instance owner...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.instance', 'getOwner', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch instance owner');
      }

      spinner.succeed('Instance owner retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nOwner: ${story.data.owner || story.data}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch instance owner');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });
