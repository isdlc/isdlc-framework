# Data Flow: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 90%

---

## 1. Profile Discovery Flow

```
Source: Filesystem (three directories)
Sink: ProfileRegistry (in-memory)

~/.isdlc/profiles/*.json  ---+
                              |
.isdlc/profiles/*.json  -----+---> glob() ---> parse JSON ---> validate schema
                              |                                      |
config/profiles/*.json  -----+                              +-------+-------+
(built-in)                                                  |               |
                                                         valid          invalid
                                                            |               |
                                                     add to registry   log warning,
                                                     (deduplicate      collect
                                                      by name)        suggestions
                                                            |
                                                            v
                                                     ProfileRegistry
```

**State mutation points**:
- `ProfileRegistry` is constructed once at workflow start — immutable after construction
- Invalid profiles are excluded from registry but suggestions are preserved for self-healing

---

## 2. Profile Selection Flow

```
Source: User natural language input
Sink: active_workflow.profile (state)

User Input ("quick build")
  |
  v
isdlc.md intent detection
  |-- workflow type: "feature"
  |-- profile signal: "quick"
  |
  v
matchProfileByTrigger("quick", registry)
  |
  +-- match found: "rapid"
  |     |
  |     v
  |   Orchestrator confirmation
  |     |-- "Using rapid profile — Minimal gates. Override?"
  |     |-- User: confirms
  |     |
  |     v
  |   checkThresholdWarnings(rapid, base)
  |     |-- Warning: "Coverage set to 60% (recommended: 80%)"
  |     |
  |     v
  |   Record in state:
  |     active_workflow.profile = "rapid"
  |
  +-- no match found
  |     |
  |     v
  |   List available profiles
  |     |-- Ask user to choose
  |     |-- User selects "rapid"
  |     |-- Continue to confirmation above
  |
  +-- ambiguous match
        |
        v
      List matching profiles
        |-- Ask user to disambiguate
        |-- Continue to confirmation above
```

**State mutation points**:
- `active_workflow.profile` written once during workflow start
- Profile selection is immutable for the duration of the workflow

---

## 3. Requirement Merge Flow

```
Source: iteration-requirements.json + profile + workflow type
Sink: Resolved phase requirements (used by all hooks)

iteration-requirements.json
  |
  +-- phase_requirements["06-implementation"]
  |     {
  |       test_iteration: { max_iterations: 10, success_criteria: { min_coverage_percent: 80 } },
  |       constitutional_validation: { enabled: true, max_iterations: 5 }
  |     }
  |
  v
mergeRequirements(basePhaseReq, profileOverrides)
  |
  +-- profile "rapid" global_overrides:
  |     { test_iteration: { max_iterations: 3, success_criteria: { min_coverage_percent: 60 } },
  |       constitutional_validation: { enabled: false } }
  |
  +-- Result after profile merge:
  |     { test_iteration: { max_iterations: 3, success_criteria: { min_coverage_percent: 60 } },
  |       constitutional_validation: { enabled: false, max_iterations: 5 } }
  |
  v
mergeRequirements(profileMerged, workflowOverrides)
  |
  +-- workflow "feature" overrides for "06-implementation": (none)
  |
  +-- Final resolved:
        { test_iteration: { max_iterations: 3, success_criteria: { min_coverage_percent: 60 } },
          constitutional_validation: { enabled: false, max_iterations: 5 } }
        |
        v
      Used by gate-logic.cjs check() and all downstream hooks
```

**State mutation points**:
- Merge is pure — no side effects, no state mutation
- Result is computed fresh on each gate check call

---

## 4. Self-Healing Flow

```
Source: Invalid profile file
Sink: Corrected profile file (or fallback to standard)

Profile file loaded
  |
  v
validateProfile(filePath)
  |
  +-- valid: true -> add to registry (normal path)
  |
  +-- valid: false
        |
        v
      Collect errors + suggestions
        |-- { field: "min_coverge_percent", suggested: "min_coverage_percent", confidence: "high" }
        |-- { field: "constituional_validation", suggested: "constitutional_validation", confidence: "high" }
        |
        v
      Present to user:
        "Found issues in spike.json:
         - 'min_coverge_percent' -> did you mean 'min_coverage_percent'?
         - 'constituional_validation' -> did you mean 'constitutional_validation'?
         Want me to fix these?"
        |
        +-- User accepts
        |     |
        |     v
        |   healProfile(filePath, fixes)
        |     |-- Rewrite file with corrections
        |     |-- Reload and re-validate
        |     |-- Add to registry if now valid
        |
        +-- User declines
              |
              v
            Log warning: "Profile 'spike' skipped due to validation errors"
            Fall back to 'standard' profile
```

**State mutation points**:
- `healProfile()` writes to filesystem (the profile JSON file)
- This is the only write operation in the entire profile system

---

## 5. Persistence and Session Boundaries

| Data | Persistence | Scope |
|------|-------------|-------|
| Profile files (`.json`) | Filesystem | Permanent until user edits/deletes |
| `ProfileRegistry` | In-memory | Per workflow start (rebuilt each time) |
| `active_workflow.profile` | `state.json` | Per workflow lifetime |
| Threshold warnings | Console output | Transient (displayed once at workflow start) |
| Self-healing corrections | Filesystem write | Permanent (profile file updated) |

---

## 6. Monorepo Data Flow Variant

In monorepo mode, the project profile path changes:

```
Standard:  .isdlc/profiles/*.json
Monorepo:  .isdlc/projects/{project-id}/profiles/*.json
```

Personal and built-in paths remain the same. The `loadAllProfiles()` function accepts `projectRoot` and detects monorepo mode using the existing `getProjectRoot()` + monorepo detection pattern from `common.cjs`.
