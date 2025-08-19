#!/usr/bin/env node

/**
 * Test the invite command with a sample invitation URL
 */

const { inviteCommand } = require('./dist/commands/invite');

// Sample invitation URL structure (you would get this from lama.electron)
const sampleInvitation = {
    token: 'sample-token-123456789',
    publicKey: 'sample-public-key-abcdefghijk',
    url: 'wss://comm10.dev.refinio.one'
};

// Encode as it would appear in a real invitation URL
const encodedInvitation = encodeURIComponent(JSON.stringify(sampleInvitation));
const invitationUrl = `https://edda.one/invites/invitePartner/?invited=true#${encodedInvitation}`;

console.log('Testing invite command with sample URL:\n');
console.log('URL:', invitationUrl.substring(0, 100) + '...\n');

// Simulate running the command
process.argv = ['node', 'test-invite.js', 'accept', invitationUrl];

// Execute the command
inviteCommand.parseAsync(process.argv).catch(console.error);