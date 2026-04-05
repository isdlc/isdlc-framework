---
source: github
source_id: GH-216
title: Make ATDD the default mode for all workflows — remove --atdd flag
added_at: 2026-04-05
---

# GH-216: Make ATDD the default mode for all workflows — remove --atdd flag

## Problem

ATDD mode (acceptance test scaffolds from ACs before implementation) is currently opt-in via `--atdd` flag. But the goal of ATDD — every acceptance criterion has a corresponding test — is what TDD should always do. The flag creates an unnecessary decision point and means most workflows skip AC-to-test traceability.

## Expected Behavior

ATDD is the default for all feature and fix workflows. The `--atdd` flag is removed. Phase 05 always generates test scaffolds from ACs. Phase 06 always works through them in priority order (RED → GREEN). The atdd-checklist.json tracking is always active.

## Impact

- Remove `--atdd` flag from feature and fix workflow definitions in workflows.json
- Remove `_when_atdd_mode` conditional blocks in agent_modifiers — make them unconditional
- Remove `atdd_mode` option from workflow options
- Update CLAUDE.md, isdlc.md, and agent files that reference the flag
- Update iteration-requirements.json atdd_validation to always-on (remove `when: "atdd_mode"`)

## Complexity

Medium — touches workflows.json, iteration-requirements.json, isdlc.md, and multiple agent files. No new code, just removing conditionals and making the ATDD path the only path.
