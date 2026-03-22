# Requirements Specification: REQ-0107 — Discover Cache/Projection Refresh

## 1. Business Context
After discover completes, a chain fires: skill generation → context delivery → cache rebuild. This trigger chain needs to be defined as provider-neutral data.

**Source**: GitHub #171 (CODEX-038)

## 2. Functional Requirements

### FR-001: Trigger Chain Definition
**Confidence**: High
- AC-001-01: Chain has ordered steps: discover_complete → skill_generation → context_delivery → cache_rebuild
- AC-001-02: Each step has: id, trigger_condition, action_type, depends_on[], provider_specific (bool)

### FR-002: Provider Classification
**Confidence**: High
- AC-002-01: discover_complete and skill_generation are provider-neutral
- AC-002-02: context_delivery and cache_rebuild are provider-specific

## 3. Out of Scope
Implementing the actual refresh logic. Modifying rebuild-cache.js.

## 4. MoSCoW
All Must Have.
