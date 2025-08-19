#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { QuicClient } from './client/QuicClient';
import { loadConfig } from './config';
import { authCommand } from './commands/auth';
import { crudCommands } from './commands/crud';
import { recipeCommand } from './commands/recipe';
import { streamCommand } from './commands/stream';

const program = new Command();

program
  .name('refinio')
  .description('CLI client for Refinio API')
  .version('0.1.0');

// Add auth command
program.addCommand(authCommand);

// Add CRUD commands
crudCommands.forEach(cmd => program.addCommand(cmd));

// Add recipe command
program.addCommand(recipeCommand);

// Add stream command
program.addCommand(streamCommand);

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('-j, --json', 'Output in JSON format')
  .option('-c, --config <path>', 'Path to config file');

// Handle errors
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'commander.help') {
      process.exit(0);
    }
    
    console.error(chalk.red('Error:'), error.message);
    
    if (program.opts().verbose) {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

main();