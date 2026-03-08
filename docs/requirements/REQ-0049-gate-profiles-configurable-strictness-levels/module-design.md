# Module Design: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 90%

---

## 1. Module Identification

### Module 1: ProfileLoader (`src/claude/hooks/lib/profile-loader.cjs`)

**Responsibility**: Discover, load, validate, and resolve profile files from all three tiers.

**Dependencies**:
- `fs`, `path` (Node.js built-ins)
- `os` (for `homedir()`)
- `common.cjs` (for `getProjectRoot()`, `debugLog()`)

**Data structures owned**:
- `ProfileDefinition` — parsed profile object
- `ProfileResolutionResult` — resolved profile with source metadata

### Module 2: ProfileSchema (`src/claude/hooks/config/profile-schema.json`)

**Responsibility**: Define the valid structure for profile files. Used by ProfileLoader for validation.

**Dependencies**: None (static JSON schema)

### Module 3: GateLogic Extension (modification to `src/claude/hooks/lib/gate-logic.cjs`)

**Responsibility**: Insert profile overlay into the merge chain within `check()`.

**Dependencies**:
- `profile-loader.cjs` (for `resolveProfile()`)
- Existing `mergeRequirements()` (reused)

### Module 4: Built-in Profiles (`src/claude/hooks/config/profiles/*.json`)

**Responsibility**: Ship default `rapid`, `standard`, and `strict` profile definitions.

**Dependencies**: Must conform to `profile-schema.json`

---

## 2. Data Structures

### ProfileDefinition

```typescript
interface ProfileDefinition {
  name: string;                          // unique identifier, e.g., "rapid"
  description: string;                   // one-line description for display
  triggers: string[];                    // natural language keywords for matching
  overrides: {                           // subset of phase_requirements fields
    [phaseKey: string]: {                // e.g., "06-implementation"
      test_iteration?: {
        enabled?: boolean;
        max_iterations?: number;
        circuit_breaker_threshold?: number;
        success_criteria?: {
          all_tests_passing?: boolean;
          min_coverage_percent?: number;
        };
      };
      constitutional_validation?: {
        enabled?: boolean;
        max_iterations?: number;
        articles?: string[];
      };
      interactive_elicitation?: {
        enabled?: boolean;
        min_menu_interactions?: number;
      };
      agent_delegation_validation?: {
        enabled?: boolean;
      };
      artifact_validation?: {
        enabled?: boolean;
      };
    };
  };
  global_overrides?: {                   // applied to ALL phases (convenience)
    test_iteration?: { ... };
    constitutional_validation?: { ... };
    interactive_elicitation?: { ... };
    agent_delegation_validation?: { ... };
    artifact_validation?: { ... };
  };
}
```

### ProfileResolutionResult

```typescript
interface ProfileResolutionResult {
  profile: ProfileDefinition;
  source: 'built-in' | 'project' | 'personal';
  source_path: string;                   // absolute path to the profile file
  warnings: string[];                    // threshold warnings, validation notes
  was_healed: boolean;                   // true if self-healing was applied
}
```

### ProfileRegistry

```typescript
interface ProfileRegistry {
  profiles: Map<string, ProfileResolutionResult>;  // keyed by profile name
  sources: {
    builtin: string[];                   // profile names from built-in
    project: string[];                   // profile names from .isdlc/profiles/
    personal: string[];                  // profile names from ~/.isdlc/profiles/
  };
}
```

---

## 3. Module Boundaries

```
                    +---------------------+
                    |   isdlc.md          |
                    | (intent detection)  |
                    +----------+----------+
                               |
                    profile name / trigger
                               |
                               v
                    +---------------------+
                    |  orchestrator       |
                    | (confirmation UX)   |
                    +----------+----------+
                               |
                    confirmed profile name
                               |
                               v
+------------------+  +---------------------+  +------------------+
| profile-schema   |  |  profile-loader.cjs |  | built-in         |
| .json            |<-| (discover, validate,|->| profiles/*.json  |
|                  |  |  resolve, heal)     |  |                  |
+------------------+  +----------+----------+  +------------------+
                               |
                    ProfileResolutionResult
                               |
                               v
                    +---------------------+
                    |  common.cjs         |
                    | loadIterReqs()      |
                    | + profile merge     |
                    +----------+----------+
                               |
                    merged phase_requirements
                               |
                               v
                    +---------------------+
                    |  gate-logic.cjs     |
                    | check()             |
                    | + workflow overrides |
                    +----------+----------+
                               |
                    fully resolved requirements
                               |
                               v
                    +---------------------+
                    |  12+ downstream     |
                    |  hooks (unchanged)  |
                    +---------------------+
```

---

## 4. Built-in Profile Definitions

### rapid.json

```json
{
  "name": "rapid",
  "description": "Minimal gates for simple changes or prototyping",
  "triggers": ["quick", "fast", "minimal", "rapid", "spike", "prototype"],
  "global_overrides": {
    "constitutional_validation": { "enabled": false },
    "interactive_elicitation": { "min_menu_interactions": 1 },
    "test_iteration": { "max_iterations": 3, "success_criteria": { "min_coverage_percent": 60 } }
  }
}
```

### standard.json

```json
{
  "name": "standard",
  "description": "Default — balanced rigor for most work",
  "triggers": ["standard", "default", "normal"],
  "global_overrides": {}
}
```

### strict.json

```json
{
  "name": "strict",
  "description": "Maximum rigor for critical or regulated code",
  "triggers": ["strict", "critical", "regulated", "compliance", "audit"],
  "global_overrides": {
    "test_iteration": {
      "success_criteria": { "min_coverage_percent": 95 }
    },
    "constitutional_validation": { "max_iterations": 8 }
  }
}
```

---

## 5. Validation Rules

### Schema Validation (on load)

| Field | Rule | Error Action |
|-------|------|-------------|
| `name` | Required, non-empty string | Reject file |
| `description` | Required, non-empty string | Reject file |
| `triggers` | Required, non-empty array of strings | Reject file |
| `overrides` | Optional object; keys must be valid phase keys | Flag unknown phase keys |
| `global_overrides` | Optional object; keys must be valid gate requirement types | Flag unknown keys |
| Override field values | Must match expected types from `phase_requirements` schema | Offer self-healing |

### Threshold Warnings (post-merge)

| Condition | Warning Message |
|-----------|----------------|
| `min_coverage_percent` < 80 | "Profile '{name}' sets coverage to {n}% (recommended: 80%)" |
| `constitutional_validation.enabled` = false | "Profile '{name}' disables constitutional validation" |
| `test_iteration.enabled` = false | "Profile '{name}' disables test iteration" |
| `max_iterations` < 5 | "Profile '{name}' reduces max iterations to {n} (recommended: 5+)" |

---

## 6. Self-Healing Protocol

When a profile file has validation errors:

1. Parse JSON — if malformed, report syntax error with line/column, offer to reformat
2. Validate against schema — collect all field-level errors
3. For each error, attempt correction:
   - **Typo in field name**: Levenshtein distance < 3 to a known field -> suggest correction
   - **Wrong type**: Show expected type and current value -> suggest cast
   - **Unknown phase key**: Levenshtein match against known phase keys -> suggest correction
4. Present all corrections to developer in one batch
5. If developer accepts: write corrected file, reload, continue
6. If developer declines: fall back to `standard` profile, log warning
