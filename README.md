# Refinio CLI

Command-line interface for managing ONE platform instances, profiles, and objects.

## Features

- 🔐 **Multi-instance support** - Connect to multiple ONE instances
- 👤 **Profile management** - Profiles as ONE objects for multi-context access
- 📦 **CRUD operations** - Create, read, update, delete ONE objects
- 📋 **Recipe management** - Register and manage data structure definitions
- 🔄 **Real-time streaming** - Subscribe to object changes and events
- 🚀 **Profile shortcuts** - Quick access with `refinio <profile> <command>`
- 🔑 **Person Keys** - Authenticate with cryptographic identity

## Installation

```bash
npm install -g @juergengeck/refinio-cli
```

Or clone and link locally:
```bash
git clone https://github.com/juergengeck/refinio.cli.git
cd refinio.cli
npm install
npm run build
npm link
```

## Quick Start

### 1. Connect to an Instance

```bash
# Connect with new Person keys
refinio connect quic://instance.example.com:49498 --email alice@example.com

# Or with existing keys
refinio connect quic://instance.example.com:49498 --keys ~/my-keys.json
```

### 2. Create a Profile

Profiles are ONE objects stored in the instance:

```bash
refinio profile create dev --name "Development" --description "Dev environment"
```

### 3. Use the Profile

```bash
# Set as default
refinio profile use dev

# Use profile shortcut
refinio dev recipe list

# Or explicit profile flag
refinio recipe list --profile dev
```

## Core Concepts

### Profiles as ONE Objects

Profiles are not just local configurations - they are proper ONE objects stored in the instance with:
- Unique alias for identification
- Person ID association
- Display name and description
- Permissions and metadata
- Settings and preferences

### Hierarchical Recipe System

ONE uses a self-describing recipe system where recipes themselves are ONE objects:
- Base `Recipe` defines what a recipe is
- Specialized recipes can define other recipes
- Every recipe has `$type$` (name) and `$recipe$` (what defines it)

## Command Reference

### Instance Management

```bash
# Connect to instance
refinio connect <url> [--email <email>] [--keys <path>]

# List connected instances
refinio instances

# Disconnect from instance
refinio disconnect <url>
```

### Profile Management

```bash
# Create profile (stored as ONE object)
refinio profile create <alias> [--name <name>] [--description <text>]

# List profiles in instance
refinio profile list [--my]

# Show profile details
refinio profile show [alias]

# Update profile
refinio profile update <alias> [--name <name>] [--tags <tags>]

# Delete profile
refinio profile delete <alias>

# Set default profile
refinio profile use <alias>
```

### Object Operations

```bash
# Create object
refinio create <type> --data <file.json>
refinio create <type> --inline '{"field": "value"}'

# Get object
refinio get <id> [--version <version>]

# Update object
refinio update <id> --data <file.json>

# Delete object
refinio delete <id>

# List objects
refinio list <type> [--filter <query>] [--limit <n>]
```

### Recipe Management (Data Structures)

```bash
# Register recipe (defines data structure)
refinio recipe register --file <recipe.json>
refinio recipe register --inline '{"$type$": "MyType", ...}'

# List recipes
refinio recipe list [--type <recipeType>]

# Get recipe definition
refinio recipe get <name>
```

### Streaming

```bash
# Stream events
refinio stream events [--type <event-type>]

# Watch object changes
refinio watch <id>
```

### Profile Shortcuts

Use profile aliases as shortcuts:

```bash
# Instead of: refinio recipe list --profile fritz
refinio fritz recipe list

# Works with any command
refinio fritz create Person --data person.json
refinio fritz get abc123
```

## Configuration

### Local Storage

The CLI stores minimal local data at `~/.refinio/`:
- `connections.json` - Instance connections and Person keys only
- Profile data is stored as ONE objects in the instance

### Person Keys Format

```json
{
  "personId": "sha256-hash",
  "publicKey": "hex-encoded",
  "privateKey": "hex-encoded",
  "signPublicKey": "hex-encoded",
  "signPrivateKey": "hex-encoded"
}
```

### Config File

Create `~/.refinio/cli.config.json`:
```json
{
  "client": {
    "serverUrl": "quic://localhost:49498",
    "timeout": 30000,
    "retries": 3
  },
  "output": {
    "format": "text",
    "color": true
  }
}
```

## Examples

### Multi-Instance Workflow

```bash
# Connect to development instance
refinio connect quic://dev.example.com:49498 --email dev@example.com
refinio profile create dev --name "Development"

# Connect to production instance
refinio connect quic://prod.example.com:49498 --email prod@example.com
refinio profile create prod --name "Production"

# Use different profiles
refinio dev list Person
refinio prod list Person
```

### Recipe Registration

```bash
# Create a recipe definition
cat > message-recipe.json << EOF
{
  "$type$": "CustomMessage",
  "$recipe$": "Recipe",
  "description": "Custom message type",
  "properties": {
    "content": { "type": "string", "required": true },
    "priority": { "type": "enum", "values": ["low", "medium", "high"] }
  }
}
EOF

# Register it (admin only)
refinio recipe register --file message-recipe.json --profile admin
```

### Working with Objects

```bash
# Create a Person object
echo '{"name": "Alice", "email": "alice@example.com"}' > person.json
refinio create Person --data person.json

# Get the created object
refinio get <returned-id>

# Update it
echo '{"name": "Alice Smith", "email": "alice@example.com"}' > updated.json
refinio update <id> --data updated.json

# List all Person objects
refinio list Person
```

## Global Options

- `-v, --verbose`: Enable verbose output
- `-j, --json`: Output in JSON format
- `-p, --profile <alias>`: Use specific profile
- `-c, --config <path>`: Path to config file

## Environment Variables

- `REFINIO_DEBUG`: Enable debug logging
- `REFINIO_TIMEOUT`: Request timeout in milliseconds
- `REFINIO_OUTPUT_FORMAT`: Default output format (json|text)

## Security

- Person keys are stored locally with encryption support
- Profiles are ONE objects with proper access control
- All communication uses QUIC with built-in encryption
- Instance owner has admin privileges
- No server-issued credentials - users control their keys

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Link for local testing
npm link
```

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/juergengeck/refinio.cli](https://github.com/juergengeck/refinio.cli)