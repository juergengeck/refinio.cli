/**
 * Test QUICVC connection to local lama.electron instance
 */

import { Command } from 'commander';
import * as chalk from 'chalk';
import ora from 'ora';
import { QuicVCClient } from '../transport/QuicVCClient.js';

export const testQuicvcCommand = new Command('test-quicvc')
    .description('Test QUICVC connection to local lama.electron instance')
    .option('-a, --address <address>', 'Server address', '127.0.0.1')
    .option('-p, --port <port>', 'Server port', '49497')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
        const spinner = ora('Initializing QUICVC client...').start();
        
        try {
            // Create QUICVC client
            const client = new QuicVCClient();
            
            if (options.verbose) {
                client.on('connected', (deviceId) => {
                    console.log(chalk.green(`\n✓ Connected: ${deviceId}`));
                });
                
                client.on('data', (deviceId, data) => {
                    console.log(chalk.blue(`\n← Data from ${deviceId}:`), data);
                });
                
                client.on('error', (err) => {
                    console.error(chalk.red(`\n✗ Error:`), err.message);
                });
                
                client.on('close', (deviceId) => {
                    console.log(chalk.yellow(`\n⚠ Connection closed: ${deviceId}`));
                });
            }
            
            spinner.text = `Connecting to ${options.address}:${options.port} via QUICVC...`;
            
            // Connect to server
            const connection = await client.connect(options.address, parseInt(options.port));
            
            spinner.succeed(`Connected to QUICVC server at ${options.address}:${options.port}`);
            
            console.log(chalk.cyan('\nConnection details:'));
            console.log(`  Device ID: ${connection.deviceId}`);
            console.log(`  State: ${connection.state}`);
            console.log(`  DCID: ${Buffer.from(connection.dcid).toString('hex').slice(0, 16)}...`);
            console.log(`  SCID: ${Buffer.from(connection.scid).toString('hex').slice(0, 16)}...`);
            
            // Send test message
            console.log(chalk.cyan('\nSending test message...'));
            await client.send(connection.deviceId, {
                type: 'test',
                message: 'Hello from refinio.cli via QUICVC!',
                timestamp: new Date().toISOString()
            });
            
            console.log(chalk.green('✓ Test message sent'));
            
            // Keep connection open for a bit to receive responses
            console.log(chalk.cyan('\nListening for responses (10 seconds)...'));
            
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Close connection
            console.log(chalk.cyan('\nClosing connection...'));
            await client.close(connection.deviceId);
            
            console.log(chalk.green('✓ Connection closed successfully'));
            
        } catch (error: any) {
            spinner.fail('QUICVC test failed');
            console.error(chalk.red('\nError:'), error.message);
            
            if (options.verbose && error.stack) {
                console.error(chalk.gray('\nStack trace:'));
                console.error(chalk.gray(error.stack));
            }
            
            process.exit(1);
        }
    });