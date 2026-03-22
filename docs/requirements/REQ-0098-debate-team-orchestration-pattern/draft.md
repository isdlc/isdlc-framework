# Debate team orchestration pattern

## Source
- GitHub Issue: #162
- Codex Reference: CODEX-029 — REQ-0098
- Workstream: C (Provider Adapters)
- Phase: 5

## Description
Define reusable debate-team orchestration pattern (creator -> critic -> refiner) as shared orchestration. Apply to requirements, architecture, design, test strategy debate teams. Decompose role semantics from provider packaging.

## Dependencies
- REQ-0094 (Team spec model) — completed

## Context
The `debate` team spec from REQ-0094 already exists with members ['creator', 'critic', 'refiner'], parallelism 'sequential', merge_policy 'last_wins', retry_policy 'per_round', max_iterations 3. This item adds the instance config that maps the generic debate spec to specific phase agents.

4 debate teams exist:
1. Requirements debate: requirements-analyst (creator) → requirements-critic → requirements-refiner
2. Architecture debate: solution-architect (creator) → architecture-critic → architecture-refiner
3. Design debate: system-designer (creator) → design-critic → design-refiner
4. Test strategy debate: test-design-engineer (creator) → test-strategy-critic → test-strategy-refiner

Each follows the same Creator→Critic→Refiner pattern with max 3 rounds.
