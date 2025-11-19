/**
 * Crypto Commands
 *
 * Convenience commands for ONE crypto operations via one.crypto Plan
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../client/ApiClient.js';

export const cryptoCommand = new Command('crypto')
  .description('ONE cryptographic operations');

/**
 * Hash data
 */
cryptoCommand
  .command('hash')
  .description('Calculate SHA-256 hash of data')
  .argument('<data>', 'Data to hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, options) => {
    const spinner = ora('Calculating hash...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.crypto', 'hash', { data });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to calculate hash');
      }

      spinner.succeed('Hash calculated');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nSHA-256: ${story.data.hash || story.data}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to calculate hash');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Sign data
 */
cryptoCommand
  .command('sign')
  .description('Sign data with a key')
  .argument('<data>', 'Data to sign')
  .argument('<keyId>', 'Key ID hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, keyId: string, options) => {
    const spinner = ora('Signing data...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.crypto', 'sign', { data, keyId });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to sign data');
      }

      spinner.succeed('Data signed');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nSignature: ${story.data.signature}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to sign data');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Verify signature
 */
cryptoCommand
  .command('verify')
  .description('Verify a signature')
  .argument('<data>', 'Original data')
  .argument('<signature>', 'Signature to verify')
  .argument('<publicKeyHash>', 'Public key hash')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, signature: string, publicKeyHash: string, options) => {
    const spinner = ora('Verifying signature...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.crypto', 'verify', { data, signature, publicKeyHash });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to verify signature');
      }

      const valid = story.data.valid;
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        if (valid) {
          console.log(chalk.green('\n✓ Signature is valid\n'));
        } else {
          console.log(chalk.red('\n✗ Signature is invalid\n'));
        }
      }
    } catch (error: any) {
      spinner.fail('Failed to verify signature');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Encrypt data
 */
cryptoCommand
  .command('encrypt')
  .description('Encrypt data for recipients')
  .argument('<data>', 'Data to encrypt')
  .argument('<recipients...>', 'Recipient key hashes (space-separated)')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (data: string, recipients: string[], options) => {
    const spinner = ora('Encrypting data...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const story = await client.execute('one.crypto', 'encrypt', { data, recipientKeys: recipients });

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to encrypt data');
      }

      spinner.succeed('Data encrypted');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nEncrypted data:\n${JSON.stringify(story.data.encrypted, null, 2)}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to encrypt data');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });

/**
 * Decrypt data
 */
cryptoCommand
  .command('decrypt')
  .description('Decrypt encrypted data')
  .argument('<encrypted>', 'Encrypted data as JSON string')
  .option('-a, --api-url <url>', 'Refinio API URL', process.env.REFINIO_API_URL || 'http://localhost:49498')
  .option('-j, --json', 'Output in JSON format')
  .action(async (encrypted: string, options) => {
    const spinner = ora('Decrypting data...').start();

    try {
      const client = createApiClient(options.apiUrl);
      const encryptedData = JSON.parse(encrypted);
      const story = await client.execute('one.crypto', 'decrypt', encryptedData);

      if (!story.success) {
        throw new Error(story.error?.message || 'Failed to decrypt data');
      }

      spinner.succeed('Data decrypted');

      if (options.json) {
        console.log(JSON.stringify(story.data, null, 2));
      } else {
        console.log(chalk.gray(`\nDecrypted data: ${story.data.decrypted || story.data}\n`));
      }
    } catch (error: any) {
      spinner.fail('Failed to decrypt data');
      console.error(chalk.red(`\n${error.message}\n`));
      process.exit(1);
    }
  });
