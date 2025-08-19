import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
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

export const streamCommand = new Command('stream')
  .description('Stream operations');

streamCommand
  .command('events')
  .description('Stream events from the server')
  .option('-t, --type <type>', 'Filter by event type')
  .action(async (options) => {
    const spinner = ora('Connecting to event stream...').start();
    
    try {
      const client = await createClient();
      
      // Set up event listener
      client.on('stream-event', (event: any) => {
        if (options.parent?.parent?.opts().json) {
          console.log(JSON.stringify(event, null, 2));
        } else {
          const timestamp = new Date(event.timestamp).toLocaleTimeString();
          console.log(`[${chalk.gray(timestamp)}] ${chalk.cyan(event.type)}:`, event.data);
        }
      });
      
      // Subscribe to events
      await client.subscribe(options.type);
      
      spinner.succeed('Connected to event stream');
      console.log(chalk.gray('Press Ctrl+C to disconnect'));
      
      // Keep connection alive
      process.on('SIGINT', async () => {
        console.log('\nDisconnecting...');
        await client.unsubscribe();
        await client.disconnect();
        process.exit(0);
      });
      
      // Keep process alive
      await new Promise(() => {});
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

streamCommand
  .command('watch')
  .description('Watch for changes to an object')
  .argument('<id>', 'Object ID to watch')
  .action(async (id, options) => {
    const spinner = ora('Setting up watch...').start();
    
    try {
      const client = await createClient();
      
      // Set up event listener for this specific object
      client.on('stream-event', (event: any) => {
        if (event.objectId === id) {
          if (options.parent?.parent?.opts().json) {
            console.log(JSON.stringify(event, null, 2));
          } else {
            const timestamp = new Date(event.timestamp).toLocaleTimeString();
            console.log(`[${chalk.gray(timestamp)}] ${chalk.cyan(event.type)}:`);
            console.log('  Version:', event.version);
            console.log('  Changes:', event.changes);
          }
        }
      });
      
      // Subscribe to object changes
      await client.sendRequest('stream.watch' as any, {
        objectId: id
      });
      
      spinner.succeed(`Watching object ${id}`);
      console.log(chalk.gray('Press Ctrl+C to stop watching'));
      
      // Keep connection alive
      process.on('SIGINT', async () => {
        console.log('\nStopping watch...');
        await client.sendRequest('stream.unwatch' as any, {
          objectId: id
        });
        await client.disconnect();
        process.exit(0);
      });
      
      // Keep process alive
      await new Promise(() => {});
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });