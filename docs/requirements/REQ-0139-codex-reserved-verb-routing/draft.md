# Codex reserved verb routing for Add, Analyze, and Build

**Source**: GitHub Issue #205
**Author**: vihang-hub

## Problem

In Codex, the workflow verbs `Add`, `Analyze`, and `Build` are defined in `AGENTS.md`, but they are still easy to miss in normal conversation handling. A user can say things like `analyze it` and the agent may treat that as a generic request instead of invoking the reserved workflow verb.

This creates inconsistent behavior between sessions and makes the dogfooding harness less predictable for both the project owner and downstream Codex users.

## Current State

The instruction contract already exists in `AGENTS.md`:

- `Add` => `/isdlc add`
- `Analyze` => `/isdlc analyze`
- `Build` => `/isdlc build`

Expected behavior today is:

- detect these verbs from natural language intent
- get brief consent before triggering the workflow
- invoke the mapped workflow immediately
- avoid doing freeform implementation/analysis first

In practice, this is not enforced strongly enough. The routing depends too much on the model correctly remembering and prioritizing the rule in the moment.

## Why It Matters

Without stronger enforcement:

- the same user phrase can produce different behavior across sessions
- Codex users cannot rely on `Add`, `Analyze`, and `Build` as stable workflow verbs
- the invisible framework becomes harder to dogfood because the primary trigger vocabulary is soft rather than contractual

## Proposed Capability

Implement Codex-side reserved-verb routing for `Add`, `Analyze`, and `Build`.

The behavior should be:

1. detect these verbs from imperative natural language intent
2. treat them as reserved workflow triggers, not ordinary prose
3. require only the brief confirmation already defined by policy
4. prevent substantial non-workflow work before the workflow decision is made

## Suggested Implementation Areas

- Codex instruction projection / session priming so the rule is always reloaded
- Intent routing tests around invisible-framework behavior
- A lightweight pre-work guard that blocks freeform handling when a reserved verb was detected
- Codex-facing documentation that states these verbs are special workflow triggers

## Acceptance Criteria

- `Add`, `Analyze`, and `Build` are handled consistently as reserved workflow verbs in Codex
- Natural-language prompts like `analyze it` route to `/isdlc analyze` instead of generic handling
- Behavior is covered by automated tests
- The rule survives fresh sessions and post-clear re-priming
