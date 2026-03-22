# Module Design: REQ-0095 — Impact Analysis Team Port

## Module: instances/impact-analysis.js
**Responsibility**: Define the impact analysis fan-out team instance config.
**Exports**: `impactAnalysisInstance` (frozen object)
**Dependencies**: None (references team_type 'fan_out' by string)
**Estimated size**: ~30 lines

## Shared Module: instance-registry.js
See REQ-0097 module-design.md for shared registry design (getTeamInstance, listTeamInstances, getTeamInstancesByPhase).

## Shared Module: bridge/team-instances.cjs
Bridge-first-with-fallback pattern, same as team-specs.cjs.
