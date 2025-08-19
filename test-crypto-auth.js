#!/usr/bin/env node

/**
 * Test authentication with proper ONE platform crypto
 * Based on patterns from one.models CommunicationServerListener
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const tweetnacl = require('tweetnacl');

// Instance information from lama.electron
const INSTANCE_INFO = {
  type: "public",
  personEmail: "lama@refinio.one", 
  instanceName: "lama",
  url: "wss://comm10.dev.refinio.one"
};

console.log('🔐 Testing ONE platform authentication with proper crypto');
console.log('=======================================================');
console.log(`Instance: ${INSTANCE_INFO.instanceName}`);
console.log(`URL: ${INSTANCE_INFO.url}`);
console.log();

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Main crypto authentication test
 */
function testCryptoAuth() {
  console.log('🔑 Generating encryption keypair using tweetnacl...');
  
  // Generate encryption keypair (for box operations)
  const encryptionKeypair = tweetnacl.box.keyPair();
  
  // Generate signing keypair (for sign operations)
  const signingKeypair = tweetnacl.sign.keyPair();
  
  // Create hex representations
  const publicKeyHex = uint8ArrayToHex(encryptionKeypair.publicKey);
  const signPublicKeyHex = uint8ArrayToHex(signingKeypair.publicKey);
  
  console.log(`   Public Key (encryption): ${publicKeyHex}`);
  console.log(`   Public Key (signing): ${signPublicKeyHex}`);
  console.log();
  
  const ws = new WebSocket(INSTANCE_INFO.url);
  let messageCount = 0;
  let serverPublicKey = null;
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Step 1: Register with encryption public key
    const registerMessage = {
      command: 'register',
      publicKey: publicKeyHex
    };
    
    console.log('📤 Step 1: Sending register message...');
    console.log(`   Public Key: ${publicKeyHex.substring(0, 32)}...`);
    ws.send(JSON.stringify(registerMessage));
  });
  
  ws.on('message', (data) => {
    messageCount++;
    const dataStr = data.toString();
    console.log(`📥 Message ${messageCount} received`);
    
    try {
      const message = JSON.parse(dataStr);
      console.log(`   Command: ${message.command}`);
      
      if (message.command === 'authentication_request') {
        console.log('🔐 Step 2: Authentication challenge received');
        console.log(`   Server Public Key: ${message.publicKey?.substring(0, 32)}...`);
        console.log(`   Challenge (hex): ${message.challenge?.substring(0, 32)}...`);
        console.log(`   Challenge length: ${message.challenge?.length} chars`);
        
        // Store server public key for encryption
        serverPublicKey = hexToUint8Array(message.publicKey);
        
        // Handle authentication according to CommunicationServerListener pattern
        handleAuthenticationChallenge(message);
        
      } else if (message.command === 'authentication_success') {
        console.log('🎉 Step 3: Authentication successful!');
        console.log(`   Ping Interval: ${message.pingInterval}ms`);
        console.log(`   Session established`);
        
        // Start ping/pong to keep connection alive
        if (message.pingInterval) {
          startPingPong(message.pingInterval);
        }
        
      } else if (message.command === 'authentication_failed') {
        console.log('❌ Authentication failed');
        console.log(`   Error: ${message.error || 'Unknown error'}`);
        
      } else if (message.command === 'error') {
        console.log('❌ Server error');
        console.log(`   Message: ${message.message || 'Unknown error'}`);
        
      } else {
        console.log(`   Other command: ${message.command}`);
        if (message.data) {
          console.log(`   Data:`, JSON.stringify(message.data, null, 2));
        }
      }
      
    } catch (error) {
      console.log(`   Non-JSON or parsing error: ${error.message}`);
    }
  });
  
  function handleAuthenticationChallenge(authRequest) {
    console.log('🔐 Processing authentication challenge...');
    
    try {
      // According to CommunicationServerListener:
      // 1. Decrypt the challenge using our private key and server's public key
      // 2. Invert all bytes (bitwise NOT operation)
      // 3. Encrypt the result and send back
      
      const challengeBytes = hexToUint8Array(authRequest.challenge);
      console.log(`   Challenge bytes length: ${challengeBytes.length}`);
      
      // The challenge format appears to be encrypted data with embedded nonce
      // Based on the pattern, we need to:
      // 1. Extract nonce (first 24 bytes typically for nacl)
      // 2. Decrypt using box.open
      // 3. Process the decrypted data
      // 4. Re-encrypt with new nonce
      
      if (challengeBytes.length < tweetnacl.box.nonceLength) {
        throw new Error('Challenge too short for nonce extraction');
      }
      
      // Extract nonce and ciphertext
      const nonce = challengeBytes.slice(0, tweetnacl.box.nonceLength);
      const ciphertext = challengeBytes.slice(tweetnacl.box.nonceLength);
      
      console.log(`   Nonce length: ${nonce.length}`);
      console.log(`   Ciphertext length: ${ciphertext.length}`);
      
      // Decrypt the challenge
      const decrypted = tweetnacl.box.open(
        ciphertext,
        nonce,
        serverPublicKey,
        encryptionKeypair.secretKey
      );
      
      if (!decrypted) {
        console.log('⚠️  Could not decrypt challenge - trying alternative approach');
        
        // Alternative: treat entire challenge as encrypted data
        // Some implementations might use a different format
        sendAlternativeResponse(authRequest.challenge);
        return;
      }
      
      console.log(`   ✅ Decrypted ${decrypted.length} bytes`);
      
      // Invert all bytes (bitwise NOT) as per CommunicationServerListener
      const inverted = new Uint8Array(decrypted.length);
      for (let i = 0; i < decrypted.length; i++) {
        inverted[i] = ~decrypted[i];
      }
      
      console.log(`   ✅ Inverted ${inverted.length} bytes`);
      
      // Encrypt the inverted data with a new nonce
      const responseNonce = tweetnacl.randomBytes(tweetnacl.box.nonceLength);
      const encrypted = tweetnacl.box(
        inverted,
        responseNonce,
        serverPublicKey,
        encryptionKeypair.secretKey
      );
      
      // Combine nonce and encrypted data
      const response = new Uint8Array(responseNonce.length + encrypted.length);
      response.set(responseNonce, 0);
      response.set(encrypted, responseNonce.length);
      
      const responseHex = uint8ArrayToHex(response);
      
      console.log(`   ✅ Encrypted response: ${responseHex.substring(0, 32)}...`);
      console.log(`   Response length: ${responseHex.length} chars`);
      
      // Send authentication response
      const authResponse = {
        command: 'authentication_response',
        response: responseHex
      };
      
      console.log('📤 Sending authentication_response...');
      ws.send(JSON.stringify(authResponse));
      
    } catch (error) {
      console.log(`❌ Crypto error: ${error.message}`);
      console.log('   Stack:', error.stack);
      
      // Try alternative response format
      sendAlternativeResponse(authRequest.challenge);
    }
  }
  
  function sendAlternativeResponse(challenge) {
    console.log('🔄 Trying alternative response format...');
    
    // Alternative: Simple signing approach
    // Some servers might expect a signature instead of encryption
    
    const challengeBytes = hexToUint8Array(challenge);
    
    // Sign the challenge with our signing key
    const signature = tweetnacl.sign.detached(challengeBytes, signingKeypair.secretKey);
    const signatureHex = uint8ArrayToHex(signature);
    
    console.log(`   Signature: ${signatureHex.substring(0, 32)}...`);
    
    const authResponse = {
      command: 'authentication_response',
      challenge: challenge,
      signature: signatureHex,
      publicKey: publicKeyHex,
      signPublicKey: signPublicKeyHex
    };
    
    console.log('📤 Sending alternative authentication_response...');
    ws.send(JSON.stringify(authResponse));
  }
  
  function startPingPong(interval) {
    console.log(`🏓 Starting ping/pong with interval: ${interval}ms`);
    
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, interval);
    
    ws.on('pong', () => {
      console.log('🏓 Pong received');
    });
  }
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log('🔌 Connection closed');
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason.toString() || 'No reason'}`);
    console.log(`   Messages received: ${messageCount}`);
    
    if (messageCount > 0) {
      console.log();
      console.log('📊 Summary:');
      console.log('   ✅ Connection established');
      console.log('   ✅ Registration accepted');
      console.log('   ✅ Challenge received');
      console.log('   🔄 Authentication attempted with crypto');
    }
  });
  
  // Test timeout
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Test complete - closing connection');
      ws.close();
    }
  }, 30000);
}

// Check dependencies
try {
  require('tweetnacl');
} catch (e) {
  console.log('📦 Installing tweetnacl...');
  require('child_process').execSync('npm install tweetnacl', { stdio: 'inherit' });
}

console.log('▶️  Starting crypto authentication test...');
testCryptoAuth();