import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { LocalCredentials } from '../credentials/LocalCredentials';
import { createProfileClient } from '../client/ProfileAwareClient';

const localCreds = new LocalCredentials();

export const profileCommand = new Command('profile')
  .description('Manage ONE Profile objects');

profileCommand
  .command('create')
  .description('Create a new Profile in the ONE instance')
  .argument('<alias>', 'Profile alias (e.g., "fritz", "dev", "prod")')
  .option('-n, --name <name>', 'Display name for the profile')
  .option('-d, --description <text>', 'Profile description')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .action(async (alias, options) => {
    const spinner = ora('Creating profile...').start();
    
    try {
      await localCreds.load();
      
      // Get instance connection
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        spinner.fail('No instance connection found. Connect to an instance first.');
        process.exit(1);
      }
      
      // Connect to instance
      const client = await createProfileClient(instance.instanceUrl);
      
      // Create the Profile object in the instance
      const result = await client.createProfile({
        alias,
        displayName: options.name || alias,
        description: options.description,
        personId: instance.personKeys.personId,
        instanceUrl: instance.instanceUrl
      });
      
      await client.disconnect();
      
      spinner.succeed(`Profile '${alias}' created in instance`);
      console.log(chalk.gray(`Profile ID: ${result.profile.id}`));
      console.log(chalk.gray(`Instance: ${instance.instanceUrl}`));
      
      // Update local default profile for this instance
      await localCreds.addInstance(
        instance.instanceUrl,
        instance.personKeys,
        alias
      );
      
      console.log(chalk.green('✓ Set as default profile for this instance'));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

profileCommand
  .command('list')
  .description('List all Profiles in the instance')
  .alias('ls')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .option('--my', 'Show only my profiles')
  .action(async (options) => {
    try {
      await localCreds.load();
      
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        console.log(chalk.yellow('No instance connection found'));
        console.log(chalk.gray('Connect to an instance first with: refinio connect <url>'));
        return;
      }
      
      const spinner = ora('Fetching profiles...').start();
      
      // Connect and get profiles
      const client = await createProfileClient(instance.instanceUrl);
      
      const filter: any = {};
      if (options.my) {
        filter.personId = instance.personKeys.personId;
      }
      
      const result = await client.listProfiles(filter);
      await client.disconnect();
      
      spinner.stop();
      
      if (result.count === 0) {
        console.log(chalk.yellow('No profiles found'));
        console.log(chalk.gray('Create a profile with: refinio profile create <alias>'));
        return;
      }
      
      console.log(chalk.cyan(`Profiles in ${instance.instanceUrl}:\n`));
      
      result.profiles.forEach((profile: any) => {
        const isDefault = profile.alias === instance.defaultProfileAlias;
        const defaultMark = isDefault ? chalk.green(' (default)') : '';
        const isMine = profile.personId === instance.personKeys.personId;
        const ownerMark = isMine ? chalk.blue(' [yours]') : '';
        
        console.log(`  ${chalk.bold(profile.alias)}${defaultMark}${ownerMark}`);
        console.log(`    ${chalk.gray(profile.displayName)}`);
        
        if (profile.description) {
          console.log(`    ${chalk.gray(profile.description)}`);
        }
        
        if (profile.lastUsed) {
          console.log(`    ${chalk.gray(`Last used: ${new Date(profile.lastUsed).toLocaleString()}`)}`);
        }
        
        console.log();
      });
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

profileCommand
  .command('use')
  .description('Set the default profile for an instance')
  .argument('<alias>', 'Profile alias')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .action(async (alias, options) => {
    const spinner = ora('Setting default profile...').start();
    
    try {
      await localCreds.load();
      
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        spinner.fail('No instance connection found');
        process.exit(1);
      }
      
      // Verify profile exists
      const client = await createProfileClient(instance.instanceUrl);
      const result = await client.getProfile({ alias });
      
      if (!result.profile) {
        spinner.fail(`Profile '${alias}' not found`);
        process.exit(1);
      }
      
      await client.disconnect();
      
      // Update local default
      await localCreds.addInstance(
        instance.instanceUrl,
        instance.personKeys,
        alias
      );
      
      spinner.succeed(`Default profile set to '${alias}' for ${instance.instanceUrl}`);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

profileCommand
  .command('show')
  .description('Show Profile details')
  .argument('[alias]', 'Profile alias (uses default if not specified)')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .action(async (alias, options) => {
    try {
      await localCreds.load();
      
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        console.error(chalk.red('No instance connection found'));
        process.exit(1);
      }
      
      const targetAlias = alias || instance.defaultProfileAlias;
      if (!targetAlias) {
        console.error(chalk.red('No profile specified and no default set'));
        process.exit(1);
      }
      
      const spinner = ora('Fetching profile...').start();
      
      const client = await createProfileClient(instance.instanceUrl);
      const result = await client.getProfile({ alias: targetAlias });
      await client.disconnect();
      
      spinner.stop();
      
      if (!result.profile) {
        console.error(chalk.red(`Profile '${targetAlias}' not found`));
        process.exit(1);
      }
      
      const profile = result.profile;
      
      console.log(chalk.cyan('Profile Details:\n'));
      console.log(`  ${chalk.bold('Alias:')} ${profile.alias}`);
      console.log(`  ${chalk.bold('Display Name:')} ${profile.displayName}`);
      console.log(`  ${chalk.bold('Profile ID:')} ${profile.id}`);
      console.log(`  ${chalk.bold('Person ID:')} ${profile.personId}`);
      console.log(`  ${chalk.bold('Instance URL:')} ${profile.instanceUrl}`);
      
      if (profile.instanceId) {
        console.log(`  ${chalk.bold('Instance ID:')} ${profile.instanceId}`);
      }
      
      if (profile.description) {
        console.log(`  ${chalk.bold('Description:')} ${profile.description}`);
      }
      
      if (profile.permissions && profile.permissions.length > 0) {
        console.log(`  ${chalk.bold('Permissions:')} ${profile.permissions.join(', ')}`);
      }
      
      if (profile.metadata) {
        if (profile.metadata.createdAt) {
          console.log(`  ${chalk.bold('Created:')} ${new Date(profile.metadata.createdAt).toLocaleString()}`);
        }
        if (profile.metadata.lastUsed) {
          console.log(`  ${chalk.bold('Last Used:')} ${new Date(profile.metadata.lastUsed).toLocaleString()}`);
        }
        if (profile.metadata.tags && profile.metadata.tags.length > 0) {
          console.log(`  ${chalk.bold('Tags:')} ${profile.metadata.tags.join(', ')}`);
        }
      }
      
      if (profile.settings && Object.keys(profile.settings).length > 0) {
        console.log(`  ${chalk.bold('Settings:')}`);
        Object.entries(profile.settings).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

profileCommand
  .command('update')
  .description('Update a Profile')
  .argument('<alias>', 'Profile alias')
  .option('-n, --name <name>', 'New display name')
  .option('-d, --description <text>', 'New description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .action(async (alias, options) => {
    const spinner = ora('Updating profile...').start();
    
    try {
      await localCreds.load();
      
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        spinner.fail('No instance connection found');
        process.exit(1);
      }
      
      const client = await createProfileClient(instance.instanceUrl);
      
      // Get the profile first
      const getResult = await client.getProfile({ alias });
      if (!getResult.profile) {
        spinner.fail(`Profile '${alias}' not found`);
        process.exit(1);
      }
      
      const updates: any = {};
      if (options.name) updates.displayName = options.name;
      if (options.description) updates.description = options.description;
      if (options.tags) {
        updates.metadata = {
          ...getResult.profile.metadata,
          tags: options.tags.split(',').map((t: string) => t.trim())
        };
      }
      
      const result = await client.updateProfile({
        profileId: getResult.profile.id,
        updates
      });
      
      await client.disconnect();
      
      spinner.succeed(`Profile '${alias}' updated`);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

profileCommand
  .command('delete')
  .description('Delete a Profile')
  .argument('<alias>', 'Profile alias')
  .option('-i, --instance <url>', 'Instance URL (uses default if not specified)')
  .action(async (alias, options) => {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete profile '${alias}'?`,
      default: false
    }]);
    
    if (!confirm) {
      console.log('Cancelled');
      return;
    }
    
    const spinner = ora('Deleting profile...').start();
    
    try {
      await localCreds.load();
      
      const instance = localCreds.getInstance(options.instance);
      if (!instance) {
        spinner.fail('No instance connection found');
        process.exit(1);
      }
      
      const client = await createProfileClient(instance.instanceUrl);
      
      // Get the profile first
      const getResult = await client.getProfile({ alias });
      if (!getResult.profile) {
        spinner.fail(`Profile '${alias}' not found`);
        process.exit(1);
      }
      
      await client.deleteProfile(getResult.profile.id);
      await client.disconnect();
      
      // Clear local default if it was this profile
      if (instance.defaultProfileAlias === alias) {
        await localCreds.addInstance(
          instance.instanceUrl,
          instance.personKeys,
          undefined
        );
      }
      
      spinner.succeed(`Profile '${alias}' deleted`);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });