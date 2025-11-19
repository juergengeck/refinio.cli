/**
 * Universal Plan Executor
 *
 * Execute any Plan method dynamically via CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

/**
 * Universal executor command
 */
export const execCommand = new Command('exec')
  .description('Execute any Plan method dynamically')
  .argument('<plan>', 'Plan name (e.g., one.storage, one.leute)')
  .argument('<method>', 'Method name (e.g., storeVersionedObject, getContacts)')
  .argument('[params...]', 'Method parameters as JSON string or key=value pairs')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .option('-r, --raw', 'Output only data (no Story wrapper)')
  .option('-t, --timing', 'Show execution timing')
  .option('-w, --watch <interval>', 'Watch mode - refresh every N seconds', parseFloat)
  .option('--stdin', 'Read params from stdin')
  .action(async (plan: string, method: string, paramArgs: string[], options) => {
    const executeOnce = async () => {
      const spinner = ora(`Executing ${plan}.${method}...`).start();

      try {
        const client = createApiClient(options.apiUrl);

        // Parse parameters
        let params: any = {};

        if (options.stdin) {
          // Read from stdin
          const stdin = await readStdin();
          params = JSON.parse(stdin);
        } else if (paramArgs.length > 0) {
          // Try to parse as JSON first
          const joinedArgs = paramArgs.join(' ');
          if (joinedArgs.startsWith('{') || joinedArgs.startsWith('[')) {
            params = JSON.parse(joinedArgs);
          } else {
            // Parse as key=value pairs
            for (const arg of paramArgs) {
              if (arg.includes('=')) {
                const [key, ...valueParts] = arg.split('=');
                const value = valueParts.join('=');
                // Try to parse value as JSON, otherwise use as string
                try {
                  params[key] = JSON.parse(value);
                } catch {
                  params[key] = value;
                }
              } else {
                // Assume positional arg as JSON
                try {
                  params = JSON.parse(arg);
                } catch {
                  throw new Error(`Invalid parameter format: ${arg}`);
                }
              }
            }
          }
        }

        // Execute Plan
        const story = await client.execute(plan, method, params);

        spinner.stop();

        if (!story.success) {
          console.error(chalk.red(`\n✗ Execution failed`));
          console.error(chalk.red(`  Error: ${story.error?.message}`));
          if (story.error?.code) {
            console.error(chalk.gray(`  Code: ${story.error.code}`));
          }

          // Suggest available methods if method not found
          if (story.error?.code === 'METHOD_NOT_FOUND') {
            const metadata = await client.getPlanMetadata(plan);
            if (metadata && metadata.methods.length > 0) {
              console.log(chalk.yellow('\nAvailable methods:'));
              metadata.methods.forEach(m => console.log(chalk.gray(`  ${m.name}`)));
            }
          }

          // Suggest available plans if plan not found
          if (story.error?.code === 'PLAN_NOT_FOUND' || story.error?.code?.includes('HTTP_404')) {
            const plans = await client.listPlans();
            if (plans.length > 0) {
              console.log(chalk.yellow('\nAvailable Plans:'));
              plans.forEach(p => console.log(chalk.gray(`  ${p}`)));
            }
          }

          console.log();
          process.exit(1);
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(story, null, 2));
        } else if (options.raw) {
          // Raw data only - useful for piping
          console.log(JSON.stringify(story.data, null, 2));
        } else {
          // Pretty formatted output
          console.log(chalk.green('\n✓ Execution successful'));
          console.log(chalk.gray(`  Plan: ${story.plan.plan}.${story.plan.method}`));

          if (options.timing && story.executionTime) {
            console.log(chalk.gray(`  Time: ${story.executionTime}ms`));
          }

          console.log(chalk.bold('\nResult:\n'));
          console.log(JSON.stringify(story.data, null, 2));
          console.log();
        }
      } catch (error: any) {
        spinner.fail('Execution error');
        console.error(chalk.red(`\n${error.message}\n`));

        if (error.message.includes('JSON')) {
          console.log(chalk.yellow('Parameter format:'));
          console.log(chalk.gray('  JSON object: \'{"key": "value"}\''));
          console.log(chalk.gray('  Key-value pairs: key1=value1 key2=value2'));
          console.log(chalk.gray('  From stdin: echo \'{"key": "value"}\' | refinio exec <plan> <method> --stdin\n'));
        }

        if (!options.watch) {
          process.exit(1);
        }
      }
    };

    // Initial execution
    await executeOnce();

    // Watch mode
    if (options.watch) {
      const intervalMs = options.watch * 1000;
      console.log(chalk.gray(`\nWatch mode: refreshing every ${options.watch}s (Ctrl+C to stop)\n`));

      const interval = setInterval(async () => {
        if (!options.json && !options.raw) {
          console.clear();
        }
        await executeOnce();
      }, intervalMs);

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        clearInterval(interval);
        console.log(chalk.yellow('\nStopped watching'));
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    }
  });

/**
 * Read from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
