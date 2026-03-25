'use strict';

/**
 * Integration Tests: Conversational Compliance
 * ===============================================
 * End-to-end tests for the compliance system: rules loaded from disk,
 * evaluated against real response content, and hook block/allow decisions.
 *
 * REQ-0140: Conversational enforcement via Stop hook.
 * Covers: FR-003 + FR-005 (integration), FR-001 (schema loading from disk)
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

// The 3 built-in rules from the real config
const BUILT_IN_RULES = [
    {
        id: 'bulleted-format',
        name: 'Bulleted Output Format',
        trigger_condition: { config: 'verbosity', value: 'bulleted', workflow: 'analyze' },
        check: {
            type: 'pattern',
            pattern: '^(?!\\s*[-*]|\\s*\\d+\\.|#{1,6}\\s|\\|.*\\||```|---|\\s*$|\\*\\*)',
            scope: 'line',
            threshold: 0.3
        },
        corrective_guidance: 'Your response must use bullet-point formatting. Rewrite all prose paragraphs as bulleted lists. Each point should be a single bullet starting with - or *. Headings, tables, and code blocks are allowed.',
        severity: 'block',
        provider_scope: 'both'
    },
    {
        id: 'sequential-domain-confirmation',
        name: 'Sequential Domain Confirmation',
        trigger_condition: { state: 'confirmation_active', workflow: 'analyze' },
        check: {
            type: 'structural',
            detect: 'collapsed_domains',
            domains: ['Requirements', 'Architecture', 'Design']
        },
        corrective_guidance: 'You must present domain confirmations sequentially -- one domain per message.',
        severity: 'block',
        provider_scope: 'both'
    },
    {
        id: 'elicitation-first',
        name: 'Elicitation Before Analysis',
        trigger_condition: { state: 'roundtable_start', workflow: 'analyze' },
        check: {
            type: 'state-match',
            detect: 'analysis_without_question',
            question_indicators: ['?', 'what do you think', 'would you like'],
            completion_indicators: ['analysis complete', 'here is the complete', 'final analysis', 'Accept or Amend', 'accept or amend']
        },
        corrective_guidance: 'You must ask at least one elicitation question before declaring analysis complete.',
        severity: 'block',
        provider_scope: 'both'
    }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeRules(testDir, rules) {
    const configDir = path.join(testDir, '.isdlc', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, 'conversational-rules.json'),
        JSON.stringify({ version: '1.0.0', rules }, null, 2)
    );
}

function writeRoundtableYaml(testDir, content) {
    fs.writeFileSync(path.join(testDir, '.isdlc', 'roundtable.yaml'), content);
}

function writeRoundtableState(testDir, state) {
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'roundtable-state.json'),
        JSON.stringify(state, null, 2)
    );
}

function removeRoundtableState(testDir) {
    const p = path.join(testDir, '.isdlc', 'roundtable-state.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('conversational-compliance: end-to-end integration', () => {
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
        // Copy compliance engine to the compliance/ dir in temp
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDir = path.join(testDir, 'compliance');
        fs.mkdirSync(engineDir, { recursive: true });
        fs.copyFileSync(engineSrc, path.join(engineDir, 'engine.cjs'));
        // Write all 3 built-in rules
        writeRules(testDir, BUILT_IN_RULES);
    });

    after(() => {
        cleanupTestEnv();
    });

    describe('bulleted format enforcement', () => {
        beforeEach(() => {
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');
            removeRoundtableState(testDir);
        });

        it('should block prose response with corrective guidance', async () => {
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: [
                    'This is a detailed analysis of the feature requirements.',
                    'The system needs to handle multiple concurrent users.',
                    'Performance should be within acceptable bounds.',
                    'Security considerations include input validation.',
                    'The deployment model uses containerized services.'
                ].join('\n')
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
            assert.ok(output.reason.includes('bullet'));
        });

        it('should allow properly formatted bulleted response', async () => {
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: [
                    '## Requirements',
                    '',
                    '- User authentication via OAuth 2.0',
                    '- Session management with JWT tokens',
                    '- Rate limiting at 100 req/min',
                    '',
                    '**Question**: What authentication providers should we support?'
                ].join('\n')
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('domain confirmation enforcement', () => {
        beforeEach(() => {
            writeRoundtableYaml(testDir, 'verbosity: conversational\n');
        });

        it('should block collapsed three-domain confirmation', async () => {
            writeRoundtableState(testDir, {
                confirmation_state: 'PRESENTING_REQUIREMENTS',
                updated_at: new Date().toISOString()
            });

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: [
                    '**Requirements**: The feature needs OAuth. Accept or Amend?',
                    '',
                    '**Architecture**: Using microservices pattern. Accept or Amend?',
                    '',
                    '**Design**: REST API with JWT. Accept or Amend?'
                ].join('\n')
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
            assert.ok(output.reason.includes('sequentially') || output.reason.includes('domain'));
        });

        it('should allow single-domain confirmation', async () => {
            writeRoundtableState(testDir, {
                confirmation_state: 'PRESENTING_REQUIREMENTS',
                updated_at: new Date().toISOString()
            });

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: [
                    '**Requirements**:',
                    '',
                    '- OAuth 2.0 authentication',
                    '- Session management',
                    '',
                    'Accept or Amend?'
                ].join('\n')
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('elicitation-first enforcement', () => {
        beforeEach(() => {
            writeRoundtableYaml(testDir, 'verbosity: conversational\n');
        });

        it('should block analysis-complete without question', async () => {
            writeRoundtableState(testDir, {
                confirmation_state: 'IDLE',
                updated_at: new Date().toISOString()
            });

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'Here is the complete analysis of your feature. The system will use a REST API with JWT authentication. Accept or Amend'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
            assert.ok(output.reason.includes('question') || output.reason.includes('elicitation'));
        });

        it('should allow response with elicitation question', async () => {
            writeRoundtableState(testDir, {
                confirmation_state: 'IDLE',
                updated_at: new Date().toISOString()
            });

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'I have some initial thoughts on this feature. What do you think about the authentication approach? Would you like to explore OAuth or API keys?'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                const output = JSON.parse(result.stdout);
                assert.notEqual(output.decision, 'block');
            }
        });
    });

    describe('rule loading pipeline', () => {
        it('should load and evaluate all 3 built-in rules from disk', async () => {
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');

            // Prose response should trigger bulleted-format rule
            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'Full prose analysis.\nMore prose.\nEven more.\nStill going.\nAnd more.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            assert.equal(output.decision, 'block');
        });
    });

    describe('multiple violations', () => {
        it('should report highest-severity violation as primary', async () => {
            // Add a warn rule alongside block rules
            const rules = [
                ...BUILT_IN_RULES,
                {
                    id: 'warn-only',
                    name: 'Warn Only Rule',
                    trigger_condition: { config: 'verbosity', value: 'bulleted' },
                    check: { type: 'pattern', pattern: '^(?!\\s*[-*])', scope: 'line', threshold: 0.3 },
                    corrective_guidance: 'Warning only.',
                    severity: 'warn',
                    provider_scope: 'both'
                }
            ];
            writeRules(testDir, rules);
            writeRoundtableYaml(testDir, 'verbosity: bulleted\n');

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'Full prose.\nMore prose.\nEven more.\nStill going.\nAnd more.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            assert.ok(result.stdout.trim());
            const output = JSON.parse(result.stdout);
            // Block should take priority over warn
            assert.equal(output.decision, 'block');

            // Restore original rules
            writeRules(testDir, BUILT_IN_RULES);
        });
    });

    describe('sidecar file lifecycle', () => {
        it('should read state transitions from sidecar file', async () => {
            writeRoundtableYaml(testDir, 'verbosity: conversational\n');

            // First: state is PRESENTING_REQUIREMENTS
            writeRoundtableState(testDir, {
                confirmation_state: 'PRESENTING_REQUIREMENTS',
                updated_at: new Date().toISOString()
            });

            // Single domain should pass
            const input1 = {
                hook_event_name: 'Stop',
                last_assistant_message: '**Requirements**:\n- Feature A\n\nAccept or Amend?'
            };
            const result1 = await runHook(hookPath, input1);
            assert.equal(result1.code, 0);
            if (result1.stdout.trim()) {
                const output1 = JSON.parse(result1.stdout);
                assert.notEqual(output1.decision, 'block');
            }

            // Update state to PRESENTING_ARCHITECTURE
            writeRoundtableState(testDir, {
                confirmation_state: 'PRESENTING_ARCHITECTURE',
                updated_at: new Date().toISOString()
            });

            // Single domain should still pass
            const input2 = {
                hook_event_name: 'Stop',
                last_assistant_message: '**Architecture**:\n- Microservices pattern\n\nAccept or Amend?'
            };
            const result2 = await runHook(hookPath, input2);
            assert.equal(result2.code, 0);
            if (result2.stdout.trim()) {
                const output2 = JSON.parse(result2.stdout);
                assert.notEqual(output2.decision, 'block');
            }
        });

        it('should handle deleted sidecar file gracefully', async () => {
            removeRoundtableState(testDir);

            const input = {
                hook_event_name: 'Stop',
                last_assistant_message: 'Any response text.'
            };
            const result = await runHook(hookPath, input);
            assert.equal(result.code, 0);
            // State-dependent rules skipped when sidecar missing
        });
    });
});
