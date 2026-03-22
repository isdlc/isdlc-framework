# Discover execution model design

## Source
- GitHub Issue: #167 (CODEX-034)
- Workstream: E (Discover & Analyze), Phase: 6

## Description
Design discover as explicit program family: discover_existing, discover_new, discover_incremental, discover_deep. Model modes, depth levels (standard/full), agent groups (core analyzers, post-analysis helpers, constitution/skills, new-project inception, deep discovery). Define participating team members, sequence vs parallel, inputs, artifacts, state updates, resume.

## Dependencies
- REQ-0070 (Codex capability audit) — completed
- REQ-0082 (WorkflowRegistry) — completed

## Context
24 discover sub-agents in src/claude/agents/discover/. The discover-orchestrator.md (2811 lines) manages the full program. Current implementation is Claude-specific — this item extracts the execution model into src/core/.
