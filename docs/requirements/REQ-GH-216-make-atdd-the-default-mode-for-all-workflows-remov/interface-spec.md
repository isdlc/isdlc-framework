# Interface Specification: REQ-GH-216

## Public Interfaces

### ConfigService.getAtdd()

**Location**: `src/core/config/config-service.js` (ESM)

**Signature**:
```
getAtdd(): AtddConfig
```

**Return type**:
```typescript
interface AtddConfig {
  enabled: boolean;           // default: true
  require_gwt: boolean;       // default: true
  track_red_green: boolean;   // default: true
  enforce_priority_order: boolean; // default: true
}
```

**Preconditions**: ConfigService instance is initialized (existing initialization flow unchanged).

**Postconditions**:
- Returns a complete `AtddConfig` object (all four fields always present).
- Never throws; errors resolve to all-true defaults.
- Idempotent within a process (config is cached on first read).

**Valid inputs**: None (parameterless).

**Error cases**: On any read or parse error, returns defaults. No exception propagation.

**Example**:
```javascript
const atdd = configService.getAtdd();
// { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }

if (!atdd.enabled) {
  // Skip all ATDD behaviors
  return;
}

if (atdd.require_gwt) {
  // Enforce GWT format
}
```

### CJS bridge: getAtdd

**Location**: `src/core/bridge/config.cjs` (CommonJS)

**Signature**:
```
module.exports.getAtdd(): AtddConfig
```

**Purpose**: Expose `ConfigService.getAtdd()` to `.cjs` hook consumers per Article XIII module-system consistency.

**Behavior**: Delegates to the ESM `ConfigService.getAtdd()` via the existing bridge mechanism. Return value identical.

**Example** (from a hook):
```javascript
const { getAtdd } = require('../../../core/bridge/config.cjs');
const atdd = getAtdd();
```

### common.cjs::readAtddConfig

**Location**: `src/claude/hooks/lib/common.cjs`

**Signature**:
```
module.exports.readAtddConfig(): AtddConfig
```

**Purpose**: Convenience passthrough for hooks already importing common.cjs.

**Behavior**: Calls `getAtdd` from the bridge and returns the result.

**Example** (from atdd-completeness-validator.cjs):
```javascript
const { readAtddConfig } = require('./lib/common.cjs');
const atdd = readAtddConfig();
```

## Configuration Schema

### `atdd` section in `.isdlc/config.json`

```json
{
  "atdd": {
    "enabled": true,
    "require_gwt": true,
    "track_red_green": true,
    "enforce_priority_order": true
  }
}
```

**Field constraints**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | boolean | true | Master kill switch. When false, all sub-behaviors are no-ops. |
| require_gwt | boolean | true | When true, Phase 05 hard-blocks on non-GWT ACs. When false, Phase 05 generates best-effort scaffolds for non-GWT ACs. |
| track_red_green | boolean | true | When true, test-watcher records RED→GREEN transitions in atdd-checklist.json. When false, no transition logging. |
| enforce_priority_order | boolean | true | When true, Phase 06 requires P0→P1→P2→P3 test completion order. When false, any order accepted. |

**Partial configurations are valid**. Missing fields are filled with defaults. Example valid partial:

```json
{
  "atdd": {
    "require_gwt": false
  }
}
```

Resolves to: `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }`.

**Invalid values**: Non-boolean values in any field trigger fail-open behavior — the invalid field uses its default, other fields retain their configured values.

## Delegation Prompt Injection Contract

### GATE REQUIREMENTS INJECTION — ATDD_CONFIG sub-block

**Inserted by**: phase-loop-controller (src/claude/commands/isdlc.md)

**Inserted into**: Phase 05 and Phase 06 agent delegation prompts

**Format**:
```
ATDD_CONFIG:
  enabled: <bool>
  require_gwt: <bool>
  track_red_green: <bool>
  enforce_priority_order: <bool>
```

**Consumer contract**: Phase 05 and Phase 06 agents MUST read `ATDD_CONFIG` from their delegation prompt and gate behavior on the provided values. Agents MUST NOT re-read `.isdlc/config.json` directly — the phase-loop controller is the authoritative injector.

**Fallback**: If the `ATDD_CONFIG` block is missing from the prompt (e.g., injection failed), agents operate with all-true defaults.

## Hook Invocation Contracts

Each ATDD-aware hook follows this pattern at handler entry:

```javascript
function handler(input) {
  let atdd;
  try {
    atdd = readAtddConfig();
  } catch (err) {
    // Fail-open: use defaults
    atdd = { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true };
  }

  if (!atdd.enabled) {
    // Short-circuit: ATDD disabled
    return passThrough(input);
  }

  // ... existing behavior, now gated on sub-knobs
}
```

**Contracts**:
- Hooks MUST call `readAtddConfig()` (or `getAtdd()` via bridge) exactly once per invocation.
- Hooks MUST check `atdd.enabled` first; short-circuit if false.
- Hooks MUST fall back to defaults on any config-read error.
- Hooks MUST NOT modify the `atdd` object.
