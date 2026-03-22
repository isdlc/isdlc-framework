# Module Design: REQ-0097 — Quality Loop Team Port

## Module: instances/quality-loop.js
**Responsibility**: Define the quality loop dual-track team instance config with fan-out policy.
**Exports**: `qualityLoopInstance` (frozen object)
**Dependencies**: None (references team_type 'dual_track' by string)
**Estimated size**: ~40 lines

## Shared Module: instance-registry.js
**Responsibility**: Load all instance configs and provide lookup.
**Public interface**:

| Function | Signature | Returns |
|----------|-----------|---------|
| `getTeamInstance` | `(instanceId: string) → Object` | Frozen instance config, throws if unknown |
| `listTeamInstances` | `() → string[]` | All registered instance IDs |
| `getTeamInstancesByPhase` | `(phase: string) → Object[]` | Instances matching a phase key |

Internal: Map populated at module load from instances directory.
**Estimated size**: ~50 lines

## Shared Module: bridge/team-instances.cjs
Bridge-first-with-fallback pattern. Exports getTeamInstance, listTeamInstances, getTeamInstancesByPhase.
**Estimated size**: ~35 lines

## Error Taxonomy
| Code | Trigger | Recovery |
|------|---------|----------|
| ERR-INSTANCE-001 | `getTeamInstance('unknown')` | Caller catches, message lists available IDs |
