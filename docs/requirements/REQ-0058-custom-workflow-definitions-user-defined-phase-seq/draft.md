# Custom workflow definitions — user-defined phase sequences (.isdlc/workflows/*.yaml)

## Context

Part of the [Hackability & Extensibility Roadmap](../docs/isdlc/hackability-roadmap.md) — **Tier 2, Layer: Compose** (Section 4.2.1).

## Problem

iSDLC ships 6 fixed workflow types (feature, fix, upgrade, test-run, test-generate, reverse-engineer). Every team has workflows that don't fit these templates: spikes, hotfixes, UI-focused features, data migrations, documentation-only changes. Today, developers either shoehorn their work into the closest workflow or skip the framework entirely.

## Design

Allow user-defined workflows in `.isdlc/workflows/*.yaml` that compose from the existing phase library:

```yaml
# .isdlc/workflows/spike.yaml
name: Spike
description: Quick exploration — no gates, no branch
phases: [00-quick-scan, 06-implementation]
gate_mode: permissive
requires_branch: false
```

```yaml
# .isdlc/workflows/hotfix.yaml
name: Hotfix
description: Emergency fix — minimal gates
phases: [06-implementation, 16-quality-loop]
gate_mode: strict
gate_profile: rapid
requires_branch: true
```

Rules:
- Phase library is fixed (framework-defined). Sequencing is user-controlled.
- Custom workflows validated on load: phases must exist, sequences must be valid.
- Framework discovers `.isdlc/workflows/*.yaml` at startup.
- Custom workflows can declare trigger keywords for intent detection.
- Custom `agent_modifiers` supported per phase.

## Invisible UX

Custom workflows are matched via declared trigger keywords:
- "spike on this" → matches spike workflow
- "hotfix for prod" → matches hotfix workflow
- Slash command fallback: `/isdlc spike`, `/isdlc hotfix`

## Files to Change

- `src/claude/hooks/config/workflows.json` — loader to merge user workflows
- `src/antigravity/workflow-init.cjs` — accept custom workflow types
- `CLAUDE.md` — intent detection table extended with custom keywords

## Dependencies

- Gate profiles (#97) — custom workflows need configurable gate strictness to be useful

## Effort

Medium-Large

**Labels**: hackability