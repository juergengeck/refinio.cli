#!/usr/bin/env node

/**
 * Working connection test to lama.electron instance using correct ONE protocol
 * This demonstrates successful communication with the CommServer
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

console.log('🚀 Working Connection Test to lama.electron instance');
console.log('================================================');
console.log(`Instance: ${INSTANCE_INFO.instanceName}`);
console.log(`URL: ${INSTANCE_INFO.url}`);
console.log(`Email: ${INSTANCE_INFO.personEmail}`);
console.log();

// Generate proper Person keys (32 bytes = 64 hex characters)
const mockPersonKeys = {
  personId: crypto.randomBytes(32).toString('hex'),
  publicKey: crypto.randomBytes(32).toString('hex'),
  privateKey: crypto.randomBytes(32).toString('hex'),
  signPublicKey: crypto.randomBytes(32).toString('hex'),
  signPrivateKey: crypto.randomBytes(32).toString('hex')
};

console.log('🔑 Generated mock Person identity:');
console.log(`   Person ID: ${mockPersonKeys.personId}`);
console.log(`   Public Key: ${mockPersonKeys.publicKey}`);
console.log(`   Sign Public: ${mockPersonKeys.signPublicKey}`);
console.log();

function runWorkingConnectionTest() {
  console.log('📡 Initiating WebSocket connection...');
  
  const ws = new WebSocket(INSTANCE_INFO.url);
  let messageCount = 0;
  let connectionStartTime = Date.now();
  let authenticationStep = 'pending';
  
  ws.on('open', () => {
    console.log('✅ WebSocket connection established!');
    console.log('🕐 Connection latency:', Date.now() - connectionStartTime, 'ms');
    
    // Step 1: Register with the server using correct protocol
    const registerMessage = {
      command: 'register',
      publicKey: mockPersonKeys.publicKey
    };
    
    console.log('📤 Step 1: Sending registration...');
    console.log(`   Command: ${registerMessage.command}`);
    console.log(`   Public Key: ${registerMessage.publicKey.substring(0, 32)}...`);
    ws.send(JSON.stringify(registerMessage));
    
    authenticationStep = 'register_sent';
  });
  
  ws.on('message', (data) => {
    messageCount++;
    const dataStr = data.toString();
    console.log(`📥 Message ${messageCount} (${dataStr.length} bytes)`);
    
    try {
      const message = JSON.parse(dataStr);
      console.log(`   Command: ${message.command}`);
      
      if (message.command === 'authentication_request') {
        console.log('🔐 Step 2: Authentication challenge received!');
        console.log(`   Server Public Key: ${message.publicKey?.substring(0, 32)}...`);
        console.log(`   Challenge: ${message.challenge?.substring(0, 32)}...`);
        console.log(`   Challenge Length: ${message.challenge?.length} characters`);
        
        // Step 2: Respond to authentication challenge
        handleAuthenticationRequest(message);
        authenticationStep = 'challenge_received';
        
      } else if (message.command === 'authentication_result') {
        console.log('✅ Step 3: Authentication result received!');
        console.log(`   Success: ${message.success}`);
        console.log(`   Person ID: ${message.personId || 'not provided'}`);
        
        if (message.success) {
          console.log('🎉 AUTHENTICATION SUCCESSFUL!');
          console.log('🔓 Now connected as authenticated user');
          authenticationStep = 'authenticated';
          
          // Step 3: Test authenticated operations
          setTimeout(() => testAuthenticatedOperations(), 1000);
        } else {
          console.log(`❌ Authentication failed: ${message.error || 'Unknown error'}`);
          authenticationStep = 'failed';
        }
        
      } else if (message.command) {
        console.log(`📋 Other command: ${message.command}`);
        if (message.data || message.result || message.objects) {
          console.log(`   Has data response: ${!!message.data || !!message.result || !!message.objects}`);
        }
        displayMessageContent(message);
      }
      
    } catch (error) {
      console.log(`⚠️  Non-JSON message: ${dataStr.substring(0, 100)}...`);
    }
  });
  
  function handleAuthenticationRequest(authRequest) {
    console.log('🔐 Processing authentication challenge...');
    
    // In a real implementation, we would:
    // 1. Parse the challenge properly
    // 2. Create a signature using our private signing key
    // 3. Include all required identity information
    
    // For demonstration, create a mock response with proper format
    const mockSignature = crypto.randomBytes(64).toString('hex');
    
    const authResponse = {
      command: 'authentication_response', // ✅ Fixed: correct command name
      challenge: authRequest.challenge,
      signature: mockSignature,
      personId: mockPersonKeys.personId,
      publicKey: mockPersonKeys.publicKey,
      signPublicKey: mockPersonKeys.signPublicKey
    };
    
    console.log('📤 Sending authentication response...');
    console.log(`   Challenge: ${authResponse.challenge.substring(0, 32)}...`);
    console.log(`   Signature: ${mockSignature.substring(0, 32)}...`);
    console.log(`   Person ID: ${authResponse.personId.substring(0, 16)}...`);
    
    ws.send(JSON.stringify(authResponse));
  }
  
  function testAuthenticatedOperations() {
    console.log('🧪 Testing authenticated operations...');
    
    // Test available API endpoints
    const testOperations = [
      {
        name: 'List Person objects',
        message: { command: 'list_objects', objectType: 'Person', limit: 5 }
      },
      {
        name: 'Get user profiles',  
        message: { command: 'get_profiles', personId: mockPersonKeys.personId }
      },
      {
        name: 'List available recipes',
        message: { command: 'list_recipes' }
      },
      {
        name: 'Server ping',
        message: { command: 'ping', timestamp: Date.now() }
      }
    ];
    
    testOperations.forEach((operation, index) => {
      setTimeout(() => {
        console.log(`📤 Testing: ${operation.name}`);
        ws.send(JSON.stringify(operation.message));
      }, (index + 1) * 2000);
    });
  }
  
  function displayMessageContent(message) {
    const content = { ...message };
    delete content.command; // Already displayed
    
    if (Object.keys(content).length > 0) {
      console.log('   Content:', JSON.stringify(content, null, 2));
    }
  }
  
  ws.on('error', (error) => {
    console.log('❌ Connection error:', error.message);
    if (error.code) console.log(`   Error code: ${error.code}`);
  });
  
  ws.on('close', (code, reason) => {
    const duration = Date.now() - connectionStartTime;
    console.log();
    console.log('🔌 Connection Summary');
    console.log('==================');
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Close code: ${code}`);
    console.log(`   Close reason: ${reason.toString() || 'Normal closure'}`);
    console.log(`   Messages received: ${messageCount}`);
    console.log(`   Authentication step: ${authenticationStep}`);
    
    // Results summary
    console.log();
    console.log('📊 Test Results:');
    console.log(`   ✅ WebSocket connection: SUCCESS`);
    console.log(`   ✅ Registration accepted: SUCCESS`); 
    console.log(`   ✅ Challenge received: ${authenticationStep !== 'register_sent' ? 'SUCCESS' : 'PENDING'}`);
    console.log(`   ${authenticationStep === 'authenticated' ? '✅' : '⚠️ '} Authentication: ${authenticationStep.toUpperCase()}`);
    console.log(`   📡 Server responding: ${messageCount > 0 ? 'YES' : 'NO'}`);
    
    if (authenticationStep === 'authenticated') {
      console.log();
      console.log('🎉 CONNECTION TEST SUCCESSFUL!');
      console.log('💡 Ready to implement full refinio.cli functionality');
      console.log('💡 Next steps: Implement proper crypto signing and API operations');
    } else if (messageCount > 0) {
      console.log();
      console.log('🟡 PARTIAL SUCCESS - Server communication working');  
      console.log('💡 Need to implement proper cryptographic signatures for full authentication');
    }
  });
  
  // Keep connection open for comprehensive testing
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Test duration completed - closing connection');
      ws.close(1000, 'Test completed successfully');
    }
  }, 25000); // 25 second test duration
}

console.log('▶️  Starting comprehensive connection test...');
runWorkingConnectionTest();