#!/usr/bin/env node

/**
 * Test script using the correct ONE platform protocol
 * Based on the working lama.electron test-connection-basic.js
 */

const WebSocket = require('ws');
const crypto = require('crypto');

// Instance information from lama.electron
const INSTANCE_INFO = {
  type: "public",
  personEmail: "lama@refinio.one", 
  instanceName: "lama",
  url: "wss://comm10.dev.refinio.one"
};

console.log('🚀 Testing with correct ONE platform protocol...');
console.log(`Instance: ${INSTANCE_INFO.instanceName}`);
console.log(`URL: ${INSTANCE_INFO.url}`);
console.log();

// Generate proper hex strings (32 bytes = 64 hex chars for public keys)
const mockPersonKeys = {
  personId: crypto.randomBytes(32).toString('hex'),
  publicKey: crypto.randomBytes(32).toString('hex'),  // 64 hex chars
  privateKey: crypto.randomBytes(32).toString('hex'),
  signPublicKey: crypto.randomBytes(32).toString('hex'), // 64 hex chars
  signPrivateKey: crypto.randomBytes(32).toString('hex')
};

console.log('🔑 Generated proper hex keys:');
console.log(`   Person ID: ${mockPersonKeys.personId.substring(0, 16)}...`);
console.log(`   Public Key: ${mockPersonKeys.publicKey.substring(0, 16)}... (${mockPersonKeys.publicKey.length} chars)`);
console.log(`   Sign Public Key: ${mockPersonKeys.signPublicKey.substring(0, 16)}... (${mockPersonKeys.signPublicKey.length} chars)`);
console.log();

function testCorrectProtocol() {
  console.log('📡 Establishing WebSocket connection...');
  
  const ws = new WebSocket(INSTANCE_INFO.url);
  let messageCount = 0;
  let connectionStartTime = Date.now();
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    console.log('🕐 Connection time:', Date.now() - connectionStartTime, 'ms');
    
    // Use the correct protocol format from lama.electron
    const registerMessage = {
      command: 'register',  // ✅ Use 'command' not 'type'
      publicKey: mockPersonKeys.publicKey  // ✅ 64-char hex string
    };
    
    console.log('📤 Sending register message with correct format...');
    console.log('🔍 Message:', JSON.stringify(registerMessage, null, 2));
    ws.send(JSON.stringify(registerMessage));
  });
  
  ws.on('message', (data) => {
    messageCount++;
    console.log(`📥 Message ${messageCount}:`, data.toString().substring(0, 200));
    
    try {
      const message = JSON.parse(data.toString());
      console.log(`✅ Parsed command: ${message.command || 'no-command'}`);
      
      if (message.command === 'authentication_request') {
        console.log('🔍 Authentication challenge received!');
        console.log(`   Challenge length: ${message.challenge?.length || 'no-challenge'}`);
        if (message.challenge) {
          console.log(`   Challenge preview: ${message.challenge.slice(0, 32)}...`);
          console.log('🎉 SUCCESS: Server accepted register and sent challenge!');
          
          // Try to respond to the challenge
          handleAuthenticationChallenge(message.challenge);
        }
      } else if (message.command === 'authentication_result') {
        console.log('🔐 Authentication result received!');
        console.log(`   Success: ${message.success}`);
        if (message.success) {
          console.log('🎉 AUTHENTICATION SUCCESSFUL!');
          console.log('🧪 Now testing API operations...');
          testAPIOperations();
        } else {
          console.log(`❌ Authentication failed: ${message.error || 'No error details'}`);
        }
      } else if (message.command) {
        console.log(`📋 Other command received: ${message.command}`);
        console.log(`   Data:`, JSON.stringify(message, null, 2));
      }
    } catch (error) {
      console.log('🔍 Non-JSON or parsing error:', error.message);
    }
  });
  
  function handleAuthenticationChallenge(challenge) {
    console.log('🔐 Handling authentication challenge...');
    
    // In a real implementation, we would:
    // 1. Use the private key to sign the challenge
    // 2. Include the person ID and other required fields
    
    // For now, create a mock signature
    const mockSignature = crypto.randomBytes(64).toString('hex');
    
    const authResponse = {
      command: 'authenticate',
      challenge: challenge,
      signature: mockSignature,
      personId: mockPersonKeys.personId,
      publicKey: mockPersonKeys.publicKey
    };
    
    console.log('📤 Sending authentication response...');
    console.log('🔍 Response keys:', Object.keys(authResponse).join(', '));
    ws.send(JSON.stringify(authResponse));
  }
  
  function testAPIOperations() {
    console.log('🧪 Testing API operations...');
    
    // Test various commands that might be available
    const testCommands = [
      { command: 'list_objects', objectType: 'Person', limit: 5 },
      { command: 'get_profiles', personId: mockPersonKeys.personId },
      { command: 'list_recipes' },
      { command: 'ping', timestamp: Date.now() }
    ];
    
    testCommands.forEach((cmd, index) => {
      setTimeout(() => {
        console.log(`📤 Testing command: ${cmd.command}`);
        ws.send(JSON.stringify(cmd));
      }, (index + 1) * 2000);
    });
  }
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error.message);
    if (error.code) console.log(`   Code: ${error.code}`);
  });
  
  ws.on('close', (code, reason) => {
    const duration = Date.now() - connectionStartTime;
    console.log(`🔌 Connection closed after ${duration}ms`);
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason.toString() || 'No reason'}`);
    console.log(`   Messages received: ${messageCount}`);
    
    if (messageCount > 0) {
      console.log('✅ Server communication successful!');
      console.log('💡 Next step: Implement proper cryptographic signing');
    } else {
      console.log('❌ No server response received');
    }
  });
  
  // Keep connection open for testing
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Closing connection after test period...');
      ws.close();
    }
  }, 20000);
}

// Start the test
testCorrectProtocol();