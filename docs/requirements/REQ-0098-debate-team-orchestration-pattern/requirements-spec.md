# Requirements Specification: REQ-0098 — Debate Team Orchestration Pattern

## 1. Business Context

The debate team pattern (Creator→Critic→Refiner) is used in 4 phases: requirements, architecture, design, and test strategy. The generic `debate` team spec exists (REQ-0094). This item adds instance configs mapping the pattern to specific phase agents.

**Source**: GitHub #162 (CODEX-029)
**Dependencies**: REQ-0094 (team spec model — completed)

## 2. Functional Requirements

### FR-001: Debate Instance Configs
**Confidence**: High
- AC-001-01: `debate_requirements` instance with creator=requirements-analyst, critic=requirements-critic, refiner=requirements-refiner, phase=01-requirements
- AC-001-02: `debate_architecture` instance with creator=solution-architect, critic=architecture-critic, refiner=architecture-refiner, phase=03-architecture
- AC-001-03: `debate_design` instance with creator=system-designer, critic=design-critic, refiner=design-refiner, phase=04-design
- AC-001-04: `debate_test_strategy` instance with creator=test-design-engineer, critic=test-strategy-critic, refiner=test-strategy-refiner, phase=05-test-strategy

### FR-002: Team Type Reference
**Confidence**: High
- AC-002-01: Each instance has `team_type: 'debate'` (resolved via getTeamSpec)

### FR-003: Instance Metadata
**Confidence**: High
- AC-003-01: Each instance has output_artifact matching the phase's primary artifact
- AC-003-02: Each instance has max_rounds: 3
- AC-003-03: Each instance has input_dependency pointing to the previous phase

### FR-004: Registry Integration
**Confidence**: High
- AC-004-01: All 4 debate instances registered in instance-registry.js
- AC-004-02: `listTeamInstances()` returns all 7 instances (3 existing + 4 new)
- AC-004-03: `getTeamInstancesByPhase('01-requirements')` returns debate_requirements

### FR-005: Pure Data
**Confidence**: High
- AC-005-01: All instances are Object.freeze'd

## 3. Out of Scope
- Runtime debate engine (stays in orchestrator agent markdown)
- New CJS bridge (team-instances.cjs already covers this)

## 4. MoSCoW
All FRs are Must Have.
