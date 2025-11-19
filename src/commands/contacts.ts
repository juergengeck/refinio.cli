import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const contactsCommand = new Command('contacts')
  .description('List all contacts')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Fetching contacts...').start();

    try {
      // Use dynamic API client - execute one.leute.getContacts plan
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.leute', 'getContacts', {});

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to fetch contacts');
      }

      const contacts = story.data as any[];

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify({ success: true, contacts }, null, 2));
      } else {
        if (contacts.length === 0) {
          console.log(chalk.gray('No contacts found'));
        } else {
          console.log(chalk.bold(`\nContacts (${contacts.length}):\n`));
          contacts.forEach((contact: any, index: number) => {
            // Extract person ID from someoneId or mainProfile
            const personId = contact.someoneId || (contact.mainProfile ? contact.mainProfile.personId : null);
            const nickname = contact.mainProfile ? contact.mainProfile.nickname : null;

            console.log(chalk.cyan(`${index + 1}. ${nickname || 'Unknown'}`));
            if (personId) {
              console.log(chalk.gray(`   Person ID: ${personId.substring(0, 16)}...`));
            }
            if (contact.identities && contact.identities.length > 0) {
              console.log(chalk.gray(`   Identities: ${contact.identities.length}`));
            }
            console.log();
          });
        }
      }
    } catch (error: any) {
      spinner.fail(error.message);
      console.error(chalk.red('\nError fetching contacts'));
      console.log(chalk.yellow('\nMake sure refinio.api is running:'));
      console.log(chalk.gray(`  Check status: curl ${options.apiUrl}/health`));
      process.exit(1);
    }
  });
