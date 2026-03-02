---
name: antigravity-validate-state
description: Antigravity-native state validation for iSDLC integrity
skill_id: ORCH-014
owner: sdlc-orchestrator
collaborators: []
project: sdlc-framework
version: 2.0.0
when_to_use: After state-modifying actions in Antigravity to verify integrity.
dependencies: []
---

# Antigravity Validate State

## Purpose
Validates `.isdlc/state.json` integrity: suspicious write patterns, structural issues, cross-location consistency, version lock, and phase regression protection.

## Usage
```bash
node src/antigravity/validate-state.cjs
```

## Output
```json
{ "result": "VALID" }
{ "result": "VALID", "warnings": ["..."] }
{ "result": "INVALID", "errors": ["..."] }
```

## Exit Codes
- `0` = VALID (state is consistent)
- `1` = INVALID (state has issues that must be fixed)
- `2` = ERROR (validation could not run)

## Implementation
Script: `src/antigravity/validate-state.cjs` — wraps `src/claude/hooks/lib/state-logic.cjs`.
