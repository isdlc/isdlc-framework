# Module Design: REQ-0126 — Skill Injection Planner

## Module: skills/injection-planner.js
**Responsibility**: Compute provider-neutral skill injection plan for a given workflow/phase/agent.
**Public interface**:

```javascript
/**
 * Compute the skill injection plan for a phase delegation.
 * @param {string} workflow - Workflow type (feature, fix, upgrade, etc.)
 * @param {string} phase - Phase key (01-requirements, 06-implementation, etc.)
 * @param {string} agent - Agent name (requirements-analyst, software-developer, etc.)
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.manifestPath] - Override skills manifest path
 * @param {string} [options.externalManifestPath] - Override external manifest path
 * @param {string} [options.projectRoot] - Project root for path resolution
 * @returns {InjectionPlan} Plan with builtIn, external, and merged arrays
 */
export function computeInjectionPlan(workflow, phase, agent, options = {}) { ... }
```

Where `InjectionPlan`:
```javascript
{
  builtIn: [{ skillId, name, file, deliveryType: 'reference', source: 'built_in' }],
  external: [{ skillId, name, file, deliveryType, source: 'external' }],
  merged: [/* builtIn first, then external, ordered by precedence */]
}
```

Internal implementation:
1. Read skills-manifest.json → find agent in `ownership` → get skill IDs
2. Map each skill ID to its SKILL.md path using `skill_lookup`
3. Read external-skills-manifest.json → filter by phase/agent + injection_mode=always
4. Apply delivery_type rules (content >10000 chars → reference)
5. Merge: built-in first, then external
6. Fail-open: missing manifests → empty arrays, never throws

**Dependencies**: fs (for reading manifests)
**Estimated size**: ~80 lines

## Module: bridge/skill-planner.cjs
Bridge-first-with-fallback pattern.
**Exports**: `computeInjectionPlan(workflow, phase, agent, options)`
**Estimated size**: ~30 lines

## Error Taxonomy
| Code | Trigger | Recovery |
|------|---------|----------|
| ERR-PLANNER-001 | Skills manifest not found | Fail-open, return empty plan |
| ERR-PLANNER-002 | External manifest not found | Fail-open, return empty external array |
