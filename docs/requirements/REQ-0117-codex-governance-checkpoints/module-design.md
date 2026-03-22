# Design Specification: Codex Governance Checkpoint Integration

**Item**: REQ-0117 | **GitHub**: #181 | **CODEX**: CODEX-048

---

## 1. Module: `src/providers/codex/governance.js` (~120 lines)

### Exports

#### `getGovernanceModel()`

Returns a frozen governance model documenting enforceable checkpoints and gaps.

```js
export function getGovernanceModel() {
  return Object.freeze({
    enforceable: Object.freeze([
      Object.freeze({
        checkpoint: 'phase-transition',
        claude_hook: 'phase-sequence-guard',
        codex_equivalent: 'adapter-runner-validation',
        status: 'enforceable',
        mitigation: 'Validated by adapter-owned runner before phase advance'
      }),
      Object.freeze({
        checkpoint: 'state-schema',
        claude_hook: 'state-write-validator',
        codex_equivalent: 'file-level-validation',
        status: 'enforceable',
        mitigation: 'State file validated on read/write via core StateStore'
      }),
      Object.freeze({
        checkpoint: 'artifact-existence',
        claude_hook: 'gate-blocker',
        codex_equivalent: 'file-system-check',
        status: 'enforceable',
        mitigation: 'Artifact files checked before gate passage'
      })
    ]),
    gaps: Object.freeze([
      Object.freeze({
        checkpoint: 'delegation-gate',
        claude_hook: 'delegation-gate (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No real-time delegation interception; periodic validation only'
      }),
      Object.freeze({
        checkpoint: 'branch-guard',
        claude_hook: 'branch-guard (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No git hook surface; branch policy enforced at PR level'
      }),
      Object.freeze({
        checkpoint: 'test-watcher',
        claude_hook: 'test-watcher (PostToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No real-time test monitoring; tests run as explicit task step'
      }),
      Object.freeze({
        checkpoint: 'state-file-guard',
        claude_hook: 'state-file-guard (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No Bash interception; state writes go through core StateStore API'
      }),
      Object.freeze({
        checkpoint: 'explore-readonly',
        claude_hook: 'explore-readonly-enforcer (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No write interception; explore phase is advisory only'
      })
    ]),
    mitigation_strategy: 'periodic-validation'
  });
}
```

#### `validateCheckpoint(phase, state)`

Runs enforceable governance checks for the given phase and state.

```js
export function validateCheckpoint(phase, state) {
  const violations = [];

  // 1. Phase transition validation (via core ValidatorEngine)
  const phaseResult = validatePhaseTransition(phase, state);
  if (!phaseResult.valid) {
    violations.push({
      checkpoint: 'phase-transition',
      message: phaseResult.reason ?? `Phase ${phase} transition validation failed`
    });
  }

  // 2. State schema validation (via core StateStore)
  const schemaResult = validateStateSchema(state);
  if (!schemaResult.valid) {
    violations.push({
      checkpoint: 'state-schema',
      message: schemaResult.reason ?? 'State schema validation failed'
    });
  }

  // 3. Artifact existence checks
  const requiredArtifacts = getRequiredArtifacts(phase);
  for (const artifact of requiredArtifacts) {
    if (!existsSync(artifact.path)) {
      violations.push({
        checkpoint: 'artifact-existence',
        message: `Required artifact missing: ${artifact.name} (${artifact.path})`
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
```

### Internal: `getRequiredArtifacts(phase)` (not exported)

Returns the list of artifacts required for gate passage at the given phase. Maps phase identifiers to expected file paths (requirements-spec.md, architecture-overview.md, module-design.md, test results, etc.) based on the phase's gate requirements.

---

## 2. Open Questions

None — the governance model is a direct mapping of Claude's 8 hooks to Codex enforcement capabilities (or lack thereof).
