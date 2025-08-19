#!/bin/bash

echo "Testing complete invitation flow for refinio.cli"
echo "================================================"
echo ""

# Step 1: Create and accept a test invitation
echo "Step 1: Accepting a test invitation..."
echo ""

# Create a test invitation URL (you would get this from lama.electron)
INVITATION_DATA='{"token":"test-token-'$(date +%s)'","publicKey":"test-key-abc123","url":"wss://comm10.dev.refinio.one"}'
ENCODED=$(node -e "console.log(encodeURIComponent('$INVITATION_DATA'))")
INVITATION_URL="https://edda.one/invites/invitePartner/?invited=true#$ENCODED"

echo "Test invitation URL:"
echo "$INVITATION_URL" | cut -c1-80
echo ""

# Accept the invitation
node dist/commands/invite.js accept "$INVITATION_URL"

echo ""
echo "Step 2: List stored invitations..."
echo ""

# List invitations
node dist/commands/invite.js list

echo ""
echo "Step 3: Attempt local connection using invitation..."
echo ""

# Try to connect locally
timeout 5 node dist/commands/connect-local.js --verbose || true

echo ""
echo "Test complete!"
echo ""
echo "Note: The local connection will fail unless lama.electron is running"
echo "and configured to accept these test credentials."