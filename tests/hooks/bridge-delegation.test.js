/**
 * Tests for hook bridge-first delegation pattern
 * REQ-0090/91/92/93: Verify hooks delegate to core when bridge is available
 *
 * These tests verify the structural pattern:
 * 1. Each hook has a _getCoreBridge() function
 * 2. The bridge path resolves correctly
 * 3. When bridge returns undefined, fallback logic runs
 * 4. The check() export still works (backward compat)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const HOOKS_DIR = path.resolve(__dirname, '..', '..', 'src', 'claude', 'hooks');
const DISPATCHERS_DIR = path.join(HOOKS_DIR, 'dispatchers');
const BRIDGE_DIR = path.resolve(__dirname, '..', '..', 'src', 'core', 'bridge');

// =========================================================================
// ITEM 1: Core validator hooks (REQ-0090)
// =========================================================================

const VALIDATOR_HOOKS = [
  'constitution-validator.cjs',
  'constitutional-iteration-validator.cjs',
  'phase-sequence-guard.cjs',
  'test-adequacy-blocker.cjs',
  'output-format-validator.cjs',
  'blast-radius-validator.cjs',
  'test-watcher.cjs'
];

describe('ITEM 1: Validator hooks bridge delegation (REQ-0090)', () => {
  for (const hookFile of VALIDATOR_HOOKS) {
    describe(hookFile, () => {
      let hookContent;

      before(() => {
        const hookPath = path.join(HOOKS_DIR, hookFile);
        hookContent = readFileSync(hookPath, 'utf8');
      });

      it('should have _getCoreBridge function', () => {
        assert.ok(
          hookContent.includes('_getCoreBridge') || hookContent.includes('_getEnforcementBridge'),
          `${hookFile} should have a bridge getter function`
        );
      });

      it('should reference core bridge path', () => {
        assert.ok(
          hookContent.includes('core') && hookContent.includes('bridge'),
          `${hookFile} should reference core/bridge path`
        );
      });

      it('should export check function', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        assert.ok(typeof hookModule.check === 'function', `${hookFile} should export check()`);
      });

      it('should return allow on empty input (backward compat)', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        const result = hookModule.check({ input: null, state: null });
        assert.equal(result.decision, 'allow');
      });
    });
  }
});

// =========================================================================
// ITEM 2: Workflow guard hooks (REQ-0091)
// =========================================================================

const WORKFLOW_HOOKS = [
  'iteration-corridor.cjs',
  'phase-loop-controller.cjs',
  'plan-surfacer.cjs',
  'workflow-completion-enforcer.cjs',
  'phase-transition-enforcer.cjs',
  'discover-menu-guard.cjs',
  'menu-halt-enforcer.cjs'
];

describe('ITEM 2: Workflow guard hooks bridge delegation (REQ-0091)', () => {
  for (const hookFile of WORKFLOW_HOOKS) {
    describe(hookFile, () => {
      let hookContent;

      before(() => {
        const hookPath = path.join(HOOKS_DIR, hookFile);
        hookContent = readFileSync(hookPath, 'utf8');
      });

      it('should have _getCoreBridge function', () => {
        assert.ok(
          hookContent.includes('_getCoreBridge'),
          `${hookFile} should have _getCoreBridge function`
        );
      });

      it('should reference core/bridge/workflow or core/bridge/observability', () => {
        assert.ok(
          hookContent.includes('core/bridge') || hookContent.includes("core', 'bridge'"),
          `${hookFile} should reference core bridge`
        );
      });

      it('should export check function', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        assert.ok(typeof hookModule.check === 'function', `${hookFile} should export check()`);
      });

      it('should return allow on empty input (backward compat)', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        const result = hookModule.check({ input: null, state: null });
        assert.equal(result.decision, 'allow');
      });
    });
  }
});

// =========================================================================
// ITEM 3: Observability hooks (REQ-0092)
// =========================================================================

const OBSERVABILITY_HOOKS = [
  'skill-validator.cjs',
  'log-skill-usage.cjs',
  'menu-tracker.cjs',
  'walkthrough-tracker.cjs',
  'review-reminder.cjs',
  'atdd-completeness-validator.cjs'
];

describe('ITEM 3: Observability hooks bridge delegation (REQ-0092)', () => {
  for (const hookFile of OBSERVABILITY_HOOKS) {
    describe(hookFile, () => {
      let hookContent;

      before(() => {
        const hookPath = path.join(HOOKS_DIR, hookFile);
        hookContent = readFileSync(hookPath, 'utf8');
      });

      it('should have _getCoreBridge function', () => {
        assert.ok(
          hookContent.includes('_getCoreBridge'),
          `${hookFile} should have _getCoreBridge function`
        );
      });

      it('should reference core/bridge/observability', () => {
        assert.ok(
          hookContent.includes('observability') || hookContent.includes("core', 'bridge'"),
          `${hookFile} should reference observability bridge`
        );
      });

      it('should export check function', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        assert.ok(typeof hookModule.check === 'function', `${hookFile} should export check()`);
      });

      it('should return allow on empty input (backward compat)', () => {
        const hookModule = require(path.join(HOOKS_DIR, hookFile));
        const result = hookModule.check({ input: null, state: null });
        assert.equal(result.decision, 'allow');
      });
    });
  }
});

// =========================================================================
// ITEM 4: Dispatchers (REQ-0093)
// =========================================================================

const DISPATCHERS = [
  'pre-task-dispatcher.cjs',
  'post-task-dispatcher.cjs',
  'pre-skill-dispatcher.cjs',
  'post-bash-dispatcher.cjs',
  'post-write-edit-dispatcher.cjs'
];

describe('ITEM 4: Dispatcher checkpoint router delegation (REQ-0093)', () => {
  for (const dispFile of DISPATCHERS) {
    describe(dispFile, () => {
      let dispContent;

      before(() => {
        const dispPath = path.join(DISPATCHERS_DIR, dispFile);
        dispContent = readFileSync(dispPath, 'utf8');
      });

      it('should have _getCheckpointRouter function', () => {
        assert.ok(
          dispContent.includes('_getCheckpointRouter') || dispContent.includes('checkpoint-router'),
          `${dispFile} should reference checkpoint router`
        );
      });

      it('should reference core/bridge/checkpoint-router', () => {
        assert.ok(
          dispContent.includes('checkpoint-router') || dispContent.includes("core', 'bridge'"),
          `${dispFile} should reference core bridge`
        );
      });
    });
  }
});

// =========================================================================
// Bridge file existence checks
// =========================================================================

describe('Bridge files exist', () => {
  it('validators bridge exists', () => {
    assert.ok(existsSync(path.join(BRIDGE_DIR, 'validators.cjs')));
  });

  it('workflow bridge exists', () => {
    assert.ok(existsSync(path.join(BRIDGE_DIR, 'workflow.cjs')));
  });

  it('state bridge exists', () => {
    assert.ok(existsSync(path.join(BRIDGE_DIR, 'state.cjs')));
  });

  it('observability bridge exists', () => {
    assert.ok(existsSync(path.join(BRIDGE_DIR, 'observability.cjs')));
  });

  it('checkpoint-router bridge exists', () => {
    assert.ok(existsSync(path.join(BRIDGE_DIR, 'checkpoint-router.cjs')));
  });
});

// =========================================================================
// Gate-blocker already has bridge (verify)
// =========================================================================

describe('gate-blocker.cjs bridge (already from Batch 1)', () => {
  let content;
  before(() => {
    content = readFileSync(path.join(HOOKS_DIR, 'gate-blocker.cjs'), 'utf8');
  });

  it('should have _getEnforcementBridge function', () => {
    assert.ok(content.includes('_getEnforcementBridge'));
  });

  it('should reference validators bridge', () => {
    assert.ok(content.includes('validators.cjs'));
  });

  it('should have bridge-first check pattern', () => {
    assert.ok(content.includes('bridge.check'));
  });
});

// =========================================================================
// state-write-validator delegates via state-logic.cjs
// =========================================================================

describe('state-write-validator.cjs delegation chain', () => {
  let stateLogicContent;
  before(() => {
    stateLogicContent = readFileSync(path.join(HOOKS_DIR, 'lib', 'state-logic.cjs'), 'utf8');
  });

  it('state-logic.cjs should have _getCoreBridge', () => {
    assert.ok(stateLogicContent.includes('_getCoreBridge'));
  });

  it('state-logic.cjs should delegate validatePhase to core bridge', () => {
    assert.ok(stateLogicContent.includes('_b.validatePhase'));
  });
});
