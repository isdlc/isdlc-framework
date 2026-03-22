/**
 * Provider Support Matrix — REQ-0122
 *
 * Frozen data module documenting which features each provider (Claude, Codex)
 * supports, governance enforcement deltas, and known Codex limitations.
 *
 * Follows the frozen registry pattern from src/core/teams/registry.js.
 *
 * Exports:
 * - getProviderSupportMatrix()  — per-feature provider comparison
 * - getGovernanceDeltas()       — per-checkpoint enforcement comparison
 * - getKnownLimitations()       — documented Codex constraints
 *
 * @module src/core/providers/support-matrix
 */

import { getGovernanceModel } from '../../providers/codex/governance.js';

// ---------------------------------------------------------------------------
// FR-001: Provider Support Matrix (AC-001-01 through AC-001-03)
// ---------------------------------------------------------------------------

/**
 * Get the frozen provider support matrix comparing Claude and Codex
 * per feature.
 *
 * @returns {ReadonlyArray<Readonly<{ feature: string, claude: string, codex: string, notes: string }>>}
 */
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

// ---------------------------------------------------------------------------
// FR-002: Governance Strength Deltas (AC-002-01 through AC-002-03)
// ---------------------------------------------------------------------------

/**
 * Get per-checkpoint governance enforcement comparison between Claude and Codex.
 * Derived from getGovernanceModel() (REQ-0117).
 *
 * @returns {ReadonlyArray<Readonly<{ checkpoint: string, claude_strength: string, codex_strength: string, delta: string }>>}
 */
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

// ---------------------------------------------------------------------------
// FR-003: Known Limitations (AC-003-01 through AC-003-03)
// ---------------------------------------------------------------------------

/**
 * Get frozen array of documented Codex constraints.
 *
 * @returns {ReadonlyArray<Readonly<{ limitation: string, impact: string, mitigation: string }>>}
 */
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
