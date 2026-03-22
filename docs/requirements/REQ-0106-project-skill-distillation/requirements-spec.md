# Requirements Specification: REQ-0106 — Project Skill Distillation

## 1. Business Context
Discover produces project-specific skills and reconciles them by source. This logic needs to be shared so both providers can distill skills consistently.

**Source**: GitHub #170 (CODEX-037)

## 2. Functional Requirements

### FR-001: Reconciliation Rules
**Confidence**: High
- AC-001-01: Rules define source priority: user > project > framework
- AC-001-02: Rules define stale detection: skills from previous discovery not present in new results
- AC-001-03: Rules define user-owned preservation: skills with source='user' never auto-removed

### FR-002: Distillation Config
**Confidence**: High
- AC-002-01: Config specifies: sources, priority_order, stale_action (remove|warn|keep), user_owned_fields[]
- AC-002-02: getDistillationConfig() returns frozen config

## 3. Out of Scope
Actual skill file operations. Modifying skills-researcher agent.

## 4. MoSCoW
All Must Have.
