/**
 * Enhanced invite command that connects through existing refinio.api instance
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';

interface ConnectionOptions {
    apiUrl?: string;
    verbose?: boolean;
}

interface InvitationData {
    token: string;
    publicKey: string;
    url: string;
}

export const inviteConnectCommand = new Command('invite-connect')
    .description('Connect to another ONE instance using an invitation URL through refinio.api')
    .argument('<invite-url>', 'Invitation URL from the other instance')
    .option('-a, --api-url <url>', 'Refinio API URL', 'http://localhost:8081')
    .option('-v, --verbose', 'Verbose output')
    .action(async (inviteUrl: string, options: ConnectionOptions) => {
        const spinner = ora('Processing invitation...').start();

        try {
            // Parse the invitation
            const hashIndex = inviteUrl.indexOf('#');
            if (hashIndex === -1) {
                throw new Error('Invalid invitation URL - no hash fragment');
            }

            const encodedData = inviteUrl.substring(hashIndex + 1);
            const decodedData = decodeURIComponent(encodedData);
            const invitation: InvitationData = JSON.parse(decodedData);

            spinner.succeed('Invitation parsed');
            console.log(chalk.cyan('\nInvitation Details:'));
            console.log(`  Token: ${chalk.yellow(invitation.token.substring(0, 20))}...`);
            console.log(`  Public Key: ${chalk.yellow(invitation.publicKey.substring(0, 20))}...`);
            console.log(`  CommServer: ${chalk.yellow(invitation.url)}`);

            // Check if refinio.api is running
            spinner.start('Checking refinio.api instance...');
            try {
                const healthCheck = await fetch(`${options.apiUrl}/health`);
                if (!healthCheck.ok && healthCheck.status !== 404) {
                    throw new Error(`API not responding (status: ${healthCheck.status})`);
                }
                spinner.succeed(`Refinio API is running at ${options.apiUrl}`);
            } catch (error) {
                spinner.fail(`Cannot connect to refinio.api at ${options.apiUrl}`);
                console.log(chalk.yellow('\nMake sure you have started refinio.api with:'));
                console.log(chalk.gray('  refinio start --port 8081 --background'));
                throw error;
            }

            // Send connection request to refinio.api
            spinner.start('Establishing P2P connection through refinio.api...');

            const connectResponse = await fetch(`${options.apiUrl}/api/connections/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inviteUrl: inviteUrl,
                    invitation: invitation
                })
            });

            if (!connectResponse.ok) {
                const errorText = await connectResponse.text();
                throw new Error(`Failed to establish connection: ${errorText}`);
            }

            const result = await connectResponse.json() as any;
            spinner.succeed('Connection established!');

            console.log(chalk.green('\n✅ Successfully connected!'));
            console.log(chalk.cyan('\nConnection Details:'));

            if (result.personId) {
                console.log(`  Remote Person: ${chalk.yellow(result.personId.substring(0, 20))}...`);
            }
            if (result.instanceId) {
                console.log(`  Remote Instance: ${chalk.yellow(result.instanceId.substring(0, 20))}...`);
            }
            if (result.connectionId) {
                console.log(`  Connection ID: ${chalk.yellow(result.connectionId)}`);
            }

            // Verify connection is active
            spinner.start('Verifying connection...');
            const connectionsResponse = await fetch(`${options.apiUrl}/api/connections`);

            if (connectionsResponse.ok) {
                const connections = await connectionsResponse.json() as any[];
                const activeConnections = connections.filter((c: any) => c.status === 'active' || c.connected);

                spinner.succeed(`Connection verified - ${activeConnections.length} active connection(s)`);

                if (options.verbose) {
                    console.log(chalk.gray('\nActive connections:'));
                    activeConnections.forEach((conn: any) => {
                        console.log(chalk.gray(`  - ${conn.id || conn.connectionId}: ${conn.status || 'connected'}`));
                    });
                }
            } else {
                spinner.warn('Could not verify connections');
            }

            console.log(chalk.gray('\n💡 Connection is active and ready for data exchange'));
            console.log(chalk.gray('The two instances can now sync data through the CommServer'));

            // Monitor the connection if verbose
            if (options.verbose) {
                console.log(chalk.gray('\nMonitoring connection (press Ctrl+C to exit)...'));

                const interval = setInterval(async () => {
                    try {
                        const statusResponse = await fetch(`${options.apiUrl}/api/connections`);
                        if (statusResponse.ok) {
                            const connections = await statusResponse.json() as any[];
                            const active = connections.filter((c: any) => c.status === 'active' || c.connected).length;
                            process.stdout.write(`\r${chalk.gray(`[${new Date().toLocaleTimeString()}] Active connections: ${active}`)}  `);
                        }
                    } catch (error) {
                        // API might be down
                    }
                }, 5000);

                process.on('SIGINT', () => {
                    clearInterval(interval);
                    console.log(chalk.yellow('\n\nExiting...'));
                    process.exit(0);
                });

                // Keep process alive
                await new Promise(() => {});
            }

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