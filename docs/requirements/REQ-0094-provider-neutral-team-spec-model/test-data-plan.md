# Test Data Plan: REQ-0094 — Provider-Neutral Team Spec Model

## Overview

This module is pure data with no external inputs. Test data consists of expected spec field values (from requirements) and invalid inputs for negative tests. No fixtures directory, no generated data, no external services.

## Boundary Values

| Field | Lower Bound | Upper Bound | Notes |
|-------|-------------|-------------|-------|
| `max_iterations` | 1 (fan_out) | 10 (dual_track) | Must be positive integer |
| `members` array | 2 elements (fan_out, dual_track) | 3 elements (impl_review_loop, debate) | Non-empty, all strings |
| `team_type` string | Shortest: 'debate' (6 chars) | Longest: 'implementation_review_loop' (25 chars) | Must match spec filename convention |

## Invalid Inputs

### getTeamSpec() Invalid Arguments

| Input | Expected Behavior | Test Case |
|-------|-------------------|-----------|
| `'nonexistent'` | Throws Error with available types listed | TR-05 |
| `null` | Throws Error | TR-06 |
| `undefined` | Throws Error | TR-06 |
| `''` (empty string) | Throws Error with available types listed | TR-07 |
| `42` (number) | Throws Error | TR-05 (covered by "unknown type") |
| `{}` (object) | Throws Error | TR-05 (covered by "unknown type") |

### Mutation Attempts on Frozen Objects

| Mutation | Expected Behavior | Test Case |
|----------|-------------------|-----------|
| `spec.team_type = 'hacked'` | TypeError in strict mode | TS-10 |
| `spec.new_prop = 'added'` | TypeError in strict mode | TS-11 |
| `delete spec.members` | TypeError in strict mode | TS-10 (implicit) |

## Maximum-Size Inputs

Not applicable for this module. The registry has exactly 4 entries, each with a fixed-size frozen object. There are no user-provided inputs, no variable-length data, and no file I/O that could encounter large payloads.

The only "size" consideration is the `members` array, which ranges from 2-3 elements per spec -- well within trivial bounds.

## Expected Spec Values (Golden Data)

These are the exact values from the requirements spec (FR-001 AC-001-01 through AC-001-04) used as expected values in all positive tests.

### implementation_review_loop
```json
{
  "team_type": "implementation_review_loop",
  "members": ["writer", "reviewer", "updater"],
  "parallelism": "sequential",
  "merge_policy": "last_wins",
  "retry_policy": "per_member",
  "max_iterations": 3,
  "state_owner": "orchestrator"
}
```

### fan_out
```json
{
  "team_type": "fan_out",
  "members": ["orchestrator", "sub_agent"],
  "parallelism": "full",
  "merge_policy": "consolidate",
  "retry_policy": "fail_open",
  "max_iterations": 1,
  "state_owner": "orchestrator"
}
```

### dual_track
```json
{
  "team_type": "dual_track",
  "members": ["track_a", "track_b"],
  "parallelism": "full",
  "merge_policy": "consolidate",
  "retry_policy": "per_track",
  "max_iterations": 10,
  "state_owner": "orchestrator"
}
```

### debate
```json
{
  "team_type": "debate",
  "members": ["creator", "critic", "refiner"],
  "parallelism": "sequential",
  "merge_policy": "last_wins",
  "retry_policy": "per_round",
  "max_iterations": 3,
  "state_owner": "orchestrator"
}
```

## Required Field Set (Schema Validation Data)

```javascript
const REQUIRED_FIELDS = ['team_type', 'members', 'parallelism', 'merge_policy', 'retry_policy', 'max_iterations', 'state_owner'];
const VALID_PARALLELISM = ['sequential', 'full', 'dual_track'];
```

## Test Data Generation Strategy

No generation needed. All test data is:
1. **Static golden values** hardcoded from the requirements spec (positive tests)
2. **Known-invalid literals** for negative/boundary tests (null, undefined, '', 'nonexistent')
3. **Direct imports** of the spec objects themselves (integration/freeze tests)
