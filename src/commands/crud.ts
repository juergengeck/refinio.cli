import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { QuicClient } from '../client/QuicClient';
import { loadConfig, loadPersonKeys } from '../config';

async function createClient(): Promise<QuicClient> {
  const config = await loadConfig();
  const client = new QuicClient(config.client);
  await client.connect();
  
  const personKeys = await loadPersonKeys();
  await client.authenticate(personKeys);
  
  return client;
}

const createCommand = new Command('create')
  .description('Create a new object')
  .argument('<type>', 'Object type')
  .option('-d, --data <path>', 'Path to JSON data file')
  .option('-i, --inline <json>', 'Inline JSON data')
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
      
      const client = await createClient();
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
  .action(async (id, options) => {
    const spinner = ora('Fetching object...').start();
    
    try {
      const client = await createClient();
      const result = await client.readObject(id, options.version);
      await client.disconnect();
      
      spinner.succeed('Object fetched successfully');
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.data);
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
      
      const client = await createClient();
      const result = await client.updateObject(id, data);
      await client.disconnect();
      
      spinner.succeed('Object updated successfully');
      
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

const deleteCommand = new Command('delete')
  .description('Delete an object')
  .argument('<id>', 'Object ID')
  .option('-f, --force', 'Skip confirmation')
  .action(async (id, options) => {
    if (!options.force) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete object ${id}?`,
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log('Deletion cancelled');
        return;
      }
    }
    
    const spinner = ora('Deleting object...').start();
    
    try {
      const client = await createClient();
      await client.deleteObject(id);
      await client.disconnect();
      
      spinner.succeed('Object deleted successfully');
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
  .option('-o, --offset <number>', 'Offset results', '0')
  .action(async (type, options) => {
    const spinner = ora('Fetching objects...').start();
    
    try {
      const client = await createClient();
      const result = await client.sendRequest('list' as any, {
        type,
        filter: options.filter,
        limit: parseInt(options.limit),
        offset: parseInt(options.offset)
      });
      await client.disconnect();
      
      spinner.succeed(`Found ${result.count} objects`);
      
      if (options.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        result.data.forEach((obj: any) => {
          console.log(chalk.cyan(`- ${obj.id}`));
        });
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