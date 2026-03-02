/**
 * Tests for Debate Artifacts, Edge Cases, and Cross-Module Integration
 * Traces to: FR-005, FR-007, NFR-001, NFR-003, NFR-004, AC-005-01..AC-005-03, AC-007-01..AC-007-04
 * Feature: REQ-0016-multi-agent-design-team
 * Validation Rules: M5-V01..M5-V03 (isdlc.md) + cross-module integration checks
 *
 * Target files:
 *   - src/claude/commands/isdlc.md (M5)
 *   - src/claude/agents/00-sdlc-orchestrator.md (M1 -- edge cases)
 *   - src/claude/agents/03-design-critic.md (M2 -- artifact naming)
 *   - src/claude/agents/03-design-refiner.md (M3 -- artifact naming)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ISDLC_CMD_PATH = path.resolve(__dirname, '..', '..', 'commands', 'isdlc.md');
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');
const CRITIC_PATH = path.resolve(__dirname, '..', '..', 'agents', '03-design-critic.md');
const REFINER_PATH = path.resolve(__dirname, '..', '..', 'agents', '03-design-refiner.md');

describe('M5: isdlc.md Command Description Updates', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ISDLC_CMD_PATH), 'isdlc.md command file must exist');
            content = fs.readFileSync(ISDLC_CMD_PATH, 'utf8');
        }
        return content;
    }

    // TC-M5-01: Debate-enabled phases lists Phase 04 (Design) [M5-V01] traces: FR-003
    it('TC-M5-01: Debate-enabled phases lists Phase 04 (Design)', () => {
        const c = getContent();
        assert.ok(c.includes('Phase 04'), 'Must list Phase 04 as debate-enabled');
        assert.ok(c.includes('Design'), 'Must reference Design in debate-enabled phases');
    });

    // TC-M5-02: Phase 01 still listed [M5-V02] traces: NFR-003
    it('TC-M5-02: Phase 01 still listed in debate-enabled phases', () => {
        const c = getContent();
        assert.ok(c.includes('Phase 01'), 'Must still list Phase 01 as debate-enabled');
    });

    // TC-M5-03: Phase 03 still listed [M5-V03] traces: NFR-003
    it('TC-M5-03: Phase 03 still listed in debate-enabled phases', () => {
        const c = getContent();
        assert.ok(c.includes('Phase 03'), 'Must still list Phase 03 as debate-enabled');
    });
});

describe('Cross-Module: Debate Artifacts (FR-005)', () => {
    // TC-INT-01: Critique file naming in critic matches orchestrator expectation traces: AC-005-01
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

    // TC-INT-02: debate-summary.md referenced in orchestrator traces: AC-005-02
    it('TC-INT-02: debate-summary.md referenced in orchestrator', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(
            orchContent.includes('debate-summary.md'),
            'Orchestrator must reference debate-summary.md generation'
        );
    });

    // TC-INT-03: Design metrics in critic summary traces: AC-005-03
    it('TC-INT-03: Design metrics (5 metrics) in critic summary', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        assert.ok(criticContent.includes('API Endpoint Count'), 'Must include API Endpoint Count metric');
        assert.ok(criticContent.includes('Validation Rule Count'), 'Must include Validation Rule Count metric');
        assert.ok(criticContent.includes('Error Code Count'), 'Must include Error Code Count metric');
        assert.ok(criticContent.includes('Module Count'), 'Must include Module Count metric');
        assert.ok(criticContent.includes('Pattern Consistency Score'), 'Must include Pattern Consistency Score metric');
    });

    // TC-INT-04: Design metrics match FR-005 list traces: AC-005-03, FR-005
    it('TC-INT-04: All 5 design-specific metrics present in critic (FR-005 compliance)', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        const requiredMetrics = [
            'API Endpoint Count',
            'Validation Rule Count',
            'Error Code Count',
            'Module Count',
            'Pattern Consistency Score'
        ];
        for (const metric of requiredMetrics) {
            assert.ok(
                criticContent.includes(metric),
                `Missing design metric: ${metric}`
            );
        }
    });
});

describe('Cross-Module: Edge Cases (FR-007)', () => {
    // TC-INT-05: Missing critical artifact handling traces: AC-007-01
    it('TC-INT-05: Missing critical artifact handling documented in orchestrator', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const debateIdx = orchContent.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = orchContent.substring(debateIdx);

        assert.ok(
            debateSection.includes('single-agent') || debateSection.includes('fall back') ||
            debateSection.includes('Abort'),
            'Must document fallback to single-agent when critical artifact missing'
        );
    });

    // TC-INT-06: Malformed critique fail-open traces: AC-007-02
    it('TC-INT-06: Malformed critique treated as 0 BLOCKING (fail-open)', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const debateIdx = orchContent.indexOf('DEBATE LOOP ORCHESTRATION');
        const debateSection = orchContent.substring(debateIdx);

        assert.ok(
            debateSection.includes('Article X') || debateSection.includes('fail-open'),
            'Must reference Article X or fail-open for malformed critique handling'
        );
    });

    // TC-INT-07: Unconverged debate appends warning traces: AC-007-03
    it('TC-INT-07: Unconverged debate appends warning to critical artifact', () => {
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

    // TC-INT-08: Non-REST interface type adaptation traces: AC-007-04
    it('TC-INT-08: Non-REST interface type adaptation documented in critic', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        assert.ok(criticContent.includes('Interface Type'), 'Must contain Interface Type detection');
        assert.ok(criticContent.includes('REST'), 'Must reference REST interface type');
        assert.ok(criticContent.includes('CLI'), 'Must reference CLI interface type');
        assert.ok(criticContent.includes('Library'), 'Must reference Library interface type');
    });
});

describe('Cross-Module: Backward Compatibility (NFR-003)', () => {
    // TC-INT-09: Existing debate loop section still present
    it('TC-INT-09: Orchestrator still contains DEBATE LOOP ORCHESTRATION section', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(
            orchContent.includes('DEBATE LOOP ORCHESTRATION'),
            'Must still contain DEBATE LOOP ORCHESTRATION section (not renamed or removed)'
        );
    });

    // TC-INT-10: Phase 01 and Phase 03 routing still present
    it('TC-INT-10: Phase 01 and Phase 03 routing entries preserved', () => {
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(orchContent.includes('01-requirements-analyst.md'), 'Phase 01 creator mapping preserved');
        assert.ok(orchContent.includes('01-requirements-critic.md'), 'Phase 01 critic mapping preserved');
        assert.ok(orchContent.includes('01-requirements-refiner.md'), 'Phase 01 refiner mapping preserved');
        assert.ok(orchContent.includes('02-solution-architect.md'), 'Phase 03 creator mapping preserved');
        assert.ok(orchContent.includes('02-architecture-critic.md'), 'Phase 03 critic mapping preserved');
        assert.ok(orchContent.includes('02-architecture-refiner.md'), 'Phase 03 refiner mapping preserved');
    });

    // TC-INT-11: Refiner has never-remove rule
    it('TC-INT-11: Refiner preserves existing design decisions', () => {
        const refinerContent = fs.readFileSync(REFINER_PATH, 'utf8');
        assert.ok(
            refinerContent.includes('NEVER remove existing design decisions'),
            'Refiner must have rule preventing removal of existing decisions'
        );
    });
});

describe('Cross-Module: Constitutional Compliance (NFR-004)', () => {
    // TC-INT-12: Critic references 5 constitutional articles for compliance checks
    it('TC-INT-12: Critic checks constitutional articles I, IV, V, VII, IX', () => {
        const criticContent = fs.readFileSync(CRITIC_PATH, 'utf8');
        const referencedArticles = [
            criticContent.includes('Article I'),
            criticContent.includes('Article IV'),
            criticContent.includes('Article V'),
            criticContent.includes('Article VII'),
            criticContent.includes('Article IX')
        ];
        const articleCount = referencedArticles.filter(Boolean).length;
        assert.ok(
            articleCount >= 4,
            `Must reference at least 4 of the 5 applicable constitutional articles (found ${articleCount})`
        );
    });
});

describe('Cross-Module: Agent File Size (NFR-001)', () => {
    // TC-INT-13: New critic agent file under 15KB
    it('TC-INT-13: 03-design-critic.md is under 15KB', () => {
        const stats = fs.statSync(CRITIC_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `Critic file size ${stats.size} bytes exceeds 15KB limit`
        );
    });

    // TC-INT-14: New refiner agent file under 15KB
    it('TC-INT-14: 03-design-refiner.md is under 15KB', () => {
        const stats = fs.statSync(REFINER_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `Refiner file size ${stats.size} bytes exceeds 15KB limit`
        );
    });

    // TC-INT-15: isdlc.md command file exists
    it('TC-INT-15: isdlc.md command file exists', () => {
        assert.ok(fs.existsSync(ISDLC_CMD_PATH), 'isdlc.md must exist at expected path');
    });
});
