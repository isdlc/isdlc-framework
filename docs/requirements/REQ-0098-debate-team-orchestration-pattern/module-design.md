# Module Design: REQ-0098 — Debate Team Orchestration Pattern

## Debate Instance Schema

Each file exports a frozen object:

```javascript
export const debate{Phase}Instance = Object.freeze({
  instance_id: 'debate_{phase}',
  team_type: 'debate',
  phase: '{phase_key}',
  members: Object.freeze([
    { role: 'creator', agent: '{creator_agent}' },
    { role: 'critic', agent: '{critic_agent}' },
    { role: 'refiner', agent: '{refiner_agent}' }
  ]),
  output_artifact: '{primary_artifact}',
  input_dependency: '{previous_phase}',
  max_rounds: 3
});
```

## Instance Values

| Instance | Phase | Creator | Critic | Refiner | Output | Input Dep |
|----------|-------|---------|--------|---------|--------|-----------|
| debate_requirements | 01-requirements | requirements-analyst | requirements-critic | requirements-refiner | requirements-spec.md | null |
| debate_architecture | 03-architecture | solution-architect | architecture-critic | architecture-refiner | architecture-overview.md | 01-requirements |
| debate_design | 04-design | system-designer | design-critic | design-refiner | module-design.md | 03-architecture |
| debate_test_strategy | 05-test-strategy | test-design-engineer | test-strategy-critic | test-strategy-refiner | test-strategy.md | 04-design |

## Registry Modification

Add 4 imports to instance-registry.js Map initialization:
```javascript
import { debateRequirementsInstance } from './instances/debate-requirements.js';
import { debateArchitectureInstance } from './instances/debate-architecture.js';
import { debateDesignInstance } from './instances/debate-design.js';
import { debateTestStrategyInstance } from './instances/debate-test-strategy.js';
```

listTeamInstances() returns 7 total (3 existing + 4 new).
getTeamInstancesByPhase() now returns debate instances for phases 01/03/04/05.

## Estimated size
~20 lines per instance file, ~8 lines added to registry = ~90 lines total.
