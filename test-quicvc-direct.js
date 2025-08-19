#!/usr/bin/env node

/**
 * Direct test of QUICVC client without CLI framework
 */

const { QuicVCClient } = require('./dist/transport/QuicVCClient');

async function testQuicVC() {
    console.log('Testing QUICVC connection to local lama.electron instance...\n');
    
    const client = new QuicVCClient();
    
    // Set up event handlers
    client.on('connected', (deviceId) => {
        console.log(`✓ Connected: ${deviceId}`);
    });
    
    client.on('data', (deviceId, data) => {
        console.log(`← Data from ${deviceId}:`, data);
    });
    
    client.on('error', (err) => {
        console.error(`✗ Error:`, err.message);
    });
    
    client.on('close', (deviceId) => {
        console.log(`⚠ Connection closed: ${deviceId}`);
    });
    
    try {
        // Connect to local QUICVC server on standard port
        const connection = await client.connect('127.0.0.1', 49497);
        
        console.log('\nConnection established!');
        console.log(`  Device ID: ${connection.deviceId}`);
        console.log(`  State: ${connection.state}`);
        console.log(`  Local port: ${connection.socket.address().port}`);
        
        // Send test message
        console.log('\nSending test message...');
        await client.send(connection.deviceId, {
            type: 'test',
            message: 'Hello from refinio.cli via QUICVC!',
            timestamp: new Date().toISOString()
        });
        
        console.log('Test message sent, listening for responses...\n');
        
        // Keep connection open for 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Close connection
        console.log('\nClosing connection...');
        await client.close(connection.deviceId);
        
        console.log('✓ Test completed successfully');
        
    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run test
testQuicVC().catch(console.error);