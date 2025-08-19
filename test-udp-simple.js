#!/usr/bin/env node

/**
 * Simple UDP test to see if we can communicate with lama.electron
 */

const dgram = require('dgram');

async function testUDP() {
    console.log('Testing UDP communication with lama.electron on port 49497...\n');
    
    const socket = dgram.createSocket('udp4');
    
    socket.on('message', (msg, rinfo) => {
        console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
        console.log('Raw data (hex):', msg.toString('hex').slice(0, 100));
        console.log('Raw data (text):', msg.toString().slice(0, 100));
    });
    
    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });
    
    // Bind to any available port
    await new Promise((resolve) => {
        socket.bind(0, '0.0.0.0', resolve);
    });
    
    const localPort = socket.address().port;
    console.log(`Socket bound to port ${localPort}`);
    
    // Try different message formats
    const tests = [
        // Test 1: Service type byte + JSON (like lama expects)
        Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify({ type: 'ping' }))]),
        
        // Test 2: QUICVC INITIAL packet header
        Buffer.concat([
            Buffer.from([0x00]), // INITIAL packet type
            Buffer.from([0x00, 0x00, 0x00, 0x01]), // Version
            Buffer.from([0x10]), // DCID length
            Buffer.from([0x10]), // SCID length
            Buffer.alloc(16, 0x01), // DCID
            Buffer.alloc(16, 0x02), // SCID
            Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // Packet number
        ]),
        
        // Test 3: Discovery service message
        Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify({
            type: 'discovery',
            deviceId: 'test-cli',
            timestamp: Date.now()
        }))])
    ];
    
    for (let i = 0; i < tests.length; i++) {
        console.log(`\nSending test ${i + 1} (${tests[i].length} bytes)...`);
        console.log('Data (hex):', tests[i].toString('hex').slice(0, 100));
        
        socket.send(tests[i], 49497, '127.0.0.1', (err) => {
            if (err) console.error('Send error:', err);
            else console.log('Sent successfully');
        });
        
        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\nWaiting for responses (5 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    socket.close();
    console.log('\nTest completed');
}

testUDP().catch(console.error);