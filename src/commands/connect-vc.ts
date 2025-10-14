/**
 * Connect using Verifiable Credentials derived from invitations
 * 
 * This command establishes direct peer connections using VC authentication
 * instead of relying on CommServer. It uses invitation tokens to create
 * verifiable credentials that authenticate both parties.
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

export const connectVcCommand = new Command('connect-vc')
    .description('Connect using Verifiable Credentials from invitations')
    .option('-p, --port <port>', 'Target port', '49497')
    .option('-a, --address <address>', 'Target address', '127.0.0.1')
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
            
            spinner.start('Creating Verifiable Credential from invitation...');
            
            // Import and use the QuicVC client with direct VC authentication
            const { QuicVCWithDirectAuth } = await import('../transport/QuicVCWithDirectAuth.js');
            
            const client = new QuicVCWithDirectAuth();
            
            // Set the invitation for credential creation
            client.setInvitation(invitation);
            
            spinner.succeed('Verifiable Credential created');
            
            // Set up event handlers
            client.on('peer_authenticated', (peer: any) => {
                console.log(chalk.green(`\n✓ Peer authenticated: ${peer.deviceId}`));
                console.log(`  Trust level: ${chalk.cyan(peer.trustLevel)}`);
                console.log(`  Public key: ${chalk.gray(peer.publicKeyHex.substring(0, 20))}...`);
            });
            
            client.on('authenticated', (connection: any) => {
                console.log(chalk.green(`\n✓ Authentication complete with ${connection.deviceId}`));
            });
            
            client.on('ready', (connection: any) => {
                console.log(chalk.green(`\n✓ Connection ready with ${connection.deviceId}`));
            });
            
            client.on('authentication_error', (error: string, remoteInfo: any) => {
                console.error(chalk.red(`\n✗ Authentication error: ${error}`));
                console.error(chalk.gray(`  Remote: ${remoteInfo.address}:${remoteInfo.port}`));
            });
            
            client.on('data', (deviceId: string, data: any) => {
                console.log(chalk.blue(`\n← Data from ${deviceId}:`));
                console.log(data);
            });
            
            client.on('discovery', (deviceId: string, data: any) => {
                console.log(chalk.magenta(`\n🔍 Discovery from ${deviceId}:`));
                console.log(data.toString());
            });
            
            client.on('error', (err: Error) => {
                console.error(chalk.red(`\n✗ Connection error: ${err.message}`));
            });
            
            spinner.start(`Connecting to ${options.address}:${options.port} with VC authentication...`);
            
            // Connect using VC authentication
            const connection = await client.connectWithVCAuth(options.address, parseInt(options.port));
            
            spinner.succeed(`Connected and authenticated`);
            
            console.log(chalk.cyan('\nConnection Details:'));
            console.log(`  Device ID: ${connection.deviceId}`);
            console.log(`  State: ${connection.state}`);
            console.log(`  Address: ${connection.address}:${connection.port}`);
            
            // Display verified peers
            const verifiedPeers = client.getVerifiedPeers();
            if (verifiedPeers.length > 0) {
                console.log(chalk.cyan('\nVerified Peers:'));
                verifiedPeers.forEach(peer => {
                    console.log(`  ${peer.deviceId}:`);
                    console.log(`    Trust: ${peer.trustLevel}`);
                    console.log(`    Verified: ${new Date(peer.verifiedAt).toLocaleString()}`);
                });
            }
            
            // Send a test message
            console.log(chalk.cyan('\nSending authenticated message...'));
            await client.send(connection.deviceId, {
                type: 'authenticated_message',
                from: 'refinio.cli',
                message: 'Hello via Verifiable Credentials!',
                timestamp: new Date().toISOString(),
                credential_used: invitation.token.substring(0, 16) + '...'
            });
            
            console.log(chalk.green('✓ Message sent'));
            
            // Interactive mode
            console.log(chalk.cyan('\nConnection established with VC authentication'));
            console.log(chalk.gray('Commands:'));
            console.log(chalk.gray('  send <message> - Send a message'));
            console.log(chalk.gray('  peers - List verified peers'));
            console.log(chalk.gray('  quit - Close connection and exit'));
            console.log(chalk.gray('  Ctrl+C - Force quit\n'));
            
            // Set up interactive input
            const readline = (await import('readline')).createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: chalk.cyan('vc> ')
            });
            
            readline.prompt();
            
            readline.on('line', async (line: string) => {
                const [command, ...args] = line.trim().split(' ');
                
                switch (command) {
                    case 'send':
                        if (args.length === 0) {
                            console.log(chalk.yellow('Usage: send <message>'));
                        } else {
                            try {
                                await client.send(connection.deviceId, {
                                    type: 'user_message',
                                    message: args.join(' '),
                                    timestamp: new Date().toISOString()
                                });
                                console.log(chalk.green('✓ Message sent'));
                            } catch (error: any) {
                                console.error(chalk.red(`✗ Send failed: ${error.message}`));
                            }
                        }
                        break;
                        
                    case 'peers':
                        const peers = client.getVerifiedPeers();
                        if (peers.length === 0) {
                            console.log(chalk.yellow('No verified peers'));
                        } else {
                            console.log(chalk.cyan('Verified Peers:'));
                            peers.forEach(peer => {
                                console.log(`  ${peer.deviceId} (${peer.trustLevel})`);
                            });
                        }
                        break;
                        
                    case 'quit':
                    case 'exit':
                        console.log(chalk.yellow('\nClosing connection...'));
                        await client.close(connection.deviceId);
                        process.exit(0);
                        break;
                        
                    case 'help':
                        console.log(chalk.gray('Commands:'));
                        console.log(chalk.gray('  send <message> - Send a message'));
                        console.log(chalk.gray('  peers - List verified peers'));
                        console.log(chalk.gray('  quit - Close connection and exit'));
                        break;
                        
                    default:
                        if (command) {
                            console.log(chalk.yellow(`Unknown command: ${command}`));
                            console.log(chalk.gray('Type "help" for available commands'));
                        }
                }
                
                readline.prompt();
            });
            
            readline.on('SIGINT', async () => {
                console.log(chalk.yellow('\n\nClosing connection...'));
                await client.close(connection.deviceId);
                process.exit(0);
            });
            
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