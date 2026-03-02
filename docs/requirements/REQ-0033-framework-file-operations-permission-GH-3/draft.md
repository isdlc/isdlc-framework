# Framework file operations should not require user permission

**Source**: GitHub Issue #3
**Type**: Enhancement (UX)

## Problem

When the iSDLC framework updates its own internal files (e.g., `.isdlc/state.json`, `.isdlc/hook-activity.log`), Claude Code prompts the user for permission. These are framework-managed files — the user should never be asked to approve writes to them.

This applies to **all framework-related files**, not just state.json:
- `.isdlc/state.json` — workflow state tracking
- `.isdlc/hook-activity.log` — hook audit log
- `.isdlc/*.md` — phase artifacts (requirements, architecture docs, etc.)
- `.isdlc/` directory contents generally

## Expected Behavior

All reads/writes to `.isdlc/` and other framework-managed paths should be auto-allowed without user prompts. The framework manages these files as part of its normal operation — requiring permission breaks the invisible-framework UX.

## Potential Fix

Update `src/claude/settings.json` (and sync to `.claude/settings.json`) to add `allow` rules for:
- Write/Edit operations targeting `.isdlc/**`
- Read operations on `.isdlc/**`
- Any Bash commands that only touch `.isdlc/` paths

This may involve adding path-based allow patterns to the `permissions` section of settings.json, or adjusting hook configurations to auto-approve framework file operations.
