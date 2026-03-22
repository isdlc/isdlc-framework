# Implementation Notes: Discover Execution Model (Batch REQ-0103..0107)

## Overview

6 ESM modules + 1 CJS bridge implementing the discover subsystem's provider-neutral execution model as frozen pure-data objects. Follows the same pattern as `src/core/teams/specs/` and `src/core/content/content-model.js`.

## Files Created

### Production (src/core/discover/)
| File | Lines | Purpose |
|------|-------|---------|
| modes.js | 42 | 4 frozen mode configs (existing, new, incremental, deep) |
| agent-groups.js | 70 | 7 frozen agent group configs with members and parallelism |
| ux-flows.js | 131 | Menu definitions + walkthrough step sequences + registry helpers |
| discover-state-schema.js | 115 | State schema, creation, resume, completion, step marking |
| skill-distillation.js | 60 | Distillation config, reconciliation rules, source priority |
| projection-chain.js | 52 | 4-step trigger chain with provider classification |
| index.js | 82 | Re-exports + getDiscoverMode/getAgentGroup registries |

### Bridge (src/core/bridge/)
| File | Lines | Purpose |
|------|-------|---------|
| discover.cjs | 85 | CJS bridge-first-with-fallback for all discover functions |

### Tests (tests/core/discover/)
| File | Tests | Purpose |
|------|-------|---------|
| modes.test.js | 9 | Mode definitions, schema, immutability |
| agent-groups.test.js | 13 | Group definitions, schema, immutability |
| ux-flows.test.js | 16 | Menus, walkthroughs, helpers, immutability |
| discover-state-schema.test.js | 11 | State creation, resume, completion, step marking |
| skill-distillation.test.js | 7 | Config, rules, priority, immutability |
| projection-chain.test.js | 9 | Chain steps, provider classification, immutability |
| bridge-discover.test.js | 14 | CJS bridge exports and ESM parity |

**Total**: 86 new tests, all passing. Suite total: 721 (635 + 86).

## Key Decisions

1. **Frozen arrays**: Agent group `members` and mode `agent_groups` use `Object.freeze()` on the arrays themselves, not just the parent object, to prevent mutation of nested arrays.

2. **Mutable working state**: `createInitialDiscoverState()` returns a plain mutable object (not frozen) because discover state is working data that gets mutated during execution. Only config/schema objects are frozen.

3. **Walkthrough registry**: `discover_incremental` has no walkthrough object (single step: core_analyzers). The state functions handle this with an inline fallback rather than creating a trivial walkthrough.

4. **Bridge pattern**: Follows `team-specs.cjs` bridge-first-with-fallback pattern — lazy `import()` with module caching.

## Traceability

- REQ-0103: modes.js, agent-groups.js, index.js
- REQ-0104: ux-flows.js
- REQ-0105: discover-state-schema.js
- REQ-0106: skill-distillation.js
- REQ-0107: projection-chain.js
