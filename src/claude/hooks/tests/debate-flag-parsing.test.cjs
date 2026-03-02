/**
 * Tests for Flag Parsing (Module M5)
 * Traces to: FR-005, AC-005-01..05
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ISDLC_CMD_PATH = path.resolve(__dirname, '..', '..', 'commands', 'isdlc.md');

describe('M5: Flag Parsing (isdlc.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ISDLC_CMD_PATH), 'isdlc.md command file must exist');
            content = fs.readFileSync(ISDLC_CMD_PATH, 'utf8');
        }
        return content;
    }

    // TC-M5-01: --debate flag documented
    it('TC-M5-01: --debate flag documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('--debate'),
            'Must contain --debate flag documentation'
        );
    });

    // TC-M5-02: --no-debate flag documented
    it('TC-M5-02: --no-debate flag documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('--no-debate'),
            'Must contain --no-debate flag documentation'
        );
    });

    // TC-M5-03: Flag precedence rules documented
    it('TC-M5-03: Flag precedence rules documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('precedence') && lower.includes('debate'),
            'Must contain flag precedence ordering for debate flags'
        );
    });

    // TC-M5-04: --no-debate wins over --debate
    it('TC-M5-04: --no-debate wins over --debate', () => {
        const c = getContent();
        assert.ok(
            c.includes('--no-debate') && (c.includes('wins') || c.includes('always wins')),
            'Must document that --no-debate wins over --debate'
        );
    });

    // TC-M5-05: -light implies no debate
    it('TC-M5-05: -light implies no debate', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('-light') && lower.includes('no-debate') ||
            lower.includes('-light') && lower.includes('debate off') ||
            lower.includes('light') && lower.includes('implies'),
            'Must document that -light implies no debate'
        );
    });

    // TC-M5-06: Conflict resolution documented
    it('TC-M5-06: Conflict resolution documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('conflict') && lower.includes('resolution') ||
            lower.includes('both') && lower.includes('--debate') && lower.includes('--no-debate'),
            'Must contain conflict resolution rule'
        );
    });

    // TC-M5-07: FLAGS block passed to orchestrator
    it('TC-M5-07: FLAGS block passed to orchestrator', () => {
        const c = getContent();
        assert.ok(
            c.includes('debate') && (c.includes('flags') || c.includes('FLAGS')),
            'Must contain debate flag passing to orchestrator'
        );
    });

    // TC-M5-08: debate_mode field written to state.json
    it('TC-M5-08: debate_mode field referenced', () => {
        const c = getContent();
        assert.ok(
            c.includes('debate_mode') || c.includes('debate') && c.includes('state'),
            'Must reference debate_mode or state.json debate field'
        );
    });

    // TC-M5-09: Standard sizing default documented
    it('TC-M5-09: Standard sizing default documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('standard') && lower.includes('debate'),
            'Must document standard sizing defaults to debate ON'
        );
    });

    // TC-M5-10: --debate overrides -light documented
    it('TC-M5-10: --debate overrides -light documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('--debate') && c.includes('-light'),
            'Must contain --debate and -light interaction documentation'
        );
    });
});
