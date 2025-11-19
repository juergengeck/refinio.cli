/**
 * API Discovery Commands
 *
 * Commands for discovering and inspecting available Plans in refinio.api
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';
import type { PlanMetadata } from '../client/ApiClient.js';

/**
 * Main API command group
 */
export const apiCommand = new Command('api')
  .description('Discover and inspect refinio.api Plans');

/**
 * List all available Plans
 */
apiCommand
  .command('plans')
  .description('List all available Plans')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Show method counts')
  .action(async (options) => {
    const spinner = ora('Discovering Plans...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const metadata = await client.getAllMetadata();

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify({ plans: metadata.map(m => m.name) }, null, 2));
        return;
      }

      console.log(chalk.bold(`\nAvailable Plans (${metadata.length}):\n`));

      for (const plan of metadata) {
        const desc = plan.description ? chalk.gray(` - ${plan.description}`) : '';
        const methodCount = options.verbose ? chalk.gray(` [${plan.methods.length} methods]`) : '';
        console.log(chalk.cyan(`  ${plan.name}`) + desc + methodCount);
      }

      console.log(chalk.gray('\nUse "refinio api inspect <plan>" to see methods\n'));
    } catch (error: any) {
      spinner.fail('Failed to discover Plans');
      console.error(chalk.red(`\nError: ${error.message}`));
      console.log(chalk.yellow('\nMake sure refinio.api is running:'));
      console.log(chalk.gray(`  Check status: curl ${options.apiUrl}/health\n`));
      process.exit(1);
    }
  });

/**
 * Inspect a specific Plan
 */
apiCommand
  .command('inspect')
  .description('Inspect a specific Plan and its methods')
  .argument('<plan>', 'Plan name (e.g., one.storage, one.leute)')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (planName: string, options) => {
    const spinner = ora(`Inspecting ${planName}...`).start();

    try {
      const client = createApiClient(options.apiUrl);
      const metadata = await client.getPlanMetadata(planName);

      spinner.stop();

      if (!metadata) {
        console.error(chalk.red(`\nPlan '${planName}' not found`));
        console.log(chalk.yellow('\nAvailable Plans:'));
        const plans = await client.listPlans();
        plans.forEach(p => console.log(chalk.gray(`  ${p}`)));
        console.log();
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(metadata, null, 2));
        return;
      }

      // Display plan info
      console.log(chalk.bold(`\n${metadata.name}`));
      if (metadata.description) {
        console.log(chalk.gray(metadata.description));
      }
      if (metadata.version) {
        console.log(chalk.gray(`Version: ${metadata.version}`));
      }

      console.log(chalk.bold(`\nMethods (${metadata.methods.length}):\n`));

      for (const method of metadata.methods) {
        console.log(chalk.cyan(`  ${method.name}`));
        if (method.description) {
          console.log(chalk.gray(`    ${method.description}`));
        }

        if (method.params && method.params.length > 0) {
          console.log(chalk.gray('    Parameters:'));
          for (const param of method.params) {
            const required = param.required ? chalk.red('*') : ' ';
            const desc = param.description ? chalk.gray(` - ${param.description}`) : '';
            console.log(chalk.gray(`      ${required} ${param.name}: ${param.type}${desc}`));
          }
        }

        if (method.returns) {
          console.log(chalk.gray(`    Returns: ${method.returns}`));
        }

        console.log(); // Blank line between methods
      }

      console.log(chalk.gray(`Use "refinio exec ${planName} <method> [params]" to execute\n`));
    } catch (error: any) {
      spinner.fail('Failed to inspect Plan');
      console.error(chalk.red(`\nError: ${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Check API server health
 */
apiCommand
  .command('health')
  .description('Check refinio.api server health')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora('Checking server health...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const health = await client.healthCheck();

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      if (health.ok) {
        console.log(chalk.green('\n✓ Server is healthy'));
        console.log(chalk.gray(`  URL: ${options.apiUrl}\n`));
      } else {
        console.log(chalk.red('\n✗ Server is not responding'));
        console.log(chalk.gray(`  URL: ${options.apiUrl}`));
        console.log(chalk.gray(`  Error: ${health.error}\n`));
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail('Health check failed');
      console.error(chalk.red(`\nError: ${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Clear metadata cache
 */
apiCommand
  .command('clear-cache')
  .description('Clear Plan metadata cache')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .action(async (options) => {
    const client = createApiClient(options.apiUrl);
    client.clearCache();
    console.log(chalk.green('✓ Cache cleared\n'));
  });
