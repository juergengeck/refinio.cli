import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import crypto from 'crypto';
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
      
      // Create the Profile object in the instance using official one.models Profile structure
      const result = await client.createProfile({
        nickname: alias,  // Using nickname field from official Profile
        personId: instance.personKeys.personId as any,
        owner: instance.personKeys.personId as any,  // For now, person is also the owner
        profileId: crypto.randomBytes(16).toString('hex'),
        communicationEndpoint: [],
        personDescription: []
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
        const isDefault = profile.nickname === instance.defaultProfileAlias;
        const defaultMark = isDefault ? chalk.green(' (default)') : '';
        const isMine = profile.personId === instance.personKeys.personId;
        const ownerMark = isMine ? chalk.blue(' [yours]') : '';
        
        console.log(`  ${chalk.bold(profile.nickname || profile.profileId)}${defaultMark}${ownerMark}`);
        
        if (profile.personDescription?.length > 0) {
          console.log(`    ${chalk.gray('Person descriptions: ' + profile.personDescription.length)}`);
        }
        
        if (profile.communicationEndpoint?.length > 0) {
          console.log(`    ${chalk.gray('Communication endpoints: ' + profile.communicationEndpoint.length)}`);
        }
        
        console.log(`    ${chalk.gray('Profile ID: ' + profile.profileId)}`);
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
      const result = await client.getProfile({ nickname: alias });
      
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
      const result = await client.getProfile({ nickname: targetAlias });
      await client.disconnect();
      
      spinner.stop();
      
      if (!result.profile) {
        console.error(chalk.red(`Profile '${targetAlias}' not found`));
        process.exit(1);
      }
      
      const profile = result.profile;
      
      console.log(chalk.cyan('Profile Details:\n'));
      console.log(`  ${chalk.bold('Nickname:')} ${profile.nickname || 'No nickname'}`);
      console.log(`  ${chalk.bold('Profile ID:')} ${profile.profileId}`);
      console.log(`  ${chalk.bold('Person ID:')} ${profile.personId}`);
      console.log(`  ${chalk.bold('Owner:')} ${profile.owner}`);
      
      if (profile.communicationEndpoint && profile.communicationEndpoint.length > 0) {
        console.log(`  ${chalk.bold('Communication Endpoints:')} ${profile.communicationEndpoint.length} endpoint(s)`);
      }
      
      if (profile.personDescription && profile.personDescription.length > 0) {
        console.log(`  ${chalk.bold('Person Descriptions:')} ${profile.personDescription.length} description(s)`);
      }
      
      if (profile.$versionHash$) {
        console.log(`  ${chalk.bold('Version Hash:')} ${profile.$versionHash$}`);
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
      const getResult = await client.getProfile({ nickname: alias });
      if (!getResult.profile) {
        spinner.fail(`Profile '${alias}' not found`);
        process.exit(1);
      }
      
      const updates: any = {};
      if (options.name) updates.nickname = options.name;  // Update nickname
      // Note: For description and other metadata, we'd need PersonDescription objects
      
      const result = await client.updateProfile({
        profileId: getResult.profile.profileId,
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
      const getResult = await client.getProfile({ nickname: alias });
      if (!getResult.profile) {
        spinner.fail(`Profile '${alias}' not found`);
        process.exit(1);
      }
      
      await client.deleteProfile(getResult.profile.profileId);
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