# Interface Specification: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 90%

---

## 1. ProfileLoader API

### `loadAllProfiles(projectRoot?: string): ProfileRegistry`

Discovers and loads all profiles from all three tiers.

**Preconditions**:
- `projectRoot` resolves to a directory (or defaults via `getProjectRoot()`)

**Postconditions**:
- Returns a `ProfileRegistry` with all valid profiles, deduplicated by name (personal > project > built-in)
- Invalid profiles are logged but excluded from registry

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectRoot` | `string` | No | Project root path; defaults to `getProjectRoot()` |

**Returns**: `ProfileRegistry`

**Example**:
```javascript
const registry = loadAllProfiles('/path/to/project');
// registry.profiles: Map { 'rapid' => {...}, 'standard' => {...}, 'strict' => {...}, 'spike' => {...} }
// registry.sources.builtin: ['rapid', 'standard', 'strict']
// registry.sources.project: ['spike']
// registry.sources.personal: []
```

---

### `resolveProfile(name: string, registry?: ProfileRegistry): ProfileResolutionResult | null`

Resolves a profile by name from the registry.

**Preconditions**:
- `name` is a non-empty string
- `registry` is loaded (or will be loaded internally)

**Postconditions**:
- Returns the highest-precedence profile matching `name`, or `null` if not found

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | Yes | Profile name to resolve |
| `registry` | `ProfileRegistry` | No | Pre-loaded registry; loaded internally if omitted |

**Returns**: `ProfileResolutionResult | null`

---

### `matchProfileByTrigger(input: string, registry?: ProfileRegistry): ProfileResolutionResult | null`

Matches user natural language input against profile triggers.

**Preconditions**:
- `input` is a non-empty string

**Postconditions**:
- Returns the matched profile if exactly one trigger matches
- Returns `null` if no match or ambiguous match

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `input` | `string` | Yes | User's natural language input |
| `registry` | `ProfileRegistry` | No | Pre-loaded registry |

**Returns**: `ProfileResolutionResult | null`

**Ambiguity handling**: If multiple profiles match, returns `null`. Caller is responsible for presenting disambiguation to the user.

---

### `validateProfile(filePath: string): ValidationResult`

Validates a single profile file against the schema.

**Preconditions**:
- `filePath` points to an existing file

**Postconditions**:
- Returns validation result with errors and suggested fixes

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | Absolute path to profile JSON file |

**Returns**:
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  suggestions: SuggestedFix[];
}

interface ValidationError {
  field: string;
  message: string;
  value: any;
  expected_type?: string;
}

interface SuggestedFix {
  field: string;
  original: string;
  suggested: string;
  confidence: 'high' | 'medium';  // high = Levenshtein < 2, medium = < 3
}
```

---

### `healProfile(filePath: string, fixes: SuggestedFix[]): boolean`

Applies suggested fixes to a profile file.

**Preconditions**:
- `filePath` points to an existing file
- `fixes` are valid suggested corrections from `validateProfile()`

**Postconditions**:
- File is rewritten with fixes applied
- Returns `true` if successful, `false` on write error

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | Absolute path to profile JSON file |
| `fixes` | `SuggestedFix[]` | Yes | Fixes to apply |

**Returns**: `boolean`

---

### `checkThresholdWarnings(profile: ProfileDefinition, baseRequirements: object): string[]`

Compares profile thresholds against recommended minimums.

**Preconditions**:
- `profile` is a valid `ProfileDefinition`
- `baseRequirements` is the loaded `phase_requirements` from `iteration-requirements.json`

**Postconditions**:
- Returns array of warning strings (empty if no warnings)

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `profile` | `ProfileDefinition` | Yes | The profile to check |
| `baseRequirements` | `object` | Yes | Base phase requirements (recommended minimums) |

**Returns**: `string[]`

---

## 2. Gate Logic Extension

### Modified: `check(ctx)` in `gate-logic.cjs`

**Current behavior**:
```javascript
let phaseReq = requirements.phase_requirements[currentPhase];
if (activeWorkflow && requirements.workflow_overrides?.[activeWorkflow.type]?.[currentPhase]) {
    phaseReq = mergeRequirements(phaseReq, requirements.workflow_overrides[activeWorkflow.type][currentPhase]);
}
```

**New behavior**:
```javascript
let phaseReq = requirements.phase_requirements[currentPhase];

// Profile merge layer (new)
const profileName = activeWorkflow?.profile || state?.default_profile || 'standard';
const profileOverrides = resolveProfileOverrides(profileName, currentPhase);
if (profileOverrides) {
    phaseReq = mergeRequirements(phaseReq, profileOverrides);
}

// Workflow overrides (existing, unchanged)
if (activeWorkflow && requirements.workflow_overrides?.[activeWorkflow.type]?.[currentPhase]) {
    phaseReq = mergeRequirements(phaseReq, requirements.workflow_overrides[activeWorkflow.type][currentPhase]);
}
```

**`resolveProfileOverrides(profileName, currentPhase)`**:
- Loads the named profile from the registry
- If profile has `overrides[currentPhase]`, returns those
- If profile has `global_overrides`, returns those
- If both exist, merges `global_overrides` with `overrides[currentPhase]` (phase-specific wins)
- Returns `null` if profile not found or has no applicable overrides

---

## 3. Orchestrator Integration

### Profile Selection Protocol (in `00-sdlc-orchestrator.md`)

```
1. Extract profile signal from user input (via isdlc.md intent detection)
2. If signal found:
   a. matchProfileByTrigger(signal, registry)
   b. If match: proceed to confirmation
   c. If no match: list available profiles, ask user
3. If no signal:
   a. Read project default from .isdlc/config.json -> default_profile
   b. If configured: use project default
   c. If not configured: use 'standard'
4. Confirmation:
   a. Display: "Using [name] profile — [description]. Override?"
   b. If user overrides: repeat from step 3 with user's choice
   c. If user confirms: record profile in active_workflow.profile
5. Check threshold warnings:
   a. checkThresholdWarnings(profile, baseRequirements)
   b. If warnings: display one-line warning per threshold
   c. If enforce_minimum enabled and warnings exist: block and ask user to choose compliant profile
```

---

## 4. Config File Interfaces

### `.isdlc/config.json` (project config — new fields)

```json
{
  "default_profile": "standard",
  "enforce_minimum": false
}
```

### `.isdlc/profiles/{name}.json` (profile file)

```json
{
  "name": "spike",
  "description": "Ultra-light for throwaway prototypes",
  "triggers": ["spike", "throwaway", "experiment"],
  "global_overrides": {
    "constitutional_validation": { "enabled": false },
    "test_iteration": { "enabled": false },
    "interactive_elicitation": { "enabled": false },
    "agent_delegation_validation": { "enabled": false },
    "artifact_validation": { "enabled": false }
  }
}
```

### `~/.isdlc/profiles/{name}.json` (personal profile)

Same schema as project profile.

---

## 5. CLI Interface

### `isdlc profiles list`

**Output**:
```
Available profiles:

  rapid       (built-in)   Minimal gates for simple changes or prototyping
  standard    (built-in)   Default — balanced rigor for most work        [project default]
  strict      (built-in)   Maximum rigor for critical or regulated code
  spike       (project)    Ultra-light for throwaway prototypes
  my-rapid    (personal)   Personal rapid variant with 70% coverage

Triggers: rapid (quick, fast, minimal), spike (spike, throwaway, experiment), ...
```

### Natural Language Equivalents

- "show me my profiles" -> `isdlc profiles list`
- "what profiles are available" -> `isdlc profiles list`
- "list gate profiles" -> `isdlc profiles list`
