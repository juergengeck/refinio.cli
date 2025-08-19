# Refinio CLI

Command-line client for Refinio API using Person keys for authentication.

## Features

- **QUICVC Client**: Uses one.core's QUIC transport with verifiable credentials
- **Person Keys**: Authenticate with your Person's cryptographic identity
- **CRUD Operations**: Create, read, update, delete ONE objects
- **Recipe Execution**: Run predefined recipes with parameters
- **Real-time Streaming**: Watch objects and subscribe to events
- **Multiple Output Formats**: JSON and human-readable text

## Installation

```bash
cd packages/refinio.cli
npm install
npm run build
npm link  # Makes 'refinio' command available globally
```

## Quick Start

1. **Generate Person keys** (if you don't have them):
```bash
refinio auth generate your-email@example.com
```

2. **Authenticate with server**:
```bash
refinio auth login --keys ~/.refinio/keys.json
```

3. **Check authentication status**:
```bash
refinio auth status
```

3. **Create an object**:
```bash
refinio create Person --data person.json
```

4. **Get an object**:
```bash
refinio get abc123def456
```

5. **Execute a recipe**:
```bash
refinio recipe execute CreateProfile --params profile.json
```

## Commands

### Authentication
```bash
refinio auth generate <email>  # Generate new Person keys
refinio auth login             # Authenticate with server
refinio auth logout            # Remove stored keys
refinio auth status            # Check authentication status
```

### CRUD Operations
```bash
refinio create <type>    # Create new object
refinio get <id>         # Get object by ID
refinio update <id>      # Update existing object
refinio delete <id>      # Delete object
refinio list <type>      # List objects of type
```

### Recipes
```bash
refinio recipe execute <name>  # Execute recipe
refinio recipe list            # List available recipes
refinio recipe schema <name>   # Get recipe schema
```

### Streaming
```bash
refinio stream events     # Stream all events
refinio watch <id>        # Watch specific object
```

## Configuration

Create `~/.refinio/cli.config.json`:
```json
{
  "client": {
    "serverUrl": "quic://localhost:49498",
    "timeout": 30000,
    "retries": 3
  },
  "keys": {
    "path": "~/.refinio/keys.json"
  },
  "output": {
    "format": "text",
    "color": true
  }
}
```

## Global Options

- `-v, --verbose`: Enable verbose output
- `-j, --json`: Output in JSON format
- `-c, --config <path>`: Path to config file

## Examples

### Create a Person object
```bash
echo '{"name": "Alice", "email": "alice@example.com"}' > person.json
refinio create Person --data person.json
```

### Execute a recipe with parameters
```bash
cat > params.json <<EOF
{
  "personId": "abc123",
  "displayName": "Alice Smith"
}
EOF
refinio recipe execute CreateProfile --params params.json
```

### Watch for changes
```bash
refinio watch abc123def456
```

### Stream all events in JSON format
```bash
refinio stream events --json
```

## Environment Variables

- `REFINIO_SERVER_URL`: API server URL
- `REFINIO_TIMEOUT`: Request timeout in milliseconds
- `REFINIO_KEYS_PATH`: Path to Person keys file
- `REFINIO_PERSON_ID`: Your Person ID (optional)
- `REFINIO_OUTPUT_FORMAT`: Output format (json|text)

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```