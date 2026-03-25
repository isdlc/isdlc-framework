'use strict';

/**
 * Unit Tests: Codex Output Validator
 * ====================================
 * Tests for the Codex-side output validation that calls the shared
 * compliance engine for output inspection.
 *
 * REQ-0140: Conversational enforcement via Stop hook.
 * Covers: FR-006 (Codex Provider Integration)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let testDir;
let validator;

function createTestDir() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-codex-validator-test-'));
    fs.mkdirSync(path.join(testDir, '.isdlc', 'config'), { recursive: true });
}

function cleanTestDir() {
    if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
}

function writeRulesFile(rules) {
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'config', 'conversational-rules.json'),
        JSON.stringify({ version: '1.0.0', rules }, null, 2)
    );
}

function writeRoundtableState(state) {
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'roundtable-state.json'),
        JSON.stringify(state, null, 2)
    );
}

// Sample rules
const BULLETED_RULE = {
    id: 'bulleted-format',
    name: 'Bulleted Output Format',
    trigger_condition: { config: 'verbosity', value: 'bulleted' },
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

const CODEX_ONLY_RULE = {
    id: 'codex-only-rule',
    name: 'Codex Only Rule',
    trigger_condition: { config: 'verbosity', value: 'bulleted' },
    check: {
        type: 'pattern',
        pattern: '^(?!\\s*[-*]|\\s*\\d+\\.|#{1,6}\\s|\\|.*\\||```|---|\\s*$|\\*\\*)',
        scope: 'line',
        threshold: 0.3
    },
    corrective_guidance: 'Codex-specific guidance.',
    severity: 'block',
    provider_scope: 'codex'
};

const CLAUDE_ONLY_RULE = {
    id: 'claude-only-rule',
    name: 'Claude Only Rule',
    trigger_condition: { config: 'verbosity', value: 'bulleted' },
    check: {
        type: 'pattern',
        pattern: '^(?!\\s*[-*])',
        scope: 'line',
        threshold: 0.3
    },
    corrective_guidance: 'Claude-specific guidance.',
    severity: 'block',
    provider_scope: 'claude'
};

const DOMAIN_RULE = {
    id: 'sequential-domain-confirmation',
    name: 'Sequential Domain Confirmation',
    trigger_condition: { state: 'confirmation_active' },
    check: {
        type: 'structural',
        detect: 'collapsed_domains',
        domains: ['Requirements', 'Architecture', 'Design']
    },
    corrective_guidance: 'One domain per message.',
    severity: 'block',
    provider_scope: 'both'
};

const ELICITATION_RULE = {
    id: 'elicitation-first',
    name: 'Elicitation Before Analysis',
    trigger_condition: { state: 'roundtable_start' },
    check: {
        type: 'state-match',
        detect: 'analysis_without_question',
        question_indicators: ['?'],
        completion_indicators: ['analysis complete', 'Accept or Amend']
    },
    corrective_guidance: 'Ask questions first.',
    severity: 'block',
    provider_scope: 'both'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('codex output validator: validateCodexOutput()', () => {
    before(() => {
        createTestDir();
        // Copy engine and validator to temp dir
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const validatorSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'codex-validator.cjs');
        fs.copyFileSync(engineSrc, path.join(testDir, 'engine.cjs'));
        fs.copyFileSync(validatorSrc, path.join(testDir, 'codex-validator.cjs'));
        delete require.cache[path.join(testDir, 'codex-validator.cjs')];
        delete require.cache[path.join(testDir, 'engine.cjs')];
        validator = require(path.join(testDir, 'codex-validator.cjs'));
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-006-01: should evaluate rules with codex or both provider scope', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose line one.\nProse line two.\nProse line three.\nProse four.\nProse five.';
        const result = validator.validateCodexOutput(
            proseResponse,
            [BULLETED_RULE, CODEX_ONLY_RULE],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, true);
    });

    it('AC-006-05: should skip claude-only rules on codex', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose line one.\nProse line two.\nProse line three.\nProse four.\nProse five.';
        const result = validator.validateCodexOutput(
            proseResponse,
            [CLAUDE_ONLY_RULE],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, false);
    });

    it('AC-006-07: should reject non-bulleted output when verbosity: bulleted', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose line one.\nProse line two.\nProse line three.\nProse four.\nProse five.';
        const result = validator.validateCodexOutput(
            proseResponse,
            [BULLETED_RULE],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, true);
        assert.equal(result.severity, 'block');
        assert.ok(result.corrective_guidance);
    });

    it('AC-006-08: should block collapsed multi-domain confirmation', () => {
        const config = {};
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = '**Requirements**: Accept or Amend?\n\n**Architecture**: Accept or Amend?';
        const result = validator.validateCodexOutput(
            response,
            [DOMAIN_RULE],
            config,
            state,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, true);
        assert.equal(result.rule_id, 'sequential-domain-confirmation');
    });

    it('AC-006-09: should block analysis-complete without elicitation', () => {
        const config = {};
        const state = { confirmation_state: 'IDLE' };
        const response = 'Here is the complete analysis. Accept or Amend';
        const result = validator.validateCodexOutput(
            response,
            [ELICITATION_RULE],
            config,
            state,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, true);
        assert.equal(result.rule_id, 'elicitation-first');
    });

    it('AC-006-11: should fail-open when engine path is invalid', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose everywhere.\nMore prose.\nStill prose.\nProse.\nProse.';
        const result = validator.validateCodexOutput(
            proseResponse,
            [BULLETED_RULE],
            config,
            null,
            '/nonexistent/engine.cjs'
        );
        // Fail-open: no violation reported when engine unavailable
        assert.equal(result.violation, false);
    });

    it('should pass valid bulleted response', () => {
        const config = { verbosity: 'bulleted' };
        const response = '- Point one\n- Point two\n- Point three\n- Point four';
        const result = validator.validateCodexOutput(
            response,
            [BULLETED_RULE],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, false);
    });

    it('should return no violation for empty output', () => {
        const config = { verbosity: 'bulleted' };
        const result = validator.validateCodexOutput(
            '',
            [BULLETED_RULE],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, false);
    });

    it('should return no violation for empty rules', () => {
        const config = { verbosity: 'bulleted' };
        const result = validator.validateCodexOutput(
            'Prose content.',
            [],
            config,
            null,
            path.join(testDir, 'engine.cjs')
        );
        assert.equal(result.violation, false);
    });
});

describe('codex output validator: retryIfNeeded()', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const validatorSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'codex-validator.cjs');
        fs.copyFileSync(engineSrc, path.join(testDir, 'engine.cjs'));
        fs.copyFileSync(validatorSrc, path.join(testDir, 'codex-validator.cjs'));
        delete require.cache[path.join(testDir, 'codex-validator.cjs')];
        delete require.cache[path.join(testDir, 'engine.cjs')];
        validator = require(path.join(testDir, 'codex-validator.cjs'));
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-006-02: should return shouldRetry=true on block violation', () => {
        const verdict = {
            violation: true,
            severity: 'block',
            corrective_guidance: 'Use bullet points.',
            rule_id: 'bulleted-format'
        };
        const result = validator.retryIfNeeded(verdict, 0);
        assert.equal(result.shouldRetry, true);
        assert.ok(result.corrective_guidance);
    });

    it('AC-006-03: should return shouldRetry=false after 3 retries', () => {
        const verdict = {
            violation: true,
            severity: 'block',
            corrective_guidance: 'Use bullet points.',
            rule_id: 'bulleted-format'
        };
        const result = validator.retryIfNeeded(verdict, 3);
        assert.equal(result.shouldRetry, false);
        assert.ok(result.warning, 'Should include warning about max retries');
    });

    it('should return shouldRetry=false when no violation', () => {
        const verdict = { violation: false, severity: null };
        const result = validator.retryIfNeeded(verdict, 0);
        assert.equal(result.shouldRetry, false);
        assert.equal(result.warning, null);
    });

    it('should return shouldRetry=false on warn severity', () => {
        const verdict = {
            violation: true,
            severity: 'warn',
            corrective_guidance: 'Warning info.',
            rule_id: 'warn-rule'
        };
        const result = validator.retryIfNeeded(verdict, 0);
        assert.equal(result.shouldRetry, false);
    });
});
