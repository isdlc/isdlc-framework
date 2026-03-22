# Requirements Specification: REQ-0126 — Skill Injection Planner

## 1. Business Context

Skill injection is currently inline in isdlc.md's Phase-Loop Controller (Steps A/B/C). The logic determines which skills to inject for a given phase and agent. This is provider-neutral computation (manifest lookup, precedence rules, phase matching) — only the prompt formatting is provider-specific. Extracting it into core lets both Claude and Codex consume the same injection plan.

**Source**: GitHub #190 (CODEX-057)
**Dependencies**: REQ-0094 (team spec model — completed), REQ-0084 (search/memory boundaries — completed)

## 2. Functional Requirements

### FR-001: Compute Injection Plan
**Confidence**: High
- AC-001-01: `computeInjectionPlan(workflow, phase, agent)` returns `{ builtIn, external, merged }` arrays
- AC-001-02: Each entry in merged has: `skillId`, `name`, `file`, `deliveryType`, `source`
- AC-001-03: Returns empty plan (not error) when manifests are missing (fail-open)

### FR-002: Built-In Skill Resolution
**Confidence**: High
- AC-002-01: Reads skills-manifest.json ownership section to find agent's skill list
- AC-002-02: Maps each skill ID to its SKILL.md path from skill_lookup

### FR-003: External Skill Resolution
**Confidence**: High
- AC-003-01: Reads external-skills-manifest.json, filters by phase/agent match + injection_mode=always
- AC-003-02: Respects delivery_type from bindings (context, instruction, reference)
- AC-003-03: Content >10000 chars forces delivery_type to reference

### FR-004: Precedence Rules
**Confidence**: High
- AC-004-01: Built-in skills appear before external in merged list
- AC-004-02: Phase-specific bindings take precedence over agent-wide bindings

## 3. Out of Scope
- Prompt formatting (provider-specific)
- Reading SKILL.md file contents (that's the provider adapter's job)
- Modifying skills-manifest.json or external-skills-manifest.json

## 4. MoSCoW
All FRs are Must Have.
