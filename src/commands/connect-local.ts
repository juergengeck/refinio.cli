/**
 * Connect to local lama.electron instance using stored invitations
 * 
 * This command uses invitations obtained from lama.electron to establish
 * local QUICVC connections with proper credentials.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface StoredInvitation {
    token: string;
    publicKey: string;
    url: string;
    storedAt: string;
    id: string;
}

export const connectLocalCommand = new Command('connect-local')
    .description('Connect to local lama.electron instance using stored invitations')
    .option('-p, --port <port>', 'QUICVC port', '49497')
    .option('-a, --address <address>', 'Local address', '127.0.0.1')
    .option('-i, --invitation <id>', 'Use specific invitation by ID')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: any) => {
        const spinner = ora('Loading stored invitations...').start();
        
        try {
            // Load stored invitations
            const invitations = await getStoredInvitations();
            
            if (invitations.length === 0) {
                spinner.fail('No stored invitations found');
                console.log(chalk.yellow('\nPlease first accept an invitation using:'));
                console.log(chalk.gray('  refinio invite accept <invitation-url>'));
                process.exit(1);
            }
            
            spinner.succeed(`Found ${invitations.length} stored invitation(s)`);
            
            // Select invitation to use
            let invitation: StoredInvitation;
            if (options.invitation) {
                const foundInvitation = invitations.find((inv: StoredInvitation) => inv.id === options.invitation);
                if (!foundInvitation) {
                    throw new Error(`Invitation with ID ${options.invitation} not found`);
                }
                invitation = foundInvitation;
            } else {
                // Use the most recent invitation
                invitation = invitations[invitations.length - 1];
                console.log(chalk.cyan(`Using most recent invitation (stored ${invitation.storedAt})`));
            }
            
            console.log(chalk.cyan('\nInvitation Details:'));
            console.log(`  Token: ${chalk.yellow(invitation.token.substring(0, 20))}...`);
            console.log(`  Public Key: ${chalk.yellow(invitation.publicKey.substring(0, 20))}...`);
            console.log(`  CommServer: ${chalk.yellow(invitation.url)}`);
            
            spinner.start(`Connecting to local instance at ${options.address}:${options.port}...`);
            
            // Import and use the QuicVCClient with the invitation credentials
            const { QuicVCClientWithInvite } = await import('../transport/QuicVCClientWithInvite.js');
            
            const client = new QuicVCClientWithInvite(invitation);
            
            // Set up event handlers
            client.on('connected', (deviceId: string) => {
                spinner.succeed(`Connected to ${deviceId}`);
                console.log(chalk.green('\n✓ Successfully connected to local lama.electron instance!'));
            });
            
            client.on('data', (deviceId: string, data: any) => {
                console.log(chalk.blue(`\n← Received data from ${deviceId}:`));
                console.log(data);
            });
            
            client.on('error', (err: Error) => {
                console.error(chalk.red(`\n✗ Connection error: ${err.message}`));
            });
            
            // Connect using the invitation credentials
            const connection = await client.connectWithInvite(options.address, parseInt(options.port));
            
            console.log(chalk.cyan('\nConnection established!'));
            console.log(`  Device ID: ${connection.deviceId}`);
            console.log(`  State: ${connection.state}`);
            
            // Send a test message
            console.log(chalk.cyan('\nSending hello message...'));
            await client.send(connection.deviceId, {
                type: 'hello',
                from: 'refinio.cli',
                message: 'Connected using invitation credentials',
                timestamp: new Date().toISOString()
            });
            
            // Keep connection open for interaction
            console.log(chalk.cyan('\nConnection established. Listening for messages...'));
            console.log(chalk.gray('Press Ctrl+C to disconnect\n'));
            
            // Keep the process alive
            process.on('SIGINT', async () => {
                console.log(chalk.yellow('\n\nDisconnecting...'));
                await client.close(connection.deviceId);
                process.exit(0);
            });
            
            // Keep connection alive
            await new Promise(() => {}); // Never resolves, keeps process running
            
        } catch (error: any) {
            spinner.fail('Connection failed');
            console.error(chalk.red('\nError:'), error.message);
            
            if (options.verbose && error.stack) {
                console.error(chalk.gray('\nStack trace:'));
                console.error(chalk.gray(error.stack));
            }
            
            process.exit(1);
        }
    });

/**
 * Get stored invitations from local storage
 */
async function getStoredInvitations(): Promise<StoredInvitation[]> {
    const invitationsFile = path.join(os.homedir(), '.refinio', 'invitations.json');
    
    try {
        const data = await fs.readFile(invitationsFile, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}