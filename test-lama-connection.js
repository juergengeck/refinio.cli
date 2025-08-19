#!/usr/bin/env node

/**
 * Test script to connect to lama.electron instance using WebSocket
 * Uses the instance information from glue.id.json
 */

const WebSocket = require('ws');
const crypto = require('crypto');

// Instance information from lama.electron/lama/lama/public/glue.id.json
const INSTANCE_INFO = {
  type: "public",
  personEmail: "lama@refinio.one", 
  instanceName: "lama",
  url: "wss://comm10.dev.refinio.one"
};

console.log('🚀 Testing connection to lama.electron instance...');
console.log(`Instance: ${INSTANCE_INFO.instanceName}`);
console.log(`URL: ${INSTANCE_INFO.url}`);
console.log(`Email: ${INSTANCE_INFO.personEmail}`);
console.log();

// Test WebSocket connection
function testConnection() {
  console.log('📡 Attempting WebSocket connection...');
  
  const ws = new WebSocket(INSTANCE_INFO.url);
  
  ws.on('open', function open() {
    console.log('✅ WebSocket connection established successfully!');
    console.log('📊 Connection details:');
    console.log(`  - Ready State: ${ws.readyState}`);
    console.log(`  - Protocol: ${ws.protocol || 'default'}`);
    console.log(`  - Extensions: ${ws.extensions || 'none'}`);
    
    // Try to send a discovery/ping message
    const discoveryMessage = {
      type: 'discovery',
      timestamp: Date.now(),
      clientInfo: {
        name: 'refinio-cli-test',
        version: '0.1.0'
      }
    };
    
    console.log('📤 Sending discovery message...');
    ws.send(JSON.stringify(discoveryMessage));
  });
  
  ws.on('message', function message(data) {
    console.log('📥 Received message:');
    try {
      const parsed = JSON.parse(data.toString());
      console.log('   Type:', parsed.type || 'unknown');
      console.log('   Content:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('   Raw data:', data.toString());
    }
  });
  
  ws.on('error', function error(err) {
    console.log('❌ WebSocket error:');
    console.log(`   Error: ${err.message}`);
    console.log(`   Code: ${err.code}`);
    if (err.errno) {
      console.log(`   Errno: ${err.errno}`);
    }
  });
  
  ws.on('close', function close(code, reason) {
    console.log('🔌 WebSocket connection closed');
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason.toString() || 'No reason provided'}`);
    
    // Interpret close codes
    const closeReason = getCloseCodeReason(code);
    if (closeReason) {
      console.log(`   Meaning: ${closeReason}`);
    }
  });
  
  // Set connection timeout
  setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
      console.log('⏱️  Connection timeout - closing connection');
      ws.terminate();
    }
  }, 10000); // 10 second timeout
}

function getCloseCodeReason(code) {
  const codes = {
    1000: 'Normal Closure',
    1001: 'Going Away',
    1002: 'Protocol Error', 
    1003: 'Unsupported Data',
    1004: 'Reserved',
    1005: 'No Status Received',
    1006: 'Abnormal Closure',
    1007: 'Invalid frame payload data',
    1008: 'Policy Violation',
    1009: 'Message too big',
    1010: 'Missing Extension',
    1011: 'Internal Error',
    1012: 'Service Restart',
    1013: 'Try Again Later',
    1015: 'TLS Handshake'
  };
  return codes[code];
}

// Additional network diagnostics
function performNetworkDiagnostics() {
  console.log('🔍 Network Diagnostics:');
  
  // DNS resolution test
  const { lookup } = require('dns');
  const hostname = INSTANCE_INFO.url.replace('wss://', '').replace('ws://', '');
  
  lookup(hostname, (err, address, family) => {
    if (err) {
      console.log(`   ❌ DNS resolution failed: ${err.message}`);
    } else {
      console.log(`   ✅ DNS resolved: ${hostname} -> ${address} (IPv${family})`);
    }
    
    // Start connection test after DNS check
    console.log();
    testConnection();
  });
}

console.log('🔧 Starting network diagnostics...');
performNetworkDiagnostics();