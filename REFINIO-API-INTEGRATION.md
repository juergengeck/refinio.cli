# refinio.api Integration Analysis & Plan

## Understanding the Registry System

### Core Architecture

refinio.api uses a **dynamic handler/plan registry** that follows ONE first principles:

1. **Plan Objects** - Define operations (method + parameters)
2. **Plans** - Collections of executable methods (like `OneStoragePlan`, `OneLeutePlan`)
3. **Story Objects** - Results of Plan execution (Plan + Result)
4. **Registry** - Central registry that auto-discovers and exposes all Plans

### Dynamic Nature

The key insight: **Plans are self-describing and dynamically discoverable**

```typescript
// Registry automatically introspects Plans
const registry = createPlanRegistry();
registry.register('one.storage', new OneStoragePlan());
registry.register('one.leute', new OneLeutePlan());

// Registry extracts all methods via reflection
const metadata = registry.getAllMetadata();
// Returns: [{ name: 'one.storage', methods: ['storeVersionedObject', 'getObjectByIdHash', ...] }, ...]

// All methods automatically exposed via REST
// POST /api/one.storage/storeVersionedObject
// POST /api/one.leute/getContacts
// etc.
```

**No manual endpoint definitions needed** - the registry dynamically generates:
- REST endpoints: `POST /api/{plan}/{method}`
- OpenAPI schema: `GET /openapi.json`
- Method discovery: `registry.listPlans()`, `registry.getAllMetadata()`

### Transport Layer

refinio.api exposes Plans through **multiple transports** simultaneously:
- **REST** - HTTP API (port 49498)
- **QUIC** - P2P transport (WebSocket-based)
- **MCP/stdio** - For AI tools (Claude Code)
- **IPC** - Electron renderer↔main

All transports use the **same registry** - add a Plan once, available everywhere.

---

## Current CLI Integration Status

### ✅ Already Integrated (October 2025)

The CLI currently uses **only 3 REST endpoints**:

1. **POST /api/connections/create-invite** - Create invitation
   - Command: `refinio invite create`
   - Uses: `ConnectionHandler.createInvite()`

2. **GET /api/connections** - List active connections
   - Command: `refinio connections`
   - Uses: `ConnectionHandler.listConnections()`

3. **GET /api/contacts** - List contacts
   - Command: `refinio contacts`
   - Uses: `LeuteModel.others()`

### Current Architecture

```
CLI Command → HTTP fetch() → refinio.api REST endpoint → Handler method
```

**Limitations:**
- Hard-coded to 3 endpoints
- No dynamic discovery
- No access to 50+ other available methods
- No Plan/Story pattern usage
- No OpenAPI awareness

---

## Available But Unused refinio.api Plans

### 1. **OneStoragePlan** (7 methods)
Operations: `storeVersionedObject`, `getObjectByIdHash`, `getVersionedObjectByHash`, `storeUnversionedObject`, `getUnversionedObject`, `storeBlob`, `readBlob`

**CLI Gap:** CLI has basic `crud` commands but doesn't use Plan pattern

### 2. **OneLeutePlan** (9 methods)
Operations: `getOwnIdentity`, `getContacts`, `getContact`, `createContact`, `updateContact`, `getGroups`, `createGroup`, `addGroupMember`, `removeGroupMember`

**CLI Gap:** Only uses `getContacts` via hardcoded endpoint, missing 8 methods

### 3. **OneChannelsPlan** (6 methods)
Operations: `createChannel`, `postToChannel`, `getChannel`, `listChannels`, `getMatchingChannels`, `deleteChannel`

**CLI Gap:** No channel operations exposed in CLI

### 4. **OneCryptoPlan** (5 methods)
Operations: `sign`, `verify`, `encrypt`, `decrypt`, `hash`

**CLI Gap:** No crypto operations exposed in CLI

### 5. **OneInstancePlan** (3 methods)
Operations: `getInstanceId`, `getOwner`, `getInfo`

**CLI Gap:** No instance introspection in CLI

### 6. **ObjectHandler** (legacy, pre-Plan)
Operations: CRUD operations (create, read, update, query)

**CLI Gap:** CLI has `crud` commands but doesn't use Handler

### 7. **RecipeHandler** (legacy, pre-Plan)
Operations: Recipe registration and querying

**CLI Gap:** CLI has `recipe` commands but doesn't use Handler

### 8. **ProfileHandler** (legacy, pre-Plan)
Operations: Profile management

**CLI Gap:** CLI has `profile` commands but doesn't use Handler

### 9. **GroupHandler**
Operations: Group management

**CLI Gap:** No group commands in CLI

---

## Dynamic Discovery Gap

### What's Missing

The CLI **doesn't use dynamic discovery**:

```typescript
// CLI SHOULD be able to do this:
const client = new RestPlanClient({ baseUrl: 'http://localhost:49498' });

// Discover all available Plans
const plans = await client.listPlans();
// => ['one.storage', 'one.leute', 'one.channels', 'one.crypto', 'one.instance']

// Get Plan metadata (methods, params, descriptions)
const metadata = await client.getPlanMetadata('one.storage');
// => { methods: [{ name: 'storeVersionedObject', params: [...] }, ...] }

// Execute any Plan method
const story = await client.execute('one.storage', 'storeVersionedObject', { $type$: 'Test', data: 'foo' });
// => { success: true, plan: {...}, data: {...}, timestamp: ..., executionTime: ... }
```

### Benefits of Dynamic Discovery

1. **No Hardcoding** - CLI discovers available operations at runtime
2. **Auto-Sync** - New Plans/methods automatically available without CLI changes
3. **Self-Documentation** - CLI can show available operations with descriptions
4. **Future-Proof** - Works with any refinio.api server version

---

## Proposed Integration Plan

### Phase 1: Dynamic Client Foundation ✨

**Goal:** Create dynamic Plan client in CLI that replaces hardcoded fetch() calls

**Tasks:**
1. Add `OnePlanClient` from refinio.api to CLI (copy or import)
2. Create `src/client/ApiClient.ts` - RestPlanClient wrapper with config
3. Replace hardcoded endpoints in `connections`, `contacts`, `invite` commands
4. Add Plan discovery command: `refinio api plans` (list all available Plans)
5. Add Plan introspection: `refinio api inspect <plan>` (show methods + metadata)

**Benefits:**
- CLI becomes plan-aware
- Foundation for dynamic command generation
- No more hardcoded endpoints

**Files to modify:**
- `src/client/ApiClient.ts` (new)
- `src/commands/connections.ts`
- `src/commands/contacts.ts`
- `src/commands/invite.ts`
- `src/cli.ts` (add discovery commands)

---

### Phase 2: Universal Plan Executor 🚀

**Goal:** Single command to execute any Plan method dynamically

**Implementation:**
```bash
# Universal plan executor
refinio exec <plan> <method> [params...]

# Examples:
refinio exec one.storage storeVersionedObject '{"$type$":"Note","text":"Hello"}'
refinio exec one.leute getGroups
refinio exec one.channels listChannels
refinio exec one.crypto hash '{"data":"test"}'
```

**Tasks:**
1. Create `src/commands/exec.ts` - Universal Plan executor
2. Support JSON params via CLI args or stdin
3. Display Story results (Plan + Data + Timing)
4. Add `--raw` flag for data-only output (scripting)
5. Add `--watch` flag for polling operations

**Benefits:**
- Access to ALL 30+ Plan methods immediately
- No per-method command needed
- Scripting-friendly
- Power users can access any operation

**Files to create:**
- `src/commands/exec.ts` (new)

---

### Phase 3: Convenience Commands for Common Plans 🎯

**Goal:** Add user-friendly commands for frequently-used Plans

**New Commands:**

```bash
# Storage operations
refinio storage store <type> <data>
refinio storage get <idHash>
refinio storage list <type>

# Channel operations
refinio channels create <id>
refinio channels list
refinio channels post <channelId> <object>
refinio channels get <channelId>

# Group operations
refinio groups create <name> <members...>
refinio groups list
refinio groups add <groupId> <personId>
refinio groups remove <groupId> <personId>

# Crypto operations
refinio crypto sign <data> <keyId>
refinio crypto verify <data> <signature> <publicKey>
refinio crypto hash <data>

# Instance operations
refinio instance info
refinio instance id
refinio instance owner
```

**Implementation Pattern:**
All commands use `ApiClient.execute()` internally - just friendly wrappers.

**Tasks:**
1. Create `src/commands/storage.ts`
2. Create `src/commands/channels.ts`
3. Create `src/commands/groups.ts`
4. Create `src/commands/crypto.ts`
5. Create `src/commands/instance.ts`
6. Register all in `src/cli.ts`

**Benefits:**
- User-friendly for common operations
- Still uses Plan pattern internally
- Consistent with existing CLI style

---

### Phase 4: Auto-Generated Commands (Advanced) 🤖

**Goal:** Dynamically generate CLI commands from Plan metadata at runtime

**Implementation:**
```typescript
// On startup, CLI queries refinio.api for all Plans
const metadata = await client.getAllMetadata();

// Dynamically register commands based on metadata
for (const plan of metadata) {
  const cmd = program.command(plan.name);
  for (const method of plan.methods) {
    cmd.command(method.name)
      .description(method.description)
      .action(async (params) => {
        const story = await client.execute(plan.name, method.name, params);
        console.log(story.data);
      });
  }
}
```

**Usage:**
```bash
# All these are auto-generated:
refinio one.storage storeVersionedObject <data>
refinio one.leute getGroups
refinio one.channels listChannels
refinio one.crypto sign <data> <keyId>
```

**Benefits:**
- Zero manual command maintenance
- Automatically supports new Plans/methods
- Perfect CLI/API sync

**Challenges:**
- Complex parameter handling
- Help text formatting
- Naming conflicts

**Decision:** Start with Phase 2 (universal executor) and Phase 3 (convenience commands) first. Auto-generation is optional advanced feature.

---

## Recommended Implementation Order

### Sprint 1: Foundation (Weeks 1-2)
✅ Implement Phase 1: Dynamic Client Foundation
- Critical for replacing hardcoded endpoints
- Enables all future phases

### Sprint 2: Power User Tools (Week 3)
✅ Implement Phase 2: Universal Plan Executor
- Immediately unlocks all 30+ methods
- Validates dynamic discovery
- Useful for power users and testing

### Sprint 3: User-Friendly Commands (Weeks 4-6)
✅ Implement Phase 3: Convenience Commands
- Add storage, channels, groups, crypto, instance commands
- One command set per week
- Prioritize by user demand

### Sprint 4: Advanced (Optional)
⚡ Implement Phase 4: Auto-Generated Commands
- Only if Phases 1-3 prove the pattern
- Requires careful UX design

---

## Migration Strategy

### Backward Compatibility

All existing commands continue to work:
```bash
refinio connections  # Still works (Phase 1 updates internally)
refinio contacts     # Still works (Phase 1 updates internally)
refinio invite create # Still works (Phase 1 updates internally)
```

### Deprecation Path

Old hardcoded approach → Dynamic Plan approach:

**Before (hardcoded):**
```typescript
const response = await fetch('http://localhost:49498/api/contacts');
```

**After (dynamic):**
```typescript
const story = await apiClient.execute('one.leute', 'getContacts', {});
```

No breaking changes - internal implementation swapped.

---

## Technical Decisions

### 1. Client Implementation

**Option A:** Copy `OnePlanClient.ts` from refinio.api into CLI
- ✅ No dependency on refinio.api package
- ✅ Can customize for CLI needs
- ❌ Manual sync if refinio.api client changes

**Option B:** Import `OnePlanClient` from refinio.api
- ✅ Automatic updates
- ❌ Adds package dependency
- ❌ refinio.api not published to npm

**Recommendation:** **Option A** - Copy and customize. refinio.api client is small (~200 lines).

### 2. Configuration

Update CLI config to support multiple Plan endpoints:

```typescript
// refinio-cli.config.json
{
  "apiUrl": "http://localhost:49498",  // REST endpoint
  "quicUrl": "ws://localhost:49498",   // QUIC endpoint (future)
  "transport": "rest",                  // or "quic"
  "discovery": {
    "cacheMetadata": true,              // Cache Plan metadata
    "refreshInterval": 300000           // 5 minutes
  }
}
```

### 3. Error Handling

Story objects include execution errors:
```typescript
const story = await client.execute('one.storage', 'invalid', {});
// story.success === false
// story.error === { code: 'METHOD_NOT_FOUND', message: '...' }
```

CLI should display Story errors clearly:
```bash
$ refinio exec one.storage invalid
Error: Method 'invalid' not found on plan 'one.storage'
Available methods: storeVersionedObject, getObjectByIdHash, ...
```

---

## OpenAPI Integration (Future)

refinio.api exposes OpenAPI schema at `/openapi.json`:

```bash
# Future CLI commands
refinio api schema              # Display OpenAPI schema
refinio api schema --save       # Save to file
refinio api docs                # Open interactive docs (Swagger UI)
```

Can generate CLI commands from OpenAPI schema automatically.

---

## Success Metrics

### Phase 1 Success
- ✅ All 3 existing commands use dynamic client
- ✅ `refinio api plans` lists all available Plans
- ✅ `refinio api inspect <plan>` shows Plan metadata

### Phase 2 Success
- ✅ `refinio exec` can execute any Plan method
- ✅ All 30+ methods accessible via universal executor
- ✅ Story results displayed with timing

### Phase 3 Success
- ✅ 5 new command sets added (storage, channels, groups, crypto, instance)
- ✅ User-friendly wrappers around Plan execution
- ✅ Help text includes Plan metadata

### Overall Success
- ✅ CLI is Plan-aware, not endpoint-aware
- ✅ No hardcoded fetch() calls remain
- ✅ New refinio.api Plans automatically accessible
- ✅ CLI can work with any refinio.api server

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize phases** based on user needs
3. **Start Phase 1** implementation
4. **Test against live refinio.api** server
5. **Iterate based on feedback**

---

## Questions to Resolve

1. Should CLI bundle `OnePlanClient` or import from refinio.api?
2. What's the priority order for Phase 3 commands?
3. Do we need Phase 4 (auto-generation) or is Phase 2 (universal executor) sufficient?
4. Should CLI support QUIC transport or just REST?
5. How should CLI handle Plan versioning across refinio.api versions?

---

## Appendix: Complete Plan/Method Inventory

### OneStoragePlan (7 methods)
1. `storeVersionedObject(obj)` - Store versioned object
2. `getObjectByIdHash(idHash)` - Get latest version
3. `getVersionedObjectByHash(hash)` - Get specific version
4. `storeUnversionedObject(obj)` - Store unversioned object
5. `getUnversionedObject(hash)` - Get unversioned object
6. `storeBlob(data)` - Store binary data
7. `readBlob(hash)` - Read binary data

### OneLeutePlan (9 methods)
1. `getOwnIdentity()` - Get own Person identity
2. `getContacts()` - Get all contacts
3. `getContact(personIdHash)` - Get specific contact
4. `createContact(params)` - Create new contact
5. `updateContact(personIdHash, updates)` - Update contact
6. `getGroups()` - Get all groups
7. `createGroup(params)` - Create new group
8. `addGroupMember(groupIdHash, personIdHash)` - Add member
9. `removeGroupMember(groupIdHash, personIdHash)` - Remove member

### OneChannelsPlan (6 methods)
1. `createChannel(params)` - Create channel
2. `postToChannel(channelId, obj)` - Post to channel
3. `getChannel(channelId)` - Get channel info
4. `listChannels()` - List all channels
5. `getMatchingChannels(channelId)` - Get matching channels
6. `deleteChannel(channelId, owner)` - Delete channel

### OneCryptoPlan (5 methods)
1. `sign(data, keyId)` - Sign data
2. `verify(data, signature, publicKey)` - Verify signature
3. `encrypt(data, recipientKeys)` - Encrypt data
4. `decrypt(encrypted)` - Decrypt data
5. `hash(data)` - Calculate SHA-256 hash

### OneInstancePlan (3 methods)
1. `getInstanceId()` - Get instance ID hash
2. `getOwner()` - Get instance owner
3. `getInfo()` - Get instance information

**Total: 30 Plan methods available, 1 currently used by CLI**
