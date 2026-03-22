# Design Specification: Parity Verification

**Item**: REQ-0118 | **GitHub**: #182 | **CODEX**: CODEX-049

---

## 1. Test Pattern: Per-Subsystem Parity

Each test file follows the same pattern: for each subsystem, call the Claude adapter function and the Codex adapter function with identical inputs, then assert outputs match on strict fields while allowing divergence on flexible fields.

### Strict Parity Assertion

```js
import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';

// Example: governance-decisions.test.js
import { validateCheckpoint as claudeValidate } from '../../src/providers/claude/validation.js';
import { validateCheckpoint as codexValidate } from '../../src/providers/codex/governance.js';

describe('Governance parity', () => {
  const testCases = [
    { phase: '01-requirements', state: { /* valid state */ }, label: 'valid phase transition' },
    { phase: '99-invalid', state: { /* invalid state */ }, label: 'invalid phase rejected' },
  ];

  for (const { phase, state, label } of testCases) {
    it(`produces same block/allow for: ${label}`, () => {
      const claudeResult = claudeValidate(phase, state);
      const codexResult = codexValidate(phase, state);

      // Strict: same valid/invalid outcome
      deepStrictEqual(claudeResult.valid, codexResult.valid);
      // Strict: same number of violations
      deepStrictEqual(claudeResult.violations.length, codexResult.violations.length);
    });
  }
});
```

### Flexible Parity Assertion

```js
// Example: prompt wording — assert structural equivalence, not string equality
it('produces structurally equivalent prompts', () => {
  const claudePrompt = claudeAdapter.getPhasePrompt('01-requirements', context);
  const codexPrompt = codexAdapter.getPhasePrompt('01-requirements', context);

  // Flexible: both contain required sections (not exact string match)
  assert.ok(claudePrompt.includes('requirements'), 'Claude prompt has requirements section');
  assert.ok(codexPrompt.includes('requirements'), 'Codex prompt has requirements section');
  // Flexible: timing not compared
});
```

## 2. Test Files (~200 lines total)

| File | Strict Fields | Flexible Fields |
|------|--------------|-----------------|
| `state-mutations.test.js` | Field paths, values, schema_version | Timestamp precision |
| `artifact-generation.test.js` | File names, directory structure | File content formatting |
| `backlog-mutations.test.js` | Status markers, item IDs | Whitespace, line ordering |
| `meta-mutations.test.js` | analysis_status, phases_completed | created_at precision |
| `governance-decisions.test.js` | block/allow outcome, violation count | Violation message wording |
| `phase-sequencing.test.js` | Phase order, phase names | Phase descriptions |
| `schema-conformance.test.js` | Schema version, required fields | Optional field defaults |
| `integration.test.js` | End-to-end scenario outcomes | Intermediate state formatting |

## 3. Open Questions

None — the strict vs. flexible boundary is defined per-subsystem in the test files.
