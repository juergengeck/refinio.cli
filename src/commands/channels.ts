/**
 * Channel Commands
 *
 * Convenience commands for ONE channel operations via one.channels Plan
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const channelsCommand = new Command('channels')
  .description('ONE channel operations');

/**
 * List all channels
 */
channelsCommand
  .command('list')
  .description('List all channels')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching channels...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.channels', 'listChannels', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch channels');
      }

      const channels = story.data;
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(channels, null, 2));
      } else {
        if (!channels || channels.length === 0) {
          console.log(chalk.gray('No channels found'));
        } else {
          console.log(chalk.bold(`\nChannels (${channels.length}):\n`));
          channels.forEach((channel: any, index: number) => {
            console.log(chalk.cyan(`${index + 1}. ${channel.id || 'Unknown'}`));
            if (channel.owner) {
              console.log(chalk.gray(`   Owner: ${channel.owner.substring(0, 16)}...`));
            }
            console.log();
          });
        }
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch channels');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Create a channel
 */
channelsCommand
  .command('create')
  .description('Create a new channel')
  .argument('<id>', 'Channel ID')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-o, --owner <hash>', 'Owner ID hash')
  .option('-g, --group <hash>', 'Access group ID hash')
  .option('-j, --json', 'Output in JSON format')
  .action(async (id: string, options) => {
    const spinner = ora('Creating channel...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const params: any = { id };
      if (options.owner) params.owner = options.owner;
      if (options.group) params.accessGroup = options.group;

      const story = await client.execute('one.channels', 'createChannel', params);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to create channel');
      }

      spinner.succeed('Channel created');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nChannel ID: ${id}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to create channel');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Get channel info
 */
channelsCommand
  .command('get')
  .description('Get channel information')
  .argument('<channelId>', 'Channel ID')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (channelId: string, options) => {
    const spinner = ora('Fetching channel info...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.channels', 'getChannel', channelId);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch channel');
      }

      spinner.succeed('Channel info retrieved');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.bold('\nChannel Info:\n'));
        console.log(JSON.stringify(story.data, null, 2));
        console.log();
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch channel');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Post to channel
 */
channelsCommand
  .command('post')
  .description('Post object to channel')
  .argument('<channelId>', 'Channel ID')
  .argument('<data>', 'Object data as JSON string')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (channelId: string, data: string, options) => {
    const spinner = ora('Posting to channel...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const obj = JSON.parse(data);

      // Ensure $type$ is present
      if (!obj.$type$) {
        throw new Error('Object must have $type$ field');
      }

      const story = await client.execute('one.channels', 'postToChannel', { channelId, obj });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to post to channel');
      }

      spinner.succeed('Posted to channel');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nPosted to channel: ${channelId}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to post to channel');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Delete channel
 */
channelsCommand
  .command('delete')
  .description('Delete a channel')
  .argument('<channelId>', 'Channel ID')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-o, --owner <hash>', 'Owner ID hash')
  .option('-j, --json', 'Output in JSON format')
  .action(async (channelId: string, options) => {
    const spinner = ora('Deleting channel...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const params: any = { channelId };
      if (options.owner) params.owner = options.owner;

      const story = await client.execute('one.channels', 'deleteChannel', params);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to delete channel');
      }

      spinner.succeed('Channel deleted');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nDeleted channel: ${channelId}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to delete channel');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });
