'use strict';

/**
 * Unit Tests: Prose Rule Extractor
 * ==================================
 * Tests for extractRules() that parses CLAUDE.md and agent files.
 *
 * REQ-0140: Conversational enforcement via Stop hook.
 * Covers: FR-002 (Rule Extraction from Prose)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let testDir;
let extractor;

function createTestDir() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-extractor-test-'));
}

function cleanTestDir() {
    if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
}

describe('prose-extractor: extractRules()', () => {
    before(() => {
        createTestDir();
        const extractorSrc = path.resolve(__dirname, '..', '..', '..', 'core', 'compliance', 'extractors', 'prose-extractor.cjs');
        const extractorDest = path.join(testDir, 'prose-extractor.cjs');
        fs.copyFileSync(extractorSrc, extractorDest);
        delete require.cache[extractorDest];
        extractor = require(extractorDest);
    });

    after(() => {
        cleanTestDir();
    });

    it('AC-002-01: should identify enforceable rules from CLAUDE.md content', () => {
        const claudeMd = path.join(testDir, 'CLAUDE.md');
        fs.writeFileSync(claudeMd, [
            '# Analysis Completion Rules',
            '',
            '**CRITICAL**: You MUST present confirmations sequentially per domain.',
            '',
            'NEVER collapse into a single combined confirmation.',
            '',
            '## Other Section',
            '',
            'Some regular text without constraints.'
        ].join('\n'));

        const rules = extractor.extractRules([claudeMd]);
        assert.ok(rules.length >= 2, `Expected at least 2 rules, got ${rules.length}`);

        // Check that constraints were found
        const criticalRule = rules.find(r => r.source_line.includes('MUST'));
        assert.ok(criticalRule, 'Should find MUST constraint');
        const neverRule = rules.find(r => r.source_line.includes('NEVER'));
        assert.ok(neverRule, 'Should find NEVER constraint');
    });

    it('AC-002-02: should extract rules from agent files', () => {
        const agentFile = path.join(testDir, 'roundtable-analyst.md');
        fs.writeFileSync(agentFile, [
            '# Roundtable Analyst',
            '',
            '## State Machine',
            '',
            'PRESENTING_REQUIREMENTS MUST precede PRESENTING_ARCHITECTURE.',
            '',
            '## Format Rules',
            '',
            'You MUST ALWAYS use bulleted format when verbosity is set to bulleted.'
        ].join('\n'));

        const rules = extractor.extractRules([agentFile]);
        assert.ok(rules.length >= 2, `Expected at least 2 rules from agent file`);
        assert.equal(rules[0].source, 'roundtable-analyst.md');
    });

    it('AC-002-03: should skip rules that conflict with manually authored rules', () => {
        const claudeMd = path.join(testDir, 'CLAUDE-dedup.md');
        fs.writeFileSync(claudeMd, [
            '# Rules',
            '',
            'You MUST use bullet formatting.',
            'NEVER skip elicitation questions.'
        ].join('\n'));

        // First extract to get IDs
        const firstRun = extractor.extractRules([claudeMd]);
        const firstId = firstRun[0].id;

        // Second extract with the first ID as existing
        const secondRun = extractor.extractRules([claudeMd], { existingRuleIds: [firstId] });
        assert.equal(secondRun.length, firstRun.length - 1, 'Should skip one conflicting rule');
    });

    it('AC-002-04: should extract rules from AGENTS.md', () => {
        const agentsMd = path.join(testDir, 'AGENTS.md');
        fs.writeFileSync(agentsMd, [
            '# AGENTS',
            '',
            '## Behavioral Constraints',
            '',
            'Agents MUST NOT produce output in non-bulleted format when verbosity is bulleted.'
        ].join('\n'));

        const rules = extractor.extractRules([agentsMd]);
        assert.ok(rules.length >= 1);
        assert.equal(rules[0].source, 'AGENTS.md');
    });

    it('AC-002-05: should set severity to warn on all extracted rules', () => {
        const file = path.join(testDir, 'rules-severity.md');
        fs.writeFileSync(file, 'You MUST follow this rule.\nNEVER break this rule.');

        const rules = extractor.extractRules([file]);
        for (const rule of rules) {
            assert.equal(rule.severity, 'warn', `Rule ${rule.id} should have severity "warn"`);
        }
    });

    it('should return empty array for nonexistent files', () => {
        const rules = extractor.extractRules(['/nonexistent/path.md']);
        assert.ok(Array.isArray(rules));
        assert.equal(rules.length, 0);
    });

    it('should return empty array for files without constraints', () => {
        const file = path.join(testDir, 'no-constraints.md');
        fs.writeFileSync(file, 'This is a regular file.\nIt has no behavioral constraints.\nJust normal text.');

        const rules = extractor.extractRules([file]);
        assert.equal(rules.length, 0);
    });

    it('should handle multiple files', () => {
        const file1 = path.join(testDir, 'file1.md');
        const file2 = path.join(testDir, 'file2.md');
        fs.writeFileSync(file1, 'You MUST do this.');
        fs.writeFileSync(file2, 'NEVER do that.');

        const rules = extractor.extractRules([file1, file2]);
        assert.ok(rules.length >= 2);
        const sources = new Set(rules.map(r => r.source));
        assert.ok(sources.has('file1.md'));
        assert.ok(sources.has('file2.md'));
    });
});
