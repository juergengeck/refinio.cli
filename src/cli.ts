#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LocalCredentials } from './credentials/LocalCredentials.js';
import { createProfileClient } from './client/ProfileAwareClient.js';
import { authCommand } from './commands/auth.js';
import { crudCommands } from './commands/crud.js';
import { recipeCommand } from './commands/recipe.js';
import { streamCommand } from './commands/stream.js';
import { profileCommand } from './commands/profile.js';
import { contactsCommand } from './commands/contacts.js';
import { connectionsCommand } from './commands/connections.js';
import { connectCommand, disconnectCommand, instancesCommand } from './commands/connect.js';
import { testQuicvcCommand } from './commands/test-quicvc.js';
import { inviteCommand } from './commands/invite.js';
import { inviteConnectCommand } from './commands/invite-connect.js';
import { connectLocalCommand } from './commands/connect-local.js';
import { connectVcCommand } from './commands/connect-vc.js';
import { syncCommand } from './commands/sync.js';
import { debugCommand } from './commands/debug.js';
import { filerCommand } from './commands/filer.js';
import { startCommand, stopCommand, listCommand } from './commands/start.js';

// New dynamic Plan-based commands
import { apiCommand } from './commands/api.js';
import { execCommand } from './commands/exec.js';
import { storageCommand } from './commands/storage.js';
import { channelsCommand } from './commands/channels.js';
import { groupsCommand } from './commands/groups.js';
import { cryptoCommand } from './commands/crypto.js';
import { instanceCommand } from './commands/instance.js';

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

// Add contacts command
program.addCommand(contactsCommand);

// Add connections command
program.addCommand(connectionsCommand);

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

// Add invite-connect command
program.addCommand(inviteConnectCommand);

// Add connect-local command
program.addCommand(connectLocalCommand);

// Add connect-vc command
program.addCommand(connectVcCommand);

// Add sync command
program.addCommand(syncCommand);

// Add debug command
program.addCommand(debugCommand);

// Add filer command
program.addCommand(filerCommand);

// Add instance management commands
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(listCommand);

// Add dynamic Plan-based commands (Phase 1-3)
program.addCommand(apiCommand);        // Phase 1: Plan discovery
program.addCommand(execCommand);       // Phase 2: Universal executor
program.addCommand(storageCommand);    // Phase 3: Storage convenience commands
program.addCommand(channelsCommand);   // Phase 3: Channels convenience commands
program.addCommand(groupsCommand);     // Phase 3: Groups convenience commands
program.addCommand(cryptoCommand);     // Phase 3: Crypto convenience commands
program.addCommand(instanceCommand);   // Phase 3: Instance convenience commands

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
  const knownCommands = ['connect', 'disconnect', 'instances', 'profile', 'contacts', 'connections', 'auth', 'create', 'get', 'update', 'delete', 'list', 'recipe', 'stream', 'test-quicvc', 'invite', 'invite-connect', 'connect-local', 'connect-vc', 'sync', 'debug', 'filer', 'start', 'stop'];
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
    if (error.code === 'commander.help' || error.code === 'commander.version') {
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