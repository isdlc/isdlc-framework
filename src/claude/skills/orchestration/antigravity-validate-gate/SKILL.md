---
name: antigravity-validate-gate
description: Antigravity-native gate validation enforcing hard governance
skill_id: ORCH-013
owner: sdlc-orchestrator
collaborators: []
project: sdlc-framework
version: 2.0.0
when_to_use: Before phase transitions in Antigravity to ensure hard-coded requirements are met.
dependencies: [ORCH-004]
---

# Antigravity Validate Gate

## Purpose
Deterministic gate validation for Antigravity. Runs 5 gate checks (test iteration, constitutional validation, interactive elicitation, agent delegation, artifact presence) and returns PASS or BLOCK.

## Usage
```bash
node src/antigravity/validate-gate.cjs [--phase <phase>]
```

If `--phase` is omitted, reads the current phase from `state.json`.

## Output
```json
{ "result": "PASS", "phase": "03-architecture", "checks_run": 5 }
{ "result": "BLOCK", "phase": "03-architecture", "blocking": ["test_iteration"], "details": [...] }
```

## Exit Codes
- `0` = PASS (safe to advance)
- `1` = BLOCK (requirements not met — do NOT advance)
- `2` = ERROR (validation could not run)

## Implementation
Script: `src/antigravity/validate-gate.cjs` — wraps `src/claude/hooks/lib/gate-logic.cjs`.
