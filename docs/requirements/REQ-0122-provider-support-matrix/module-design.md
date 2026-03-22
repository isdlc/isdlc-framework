# Design Specification: Provider Support Matrix

**Item**: REQ-0122 | **GitHub**: #186 | **CODEX**: CODEX-053

---

## 1. Module: `src/core/providers/support-matrix.js` (~120 lines)

### Exports

#### `getProviderSupportMatrix()`

Returns a frozen array of per-feature provider comparison entries.

```js
export function getProviderSupportMatrix() {
  return Object.freeze([
    Object.freeze({ feature: 'workflow-feature', claude: 'supported', codex: 'supported', notes: 'Full feature workflow via adapter runner' }),
    Object.freeze({ feature: 'workflow-fix', claude: 'supported', codex: 'supported', notes: 'Fix workflow via adapter runner' }),
    Object.freeze({ feature: 'workflow-upgrade', claude: 'supported', codex: 'supported', notes: 'Upgrade workflow via adapter runner' }),
    Object.freeze({ feature: 'workflow-test-generate', claude: 'supported', codex: 'supported', notes: 'Test generation via adapter runner' }),
    Object.freeze({ feature: 'workflow-test-run', claude: 'supported', codex: 'supported', notes: 'Test execution via adapter runner' }),
    Object.freeze({ feature: 'discover', claude: 'supported', codex: 'supported', notes: 'Project discovery via core models' }),
    Object.freeze({ feature: 'analyze', claude: 'supported', codex: 'partial', notes: 'Roundtable analysis; Codex lacks interactive elicitation' }),
    Object.freeze({ feature: 'teams-roundtable', claude: 'supported', codex: 'unsupported', notes: 'Multi-persona roundtable requires real-time interaction' }),
    Object.freeze({ feature: 'memory', claude: 'supported', codex: 'unsupported', notes: 'Session memory requires persistent agent context' }),
    Object.freeze({ feature: 'skills', claude: 'supported', codex: 'partial', notes: 'Skill invocation supported; skill observability logging limited' }),
    Object.freeze({ feature: 'governance', claude: 'supported', codex: 'partial', notes: 'Enforceable checkpoints only; real-time hooks are gaps' }),
  ]);
}
```

#### `getGovernanceDeltas()`

Returns a frozen array of per-checkpoint enforcement comparison entries. Derived from `getGovernanceModel()` (REQ-0117).

```js
import { getGovernanceModel } from '../../providers/codex/governance.js';

export function getGovernanceDeltas() {
  const model = getGovernanceModel();
  const deltas = [];

  for (const entry of model.enforceable) {
    deltas.push(Object.freeze({
      checkpoint: entry.checkpoint,
      claude_strength: 'enforced',
      codex_strength: 'enforced',
      delta: 'none'
    }));
  }

  for (const entry of model.gaps) {
    deltas.push(Object.freeze({
      checkpoint: entry.checkpoint,
      claude_strength: 'enforced',
      codex_strength: entry.status === 'partial' ? 'instruction-only' : 'none',
      delta: entry.status === 'partial' ? 'degraded' : 'absent'
    }));
  }

  return Object.freeze(deltas);
}
```

#### `getKnownLimitations()`

Returns a frozen array of documented Codex constraints.

```js
export function getKnownLimitations() {
  return Object.freeze([
    Object.freeze({
      limitation: 'No PreToolUse/PostToolUse hook surface',
      impact: 'high',
      mitigation: 'Governance enforced via instruction-based validation and periodic checks'
    }),
    Object.freeze({
      limitation: 'No real-time validation during tool execution',
      impact: 'high',
      mitigation: 'Validation runs at phase boundaries via adapter-owned runner'
    }),
    Object.freeze({
      limitation: 'Instruction-only governance for non-enforceable checkpoints',
      impact: 'medium',
      mitigation: 'Codex AGENTS.md instructions replicate hook intent; periodic validation catches drift'
    }),
    Object.freeze({
      limitation: 'No interactive elicitation support',
      impact: 'medium',
      mitigation: 'Elicitation requirements relaxed for Codex provider; context provided upfront'
    }),
    Object.freeze({
      limitation: 'No session memory persistence',
      impact: 'low',
      mitigation: 'Stateless execution; context carried via state.json and artifacts'
    }),
  ]);
}
```

## 2. CJS Bridge: `src/core/bridge/support-matrix.cjs` (~10 lines)

```js
'use strict';

let _module;

async function load() {
  if (!_module) {
    _module = await import('../providers/support-matrix.js');
  }
  return _module;
}

module.exports.getProviderSupportMatrix = async () => (await load()).getProviderSupportMatrix();
module.exports.getGovernanceDeltas = async () => (await load()).getGovernanceDeltas();
module.exports.getKnownLimitations = async () => (await load()).getKnownLimitations();
```

## 3. Open Questions

None — the matrix is a frozen data snapshot of current provider capabilities.
