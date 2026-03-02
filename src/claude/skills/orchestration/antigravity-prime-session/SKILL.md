---
name: antigravity-prime-session
description: Prime the iSDLC session with context (Constitution, Workflows, Skills)
skill_id: ORCH-015
owner: sdlc-orchestrator
collaborators: []
project: sdlc-framework
version: 2.0.0
when_to_use: At the start of every iSDLC session in Antigravity.
dependencies: []
---

# Antigravity Prime Session

## Purpose
Rebuilds `session-cache.md` and outputs its content. Replaces the Claude Code `sessionstart` hook by making session context explicitly available.

## Usage
```bash
node src/antigravity/prime-session.cjs
```

## Output
```json
{ "result": "OK", "cache_path": "...", "sections": [...], "content": "..." }
{ "result": "ERROR", "message": "..." }
```

## Exit Codes
- `0` = Session primed successfully
- `1` = Error during priming

## Implementation
Script: `src/antigravity/prime-session.cjs` — wraps `rebuildSessionCache()` from `common.cjs`.
