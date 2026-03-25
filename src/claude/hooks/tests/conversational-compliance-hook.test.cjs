'use strict';

/**
 * Unit Tests: Stop Hook (conversational-compliance.cjs)
 * =====================================================
 * Tests for the Stop hook that invokes the compliance engine and returns
 * block/allow decisions to Claude.
 *
 * REQ-0140: Conversational enforcement via Stop hook.
 * Covers: FR-003 (Stop Hook Integration), FR-004 (Auto-Retry)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    runHook,
    prepareHook
} = require('./hook-test-utils.cjs');

const HOOK_PATH = path.resolve(__dirname, '..', 'conversational-compliance.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Writes conversational-rules.json to the test env config dir */
function writeRules(testDir, rules) {
    const configDir = path.join(testDir, '.isdlc', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'conversational-rules.json'),
        JSON.stringify({ version: '1.0.0', rules }, null, 2)
    );
}

/** Writes roundtable.yaml to the test env */
function writeRoundtableYaml(testDir, content) {
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'roundtable.yaml'),
        content
    );
}

/** Writes roundtable-state.json sidecar to the test env */
function writeRoundtableState(testDir, state) {
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'roundtable-state.json'),
        JSON.stringify(state, null, 2)
    );
}

// Sample rules
const BULLETED_RULE = {
    id: 'bulleted-format',
    name: 'Bulleted Output Format',
    trigger_condition: { config: 'verbosity', value: 'bulleted', workflow: 'analyze' },
    check: {
        type: 'pattern',
        pattern: '^(?!\\s*[-*]|\\s*\\d+\\.|#{1,6}\\s|\\|.*\\||```|---|\\s*$|\\*\\*)',
        scope: 'line',
        threshold: 0.3
    },
    corrective_guidance: 'Use bullet-point formatting.',
    severity: 'block',
    provider_scope: 'both'
};

const WARN_RULE = {
    id: 'warn-test-rule',
    name: 'Warn Test Rule',
    trigger_condition: { config: 'verbosity', value: 'bulleted' },
    check: {
        type: 'pattern',
        pattern: '^(?!\\s*[-*]|\\s*\\d+\\.|#{1,6}\\s|\\|.*\\||```|---|\\s*$|\\*\\*)',
        scope: 'line',
        threshold: 0.3
    },
    corrective_guidance: 'This is a warning.',
    severity: 'warn',
    provider_scope: 'both'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conversational-compliance Stop hook', () => {
    let hookPath;
    let testDir;

    before(() => {
        testDir = setupTestEnv({
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation'
            }
        });
        hookPath = prepareHook(HOOK_PATH);
        // Copy compliance engine to where the hook expects it
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDir = path.join(testDir, 'compliance');
        fs.mkdirSync(engineDir, { recursive: true });
        fs.copyFileSync(engineSrc, path.join(engineDir, 'engine.cjs'));
    });

    after(() => {
        cleanupTestEnv();
    });

    describe('stdin parsing', () => {
        it('should allow through on empty stdin', async () => {
            const result = await runHook(hookPath, {});
            assert.equal(result.code, 0);
            // Should not block
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });

        it('should allow through on malformed JSON input (fail-open)', async () => {
            // runHook sends JSON, so we test with an input that has no assistant_message
            const result = await runHook(hookPath, { random_key: 'value' });
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('block decision', () => {
        beforeEach(() => {
            writeRules(testDir, [BULLETED_RULE]);
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');
        });

        it('AC-003-02: should return block with corrective guidance on violation', async () => {
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'All prose.\nMore prose.\nStill prose.\nProse again.\nAnd even more.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim(), 'Should produce output');
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
            assert.ok(output.reason.includes('bullet'), 'Reason should include corrective guidance');
        });
    });

    describe('allow decision', () => {
        beforeEach(() => {
            writeRules(testDir, [BULLETED_RULE]);
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');
        });

        it('AC-003-01: should allow response with no violations', async () => {
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: '- Bullet one\n- Bullet two\n- Bullet three\n- Bullet four'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // Empty stdout or allow decision
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('warn decision', () => {
        beforeEach(() => {
            writeRules(testDir, [WARN_RULE]);
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');
        });

        it('AC-003-03: should allow response through on warn violation', async () => {
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'All prose.\nMore prose.\nStill prose.\nProse again.\nAnd even more.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // Should NOT block on warn
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('fail-open behavior', () => {
        it('should allow through when rules file is missing', async () => {
            // Remove rules file
            const rulesPath = path.join(testDir, '.isdlc', 'config', 'conversational-rules.json');
            if (fs.existsSync(rulesPath)) fs.unlinkSync(rulesPath);

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'All prose everywhere.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }

            // Restore rules
            writeRules(testDir, [BULLETED_RULE]);
        });

        it('should allow through when roundtable.yaml is missing', async () => {
            // Remove yaml
            const yamlPath = path.join(testDir, '.isdlc', 'roundtable.yaml');
            if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath);

            writeRules(testDir, [BULLETED_RULE]);
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'All prose everywhere.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // Without roundtable.yaml, verbosity config is missing, so bulleted rule skipped
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }

            // Restore yaml
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');
        });

        it('should allow through when roundtable-state.json is missing', async () => {
            writeRules(testDir, [{
                id: 'domain-rule',
                name: 'Domain Rule',
                trigger_condition: { state: 'confirmation_active' },
                check: { type: 'structural', detect: 'collapsed_domains', domains: ['Requirements', 'Architecture', 'Design'] },
                corrective_guidance: 'One domain at a time.',
                severity: 'block',
                provider_scope: 'both'
            }]);

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: '**Requirements**: Accept or Amend?\n**Architecture**: Accept or Amend?'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // State-dependent rules should be skipped when sidecar missing
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('roundtable state reading', () => {
        beforeEach(() => {
            writeRules(testDir, [{
                id: 'sequential-domain-confirmation',
                name: 'Sequential Domain Confirmation',
                trigger_condition: { state: 'confirmation_active', workflow: 'analyze' },
                check: { type: 'structural', detect: 'collapsed_domains', domains: ['Requirements', 'Architecture', 'Design'] },
                corrective_guidance: 'One domain per message.',
                severity: 'block',
                provider_scope: 'both'
            }]);
        });

        it('should use roundtable-state.json for state-dependent rules', async () => {
            writeRoundtableState(testDir, {
                confirmation_state: 'PRESENTING_REQUIREMENTS',
                updated_at: new Date().toISOString()
            });

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: '**Requirements**: Accept or Amend?\n\n**Architecture**: Accept or Amend?'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
        });

        it('should handle unparseable roundtable-state.json gracefully', async () => {
            fs.writeFileSync(
                path.join(testDir, '.isdlc', 'roundtable-state.json'),
                'not valid json {{{'
            );

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: '**Requirements**: Accept or Amend?\n\n**Architecture**: Accept or Amend?'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // Should fail-open on unparseable state
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });
});
