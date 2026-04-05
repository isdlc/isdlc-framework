/**
 * Tests for src/core/validators/checkpoint-router.js
 * REQ-0093: Core checkpoint routing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  routeCheckpoint,
  getKnownHookTypes,
  getRoutingTable
} from '../../../src/core/validators/checkpoint-router.js';

describe('routeCheckpoint', () => {
  it('should return empty arrays for unknown hook type', () => {
    const result = routeCheckpoint('Unknown', 'Task', {});
    assert.deepEqual(result, { validators: [], guards: [], observers: [] });
  });

  it('should route PreToolUse:Task with active workflow', () => {
    const result = routeCheckpoint('PreToolUse', 'Task', {
      hasActiveWorkflow: true,
      workflowType: 'feature',
      currentPhase: '06-implementation'
    });
    assert.ok(result.validators.includes('iteration-corridor'));
    assert.ok(result.validators.includes('gate-blocker'));
    assert.ok(result.validators.includes('constitution-validator'));
    assert.ok(result.guards.includes('phase-loop-controller'));
    assert.ok(result.guards.includes('plan-surfacer'));
    assert.ok(result.guards.includes('phase-sequence-guard'));
    assert.ok(result.observers.includes('skill-validator'));
    // blast-radius-validator should be present for feature + implementation
    assert.ok(result.validators.includes('blast-radius-validator'));
  });

  it('should skip workflow-required hooks when no active workflow', () => {
    const result = routeCheckpoint('PreToolUse', 'Task', {
      hasActiveWorkflow: false
    });
    // Only skill-validator should remain (no workflow required)
    assert.ok(result.observers.includes('skill-validator'));
    assert.equal(result.validators.length, 0);
    assert.equal(result.guards.length, 0);
  });

  it('should include test-adequacy-blocker for upgrade phases', () => {
    const result = routeCheckpoint('PreToolUse', 'Task', {
      hasActiveWorkflow: true,
      currentPhase: '15-upgrade-plan'
    });
    assert.ok(result.validators.includes('test-adequacy-blocker'));
  });

  it('should exclude test-adequacy-blocker for non-upgrade phases', () => {
    const result = routeCheckpoint('PreToolUse', 'Task', {
      hasActiveWorkflow: true,
      currentPhase: '06-implementation'
    });
    assert.ok(!result.validators.includes('test-adequacy-blocker'));
  });

  it('should route PostToolUse:Task with active workflow', () => {
    const result = routeCheckpoint('PostToolUse', 'Task', {
      hasActiveWorkflow: true
    });
    assert.ok(result.observers.includes('log-skill-usage'));
    assert.ok(result.observers.includes('menu-tracker'));
    assert.ok(result.observers.includes('phase-transition-enforcer'));
    assert.ok(result.observers.includes('menu-halt-enforcer'));
  });

  it('should include walkthrough-tracker for discover workflows', () => {
    const result = routeCheckpoint('PostToolUse', 'Task', {
      hasActiveWorkflow: true,
      workflowType: 'discover'
    });
    assert.ok(result.observers.includes('walkthrough-tracker'));
    assert.ok(result.observers.includes('discover-menu-guard'));
  });

  it('should exclude walkthrough-tracker for non-discover workflows', () => {
    const result = routeCheckpoint('PostToolUse', 'Task', {
      hasActiveWorkflow: true,
      workflowType: 'feature'
    });
    assert.ok(!result.observers.includes('walkthrough-tracker'));
    assert.ok(!result.observers.includes('discover-menu-guard'));
  });

  it('should route PreToolUse:Skill correctly', () => {
    const result = routeCheckpoint('PreToolUse', 'Skill', {
      hasActiveWorkflow: true
    });
    assert.ok(result.validators.includes('iteration-corridor'));
    assert.ok(result.validators.includes('gate-blocker'));
    assert.ok(result.validators.includes('constitutional-iteration-validator'));
  });

  it('should route PostToolUse:Bash with atdd enabled and enforce_priority_order (REQ-GH-216)', () => {
    const result = routeCheckpoint('PostToolUse', 'Bash', {
      hasActiveWorkflow: true,
      atdd: { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }
    });
    assert.ok(result.observers.includes('test-watcher'));
    assert.ok(result.observers.includes('review-reminder'));
    assert.ok(result.observers.includes('atdd-completeness-validator'));
  });

  it('TC-T002-13 / AC-008-03: should exclude atdd-completeness-validator when atdd.enabled=false', () => {
    const result = routeCheckpoint('PostToolUse', 'Bash', {
      hasActiveWorkflow: true,
      atdd: { enabled: false, require_gwt: true, track_red_green: true, enforce_priority_order: true }
    });
    assert.ok(result.observers.includes('test-watcher'));
    assert.ok(!result.observers.includes('atdd-completeness-validator'),
      'master kill switch should exclude atdd hook even when enforce_priority_order=true');
  });

  it('TC-T002-12 / AC-007-02: should exclude atdd-completeness-validator when enforce_priority_order=false', () => {
    const result = routeCheckpoint('PostToolUse', 'Bash', {
      hasActiveWorkflow: true,
      atdd: { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: false }
    });
    assert.ok(result.observers.includes('test-watcher'));
    assert.ok(!result.observers.includes('atdd-completeness-validator'),
      'enforce_priority_order=false should exclude atdd hook');
  });

  it('no atdd context -> fail-open to defaults (includes atdd hook)', () => {
    const result = routeCheckpoint('PostToolUse', 'Bash', {
      hasActiveWorkflow: true
    });
    assert.ok(result.observers.includes('test-watcher'));
    // When context.atdd is omitted, fail-open defaults (all-true) apply, so
    // atdd-completeness-validator IS routed.
    assert.ok(result.observers.includes('atdd-completeness-validator'),
      'missing atdd context should assume all-true defaults');
  });

  it('should route PostToolUse:Write correctly', () => {
    const result = routeCheckpoint('PostToolUse', 'Write', {
      hasActiveWorkflow: true
    });
    assert.ok(result.validators.includes('state-write-validator'));
    assert.ok(result.observers.includes('output-format-validator'));
    // workflow-completion-enforcer only when no active workflow
    assert.ok(!result.observers.includes('workflow-completion-enforcer'));
  });

  it('should include workflow-completion-enforcer when no active workflow', () => {
    const result = routeCheckpoint('PostToolUse', 'Write', {
      hasActiveWorkflow: false
    });
    assert.ok(result.validators.includes('state-write-validator'));
    assert.ok(result.observers.includes('workflow-completion-enforcer'));
    // output-format-validator requires workflow
    assert.ok(!result.observers.includes('output-format-validator'));
  });

  it('should exclude output-format-validator for Edit tool', () => {
    const result = routeCheckpoint('PostToolUse', 'Edit', {
      hasActiveWorkflow: true
    });
    assert.ok(result.validators.includes('state-write-validator'));
    // output-format-validator has toolFilter: 'Write', so excluded for Edit
    assert.ok(!result.observers.includes('output-format-validator'));
  });
});

describe('getKnownHookTypes', () => {
  it('should return all registered hook types', () => {
    const types = getKnownHookTypes();
    assert.ok(types.includes('PreToolUse:Task'));
    assert.ok(types.includes('PostToolUse:Task'));
    assert.ok(types.includes('PreToolUse:Skill'));
    assert.ok(types.includes('PostToolUse:Bash'));
    assert.ok(types.includes('PostToolUse:Write'));
    assert.ok(types.includes('PostToolUse:Edit'));
  });
});

describe('getRoutingTable', () => {
  it('should return table for known type', () => {
    const table = getRoutingTable('PreToolUse:Task');
    assert.ok(Array.isArray(table));
    assert.ok(table.length > 0);
  });

  it('should return null for unknown type', () => {
    const table = getRoutingTable('Unknown:Type');
    assert.equal(table, null);
  });
});
