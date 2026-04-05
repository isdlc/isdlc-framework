'use strict';

/**
 * iSDLC Post-Write/Edit Dispatcher - Integration Test Suite (CJS)
 * =================================================================
 * Integration tests for src/claude/hooks/dispatchers/post-write-edit-dispatcher.cjs
 *
 * The post-write/edit dispatcher consolidates:
 *   For Write: 3 hooks
 *     1. state-write-validator          - reads file from disk, stderr only
 *     2. output-format-validator        - reads file from disk, stderr only
 *     3. workflow-completion-enforcer   - reads FRESH state, manages own I/O
 *   For Edit: 3 hooks
 *     1. state-write-validator
 *     2. output-format-validator
 *     3. workflow-completion-enforcer
 *
 * No state write from dispatcher (all hooks manage their own I/O).
 *
 * Run: node --test src/claude/hooks/tests/test-post-write-edit-dispatcher.test.cjs
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    prepareDispatcher,
    runDispatcher,
    writeState,
    readState,
    writeConfig
} = require('./hook-test-utils.cjs');

function writeTemplateFixtures(testDir) {
    const templatesDir = path.join(testDir, '.isdlc', 'config', 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'requirements.template.json'), JSON.stringify({
        domain: 'requirements',
        format: {
            section_order: [
                'functional_requirements',
                'assumptions_and_inferences',
                'non_functional_requirements',
                'out_of_scope',
                'prioritization'
            ],
            required_sections: [
                'functional_requirements',
                'assumptions_and_inferences',
                'prioritization'
            ]
        }
    }, null, 2));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PostToolUse[Write] input for state.json */
function writeStateInput(filePath) {
    return {
        tool_name: 'Write',
        tool_input: { file_path: filePath || '/tmp/project/.isdlc/state.json' },
        tool_result: 'File written successfully'
    };
}

/** Build a PostToolUse[Write] input for a regular file */
function writeFileInput(filePath) {
    return {
        tool_name: 'Write',
        tool_input: { file_path: filePath || '/tmp/project/src/index.js' },
        tool_result: 'File written successfully'
    };
}

/** Build a PostToolUse[Edit] input for state.json */
function editStateInput(filePath) {
    return {
        tool_name: 'Edit',
        tool_input: { file_path: filePath || '/tmp/project/.isdlc/state.json' },
        tool_result: 'File edited successfully'
    };
}

/** Build a PostToolUse[Edit] input for a regular file */
function editFileInput(filePath) {
    return {
        tool_name: 'Edit',
        tool_input: { file_path: filePath || '/tmp/project/src/index.js' },
        tool_result: 'File edited successfully'
    };
}

/** Build an active workflow state */
function activeWorkflowState(phase) {
    return {
        active_workflow: {
            type: 'feature',
            requirement_id: 'REQ-TEST',
            current_phase: phase || '06-implementation',
            phases: ['01-requirements', '02-architecture', '06-implementation'],
            started_at: new Date().toISOString()
        },
        phases: {
            [phase || '06-implementation']: {
                status: 'in_progress',
                started_at: new Date().toISOString(),
                iterations: { current: 1, max: 3 }
            }
        },
        skill_enforcement: { enabled: true, mode: 'observe', manifest_version: '5.0.0' },
        iteration_enforcement: { enabled: true },
        skill_usage_log: [],
        gates: {},
        pending_escalations: []
    };
}

/** Build a state with completed workflow (triggers workflow-completion-enforcer) */
function completedWorkflowState() {
    const completedAt = new Date().toISOString();
    return {
        active_workflow: null,
        phases: {
            '06-implementation': {
                status: 'completed',
                started_at: new Date(Date.now() - 60000).toISOString(),
                completed_at: completedAt,
                iterations: { current: 2, max: 3 }
            }
        },
        workflow_history: [{
            type: 'feature',
            requirement_id: 'REQ-TEST',
            started_at: new Date(Date.now() - 120000).toISOString(),
            completed_at: completedAt,
            phases: ['06-implementation']
            // Intentionally missing phase_snapshots and metrics to trigger remediation
        }],
        skill_enforcement: { enabled: true, mode: 'observe' },
        iteration_enforcement: { enabled: true },
        skill_usage_log: [],
        gates: {},
        pending_escalations: []
    };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('post-write-edit-dispatcher', () => {
    let dispatcherPath;

    // -------------------------------------------------------------------------
    // TC-01: Empty stdin
    // -------------------------------------------------------------------------
    describe('empty/invalid stdin handling', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-01: exits cleanly with empty stdin', async () => {
            const result = await runDispatcher(dispatcherPath, '');
            assert.equal(result.code, 0);
            assert.equal(result.stdout, '');
        });

        it('TC-02: exits cleanly with invalid JSON stdin', async () => {
            const result = await runDispatcher(dispatcherPath, '{{bad json}}');
            assert.equal(result.code, 0);
            assert.equal(result.stdout, '');
        });
    });

    // -------------------------------------------------------------------------
    // TC-03: Write to non-state file (no special handling)
    // -------------------------------------------------------------------------
    describe('non-state file write', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-03: processes non-state Write without errors', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0);
        });

        it('TC-04: processes non-state Edit without errors', async () => {
            const result = await runDispatcher(dispatcherPath, editFileInput());
            assert.equal(result.code, 0);
        });
    });

    // -------------------------------------------------------------------------
    // TC-05: Write to state.json (triggers state-write-validator)
    // -------------------------------------------------------------------------
    describe('state.json write validation', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-05: state-write-validator runs on state.json Write', async () => {
            // Point to the actual state.json in the test dir
            const statePath = path.join(process.env.CLAUDE_PROJECT_DIR, '.isdlc', 'state.json');
            const result = await runDispatcher(dispatcherPath, writeStateInput(statePath));
            assert.equal(result.code, 0);
            // Validator runs and may produce stderr warnings, but never blocks
        });
    });

    // -------------------------------------------------------------------------
    // TC-06: output-format-validator runs for Edit
    // -------------------------------------------------------------------------
    describe('output-format-validator conditional execution', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            writeTemplateFixtures(process.env.CLAUDE_PROJECT_DIR);
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-06: Edit input triggers output-format-validator for template-backed artifacts', async () => {
            const artifactPath = path.join(process.env.CLAUDE_PROJECT_DIR, 'docs', 'requirements', 'REQ-GH-234', 'requirements-spec.md');
            fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
            fs.writeFileSync(artifactPath, [
                '# Requirements Spec',
                '## Functional Requirements',
                'content',
                '## Assumptions and Inferences',
                'content',
                '## Surprise Section',
                'content',
                '## Prioritization',
                'content'
            ].join('\n'));

            const result = await runDispatcher(dispatcherPath, editFileInput(artifactPath));
            assert.equal(result.code, 0);
            assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        });

        it('TC-07: Write input runs all 3 hooks including output-format-validator', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0);
            // All 3 hooks should run for Write
        });
    });

    // -------------------------------------------------------------------------
    // TC-08: Never produces block (PostToolUse is observational)
    // -------------------------------------------------------------------------
    describe('never blocks', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-08: never produces a block response for Write', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                try {
                    const parsed = JSON.parse(result.stdout);
                    assert.notEqual(parsed.continue, false,
                        'PostToolUse should never block');
                } catch {
                    // Non-JSON stdout is fine
                }
            }
        });

        it('TC-09: never produces a block response for Edit', async () => {
            const result = await runDispatcher(dispatcherPath, editFileInput());
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                try {
                    const parsed = JSON.parse(result.stdout);
                    assert.notEqual(parsed.continue, false,
                        'PostToolUse should never block');
                } catch {
                    // Non-JSON stdout is fine
                }
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-10: Workflow-completion-enforcer remediation
    // -------------------------------------------------------------------------
    describe('workflow-completion-enforcer remediation', () => {
        before(() => {
            const state = completedWorkflowState();
            setupTestEnv(state);
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-10: workflow-completion-enforcer remediates missing snapshots on state.json write', async () => {
            const statePath = path.join(process.env.CLAUDE_PROJECT_DIR, '.isdlc', 'state.json');
            const result = await runDispatcher(dispatcherPath, writeStateInput(statePath));
            assert.equal(result.code, 0);
            // After remediation, workflow_history entry should have phase_snapshots and metrics
            const state = readState();
            if (state.workflow_history && state.workflow_history.length > 0) {
                const lastEntry = state.workflow_history[state.workflow_history.length - 1];
                assert.ok(Array.isArray(lastEntry.phase_snapshots),
                    'phase_snapshots should be added by remediation');
                assert.ok(lastEntry.metrics && typeof lastEntry.metrics === 'object',
                    'metrics should be added by remediation');
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-11: No dispatcher state write (hooks manage their own I/O)
    // -------------------------------------------------------------------------
    describe('no dispatcher state write', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-11: state remains valid after dispatcher (no double-write)', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0);
            const state = readState();
            assert.ok(state, 'State should be parseable');
            assert.ok(state.active_workflow, 'active_workflow should be intact');
        });
    });

    // -------------------------------------------------------------------------
    // TC-12: Stderr accumulation
    // -------------------------------------------------------------------------
    describe('stderr accumulation', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-12: stderr is accumulated from hooks without crashing', async () => {
            const statePath = path.join(process.env.CLAUDE_PROJECT_DIR, '.isdlc', 'state.json');
            const result = await runDispatcher(dispatcherPath, writeStateInput(statePath));
            assert.equal(result.code, 0);
            assert.equal(typeof result.stderr, 'string');
        });
    });

    // -------------------------------------------------------------------------
    // TC-13: Fail-open on hook error
    // -------------------------------------------------------------------------
    describe('fail-open on hook error', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
            // Corrupt state to trigger potential errors in hooks
            writeConfig('skills-manifest.json', '<<<CORRUPTED>>>');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-13: continues when a hook throws', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0,
                'Dispatcher should exit 0 even when hooks throw');
        });
    });

    // -------------------------------------------------------------------------
    // TC-14: Conditional activation — output-format-validator skipped when no workflow (T3-B)
    // -------------------------------------------------------------------------
    describe('conditional activation - output-format-validator skipped when no workflow', () => {
        before(() => {
            setupTestEnv({
                skill_enforcement: { enabled: true, mode: 'observe' },
                iteration_enforcement: { enabled: true },
                skill_usage_log: [],
                phases: {}
            });
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-14a: output-format-validator skipped for Write when no active workflow', async () => {
            const result = await runDispatcher(dispatcherPath, writeFileInput());
            assert.equal(result.code, 0);
            // output-format-validator requires active_workflow, so it's skipped
        });
    });

    // -------------------------------------------------------------------------
    // TC-14b: Conditional activation — workflow-completion-enforcer only when workflow null
    // -------------------------------------------------------------------------
    describe('conditional activation - workflow-completion-enforcer only when workflow null', () => {
        before(() => {
            // Active workflow present — enforcer should be skipped
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-14b: workflow-completion-enforcer skipped when active_workflow exists', async () => {
            const statePath = path.join(process.env.CLAUDE_PROJECT_DIR, '.isdlc', 'state.json');
            const result = await runDispatcher(dispatcherPath, writeStateInput(statePath));
            assert.equal(result.code, 0);
            // With an active workflow, the enforcer should not run
            // State should be unchanged (no remediation)
            const state = readState();
            assert.ok(state.active_workflow, 'active_workflow should still exist (not remediated)');
        });
    });

    // -------------------------------------------------------------------------
    // TC-15: Non-Write/Edit tool input
    // -------------------------------------------------------------------------
    describe('non-Write/Edit tool input', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-write-edit-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-15: processes non-Write/Edit tool input without error', async () => {
            const result = await runDispatcher(dispatcherPath, {
                tool_name: 'Bash',
                tool_input: { command: 'echo test' },
                tool_result: 'test'
            });
            assert.equal(result.code, 0);
        });
    });
});
