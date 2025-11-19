/**
 * Group Commands
 *
 * Convenience commands for group operations via one.leute Plan
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const groupsCommand = new Command('groups')
  .description('Group management operations');

/**
 * List all groups
 */
groupsCommand
  .command('list')
  .description('List all groups')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching groups...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.leute', 'getGroups', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch groups');
      }

      const groups = story.data;
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(groups, null, 2));
      } else {
        if (!groups || groups.length === 0) {
          console.log(chalk.gray('No groups found'));
        } else {
          console.log(chalk.bold(`\nGroups (${groups.length}):\n`));
          groups.forEach((group: any, index: number) => {
            console.log(chalk.cyan(`${index + 1}. ${group.name || 'Unknown'}`));
            if (group.members && group.members.length > 0) {
              console.log(chalk.gray(`   Members: ${group.members.length}`));
            }
            if (group.idHash) {
              console.log(chalk.gray(`   ID: ${group.idHash.substring(0, 16)}...`));
            }
            console.log();
          });
        }
      }
    } catch (error: any) {
      spinner.fail('Failed to fetch groups');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Create a group
 */
groupsCommand
  .command('create')
  .description('Create a new group')
  .argument('<name>', 'Group name')
  .argument('[members...]', 'Member person ID hashes (space-separated)')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (name: string, members: string[], options) => {
    const spinner = ora('Creating group...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const params = {
        name,
        members: members || []
      };

      const story = await client.execute('one.leute', 'createGroup', params);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to create group');
      }

      spinner.succeed('Group created');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nGroup: ${name}`));
        console.log(chalk.gray(`Members: ${members.length}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to create group');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Add member to group
 */
groupsCommand
  .command('add-member')
  .description('Add member to group')
  .argument('<groupId>', 'Group ID hash')
  .argument('<personId>', 'Person ID hash to add')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (groupId: string, personId: string, options) => {
    const spinner = ora('Adding member to group...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.leute', 'addGroupMember', { groupIdHash: groupId, personIdHash: personId });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to add member');
      }

      spinner.succeed('Member added to group');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nAdded ${personId.substring(0, 16)}... to group\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to add member');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Remove member from group
 */
groupsCommand
  .command('remove-member')
  .description('Remove member from group')
  .argument('<groupId>', 'Group ID hash')
  .argument('<personId>', 'Person ID hash to remove')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (groupId: string, personId: string, options) => {
    const spinner = ora('Removing member from group...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.leute', 'removeGroupMember', { groupIdHash: groupId, personIdHash: personId });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to remove member');
      }

      spinner.succeed('Member removed from group');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nRemoved ${personId.substring(0, 16)}... from group\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to remove member');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });
