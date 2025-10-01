# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Refinio CLI is a command-line client for the ONE platform that provides multi-instance support, profile management, and CRUD operations for ONE objects. It uses QUIC transport with Person key authentication and Verifiable Credentials (VC).

## Build and Development Commands

```bash
# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev

# Run all tests
npm test

# Run specific integration test
npm run test:integration

# Link CLI locally for testing
npm link
```

## Architecture

### Authentication Flow

The CLI supports three authentication methods:

1. **Person Keys** (traditional): Cryptographic identity stored in `~/.refinio/connections.json`
2. **QUICVC with Invitations**: Uses invitation tokens to establish trust and exchange Verifiable Credentials
3. **Direct VC Exchange**: Peer-to-peer credential exchange without CommServer

Key files:
- `src/client/QuicClient.ts` - Base QUIC client with Person key auth
- `src/transport/QuicVCClient.ts` - QUICVC protocol implementation
- `src/transport/QuicVCClientWithInvite.ts` - Invitation-based VC exchange
- `src/vc/VCAuthenticationManager.ts` - VC creation and validation

### Profile System

Profiles are official ONE objects using `one.models` Profile recipe:
- Stored in the instance, not locally
- Accessed via `nickname` for CLI shortcuts (e.g., `refinio fritz recipe list`)
- Profile structure includes: `nickname`, `profileId`, `personId`, `owner`, communication endpoints
- Local storage only keeps connection info in `~/.refinio/connections.json`

Key files:
- `src/client/ProfileAwareClient.ts` - Profile-aware QUIC client
- `src/credentials/LocalCredentials.ts` - Local connection storage
- `src/commands/profile.ts` - Profile management commands

### Command Structure

Commands are modular and registered in `src/cli.ts`:
- Connection: `connect`, `disconnect`, `instances`, `connect-vc`, `connect-local`
- Profile: `profile create/list/show/update/delete/use`
- CRUD: `create`, `get`, `update`, `delete`, `list`
- Recipe: `recipe register/list/get`
- Streaming: `stream`, `watch`
- Instance management: `start`, `stop`, `list`
- Debug/Test: `debug`, `test-quicvc`, `sync`, `filer`

Profile shortcuts work by intercepting CLI args before parsing (see `checkProfileShortcut()` in `src/cli.ts`).

### Transport Layer

Three QUIC implementations:
1. **QuicClient** - Standard QUIC with Person keys
2. **QuicVCClient** - QUICVC protocol with credential exchange
3. **QuicVCClientWithInvite** - Invitation-based trust establishment

QUICVC packet types:
- `INITIAL` (0x00) - Contains VC_INIT frame
- `HANDSHAKE` (0x01) - Contains VC_RESPONSE frame
- `PROTECTED` (0x02) - Encrypted data packets
- `RETRY` (0x03) - Retry with different parameters

### Configuration

Config hierarchy (first found wins):
1. `--config <path>` CLI flag
2. `./refinio-cli.config.json` (project)
3. `~/.refinio/cli.config.json` (user)
4. Environment variables (fallback)

Environment variables:
- `REFINIO_SERVER_URL` - Default instance URL
- `REFINIO_TIMEOUT` - Request timeout
- `REFINIO_KEYS_PATH` - Person keys location
- `REFINIO_OUTPUT_FORMAT` - Output format (json|text)
- `DEBUG=refinio:cli:*` - Enable debug logging

### TypeScript Configuration

- Target: ES2022 with NodeNext modules
- Strict mode enabled
- Output: `dist/` directory
- Entry point: `dist/cli.js` (shebang included)
- Some files excluded from compilation (see tsconfig.json)

## Recipe System

ONE uses a self-describing recipe system where recipes are ONE objects:
- Base `Recipe` defines structure
- Every recipe has `$type$` (name) and `$recipe$` (what defines it)
- Recipes are data structures, not executable functions
- Register with `recipe register`, query with `recipe list/get`

## Testing

Tests use Jest with ts-jest preset:
- Unit tests: `test/client/`, `test/commands/`, `test/credentials/`
- Integration tests: `test/integration/`
- Test timeout: 60 seconds
- Coverage excludes: CLI entry point, type definitions

## Vendor Dependencies

Local vendored packages (in `vendor/`):
- `@refinio/one.core` - Core ONE platform functionality
- `@refinio/one.models` - Official ONE object models (includes Profile recipe)

These are file: dependencies in package.json and contain updated/fixed versions.
