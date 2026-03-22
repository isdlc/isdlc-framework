# Test Cases: REQ-0094 — Provider-Neutral Team Spec Model

## Test File: `tests/core/teams/specs.test.js`

### FR-001: Team Spec Definitions (Positive)

**TS-01**: implementation_review_loop spec has correct field values
- **Requirement**: FR-001, AC-001-01
- **Test type**: positive
- **Given**: The implementation_review_loop spec is imported
- **When**: Field values are inspected
- **Then**: team_type = 'implementation_review_loop', members = ['writer', 'reviewer', 'updater'], parallelism = 'sequential', merge_policy = 'last_wins', retry_policy = 'per_member', max_iterations = 3, state_owner = 'orchestrator'

**TS-02**: fan_out spec has correct field values
- **Requirement**: FR-001, AC-001-02
- **Test type**: positive
- **Given**: The fan_out spec is imported
- **When**: Field values are inspected
- **Then**: team_type = 'fan_out', members = ['orchestrator', 'sub_agent'], parallelism = 'full', merge_policy = 'consolidate', retry_policy = 'fail_open', max_iterations = 1, state_owner = 'orchestrator'

**TS-03**: dual_track spec has correct field values
- **Requirement**: FR-001, AC-001-03
- **Test type**: positive
- **Given**: The dual_track spec is imported
- **When**: Field values are inspected
- **Then**: team_type = 'dual_track', members = ['track_a', 'track_b'], parallelism = 'full', merge_policy = 'consolidate', retry_policy = 'per_track', max_iterations = 10, state_owner = 'orchestrator'

**TS-04**: debate spec has correct field values
- **Requirement**: FR-001, AC-001-04
- **Test type**: positive
- **Given**: The debate spec is imported
- **When**: Field values are inspected
- **Then**: team_type = 'debate', members = ['creator', 'critic', 'refiner'], parallelism = 'sequential', merge_policy = 'last_wins', retry_policy = 'per_round', max_iterations = 3, state_owner = 'orchestrator'

### FR-003: Spec Field Schema (Positive + Negative)

**TS-05**: Every spec has exactly the 7 required fields
- **Requirement**: FR-003, AC-003-01
- **Test type**: positive
- **Given**: All 4 spec objects are loaded
- **When**: Object.keys() is compared to the required field set
- **Then**: Each has exactly: team_type, members, parallelism, merge_policy, retry_policy, max_iterations, state_owner (no extra, no missing)

**TS-06**: members field is an array of strings for all specs
- **Requirement**: FR-003, AC-003-02
- **Test type**: positive
- **Given**: All 4 spec objects
- **When**: members field is inspected
- **Then**: Array.isArray(spec.members) === true, every element is typeof 'string'

**TS-07**: parallelism field is one of the allowed values
- **Requirement**: FR-003, AC-003-03
- **Test type**: positive
- **Given**: All 4 spec objects
- **When**: parallelism field is inspected
- **Then**: Value is one of 'sequential', 'full', 'dual_track'

**TS-08**: parallelism values map correctly to team types
- **Requirement**: FR-003, AC-003-03
- **Test type**: positive
- **Given**: Known team type to parallelism mapping
- **When**: Each spec's parallelism is checked
- **Then**: implementation_review_loop='sequential', fan_out='full', dual_track='full', debate='sequential'

### FR-005: Pure Data Objects (Positive + Negative)

**TS-09**: All specs are frozen (Object.isFrozen)
- **Requirement**: FR-003 AC-003-04, FR-005 AC-005-01
- **Test type**: positive
- **Given**: All 4 spec objects
- **When**: Object.isFrozen() is called on each
- **Then**: Returns true for all 4

**TS-10**: Frozen specs reject property mutation
- **Requirement**: FR-005, AC-005-01
- **Test type**: negative
- **Given**: A frozen spec object
- **When**: Attempting to assign a new value to team_type
- **Then**: In strict mode, throws TypeError; in non-strict, assignment is silently ignored

**TS-11**: Frozen specs reject property addition
- **Requirement**: FR-005, AC-005-01
- **Test type**: negative
- **Given**: A frozen spec object
- **When**: Attempting to add a new property
- **Then**: In strict mode, throws TypeError; in non-strict, assignment is silently ignored

**TS-12**: Spec files export only object literals (no classes, no functions)
- **Requirement**: FR-005, AC-005-01
- **Test type**: positive
- **Given**: Each spec module's exports
- **When**: typeof of each export is checked
- **Then**: typeof === 'object', not 'function'

### FR-004: Backward Compatibility

**TS-13**: implementation-loop.js is not modified (import still works)
- **Requirement**: FR-004, AC-004-01
- **Test type**: positive
- **Given**: Existing ImplementationLoop class
- **When**: Imported from src/core/teams/implementation-loop.js
- **Then**: Constructor works with the existing sample-team-spec fixture

**TS-14**: Contract JSON schemas still exist and are valid
- **Requirement**: FR-004, AC-004-02
- **Test type**: positive
- **Given**: src/core/teams/contracts/ directory
- **When**: writer-context.json, review-context.json, update-context.json are read
- **Then**: All 3 files parse as valid JSON with expected structure

**TS-15**: Existing teams.cjs bridge is unchanged
- **Requirement**: FR-004, AC-004-03
- **Test type**: positive
- **Given**: src/core/bridge/teams.cjs
- **When**: Required and inspected
- **Then**: Exports createImplementationLoop function

**TS-16**: max_iterations field is a positive integer for all specs
- **Requirement**: FR-003, AC-003-01
- **Test type**: positive
- **Given**: All 4 spec objects
- **When**: max_iterations is inspected
- **Then**: typeof === 'number', Number.isInteger() === true, value > 0

---

## Test File: `tests/core/teams/registry.test.js`

### FR-002: Team Spec Registry (Positive)

**TR-01**: getTeamSpec returns correct spec for 'implementation_review_loop'
- **Requirement**: FR-002, AC-002-01
- **Test type**: positive
- **Given**: The registry is imported
- **When**: getTeamSpec('implementation_review_loop') is called
- **Then**: Returns the frozen implementation_review_loop spec object

**TR-02**: getTeamSpec returns correct spec for 'fan_out'
- **Requirement**: FR-002, AC-002-01
- **Test type**: positive
- **Given**: The registry is imported
- **When**: getTeamSpec('fan_out') is called
- **Then**: Returns the frozen fan_out spec object

**TR-03**: getTeamSpec returns correct spec for 'dual_track'
- **Requirement**: FR-002, AC-002-01
- **Test type**: positive
- **Given**: The registry is imported
- **When**: getTeamSpec('dual_track') is called
- **Then**: Returns the frozen dual_track spec object

**TR-04**: getTeamSpec returns correct spec for 'debate'
- **Requirement**: FR-002, AC-002-01
- **Test type**: positive
- **Given**: The registry is imported
- **When**: getTeamSpec('debate') is called
- **Then**: Returns the frozen debate spec object

### FR-002: Team Spec Registry (Negative)

**TR-05**: getTeamSpec throws on unknown type with helpful message
- **Requirement**: FR-002, AC-002-02
- **Test type**: negative
- **Given**: The registry is imported
- **When**: getTeamSpec('nonexistent') is called
- **Then**: Throws Error whose message contains the available type names

**TR-06**: getTeamSpec throws on null/undefined input
- **Requirement**: FR-002, AC-002-02
- **Test type**: negative
- **Given**: The registry is imported
- **When**: getTeamSpec(null) or getTeamSpec(undefined) is called
- **Then**: Throws Error

**TR-07**: getTeamSpec throws on empty string
- **Requirement**: FR-002, AC-002-02
- **Test type**: negative
- **Given**: The registry is imported
- **When**: getTeamSpec('') is called
- **Then**: Throws Error whose message contains available type names

### FR-002: listTeamTypes (Positive)

**TR-08**: listTeamTypes returns all 4 team type strings
- **Requirement**: FR-002, AC-002-03
- **Test type**: positive
- **Given**: The registry is imported
- **When**: listTeamTypes() is called
- **Then**: Returns array containing exactly 'implementation_review_loop', 'fan_out', 'dual_track', 'debate'

### FR-005: No Dynamic Registration

**TR-09**: Registry has no dynamic registration (catalog is fixed)
- **Requirement**: FR-005, AC-005-02
- **Test type**: positive
- **Given**: The registry module
- **When**: Its exports are inspected
- **Then**: Only getTeamSpec and listTeamTypes are exported (no register, add, or set functions)

### Integration: Registry-to-Specs Roundtrip

**TR-10**: All specs returned by registry match direct imports
- **Requirement**: FR-002 AC-002-01, INT-001
- **Test type**: positive (integration)
- **Given**: Specs imported directly AND via registry
- **When**: Registry results are compared to direct imports
- **Then**: Strict equality (===) holds for all 4 specs (same frozen objects)

---

## Test File: `tests/core/teams/bridge-team-specs.test.js`

### FR-006: CJS Bridge (Positive)

**TB-01**: CJS bridge exports getTeamSpec and listTeamTypes
- **Requirement**: FR-006, AC-006-01
- **Test type**: positive
- **Given**: team-specs.cjs is loaded
- **When**: Exports are inspected
- **Then**: typeof getTeamSpec === 'function', typeof listTeamTypes === 'function'

**TB-02**: CJS bridge getTeamSpec returns same data as ESM registry
- **Requirement**: FR-006, AC-006-03
- **Test type**: positive (integration)
- **Given**: Both CJS bridge and ESM registry are loaded
- **When**: getTeamSpec('fan_out') is called on both
- **Then**: Deep-equal comparison passes (same field values)

**TB-03**: CJS bridge listTeamTypes returns same array as ESM registry
- **Requirement**: FR-006, AC-006-03
- **Test type**: positive (integration)
- **Given**: Both CJS bridge and ESM registry are loaded
- **When**: listTeamTypes() is called on both
- **Then**: Deep-equal comparison passes

**TB-04**: CJS bridge getTeamSpec throws on unknown type
- **Requirement**: FR-006, AC-006-01
- **Test type**: negative
- **Given**: CJS bridge is loaded
- **When**: getTeamSpec('nonexistent') is called
- **Then**: Throws or returns null (per bridge-first-with-fallback fail-open behavior)
