# Test Cases: Phase 4 Batch (REQ-0095, REQ-0096, REQ-0097, REQ-0126)

**Phase**: 05 - Test Strategy & Design
**Artifact Folder**: REQ-0095-impact-analysis-team-port

---

## File 1: tests/core/teams/instances.test.js

Test ID prefix: **TI-** (Team Instance)

### REQ-0095: Impact Analysis Instance Config

#### FR-001: Instance Config (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-01 | `impactAnalysisInstance.instance_id` is `'impact_analysis'` | positive | AC-001-01 | P0 |
| TI-02 | `impactAnalysisInstance.team_type` is `'fan_out'` | positive | AC-001-01 | P0 |
| TI-03 | Members array has M1 (impact-analyzer, required), M2 (entry-point-finder, required), M3 (risk-assessor, required), M4 (cross-validation-verifier, not required) | positive | AC-001-02 | P0 |
| TI-04 | `output_artifact` is `'impact-analysis.md'`, `input_dependency` is `'01-requirements'` | positive | AC-001-03 | P0 |

#### FR-002: M4 Fail-Open Policy (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-05 | `policies.fail_open` has tier_1 (skip_if_unavailable), tier_2 (skip_if_task_fails), tier_3 (skip_if_timeout) | positive | AC-002-01 | P0 |

#### FR-003: Output/Input Mapping (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-06 | `output_artifact` is `'impact-analysis.md'` | positive | AC-003-01 | P1 |
| TI-07 | `input_dependency` is `'01-requirements'` | positive | AC-003-02 | P1 |

#### FR-004: Scope Variants (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-08 | `scope_variants` includes `'feature'` and `'upgrade'` | positive | AC-004-01 | P1 |

#### Instance Immutability (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-09 | Instance object is frozen (`Object.isFrozen`) | negative | AC-001-01 | P0 |
| TI-10 | Mutation of property throws TypeError | negative | AC-001-01 | P1 |

---

### REQ-0096: Tracing Instance Config

#### FR-001: Instance Config (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-11 | `tracingInstance.instance_id` is `'tracing'`, `team_type` is `'fan_out'` | positive | AC-001-01 | P0 |
| TI-12 | Members array has T1 (symptom-analyzer, required), T2 (execution-path-tracer, required), T3 (root-cause-identifier, required) | positive | AC-001-02 | P0 |
| TI-13 | `output_artifact` is `'trace-analysis.md'`, `input_dependency` is `'01-requirements'` | positive | AC-001-03 | P0 |

#### FR-002: Output/Input Mapping (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-14 | `output_artifact` is `'trace-analysis.md'` | positive | AC-002-01 | P1 |
| TI-15 | `input_dependency` is `'01-requirements'` | positive | AC-002-02 | P1 |

#### FR-003: No Fail-Open (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-16 | All 3 members have `required: true` | positive | AC-003-01 | P0 |
| TI-17 | `policies` is empty object | positive | AC-003-02 | P0 |

#### Instance Immutability (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-18 | Instance object is frozen | negative | AC-001-01 | P1 |

---

### REQ-0097: Quality Loop Instance Config

#### FR-001: Instance Config (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-19 | `qualityLoopInstance.instance_id` is `'quality_loop'`, `team_type` is `'dual_track'` | positive | AC-001-01 | P0 |
| TI-20 | Track A has checks QL-002 through QL-007 | positive | AC-001-02 | P0 |
| TI-21 | Track B has checks QL-008, QL-009, QL-010 | positive | AC-001-03 | P0 |
| TI-22 | `output_artifact` is `'quality-report.md'`, `input_dependency` is `'06-implementation'` | positive | AC-001-04 | P0 |

#### FR-002: Fan-Out Policy (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-23 | Fan-out trigger threshold is 250 | positive | AC-002-01 | P0 |
| TI-24 | Max chunks is 8 | positive | AC-002-02 | P1 |
| TI-25 | Distribution strategy is `'round_robin'` | positive | AC-002-03 | P1 |
| TI-26 | Fan-out applies to `'track_a'` only | positive | AC-002-04 | P0 |

#### FR-003: Scope Modes (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-27 | `scope_modes` includes `'FULL_SCOPE'` and `'FINAL_SWEEP'` | positive | AC-003-01 | P1 |

#### FR-004: Retry Policy (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-28 | `retry_both_on_failure` is `true` | positive | AC-004-01 | P0 |
| TI-29 | `max_iterations` is 10 | positive | AC-004-02 | P0 |

#### Instance Immutability (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| TI-30 | Instance object is frozen (deep freeze check) | negative | AC-001-01 | P1 |

---

## File 2: tests/core/teams/instance-registry.test.js

Test ID prefix: **IR-** (Instance Registry)

#### getTeamInstance (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IR-01 | `getTeamInstance('impact_analysis')` returns correct frozen config | positive | REQ-0095 FR-001 | P0 |
| IR-02 | `getTeamInstance('tracing')` returns correct frozen config | positive | REQ-0096 FR-001 | P0 |
| IR-03 | `getTeamInstance('quality_loop')` returns correct frozen config | positive | REQ-0097 FR-001 | P0 |

#### getTeamInstance (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IR-04 | Throws on unknown instance ID with available IDs in message | negative | ERR-INSTANCE-001 | P0 |
| IR-05 | Throws on null/undefined input | negative | ERR-INSTANCE-001 | P1 |
| IR-06 | Throws on empty string | negative | ERR-INSTANCE-001 | P1 |

#### listTeamInstances (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IR-07 | Returns array of all 3 instance IDs | positive | Registry design | P0 |

#### getTeamInstancesByPhase (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IR-08 | Phase `'01-requirements'` returns impact_analysis and tracing instances | positive | Registry design | P1 |
| IR-09 | Phase `'06-implementation'` returns quality_loop instance | positive | Registry design | P1 |
| IR-10 | Unknown phase returns empty array | negative | Registry design | P1 |

#### Registry-to-Instance Roundtrip (Integration)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IR-11 | Registry returns same frozen object references as direct imports | positive | INT-001 | P0 |

---

## File 3: tests/core/teams/bridge-team-instances.test.js

Test ID prefix: **IB-** (Instance Bridge)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IB-01 | CJS bridge exports getTeamInstance, listTeamInstances, getTeamInstancesByPhase functions | positive | Bridge design | P0 |
| IB-02 | `getTeamInstance('impact_analysis')` via bridge returns deep-equal data to ESM | positive | Bridge parity | P0 |
| IB-03 | `listTeamInstances()` via bridge returns same array as ESM | positive | Bridge parity | P1 |
| IB-04 | `getTeamInstance('nonexistent')` via bridge rejects with available IDs | negative | Bridge error | P1 |
| IB-05 | `getTeamInstancesByPhase('01-requirements')` via bridge returns same data as ESM | positive | Bridge parity | P1 |

---

## File 4: tests/core/skills/injection-planner.test.js

Test ID prefix: **IP-** (Injection Planner)

### REQ-0126: Skill Injection Planner

#### FR-001: Compute Injection Plan (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-01 | `computeInjectionPlan(workflow, phase, agent)` returns `{ builtIn, external, merged }` arrays | positive | AC-001-01 | P0 |
| IP-02 | Each merged entry has `skillId`, `name`, `file`, `deliveryType`, `source` | positive | AC-001-02 | P0 |

#### FR-001: Fail-Open (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-03 | Returns empty plan (not error) when skills manifest is missing | negative | AC-001-03 | P0 |
| IP-04 | Returns empty plan when external manifest is missing | negative | AC-001-03 | P0 |

#### FR-002: Built-In Skill Resolution (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-05 | Reads ownership section and finds agent's skill list | positive | AC-002-01 | P0 |
| IP-06 | Maps skill IDs to SKILL.md paths from skill_lookup | positive | AC-002-02 | P0 |

#### FR-003: External Skill Resolution (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-07 | Filters external skills by phase/agent match + injection_mode=always | positive | AC-003-01 | P0 |
| IP-08 | Respects delivery_type from bindings | positive | AC-003-02 | P1 |
| IP-09 | Content >10000 chars forces delivery_type to `'reference'` | positive | AC-003-03 | P0 |

#### FR-003: External Boundary (Negative)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-10 | Content at exactly 10000 chars keeps original delivery_type | negative | AC-003-03 | P1 |

#### FR-004: Precedence Rules (Positive)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| IP-11 | Built-in skills appear before external in merged list | positive | AC-004-01 | P0 |
| IP-12 | Phase-specific bindings take precedence over agent-wide bindings | positive | AC-004-02 | P1 |

---

## File 5: tests/core/skills/bridge-skill-planner.test.js

Test ID prefix: **PB-** (Planner Bridge)

| Test ID | Description | Type | AC | Priority |
|---------|-------------|------|-----|----------|
| PB-01 | CJS bridge exports `computeInjectionPlan` function | positive | Bridge design | P0 |
| PB-02 | Bridge `computeInjectionPlan` returns deep-equal data to ESM | positive | Bridge parity | P0 |
| PB-03 | Bridge returns empty plan when manifests missing (fail-open) | negative | AC-001-03 | P1 |
| PB-04 | Bridge rejects/resolves consistently with ESM version | positive | Bridge parity | P1 |

---

## Test Data Fixtures

### For injection planner tests (tests/core/skills/fixtures/)

**fixture-skills-manifest.json**: Minimal manifest with ownership for one test agent and skill_lookup entries.

**fixture-external-manifest.json**: Minimal external manifest with 2-3 bindings covering phase-match, agent-match, and injection_mode=always scenarios.

**fixture-large-skill-content.txt**: 10001-character string for testing delivery_type forcing.

---

## Total Test Count

| File | Tests |
|------|-------|
| instances.test.js | 30 |
| instance-registry.test.js | 11 |
| bridge-team-instances.test.js | 5 |
| injection-planner.test.js | 12 |
| bridge-skill-planner.test.js | 4 |
| **Total** | **62** |

Expected post-implementation total: 1585 + 62 = **1647 tests** (above 555 baseline per Article II).
