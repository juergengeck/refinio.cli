#!/usr/bin/env node

/**
 * Test script to interact with lama.electron instance using ONE protocol
 * Based on the patterns observed in the lama.electron codebase
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

console.log('🚀 Testing ONE protocol connection to lama.electron instance...');
console.log(`Instance: ${INSTANCE_INFO.instanceName}`);
console.log(`URL: ${INSTANCE_INFO.url}`);
console.log();

// Mock Person keys for testing (would normally be generated or imported)
const mockPersonKeys = {
  personId: crypto.randomBytes(32).toString('hex'),
  publicKey: crypto.randomBytes(32).toString('hex'),
  privateKey: crypto.randomBytes(32).toString('hex'),
  signPublicKey: crypto.randomBytes(32).toString('hex'),
  signPrivateKey: crypto.randomBytes(32).toString('hex')
};

console.log('🔑 Generated mock Person keys:');
console.log(`   Person ID: ${mockPersonKeys.personId.substring(0, 16)}...`);
console.log();

// Test ONE protocol WebSocket connection
function testONEProtocol() {
  console.log('📡 Establishing WebSocket connection...');
  
  const ws = new WebSocket(INSTANCE_INFO.url);
  let messageId = 1;
  
  function sendMessage(type, payload) {
    const message = {
      id: `msg-${messageId++}`,
      type: type,
      payload: payload,
      timestamp: Date.now()
    };
    
    console.log(`📤 Sending ${type} message (ID: ${message.id})`);
    if (payload) {
      console.log(`   Payload keys: ${Object.keys(payload).join(', ')}`);
    }
    
    ws.send(JSON.stringify(message));
    return message.id;
  }
  
  ws.on('open', function open() {
    console.log('✅ WebSocket connection established!');
    
    // Step 1: Try authentication request
    console.log('🔐 Initiating authentication...');
    
    const authPayload = {
      personId: mockPersonKeys.personId,
      publicKey: mockPersonKeys.publicKey,
      signPublicKey: mockPersonKeys.signPublicKey,
      clientInfo: {
        name: 'refinio-cli-test',
        version: '0.1.0',
        capabilities: ['crud', 'profile', 'recipe']
      }
    };
    
    sendMessage('AUTH_REQUEST', authPayload);
  });
  
  ws.on('message', function message(data) {
    console.log('📥 Received message:');
    
    try {
      const message = JSON.parse(data.toString());
      console.log(`   Type: ${message.type || 'unknown'}`);
      console.log(`   ID: ${message.id || 'no-id'}`);
      
      // Handle different message types
      switch (message.type) {
        case 'AUTH_RESPONSE':
          handleAuthResponse(message.payload);
          break;
        case 'CHALLENGE':
          handleChallenge(message.payload);
          break;
        case 'ERROR':
          console.log(`   ❌ Server error: ${message.payload?.error || 'Unknown error'}`);
          break;
        case 'PING':
          console.log('   🏓 Received ping, sending pong...');
          sendMessage('PONG', { timestamp: Date.now() });
          break;
        default:
          console.log(`   📄 Payload:`, JSON.stringify(message.payload || {}, null, 4));
      }
    } catch (e) {
      console.log('   📄 Raw data:', data.toString().substring(0, 200));
      if (data.length > 200) {
        console.log(`   ... (${data.length - 200} more characters)`);
      }
    }
  });
  
  function handleAuthResponse(payload) {
    console.log('🔐 Authentication response received:');
    
    if (payload.challenge) {
      console.log('   📋 Server sent challenge for signing');
      console.log(`   Challenge: ${payload.challenge.substring(0, 32)}...`);
      
      // In a real implementation, we would sign the challenge with private key
      const mockSignature = crypto.randomBytes(64).toString('hex');
      
      console.log('   ✍️  Signing challenge (mock)...');
      
      const responsePayload = {
        personId: mockPersonKeys.personId,
        signature: mockSignature,
        challenge: payload.challenge
      };
      
      sendMessage('AUTH_RESPONSE', responsePayload);
      
    } else if (payload.authenticated === true) {
      console.log('   ✅ Authentication successful!');
      console.log(`   Person ID: ${payload.personId || 'not provided'}`);
      console.log(`   Permissions: ${(payload.permissions || []).join(', ')}`);
      
      // Now try some basic operations
      testBasicOperations();
      
    } else if (payload.authenticated === false) {
      console.log('   ❌ Authentication failed');
      console.log(`   Error: ${payload.error || 'No error details'}`);
    }
  }
  
  function handleChallenge(payload) {
    console.log('🎯 Received challenge:');
    console.log(`   Challenge data: ${payload.challenge?.substring(0, 32)}...`);
    
    // Mock challenge response
    const mockSignature = crypto.randomBytes(64).toString('hex');
    sendMessage('CHALLENGE_RESPONSE', {
      signature: mockSignature,
      personId: mockPersonKeys.personId
    });
  }
  
  function testBasicOperations() {
    console.log('🧪 Testing basic operations...');
    
    // Test 1: List objects
    setTimeout(() => {
      console.log('📋 Testing object listing...');
      sendMessage('LIST_REQUEST', {
        type: 'Person',
        limit: 10
      });
    }, 1000);
    
    // Test 2: List recipes  
    setTimeout(() => {
      console.log('📜 Testing recipe listing...');
      sendMessage('RECIPE_LIST', {
        recipeType: undefined // List all recipes
      });
    }, 2000);
    
    // Test 3: List profiles
    setTimeout(() => {
      console.log('👤 Testing profile listing...');
      sendMessage('PROFILE_LIST', {
        personId: mockPersonKeys.personId
      });
    }, 3000);
  }
  
  ws.on('error', function error(err) {
    console.log('❌ WebSocket error:');
    console.log(`   ${err.message}`);
    if (err.code) console.log(`   Code: ${err.code}`);
  });
  
  ws.on('close', function close(code, reason) {
    console.log('🔌 Connection closed');
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason.toString() || 'No reason'}`);
    
    const closeReason = getCloseCodeReason(code);
    if (closeReason) {
      console.log(`   Meaning: ${closeReason}`);
    }
  });
  
  // Keep connection open for testing
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Test complete - closing connection');
      ws.close();
    }
  }, 15000); // 15 second test duration
}

function getCloseCodeReason(code) {
  const codes = {
    1000: 'Normal Closure',
    1001: 'Going Away', 
    1002: 'Protocol Error',
    1003: 'Unsupported Data',
    1006: 'Abnormal Closure',
    1008: 'Policy Violation',
    1011: 'Internal Error'
  };
  return codes[code];
}

// Start the test
testONEProtocol();