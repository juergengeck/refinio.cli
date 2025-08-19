import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { createProfileClient } from '../client/ProfileAwareClient';

async function createClient(profileAlias?: string): Promise<any> {
  return createProfileClient(profileAlias);
}

const createCommand = new Command('create')
  .description('Create a new object')
  .argument('<type>', 'Object type')
  .option('-d, --data <path>', 'Path to JSON data file')
  .option('-i, --inline <json>', 'Inline JSON data')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (type, options) => {
    const spinner = ora('Creating object...').start();
    
    try {
      let data;
      if (options.data) {
        const content = await fs.readFile(options.data, 'utf-8');
        data = JSON.parse(content);
      } else if (options.inline) {
        data = JSON.parse(options.inline);
      } else {
        spinner.fail('No data provided');
        process.exit(1);
      }
      
      const client = await createClient(options.profile);
      const result = await client.createObject(type, data);
      await client.disconnect();
      
      spinner.succeed('Object created successfully');
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('ID:'), result.id);
        console.log(chalk.green('Version:'), result.version);
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const getCommand = new Command('get')
  .description('Get an object by ID')
  .argument('<id>', 'Object ID')
  .option('-v, --version <version>', 'Specific version')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (id, options) => {
    const spinner = ora('Fetching object...').start();
    
    try {
      const client = await createClient(options.profile);
      const result = await client.readObject(id, options.version);
      await client.disconnect();
      
      spinner.succeed('Object fetched successfully');
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.cyan('Object Details:'));
        console.log(JSON.stringify(result.data, null, 2));
        console.log(chalk.gray('Version:'), result.version);
        console.log(chalk.gray('Created:'), new Date(result.created).toLocaleString());
        if (result.modified) {
          console.log(chalk.gray('Modified:'), new Date(result.modified).toLocaleString());
        }
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const updateCommand = new Command('update')
  .description('Update an existing object')
  .argument('<id>', 'Object ID')
  .option('-d, --data <path>', 'Path to JSON data file')
  .option('-i, --inline <json>', 'Inline JSON data')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (id, options) => {
    const spinner = ora('Updating object...').start();
    
    try {
      let data;
      if (options.data) {
        const content = await fs.readFile(options.data, 'utf-8');
        data = JSON.parse(content);
      } else if (options.inline) {
        data = JSON.parse(options.inline);
      } else {
        spinner.fail('No data provided');
        process.exit(1);
      }
      
      const client = await createClient(options.profile);
      const result = await client.updateObject(id, data);
      await client.disconnect();
      
      spinner.succeed('Object updated successfully');
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('Version:'), result.version);
        console.log(chalk.green('Modified:'), new Date(result.modified).toLocaleString());
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const deleteCommand = new Command('delete')
  .description('Delete an object')
  .argument('<id>', 'Object ID')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (id, options) => {
    const spinner = ora('Deleting object...').start();
    
    try {
      const client = await createClient(options.profile);
      const result = await client.deleteObject(id);
      await client.disconnect();
      
      spinner.succeed('Object deleted successfully');
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const listCommand = new Command('list')
  .description('List objects of a type')
  .argument('<type>', 'Object type')
  .option('-f, --filter <query>', 'Filter query')
  .option('-l, --limit <number>', 'Limit results', '100')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (type, options) => {
    const spinner = ora('Fetching objects...').start();
    
    try {
      const client = await createClient(options.profile);
      const result = await client.listObjects(type, {
        filter: options.filter,
        limit: parseInt(options.limit),
        offset: parseInt(options.offset)
      });
      await client.disconnect();
      
      spinner.succeed(`Found ${result.count} objects`);
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        result.objects.forEach((obj: any) => {
          console.log(chalk.cyan(`\n${obj.id}`));
          console.log('  Type:', obj.type);
          console.log('  Version:', obj.version);
          console.log('  Created:', new Date(obj.created).toLocaleString());
          if (obj.summary) {
            console.log('  Summary:', obj.summary);
          }
        });
        
        if (result.hasMore) {
          console.log(chalk.yellow(`\n${result.count} more objects available. Use --offset to paginate.`));
        }
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

export const crudCommands = [
  createCommand,
  getCommand,
  updateCommand,
  deleteCommand,
  listCommand
];