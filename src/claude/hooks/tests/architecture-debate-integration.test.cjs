/**
 * Tests for Debate Artifacts, Edge Cases, and Cross-Module Integration
 * Traces to: FR-006, FR-007, NFR-001, NFR-003, NFR-004, AC-006-01..AC-006-03, AC-007-01..AC-007-03
 * Feature: REQ-0015-multi-agent-architecture-team
 * Validation Rules: M5-V01..M5-V04 (isdlc.md) + cross-module integration checks
 *
 * Target files:
 *   - src/claude/commands/isdlc.md (M5)
 *   - src/claude/agents/00-sdlc-orchestrator.md (M1 -- edge cases)
 *   - src/claude/agents/02-architecture-critic.md (M2 -- artifact naming)
 *   - src/claude/agents/02-architecture-refiner.md (M3 -- artifact naming)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ISDLC_CMD_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'commands', 'isdlc.md');
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '00-sdlc-orchestrator.md');
const CRITIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '02-architecture-critic.md');
const REFINER_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '02-architecture-refiner.md');

describe('M5: isdlc.md Command Description Updates', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ISDLC_CMD_PATH), 'isdlc.md command file must exist');
            content = fs.readFileSync(ISDLC_CMD_PATH, 'utf8');
        }
        return content;
    }

    // TC-M5-01: --debate description updated from requirements-only [M5-V01] traces: FR-003
    it('TC-M5-01: --debate description no longer says requirements-only scope', () => {
        const c = getContent();
        assert.ok(
            !c.includes('Force debate mode ON (multi-agent requirements team)'),
            'Must NOT contain old requirements-only --debate description'
        );
    });

    // TC-M5-02: --debate description covers both phases [M5-V02] traces: FR-003
    it('TC-M5-02: --debate description covers both requirements and architecture', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('requirements') && lower.includes('architecture'),
            'Must reference both requirements and architecture in debate mode description'
        );
    });

    // TC-M5-03: --no-debate description mentions single-agent [M5-V03] traces: FR-003
    it('TC-M5-03: --no-debate description mentions single-agent mode', () => {
        const c = getContent();
        assert.ok(
            c.includes('single-agent'),
            'Must contain single-agent in --no-debate description'
        );
    });

    // TC-M5-04: Debate-enabled phases listed [M5-V04] traces: FR-003
    it('TC-M5-04: Debate-enabled phases listed (Phase 01 and Phase 03)', () => {
        const c = getContent();
        assert.ok(c.includes('Phase 01'), 'Must list Phase 01 as debate-enabled');
        assert.ok(c.includes('Phase 03'), 'Must list Phase 03 as debate-enabled');
    });
});

describe('Cross-Module: Debate Artifacts (FR-006)', () => {
    // TC-INT-01: Critique file naming in critic matches orchestrator expectation traces: AC-006-01
    it('TC-INT-01: Critic output naming matches orchestrator parse expectation', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');

        // Both must reference round-N-critique.md pattern
        assert.ok(
            criticContent.includes('round-') && criticContent.includes('critique'),
            'Critic must reference round-N-critique.md output'
        );
        assert.ok(
            orchContent.includes('round-') && orchContent.includes('critique'),
            'Orchestrator must reference round-N-critique.md for parsing'
        );
    });

    // TC-INT-02: debate-summary.md referenced in orchestrator traces: AC-006-02
    it('TC-INT-02: debate-summary.md referenced in orchestrator', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(
            orchContent.includes('debate-summary.md'),
            'Orchestrator must reference debate-summary.md generation'
        );
    });

    // TC-INT-03: Architecture metrics in critic summary traces: AC-006-03
    it('TC-INT-03: Architecture metrics (ADR Count, Threat Coverage, NFR Alignment Score) in critic', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        assert.ok(criticContent.includes('ADR Count'), 'Must include ADR Count metric');
        assert.ok(criticContent.includes('Threat Coverage'), 'Must include Threat Coverage metric');
        assert.ok(criticContent.includes('NFR Alignment Score'), 'Must include NFR Alignment Score metric');
    });
});

describe('Cross-Module: Edge Cases (FR-007)', () => {
    // TC-INT-04: Missing critical artifact handling traces: AC-007-01
    it('TC-INT-04: Missing critical artifact triggers single-agent fallback', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const debateIdx = orchContent.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = orchContent.substring(debateIdx);

        assert.ok(
            debateSection.includes('architecture-overview.md'),
            'Must reference architecture-overview.md as critical artifact'
        );
        assert.ok(
            debateSection.includes('single-agent') || debateSection.includes('fall back') ||
            debateSection.includes('Abort'),
            'Must document fallback to single-agent when critical artifact missing'
        );
    });

    // TC-INT-05: Malformed critique fail-open traces: AC-007-02
    it('TC-INT-05: Malformed critique treated as 0 BLOCKING (fail-open)', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const debateIdx = orchContent.indexOf('DEBATE LOOP ORCHESTRATION');
        const debateSection = orchContent.substring(debateIdx);

        assert.ok(
            debateSection.includes('Article X') || debateSection.includes('fail-open'),
            'Must reference Article X or fail-open for malformed critique handling'
        );
    });

    // TC-INT-06: Unconverged debate appends warning traces: AC-007-03
    it('TC-INT-06: Unconverged debate appends warning to critical artifact', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const debateIdx = orchContent.indexOf('DEBATE LOOP ORCHESTRATION');
        const debateSection = orchContent.substring(debateIdx);

        assert.ok(
            debateSection.includes('did not converge') || debateSection.includes('unconverged'),
            'Must document unconverged debate warning'
        );
        assert.ok(
            debateSection.includes('BLOCKING') && debateSection.includes('remain'),
            'Must note remaining BLOCKING findings in unconverged warning'
        );
    });
});

describe('Cross-Module: Backward Compatibility (NFR-003)', () => {
    // TC-INT-07: Existing Phase 01 debate tests must not be broken by orchestrator changes
    it('TC-INT-07: Orchestrator still contains DEBATE LOOP ORCHESTRATION section', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(
            orchContent.includes('DEBATE LOOP ORCHESTRATION'),
            'Must still contain DEBATE LOOP ORCHESTRATION section (not renamed or removed)'
        );
    });

    // TC-INT-08: Phase 01 routing still present after generalization
    it('TC-INT-08: Phase 01 routing entries preserved after generalization', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(orchContent.includes('01-requirements-analyst.md'), 'Phase 01 creator mapping preserved');
        assert.ok(orchContent.includes('01-requirements-critic.md'), 'Phase 01 critic mapping preserved');
        assert.ok(orchContent.includes('01-requirements-refiner.md'), 'Phase 01 refiner mapping preserved');
    });

    // TC-INT-09: Refiner has never-remove rule (prevents accidental deletion of existing content)
    it('TC-INT-09: Refiner preserves existing architectural decisions', () => {
        const refinerContent = fs.readFileSync(REFINER_PATH, 'utf8');
        assert.ok(
            refinerContent.includes('NEVER remove existing architectural decisions'),
            'Refiner must have rule preventing removal of existing decisions'
        );
    });
});

describe('Cross-Module: Constitutional Compliance (NFR-004)', () => {
    // TC-INT-10: Critic references constitutional articles for compliance checks
    it('TC-INT-10: Critic checks constitutional articles III, IV, V, VII, IX, X', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        // At minimum, must reference some of the applicable articles
        const referencedArticles = [
            criticContent.includes('Article III'),
            criticContent.includes('Article IV'),
            criticContent.includes('Article V'),
            criticContent.includes('Article VII'),
            criticContent.includes('Article IX'),
            criticContent.includes('Article X')
        ];
        const articleCount = referencedArticles.filter(Boolean).length;
        assert.ok(
            articleCount >= 3,
            `Must reference at least 3 of the 6 applicable constitutional articles (found ${articleCount})`
        );
    });
});

describe('Cross-Module: Agent File Size (NFR-001)', () => {
    // TC-INT-11: New critic agent file under 15KB
    it('TC-INT-11: 02-architecture-critic.md is under 15KB', () => {
        const stats = fs.statSync(CRITIC_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `Critic file size ${stats.size} bytes exceeds 15KB limit`
        );
    });

    // TC-INT-12: New refiner agent file under 15KB
    it('TC-INT-12: 02-architecture-refiner.md is under 15KB', () => {
        const stats = fs.statSync(REFINER_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `Refiner file size ${stats.size} bytes exceeds 15KB limit`
        );
    });

    // TC-INT-13: isdlc.md command file exists
    it('TC-INT-13: isdlc.md command file exists', () => {
        assert.ok(fs.existsSync(ISDLC_CMD_PATH), 'isdlc.md must exist at expected path');
    });
});
