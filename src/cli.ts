#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LocalCredentials } from './credentials/LocalCredentials';
import { createProfileClient } from './client/ProfileAwareClient';
import { authCommand } from './commands/auth';
import { crudCommands } from './commands/crud';
import { recipeCommand } from './commands/recipe';
import { streamCommand } from './commands/stream';
import { profileCommand } from './commands/profile';
import { connectCommand, disconnectCommand, instancesCommand } from './commands/connect';
import { testQuicvcCommand } from './commands/test-quicvc';
import { inviteCommand } from './commands/invite';
import { connectLocalCommand } from './commands/connect-local';
import { connectVcCommand } from './commands/connect-vc';

const program = new Command();

program
  .name('refinio')
  .description('CLI client for Refinio API with multi-instance support')
  .version('0.1.0')
  .usage('[profile-alias] <command> [options]')
  .usage('<command> [options]');

// Add connection commands
program.addCommand(connectCommand);
program.addCommand(disconnectCommand);
program.addCommand(instancesCommand);

// Add profile command
program.addCommand(profileCommand);

// Add auth command
program.addCommand(authCommand);

// Add CRUD commands
crudCommands.forEach(cmd => program.addCommand(cmd));

// Add recipe command
program.addCommand(recipeCommand);

// Add stream command
program.addCommand(streamCommand);

// Add QUICVC test command
program.addCommand(testQuicvcCommand);

// Add invite command
program.addCommand(inviteCommand);

// Add connect-local command
program.addCommand(connectLocalCommand);

// Add connect-vc command
program.addCommand(connectVcCommand);

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('-j, --json', 'Output in JSON format')
  .option('-p, --profile <alias>', 'Use specific profile')
  .option('-c, --config <path>', 'Path to config file');

// Handle profile shortcut: refinio <profile-alias> <command>
async function checkProfileShortcut(argv: string[]): Promise<string[]> {
  // Skip if less than 3 args (node, script, command)
  if (argv.length < 3) return argv;
  
  const potentialProfile = argv[2];
  
  // Skip if it starts with - (it's a flag) or is a known command
  const knownCommands = ['connect', 'disconnect', 'instances', 'profile', 'auth', 'create', 'get', 'update', 'delete', 'list', 'recipe', 'stream', 'test-quicvc', 'invite', 'connect-local', 'connect-vc'];
  if (potentialProfile.startsWith('-') || knownCommands.includes(potentialProfile)) {
    return argv;
  }
  
  // For now, assume it's a profile alias and let the command handler validate
  // This allows: refinio fritz recipe list
  const newArgv = [...argv.slice(0, 2)]; // node and script
  
  if (argv.length > 3) {
    // Add the actual command
    newArgv.push(argv[3]);
    // Add --profile flag
    newArgv.push('--profile', potentialProfile);
    // Add remaining args
    newArgv.push(...argv.slice(4));
  } else {
    // Just profile name, show profile info
    newArgv.push('profile', 'show', potentialProfile);
  }
  
  return newArgv;
}

// Handle dynamic profile commands
program
  .command('exec <profile>')
  .description('Execute commands using a specific profile')
  .allowUnknownOption()
  .action(async (profile, options, command) => {
    const spinner = ora('Connecting to instance...').start();
    
    try {
      const client = await createProfileClient(profile);
      spinner.succeed(`Connected to ${profile}`);
      
      // Show profile info
      const profileInfo = client.getProfile();
      if (profileInfo) {
        console.log(chalk.gray(`Instance: ${profileInfo.instanceUrl}`));
        console.log(chalk.gray(`Person ID: ${profileInfo.personKeys.personId}`));
      }
      
      await client.disconnect();
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

// Handle errors
program.exitOverride();

async function main() {
  try {
    // Check for profile shortcut
    const modifiedArgv = await checkProfileShortcut(process.argv);
    
    await program.parseAsync(modifiedArgv);
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