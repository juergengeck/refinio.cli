import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const connectionsCommand = new Command('connections')
  .description('List active connections')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .option('-w, --watch', 'Watch connections (refresh every 2 seconds)')
  .action(async (options) => {
    const displayConnections = async () => {
      const spinner = ora('Fetching connections...').start();

      try {
        // Use dynamic API client (legacy REST endpoint fallback)
        const client = createApiClient(options.apiUrl);

        // Try using the direct REST endpoint for backward compatibility
        const response = await fetch(`${options.apiUrl}/api/connections`);

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const connections = await response.json() as any[];

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify({ success: true, connections }, null, 2));
        } else {
          // Clear console if watching
          if (options.watch) {
            console.clear();
          }

          if (connections.length === 0) {
            console.log(chalk.gray('No active connections'));
          } else {
            console.log(chalk.bold(`\nActive Connections (${connections.length}):\n`));
            connections.forEach((conn: any, index: number) => {
              console.log(chalk.cyan(`${index + 1}. Connection ${conn.connectionId || conn.remoteInstanceId}`));

              if (conn.remotePersonId) {
                console.log(chalk.gray(`   Remote Person: ${conn.remotePersonId.substring(0, 16)}...`));
              }

              if (conn.remoteInstanceId) {
                console.log(chalk.gray(`   Remote Instance: ${conn.remoteInstanceId.substring(0, 16)}...`));
              }

              const status = conn.isOnline ? chalk.green('online') : chalk.yellow('offline');
              console.log(chalk.gray(`   Status: ${status}`));

              if (conn.established) {
                console.log(chalk.gray(`   Established: ${new Date(conn.established).toLocaleString()}`));
              }

              console.log();
            });
          }

          if (options.watch) {
            console.log(chalk.gray(`Last update: ${new Date().toLocaleTimeString()}`));
            console.log(chalk.gray('Press Ctrl+C to stop watching'));
          }
        }
      } catch (error: any) {
        spinner.fail(error.message);
        console.error(chalk.red('\nError fetching connections'));
        console.log(chalk.yellow('\nMake sure refinio.api is running:'));
        console.log(chalk.gray(`  Check status: curl ${options.apiUrl}/health`));

        if (!options.watch) {
          process.exit(1);
        }
      }
    };

    // Initial display
    await displayConnections();

    // Watch mode
    if (options.watch && !options.json) {
      const interval = setInterval(async () => {
        await displayConnections();
      }, 2000);

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        clearInterval(interval);
        console.log(chalk.yellow('\n\nStopped watching connections'));
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    }
  });
