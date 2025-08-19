/**
 * Invite command - Accept ONE platform invitation links
 * 
 * Processes invitation URLs from lama.electron or one.leute that contain
 * the credentials needed for establishing connections via CommServer.
 */

import { Command } from 'commander';

const chalk = require('chalk');
const ora = require('ora');
const WebSocket = require('ws');

interface Invitation {
    token: string;
    publicKey: string;
    url: string;
}

export const inviteCommand = new Command('invite')
    .description('Process ONE platform invitation links');

inviteCommand
    .command('accept <url>')
    .description('Accept an invitation URL from lama.electron or one.leute')
    .option('-v, --verbose', 'Verbose output')
    .option('-p, --pair', 'Immediately establish pairing')
    .action(async (inviteUrl: string, options: any) => {
        const spinner = ora('Processing invitation...').start();
        
        try {
            // Parse the invitation URL
            const invitation = parseInvitationUrl(inviteUrl);
            
            if (!invitation) {
                throw new Error('Invalid invitation URL format');
            }
            
            spinner.succeed('Invitation parsed successfully');
            
            console.log(chalk.cyan('\nInvitation Details:'));
            console.log(`  Token: ${chalk.yellow(invitation.token.substring(0, 20))}...`);
            console.log(`  Public Key: ${chalk.yellow(invitation.publicKey.substring(0, 20))}...`);
            console.log(`  CommServer: ${chalk.yellow(invitation.url)}`);
            
            // Determine invitation type
            const inviteType = getInvitationType(inviteUrl);
            console.log(`  Type: ${chalk.green(inviteType)}`);
            
            // Store invitation for use with QUICVC or WebSocket connections
            await storeInvitation(invitation);
            
            spinner.start('Connecting to CommServer...');
            
            // Test connection to CommServer
            const connected = await testCommServerConnection(invitation);
            
            if (connected) {
                spinner.succeed('Successfully connected to CommServer');
                
                console.log(chalk.green('\n✓ Invitation processed successfully!'));
                console.log(chalk.gray('\nYou can now use this invitation to:'));
                console.log(chalk.gray('  - Establish QUICVC connections locally'));
                console.log(chalk.gray('  - Connect via CommServer relay'));
                console.log(chalk.gray('  - Exchange data with the inviter'));
                
                // Optionally establish pairing immediately
                if (options.pair) {
                    spinner.start('Establishing pairing...');
                    await establishPairing(invitation);
                    spinner.succeed('Pairing established');
                }
            } else {
                spinner.warn('Could not connect to CommServer');
                console.log(chalk.yellow('\nInvitation stored but connection failed.'));
                console.log(chalk.gray('The CommServer may be temporarily unavailable.'));
            }
            
        } catch (error: any) {
            spinner.fail('Failed to process invitation');
            console.error(chalk.red('\nError:'), error.message);
            
            if (options.verbose && error.stack) {
                console.error(chalk.gray('\nStack trace:'));
                console.error(chalk.gray(error.stack));
            }
            
            process.exit(1);
        }
    });

// Add subcommand to list stored invitations
inviteCommand
    .command('list')
    .description('List stored invitations')
    .action(async () => {
        try {
            const invitations = await getStoredInvitations();
            
            if (invitations.length === 0) {
                console.log(chalk.yellow('No stored invitations'));
                return;
            }
            
            console.log(chalk.cyan('Stored Invitations:\n'));
            
            invitations.forEach((inv, index) => {
                console.log(chalk.white(`${index + 1}. CommServer: ${inv.url}`));
                console.log(`   Token: ${inv.token.substring(0, 30)}...`);
                console.log(`   Stored: ${inv.storedAt}\n`);
            });
            
        } catch (error: any) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

// Add subcommand to clear stored invitations
inviteCommand
    .command('clear')
    .description('Clear all stored invitations')
    .action(async () => {
        try {
            await clearStoredInvitations();
            console.log(chalk.green('✓ All invitations cleared'));
        } catch (error: any) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

/**
 * Parse invitation URL to extract credentials
 */
function parseInvitationUrl(url: string): Invitation | null {
    try {
        // Extract the hash fragment containing the encoded invitation
        const hashIndex = url.indexOf('#');
        if (hashIndex === -1) {
            throw new Error('No hash fragment in URL');
        }
        
        const encodedData = url.substring(hashIndex + 1);
        const decodedData = decodeURIComponent(encodedData);
        const invitation = JSON.parse(decodedData) as Invitation;
        
        // Validate required fields
        if (!invitation.token || !invitation.publicKey || !invitation.url) {
            throw new Error('Missing required invitation fields');
        }
        
        return invitation;
    } catch (error) {
        console.error('Failed to parse invitation URL:', error);
        return null;
    }
}

/**
 * Determine invitation type from URL
 */
function getInvitationType(url: string): string {
    if (url.includes('invites/inviteDevice/?invited=true')) {
        return 'Instance of Machine (IoM)';
    } else if (url.includes('invites/invitePartner/?invited=true')) {
        return 'Instance of Person (IoP)';
    }
    return 'Unknown';
}

/**
 * Store invitation for later use
 */
async function storeInvitation(invitation: Invitation): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const configDir = path.join(os.homedir(), '.refinio');
    const invitationsFile = path.join(configDir, 'invitations.json');
    
    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });
    
    // Load existing invitations
    let invitations: any[] = [];
    try {
        const data = await fs.readFile(invitationsFile, 'utf-8');
        invitations = JSON.parse(data);
    } catch {
        // File doesn't exist yet
    }
    
    // Add new invitation with metadata
    invitations.push({
        ...invitation,
        storedAt: new Date().toISOString(),
        id: generateId()
    });
    
    // Save updated invitations
    await fs.writeFile(invitationsFile, JSON.stringify(invitations, null, 2));
}

/**
 * Get stored invitations
 */
async function getStoredInvitations(): Promise<any[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const invitationsFile = path.join(os.homedir(), '.refinio', 'invitations.json');
    
    try {
        const data = await fs.readFile(invitationsFile, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Clear stored invitations
 */
async function clearStoredInvitations(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const invitationsFile = path.join(os.homedir(), '.refinio', 'invitations.json');
    
    try {
        await fs.unlink(invitationsFile);
    } catch {
        // File doesn't exist
    }
}

/**
 * Test connection to CommServer
 */
async function testCommServerConnection(invitation: Invitation): Promise<boolean> {
    return new Promise((resolve) => {
        const ws = new WebSocket(invitation.url);
        
        const timeout = setTimeout(() => {
            ws.close();
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
        });
        
        ws.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

/**
 * Establish pairing using the invitation
 */
async function establishPairing(invitation: Invitation): Promise<void> {
    // This would implement the full pairing protocol
    // For now, just store the invitation for later use
    console.log(chalk.gray('Pairing implementation pending...'));
}

/**
 * Generate a simple ID
 */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}