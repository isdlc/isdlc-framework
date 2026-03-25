'use strict';

/**
 * Unit Tests: Compliance Engine (engine.cjs)
 * ===========================================
 * Tests for loadRules() and evaluateRules() functions.
 * REQ-0140: Conversational enforcement via Stop hook.
 *
 * Covers: FR-001 (Rule Definition Schema), FR-005 (Built-in Rules)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Test setup: create temp directory and copy engine + rules for isolation
// ---------------------------------------------------------------------------

let testDir;
let engine;

function createTestDir() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-compliance-engine-test-'));
    // Create .isdlc/config/ dir
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

// ---------------------------------------------------------------------------
// Sample rules for testing
// ---------------------------------------------------------------------------

const VALID_BULLETED_RULE = {
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

const VALID_DOMAIN_RULE = {
    id: 'sequential-domain-confirmation',
    name: 'Sequential Domain Confirmation',
    trigger_condition: { state: 'confirmation_active', workflow: 'analyze' },
    check: {
        type: 'structural',
        detect: 'collapsed_domains',
        domains: ['Requirements', 'Architecture', 'Design']
    },
    corrective_guidance: 'Present one domain confirmation per message.',
    severity: 'block',
    provider_scope: 'both'
};

const VALID_ELICITATION_RULE = {
    id: 'elicitation-first',
    name: 'Elicitation Before Analysis',
    trigger_condition: { state: 'roundtable_start', workflow: 'analyze' },
    check: {
        type: 'state-match',
        detect: 'analysis_without_question',
        question_indicators: ['?'],
        completion_indicators: ['analysis complete', 'Accept or Amend']
    },
    corrective_guidance: 'Ask elicitation questions first.',
    severity: 'block',
    provider_scope: 'both'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compliance-engine: loadRules()', () => {
    before(() => {
        createTestDir();
        // Copy engine to temp dir
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        // Clear require cache to get fresh module
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-001-01: should load valid rules into normalized model', () => {
        const rulesPath = path.join(testDir, '.isdlc', 'config', 'conversational-rules.json');
        writeRulesFile([VALID_BULLETED_RULE, VALID_DOMAIN_RULE, VALID_ELICITATION_RULE]);
        const rules = engine.loadRules(rulesPath);
        assert.equal(rules.length, 3);
        assert.equal(rules[0].id, 'bulleted-format');
        assert.equal(rules[0].name, 'Bulleted Output Format');
        assert.equal(rules[0].severity, 'block');
        assert.equal(rules[0].provider_scope, 'both');
        assert.ok(rules[0].check);
        assert.ok(rules[0].corrective_guidance);
    });

    it('AC-001-04: should skip invalid rules (missing required fields) with warning', () => {
        const invalidRule = { id: 'bad-rule' }; // Missing name, check, etc.
        writeRulesFile([VALID_BULLETED_RULE, invalidRule]);
        const rulesPath = path.join(testDir, '.isdlc', 'config', 'conversational-rules.json');
        const rules = engine.loadRules(rulesPath);
        assert.equal(rules.length, 1);
        assert.equal(rules[0].id, 'bulleted-format');
    });

    it('AC-001-05: should return empty array when no rules file exists', () => {
        const rules = engine.loadRules(path.join(testDir, 'nonexistent', 'rules.json'));
        assert.ok(Array.isArray(rules));
        assert.equal(rules.length, 0);
    });

    it('should return empty array for malformed JSON', () => {
        const badPath = path.join(testDir, '.isdlc', 'config', 'bad-rules.json');
        fs.writeFileSync(badPath, '{ not valid json !!!');
        const rules = engine.loadRules(badPath);
        assert.ok(Array.isArray(rules));
        assert.equal(rules.length, 0);
    });

    it('should return empty array when rules file has no rules array', () => {
        const noArrayPath = path.join(testDir, '.isdlc', 'config', 'no-array.json');
        fs.writeFileSync(noArrayPath, JSON.stringify({ version: '1.0.0' }));
        const rules = engine.loadRules(noArrayPath);
        assert.ok(Array.isArray(rules));
        assert.equal(rules.length, 0);
    });
});

describe('compliance-engine: evaluateRules() - provider scope filtering', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-001-03: should skip rules with provider_scope "codex" when provider is "claude"', () => {
        const codexOnlyRule = { ...VALID_BULLETED_RULE, provider_scope: 'codex' };
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'This is a prose paragraph without bullets. It continues as prose. More prose here. Even more prose content. Still prose.';
        const verdict = engine.evaluateRules(proseResponse, [codexOnlyRule], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should evaluate rules with provider_scope "both" for either provider', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'This is all prose.\nMore prose here.\nStill more prose.\nEven more.\nAnd more.';
        const verdictClaude = engine.evaluateRules(proseResponse, [VALID_BULLETED_RULE], config, null, 'claude');
        const verdictCodex = engine.evaluateRules(proseResponse, [VALID_BULLETED_RULE], config, null, 'codex');
        assert.equal(verdictClaude.violation, true);
        assert.equal(verdictCodex.violation, true);
    });

    it('should skip rules with provider_scope "claude" when provider is "codex"', () => {
        const claudeOnlyRule = { ...VALID_BULLETED_RULE, provider_scope: 'claude' };
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'This is prose without bullets.\nMore prose.\nStill prose.\nProse again.\nAnd again.';
        const verdict = engine.evaluateRules(proseResponse, [claudeOnlyRule], config, null, 'codex');
        assert.equal(verdict.violation, false);
    });
});

describe('compliance-engine: evaluateRules() - trigger condition filtering', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-001-02: should skip rule when config condition not met (verbosity != bulleted)', () => {
        const config = { verbosity: 'conversational' };
        const proseResponse = 'All prose.\nMore prose.\nStill prose.\nProse again.\nAnd again.';
        const verdict = engine.evaluateRules(proseResponse, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should evaluate rule when config condition is met', () => {
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'All prose.\nMore prose.\nStill prose.\nProse again.\nAnd again.';
        const verdict = engine.evaluateRules(proseResponse, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.rule_id, 'bulleted-format');
    });

    it('should skip state-dependent rules when roundtable state is null', () => {
        const config = {};
        const response = 'Some text.';
        const verdict = engine.evaluateRules(response, [VALID_DOMAIN_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should evaluate domain confirmation rule when state is confirmation_active', () => {
        const config = {};
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        // Collapsed: mentions both Architecture and Design confirmations
        const response = '**Requirements**: Accept or Amend?\n\n**Architecture**: Accept or Amend?\n\n**Design**: Accept or Amend?';
        const verdict = engine.evaluateRules(response, [VALID_DOMAIN_RULE], config, state, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.rule_id, 'sequential-domain-confirmation');
    });
});

describe('compliance-engine: evaluateRules() - bulleted format check', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    const config = { verbosity: 'bulleted' };

    it('AC-005-01: should pass when response is properly bulleted', () => {
        const response = [
            '## Requirements',
            '',
            '- First point about the feature',
            '- Second point about the feature',
            '- Third point about the feature',
            '',
            '**Question**: What do you think?'
        ].join('\n');
        const verdict = engine.evaluateRules(response, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect prose paragraphs exceeding threshold', () => {
        const response = [
            'This is a prose paragraph that goes on and on.',
            'Another prose paragraph with more content.',
            'Yet another paragraph of prose.',
            'Still more prose here.',
            'And even more prose.'
        ].join('\n');
        const verdict = engine.evaluateRules(response, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.severity, 'block');
    });

    it('should allow headings, tables, code blocks as non-prose', () => {
        const response = [
            '## Heading',
            '',
            '| Col1 | Col2 |',
            '|------|------|',
            '| val1 | val2 |',
            '',
            '```javascript',
            'const x = 1;',
            '```',
            '',
            '- A bullet point',
            '- Another bullet point'
        ].join('\n');
        const verdict = engine.evaluateRules(response, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should handle response with mix below threshold', () => {
        // 1 prose line out of 5 non-empty = 20%, below 30% threshold
        const response = [
            '- Bullet one',
            '- Bullet two',
            '- Bullet three',
            '- Bullet four',
            'One prose line here'
        ].join('\n');
        const verdict = engine.evaluateRules(response, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

describe('compliance-engine: evaluateRules() - domain confirmation check', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-005-02: should pass single-domain confirmation message', () => {
        const config = {};
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = '**Requirements**:\n\n- Point one\n- Point two\n\nAccept or Amend?';
        const verdict = engine.evaluateRules(response, [VALID_DOMAIN_RULE], config, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('AC-005-04: should detect collapsed multi-domain confirmation', () => {
        const config = {};
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = '**Requirements**: Here are the requirements.\n\nAccept or Amend?\n\n**Architecture**: Here is the architecture.\n\nAccept or Amend?';
        const verdict = engine.evaluateRules(response, [VALID_DOMAIN_RULE], config, state, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.rule_id, 'sequential-domain-confirmation');
    });

    it('AC-005-05: should validate confirmation matches current state', () => {
        const config = {};
        const state = { confirmation_state: 'PRESENTING_ARCHITECTURE' };
        // Only Architecture confirmation should be valid here
        const response = '**Architecture**:\n\n- Design decision one\n- Design decision two\n\nAccept or Amend?';
        const verdict = engine.evaluateRules(response, [VALID_DOMAIN_RULE], config, state, 'claude');
        assert.equal(verdict.violation, false);
    });
});

describe('compliance-engine: evaluateRules() - elicitation-first check', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-005-03: should pass when response contains elicitation question', () => {
        const config = {};
        const state = { confirmation_state: 'IDLE' };
        const response = 'Let me start the analysis. What are the key requirements you want to focus on?';
        const verdict = engine.evaluateRules(response, [VALID_ELICITATION_RULE], config, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect analysis-complete without question', () => {
        const config = {};
        const state = { confirmation_state: 'IDLE' };
        const response = 'Here is the complete analysis of the feature. All requirements have been documented. Accept or Amend';
        const verdict = engine.evaluateRules(response, [VALID_ELICITATION_RULE], config, state, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.rule_id, 'elicitation-first');
    });

    it('should pass when no completion indicator is present', () => {
        const config = {};
        const state = { confirmation_state: 'IDLE' };
        const response = 'Let me think about this feature. I have some initial thoughts about the design.';
        const verdict = engine.evaluateRules(response, [VALID_ELICITATION_RULE], config, state, 'claude');
        assert.equal(verdict.violation, false);
    });
});

describe('compliance-engine: evaluateRules() - verdict construction', () => {
    before(() => {
        createTestDir();
        const engineSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'engine.cjs');
        const engineDest = path.join(testDir, 'engine.cjs');
        fs.copyFileSync(engineSrc, engineDest);
        delete require.cache[engineDest];
        engine = require(engineDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('should return no-violation verdict when all rules pass', () => {
        const config = { verbosity: 'bulleted' };
        const response = '- Bullet one\n- Bullet two\n- Bullet three';
        const verdict = engine.evaluateRules(response, [VALID_BULLETED_RULE], config, null, 'claude');
        assert.equal(verdict.violation, false);
        assert.equal(verdict.rule_id, null);
        assert.equal(verdict.severity, null);
        assert.equal(verdict.corrective_guidance, null);
        assert.ok(Array.isArray(verdict.all_violations));
        assert.equal(verdict.all_violations.length, 0);
    });

    it('should return highest-severity violation when multiple violations', () => {
        const warnRule = {
            ...VALID_BULLETED_RULE,
            id: 'warn-rule',
            severity: 'warn',
            trigger_condition: { config: 'verbosity', value: 'bulleted' }
        };
        const blockRule = {
            ...VALID_BULLETED_RULE,
            id: 'block-rule',
            severity: 'block',
            trigger_condition: { config: 'verbosity', value: 'bulleted' }
        };
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose line one.\nProse line two.\nProse line three.\nProse line four.\nProse line five.';
        const verdict = engine.evaluateRules(proseResponse, [warnRule, blockRule], config, null, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.severity, 'block');
        assert.equal(verdict.rule_id, 'block-rule');
    });

    it('should collect all violations in all_violations array', () => {
        const rule1 = {
            ...VALID_BULLETED_RULE,
            id: 'rule-1',
            severity: 'warn',
            trigger_condition: { config: 'verbosity', value: 'bulleted' }
        };
        const rule2 = {
            ...VALID_BULLETED_RULE,
            id: 'rule-2',
            severity: 'block',
            trigger_condition: { config: 'verbosity', value: 'bulleted' }
        };
        const config = { verbosity: 'bulleted' };
        const proseResponse = 'Prose line one.\nProse line two.\nProse line three.\nProse line four.\nProse line five.';
        const verdict = engine.evaluateRules(proseResponse, [rule1, rule2], config, null, 'claude');
        assert.equal(verdict.all_violations.length, 2);
    });

    it('should return empty verdict for empty rule set', () => {
        const verdict = engine.evaluateRules('Any response', [], {}, null, 'claude');
        assert.equal(verdict.violation, false);
        assert.equal(verdict.all_violations.length, 0);
    });
});
