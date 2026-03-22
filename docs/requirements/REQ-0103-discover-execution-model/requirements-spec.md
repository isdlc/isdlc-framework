# Requirements Specification: REQ-0103 — Discover Execution Model

## 1. Business Context
The discover subsystem has 24 sub-agents orchestrated by a 2811-line Claude-specific orchestrator. Codex needs a provider-neutral execution model that defines modes, agent groups, sequencing, and depth levels as consumable data.

**Source**: GitHub #167 (CODEX-034)

## 2. Functional Requirements

### FR-001: Mode Definitions
**Confidence**: High
- AC-001-01: 4 modes defined: discover_existing, discover_new, discover_incremental, discover_deep
- AC-001-02: Each mode specifies: id, agent_groups (ordered), depth_levels, applicable_when

### FR-002: Agent Group Definitions
**Confidence**: High
- AC-002-01: 7 groups defined: core_analyzers, post_analysis, constitution_skills, new_project_core, new_project_party, deep_standard, deep_full
- AC-002-02: Each group specifies: id, members (agent IDs), parallelism (parallel|sequential), required_for_modes
- AC-002-03: core_analyzers includes D1 (architecture-analyzer), D2 (test-evaluator), D5 (data-model-analyzer), D6 (feature-mapper)
- AC-002-04: new_project_party includes D9-D15 (domain-researcher through test-strategist)

### FR-003: Depth Levels
**Confidence**: High
- AC-003-01: 2 depth levels: standard, full
- AC-003-02: standard includes D16 (security-auditor), D17 (technical-debt-auditor)
- AC-003-03: full adds D18 (performance-analyst), D19 (ops-readiness-reviewer)

### FR-004: Registry
**Confidence**: High
- AC-004-01: getDiscoverMode(modeId) returns frozen mode config
- AC-004-02: getAgentGroup(groupId) returns frozen group config
- AC-004-03: listDiscoverModes() returns all 4 mode IDs

## 3. Out of Scope
Modifying discover-orchestrator.md. Runtime orchestration.

## 4. MoSCoW
All Must Have.
