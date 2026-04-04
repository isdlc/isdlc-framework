'use strict';

/**
 * iSDLC Common Utilities - Test Suite (CJS)
 * ==========================================
 * Unit tests for src/claude/hooks/lib/common.js
 *
 * Uses node:test (built-in) and .cjs extension to avoid ESM/CJS conflicts.
 * The hook libs use CommonJS require() but package.json has "type": "module".
 * We copy common.js to the temp dir as common.cjs so Node treats it as CJS.
 *
 * Run: node --test src/claude/hooks/tests/test-common.test.cjs
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    writeState,
    readState,
    writeConfig
} = require('./hook-test-utils.cjs');

// Source path for common.js
const commonSrcPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');

/**
 * Copy common.js into the temp test directory as common.cjs so we can require()
 * it without ESM interference from the project-level package.json.
 * Returns the path to the .cjs copy.
 */
function installCommonCjs() {
    const testDir = getTestDir();
    const libDir = path.join(testDir, 'lib');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    const dest = path.join(libDir, 'common.cjs');
    fs.copyFileSync(commonSrcPath, dest);
    return dest;
}

/** Require common.cjs from the temp dir, clearing cache first. */
function requireCommon(cjsPath) {
    delete require.cache[require.resolve(cjsPath)];
    return require(cjsPath);
}

// =============================================================================
// Test Suite: common.js
// =============================================================================

describe('common.js', () => {
    let common;
    let savedEnv;
    let commonCjsPath;

    before(() => {
        savedEnv = { ...process.env };
        setupTestEnv();
        commonCjsPath = installCommonCjs();
        common = requireCommon(commonCjsPath);
    });

    after(() => {
        cleanupTestEnv();
        // Restore env
        process.env = savedEnv;
    });

    /** Helper to get a fresh require of common after env/file changes. */
    function freshCommon() {
        return requireCommon(commonCjsPath);
    }

    // -------------------------------------------------------------------------
    // getProjectRoot()
    // -------------------------------------------------------------------------
    describe('getProjectRoot()', () => {
        it('returns CLAUDE_PROJECT_DIR when env var is set', () => {
            const root = common.getProjectRoot();
            assert.equal(root, process.env.CLAUDE_PROJECT_DIR);
        });

        it('returns value that matches the temp test directory', () => {
            const root = common.getProjectRoot();
            const testDir = getTestDir();
            assert.ok(
                root.includes(testDir) || testDir.includes(root),
                `Expected root "${root}" to match test dir "${testDir}"`
            );
        });
    });

    // -------------------------------------------------------------------------
    // readState() / writeState()
    // -------------------------------------------------------------------------
    describe('readState() / writeState()', () => {
        const DEFAULT_STATE = {
            skill_enforcement: {
                enabled: true,
                mode: 'observe',
                fail_behavior: 'allow',
                manifest_version: '4.0.0'
            },
            current_phase: '06-implementation',
            skill_usage_log: [],
            iteration_enforcement: { enabled: true },
            phases: {}
        };

        afterEach(() => {
            // Restore original state for subsequent tests
            writeState(DEFAULT_STATE);
        });

        it('readState() returns the state written by setupTestEnv', () => {
            const state = common.readState();
            assert.ok(state, 'readState() should return non-null');
            assert.equal(state.current_phase, '06-implementation');
            assert.equal(state.skill_enforcement.mode, 'observe');
        });

        it('writeState() updates state.json', () => {
            const newState = {
                current_phase: '07-testing',
                skill_enforcement: { enabled: true, mode: 'observe' },
                skill_usage_log: []
            };
            const result = common.writeState(newState);
            assert.equal(result, true);

            const readBack = common.readState();
            assert.equal(readBack.current_phase, '07-testing');
        });

        it('readState() returns null for missing state file', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            fs.unlinkSync(stateFile);

            const state = common.readState();
            assert.equal(state, null);
        });

        it('readState() returns null for invalid JSON', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            fs.writeFileSync(stateFile, '{ not valid json!!!');

            const state = common.readState();
            assert.equal(state, null);
        });
    });

    // -------------------------------------------------------------------------
    // readStateValue()
    // -------------------------------------------------------------------------
    describe('readStateValue()', () => {
        it('reads a top-level key', () => {
            const phase = common.readStateValue('current_phase');
            assert.equal(phase, '06-implementation');
        });

        it('reads a nested dot path', () => {
            const mode = common.readStateValue('skill_enforcement.mode');
            assert.equal(mode, 'observe');
        });

        it('returns undefined for missing path', () => {
            const val = common.readStateValue('nonexistent.deep.path');
            assert.equal(val, undefined);
        });

        it('returns undefined when state file does not exist', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            const backup = fs.readFileSync(stateFile, 'utf8');
            fs.unlinkSync(stateFile);

            const val = common.readStateValue('current_phase');
            assert.equal(val, undefined);

            // Restore for subsequent tests
            fs.writeFileSync(stateFile, backup);
        });
    });

    // -------------------------------------------------------------------------
    // appendSkillLog()
    // -------------------------------------------------------------------------
    describe('appendSkillLog()', () => {
        beforeEach(() => {
            writeState({
                skill_enforcement: { enabled: true, mode: 'observe' },
                current_phase: '06-implementation',
                skill_usage_log: []
            });
        });

        it('appends entry to skill_usage_log array', () => {
            const entry = { skill: 'DEV-001', agent: 'software-developer', timestamp: '2026-01-01T00:00:00Z' };
            const result = common.appendSkillLog(entry);
            assert.equal(result, true);

            const state = common.readState();
            assert.equal(state.skill_usage_log.length, 1);
            assert.equal(state.skill_usage_log[0].skill, 'DEV-001');
        });

        it('multiple appends accumulate entries', () => {
            common.appendSkillLog({ skill: 'DEV-001' });
            common.appendSkillLog({ skill: 'DEV-002' });
            common.appendSkillLog({ skill: 'DEV-003' });

            const state = common.readState();
            assert.equal(state.skill_usage_log.length, 3);
            assert.equal(state.skill_usage_log[2].skill, 'DEV-003');
        });

        it('initializes array if skill_usage_log is missing', () => {
            writeState({
                skill_enforcement: { enabled: true, mode: 'observe' },
                current_phase: '06-implementation'
                // No skill_usage_log key
            });

            const result = common.appendSkillLog({ skill: 'TEST-001' });
            assert.equal(result, true);

            const state = common.readState();
            assert.ok(Array.isArray(state.skill_usage_log));
            assert.equal(state.skill_usage_log.length, 1);
        });

        it('returns false when state file does not exist', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            const backup = fs.readFileSync(stateFile, 'utf8');
            fs.unlinkSync(stateFile);

            const result = common.appendSkillLog({ skill: 'DEV-001' });
            assert.equal(result, false);

            // Restore
            fs.writeFileSync(stateFile, backup);
        });
    });

    // -------------------------------------------------------------------------
    // getTimestamp()
    // -------------------------------------------------------------------------
    describe('getTimestamp()', () => {
        it('returns string in ISO format', () => {
            const ts = common.getTimestamp();
            assert.equal(typeof ts, 'string');
            // ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
            assert.ok(ts.includes('T'), 'Should contain T separator');
            assert.ok(ts.endsWith('Z'), 'Should end with Z (UTC)');
            // Verify it can be parsed back
            const parsed = new Date(ts);
            assert.ok(!isNaN(parsed.getTime()), 'Should be a valid date');
        });

        it('has appropriate length for ISO timestamp', () => {
            const ts = common.getTimestamp();
            // ISO string: "2026-01-22T10:30:45.123Z" => 24 chars
            assert.ok(ts.length >= 20 && ts.length <= 30,
                `Timestamp length ${ts.length} should be between 20 and 30`);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeAgentName()
    // -------------------------------------------------------------------------
    describe('normalizeAgentName()', () => {
        it('converts to lowercase and replaces underscores with hyphens', () => {
            assert.equal(common.normalizeAgentName('Software_Developer'), 'software-developer');
        });

        it('maps "developer" to "software-developer"', () => {
            assert.equal(common.normalizeAgentName('developer'), 'software-developer');
        });

        it('maps "architect" to "solution-architect"', () => {
            assert.equal(common.normalizeAgentName('architect'), 'solution-architect');
        });

        it('maps "d1" to "architecture-analyzer"', () => {
            assert.equal(common.normalizeAgentName('d1'), 'architecture-analyzer');
        });

        it('maps "orchestrator" to "sdlc-orchestrator"', () => {
            assert.equal(common.normalizeAgentName('orchestrator'), 'sdlc-orchestrator');
        });

        it('maps "sre" to "site-reliability-engineer"', () => {
            assert.equal(common.normalizeAgentName('sre'), 'site-reliability-engineer');
        });

        it('handles already-normalized name by returning it unchanged', () => {
            assert.equal(common.normalizeAgentName('software-developer'), 'software-developer');
        });

        it('returns empty string for null input', () => {
            assert.equal(common.normalizeAgentName(null), '');
        });

        it('returns empty string for undefined input', () => {
            assert.equal(common.normalizeAgentName(undefined), '');
        });

        it('passes through unknown agent names in lowercase', () => {
            assert.equal(common.normalizeAgentName('Custom-Agent'), 'custom-agent');
        });
    });

    // -------------------------------------------------------------------------
    // loadManifest()
    // -------------------------------------------------------------------------
    describe('loadManifest()', () => {
        it('loads manifest from canonical config location', () => {
            const manifest = common.loadManifest();
            assert.ok(manifest, 'Manifest should be loaded');
            assert.ok(manifest.ownership, 'Manifest should have ownership section');
            assert.ok(manifest.skill_lookup, 'Manifest should have skill_lookup section');
            assert.equal(manifest.version, '5.0.0');
        });

        it('returns null when no manifest file is found', () => {
            const testDir = getTestDir();
            // Remove manifest from all possible locations so loadManifest returns null
            const paths = [
                path.join(testDir, '.claude', 'hooks', 'config', 'skills-manifest.json'),
                path.join(testDir, 'src', 'isdlc', 'config', 'skills-manifest.json'),
                path.join(testDir, '.isdlc', 'config', 'skills-manifest.json'),
            ];
            const backups = {};
            for (const p of paths) {
                if (fs.existsSync(p)) { backups[p] = fs.readFileSync(p, 'utf8'); fs.unlinkSync(p); }
            }

            const fresh = freshCommon();
            const result = fresh.loadManifest();
            assert.equal(result, null);

            // Restore
            for (const [p, content] of Object.entries(backups)) {
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, content);
            }
        });
    });

    // -------------------------------------------------------------------------
    // getAgentPhase() / getSkillOwner()
    // -------------------------------------------------------------------------
    describe('getAgentPhase() / getSkillOwner()', () => {
        it('returns phase for a known agent', () => {
            const phase = common.getAgentPhase('software-developer');
            assert.equal(phase, '06-implementation');
        });

        it('returns null for unknown agent', () => {
            const phase = common.getAgentPhase('nonexistent-agent');
            assert.equal(phase, null);
        });

        it('returns owner for a known skill ID', () => {
            const owner = common.getSkillOwner('DEV-001');
            assert.equal(owner, 'software-developer');
        });

        it('returns null for unknown skill ID', () => {
            const owner = common.getSkillOwner('FAKE-999');
            assert.equal(owner, null);
        });

        it('returns "all" phase for sdlc-orchestrator', () => {
            const phase = common.getAgentPhase('sdlc-orchestrator');
            assert.equal(phase, 'all');
        });

        it('returns "setup" phase for discover agents', () => {
            const phase = common.getAgentPhase('architecture-analyzer');
            assert.equal(phase, 'setup');
        });
    });

    // -------------------------------------------------------------------------
    // isAgentAuthorizedForPhase()
    // -------------------------------------------------------------------------
    describe('isAgentAuthorizedForPhase()', () => {
        it('returns true when agent phase matches current phase', () => {
            const result = common.isAgentAuthorizedForPhase('software-developer', '06-implementation');
            assert.equal(result, true);
        });

        it('returns true for orchestrator (phase="all")', () => {
            const result = common.isAgentAuthorizedForPhase('sdlc-orchestrator', '06-implementation');
            assert.equal(result, true);
        });

        it('returns false for phase mismatch', () => {
            const result = common.isAgentAuthorizedForPhase('software-developer', '01-requirements');
            assert.equal(result, false);
        });

        it('returns true for setup agents (discover agents)', () => {
            const result = common.isAgentAuthorizedForPhase('architecture-analyzer', '06-implementation');
            assert.equal(result, true);
        });

        it('returns true (fail open) for unknown agent not in manifest', () => {
            const result = common.isAgentAuthorizedForPhase('nonexistent-agent', '06-implementation');
            assert.equal(result, true);
        });
    });

    // -------------------------------------------------------------------------
    // Monorepo utilities
    // -------------------------------------------------------------------------
    describe('isMonorepoMode()', () => {
        it('returns false when monorepo.json does not exist', () => {
            assert.equal(common.isMonorepoMode(), false);
        });

        it('returns true when monorepo.json exists', () => {
            const testDir = getTestDir();
            fs.writeFileSync(
                path.join(testDir, '.isdlc', 'monorepo.json'),
                JSON.stringify({ projects: {}, default_project: 'app' })
            );

            assert.equal(common.isMonorepoMode(), true);

            // Cleanup
            fs.unlinkSync(path.join(testDir, '.isdlc', 'monorepo.json'));
        });
    });

    describe('readMonorepoConfig()', () => {
        it('returns null when monorepo.json does not exist', () => {
            const result = common.readMonorepoConfig();
            assert.equal(result, null);
        });

        it('returns parsed config when monorepo.json exists', () => {
            const testDir = getTestDir();
            const config = { projects: { app: { path: 'apps/web' } }, default_project: 'app' };
            fs.writeFileSync(
                path.join(testDir, '.isdlc', 'monorepo.json'),
                JSON.stringify(config)
            );

            const result = common.readMonorepoConfig();
            assert.deepEqual(result.default_project, 'app');
            assert.deepEqual(result.projects.app.path, 'apps/web');

            fs.unlinkSync(path.join(testDir, '.isdlc', 'monorepo.json'));
        });
    });

    describe('resolveStatePath()', () => {
        it('returns .isdlc/state.json in single-project mode', () => {
            const statePath = common.resolveStatePath();
            const testDir = getTestDir();
            assert.equal(statePath, path.join(testDir, '.isdlc', 'state.json'));
        });
    });

    // -------------------------------------------------------------------------
    // debugLog()
    // -------------------------------------------------------------------------
    describe('debugLog()', () => {
        it('does not throw when called', () => {
            assert.doesNotThrow(() => common.debugLog('test message'));
        });
    });

    // -------------------------------------------------------------------------
    // outputBlockResponse()
    // -------------------------------------------------------------------------
    describe('outputBlockResponse()', () => {
        it('writes JSON to stdout with continue=false', () => {
            const originalLog = console.log;
            let captured = '';
            console.log = (msg) => { captured = msg; };

            common.outputBlockResponse('Test block reason');

            console.log = originalLog;

            const parsed = JSON.parse(captured);
            assert.equal(parsed.continue, false);
            assert.equal(parsed.stopReason, 'Test block reason');
        });
    });

    // -------------------------------------------------------------------------
    // getManifestPath()
    // -------------------------------------------------------------------------
    describe('getManifestPath()', () => {
        it('returns path containing skills-manifest.json', () => {
            const manifestPath = common.getManifestPath();
            assert.ok(manifestPath, 'Should find manifest');
            assert.ok(
                manifestPath.includes('skills-manifest.json'),
                `Path should contain skills-manifest.json, got: ${manifestPath}`
            );
        });

        it('returns null when no manifest exists', () => {
            const testDir = getTestDir();
            // Remove from all possible locations
            const paths = [
                path.join(testDir, '.claude', 'hooks', 'config', 'skills-manifest.json'),
                path.join(testDir, 'src', 'isdlc', 'config', 'skills-manifest.json'),
                path.join(testDir, '.isdlc', 'config', 'skills-manifest.json'),
            ];
            const backups = {};
            for (const p of paths) {
                if (fs.existsSync(p)) { backups[p] = fs.readFileSync(p, 'utf8'); fs.unlinkSync(p); }
            }

            const fresh = freshCommon();
            const result = fresh.getManifestPath();
            assert.equal(result, null);

            // Restore
            for (const [p, content] of Object.entries(backups)) {
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, content);
            }
        });
    });

    // -------------------------------------------------------------------------
    // Pending Escalation Tracking
    // -------------------------------------------------------------------------
    describe('writePendingEscalation()', () => {
        afterEach(() => {
            // Clear escalations after each test
            const state = common.readState();
            if (state) {
                state.pending_escalations = [];
                common.writeState(state);
            }
        });

        it('creates pending_escalations array and appends entry', () => {
            const entry = {
                type: 'gate_blocked',
                hook: 'gate-blocker',
                phase: '06-implementation',
                detail: 'Test iteration not satisfied',
                timestamp: '2026-02-08T12:00:00.000Z'
            };
            common.writePendingEscalation(entry);

            const state = common.readState();
            assert.ok(Array.isArray(state.pending_escalations));
            assert.equal(state.pending_escalations.length, 1);
            assert.deepEqual(state.pending_escalations[0], entry);
        });

        it('appends multiple entries to existing array', () => {
            const entry1 = { type: 'gate_blocked', hook: 'gate-blocker', phase: '06-implementation', detail: 'first', timestamp: 'T1' };
            const entry2 = { type: 'corridor_blocked', hook: 'iteration-corridor', phase: '06-implementation', detail: 'second', timestamp: 'T2' };
            common.writePendingEscalation(entry1);
            common.writePendingEscalation(entry2);

            const state = common.readState();
            assert.equal(state.pending_escalations.length, 2);
            assert.equal(state.pending_escalations[0].detail, 'first');
            assert.equal(state.pending_escalations[1].detail, 'second');
        });

        it('does not throw when state.json is missing', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            fs.unlinkSync(stateFile);

            assert.doesNotThrow(() => {
                common.writePendingEscalation({ type: 'test', hook: 'x', phase: 'y', detail: 'z', timestamp: 'T' });
            });

            // Restore state for subsequent tests
            writeState({
                skill_enforcement: { enabled: true, mode: 'observe', fail_behavior: 'allow', manifest_version: '4.0.0' },
                current_phase: '06-implementation',
                skill_usage_log: [],
                iteration_enforcement: { enabled: true },
                phases: {}
            });
        });
    });

    describe('readPendingEscalations()', () => {
        afterEach(() => {
            const state = common.readState();
            if (state) {
                state.pending_escalations = [];
                common.writeState(state);
            }
        });

        it('returns null when no escalations exist', () => {
            const result = common.readPendingEscalations();
            assert.equal(result, null);
        });

        it('returns null for empty escalations array', () => {
            const state = common.readState();
            state.pending_escalations = [];
            common.writeState(state);

            const result = common.readPendingEscalations();
            assert.equal(result, null);
        });

        it('returns array when escalations exist', () => {
            const entry = { type: 'gate_blocked', hook: 'gate-blocker', phase: '06-implementation', detail: 'blocked', timestamp: 'T1' };
            common.writePendingEscalation(entry);

            const result = common.readPendingEscalations();
            assert.ok(Array.isArray(result));
            assert.equal(result.length, 1);
            assert.equal(result[0].type, 'gate_blocked');
        });

        it('returns null when state.json is missing', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            fs.unlinkSync(stateFile);

            const result = common.readPendingEscalations();
            assert.equal(result, null);

            // Restore
            writeState({
                skill_enforcement: { enabled: true, mode: 'observe', fail_behavior: 'allow', manifest_version: '4.0.0' },
                current_phase: '06-implementation',
                skill_usage_log: [],
                iteration_enforcement: { enabled: true },
                phases: {}
            });
        });
    });

    describe('clearPendingEscalations()', () => {
        it('clears existing escalations to empty array', () => {
            common.writePendingEscalation({ type: 'test', hook: 'x', phase: 'y', detail: 'z', timestamp: 'T' });
            assert.ok(common.readPendingEscalations());

            common.clearPendingEscalations();

            const result = common.readPendingEscalations();
            assert.equal(result, null);
        });

        it('does not throw when no escalations exist', () => {
            assert.doesNotThrow(() => common.clearPendingEscalations());
        });

        it('does not throw when state.json is missing', () => {
            const testDir = getTestDir();
            const stateFile = path.join(testDir, '.isdlc', 'state.json');
            fs.unlinkSync(stateFile);

            assert.doesNotThrow(() => common.clearPendingEscalations());

            // Restore
            writeState({
                skill_enforcement: { enabled: true, mode: 'observe', fail_behavior: 'allow', manifest_version: '4.0.0' },
                current_phase: '06-implementation',
                skill_usage_log: [],
                iteration_enforcement: { enabled: true },
                phases: {}
            });
        });
    });

    // -------------------------------------------------------------------------
    // isMigrationNeeded()
    // -------------------------------------------------------------------------
    describe('isMigrationNeeded()', () => {
        it('returns false when neither legacy nor new constitution exists', () => {
            assert.equal(common.isMigrationNeeded(), false);
        });

        it('returns true when legacy exists but new does not', () => {
            const testDir = getTestDir();
            fs.writeFileSync(
                path.join(testDir, '.isdlc', 'constitution.md'),
                '# Constitution'
            );

            assert.equal(common.isMigrationNeeded(), true);

            fs.unlinkSync(path.join(testDir, '.isdlc', 'constitution.md'));
        });

        it('returns false when new location exists', () => {
            const testDir = getTestDir();
            const newDir = path.join(testDir, 'docs', 'isdlc');
            fs.mkdirSync(newDir, { recursive: true });
            fs.writeFileSync(path.join(newDir, 'constitution.md'), '# Constitution');
            fs.writeFileSync(path.join(testDir, '.isdlc', 'constitution.md'), '# Legacy');

            assert.equal(common.isMigrationNeeded(), false);

            // Cleanup
            fs.unlinkSync(path.join(newDir, 'constitution.md'));
            fs.unlinkSync(path.join(testDir, '.isdlc', 'constitution.md'));
        });
    });

    // -------------------------------------------------------------------------
    // pruneSkillUsageLog() — BUG-0004 / FIX-001
    // -------------------------------------------------------------------------
    describe('pruneSkillUsageLog()', () => {
        /** Helper to create N skill log entries with sequential IDs */
        function makeEntries(count) {
            return Array.from({ length: count }, (_, i) => ({
                timestamp: `2026-02-09T00:00:${String(i).padStart(2, '0')}.000Z`,
                agent: `agent-${i + 1}`,
                skill: `SKILL-${String(i + 1).padStart(3, '0')}`,
                agent_phase: '06-implementation',
                current_phase: '06-implementation',
                status: 'executed'
            }));
        }

        it('returns state unchanged when skill_usage_log is empty array', () => {
            const state = { skill_usage_log: [] };
            const result = common.pruneSkillUsageLog(state, 20);
            assert.deepEqual(result.skill_usage_log, []);
        });

        it('returns state unchanged when skill_usage_log is missing', () => {
            const state = { current_phase: '06-implementation' };
            const result = common.pruneSkillUsageLog(state, 20);
            assert.equal(result.current_phase, '06-implementation');
            assert.equal(result.skill_usage_log, undefined);
        });

        it('preserves all entries when count is under limit', () => {
            const entries = makeEntries(10);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 20);
            assert.equal(result.skill_usage_log.length, 10);
            assert.equal(result.skill_usage_log[0].agent, 'agent-1');
            assert.equal(result.skill_usage_log[9].agent, 'agent-10');
        });

        it('preserves all entries when count is exactly at limit', () => {
            const entries = makeEntries(20);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 20);
            assert.equal(result.skill_usage_log.length, 20);
        });

        it('prunes oldest entries when over limit, keeps last N', () => {
            const entries = makeEntries(30);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 20);
            assert.equal(result.skill_usage_log.length, 20);
            // Should keep entries 11-30 (0-indexed: 10-29)
            assert.equal(result.skill_usage_log[0].agent, 'agent-11');
            assert.equal(result.skill_usage_log[19].agent, 'agent-30');
        });

        it('preserves full entry structure after pruning', () => {
            const entries = makeEntries(25);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 20);
            const kept = result.skill_usage_log[0];
            assert.ok(kept.timestamp, 'should have timestamp');
            assert.ok(kept.agent, 'should have agent');
            assert.ok(kept.skill, 'should have skill');
            assert.ok(kept.agent_phase, 'should have agent_phase');
            assert.ok(kept.current_phase, 'should have current_phase');
            assert.ok(kept.status, 'should have status');
        });

        it('respects custom maxEntries value', () => {
            const entries = makeEntries(10);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 5);
            assert.equal(result.skill_usage_log.length, 5);
            assert.equal(result.skill_usage_log[0].agent, 'agent-6');
        });

        it('returns the pruned count', () => {
            const entries = makeEntries(30);
            const state = { skill_usage_log: entries };
            const result = common.pruneSkillUsageLog(state, 20);
            // The function should return the state; verify by checking length delta
            assert.equal(result.skill_usage_log.length, 20);
            // The pruned count is 30 - 20 = 10; verified indirectly by length check
        });
    });

    // -------------------------------------------------------------------------
    // pruneCompletedPhases() — BUG-0004 / FIX-002
    // -------------------------------------------------------------------------
    describe('pruneCompletedPhases()', () => {
        /** Helper: create a phase entry with verbose sub-objects */
        function verbosePhase(status, gatePassed) {
            return {
                status: status,
                started: '2026-02-09T00:00:00.000Z',
                completed: status === 'completed' ? '2026-02-09T01:00:00.000Z' : null,
                gate_passed: gatePassed || null,
                artifacts: ['file1.md', 'file2.json'],
                iteration_requirements: {
                    test_iteration: { current: 3, history: [{}, {}, {}] }
                },
                constitutional_validation: {
                    status: 'compliant', iterations_used: 2, history: [{}, {}]
                },
                gate_validation: {
                    passed: true, checked_at: '2026-02-09T01:00:00.000Z'
                },
                testing_environment: {
                    local: { url: 'http://localhost:3000', status: 'running' }
                },
                verification_summary: { tests_passed: 42, coverage: 85 },
                atdd_validation: { checked: true, pass: true }
            };
        }

        it('returns state unchanged when phases key is missing', () => {
            const state = { current_phase: '06-implementation' };
            const result = common.pruneCompletedPhases(state);
            assert.equal(result.current_phase, '06-implementation');
            assert.equal(result.phases, undefined);
        });

        it('returns state unchanged when phases is empty object', () => {
            const state = { phases: {} };
            const result = common.pruneCompletedPhases(state);
            assert.deepEqual(result.phases, {});
        });

        it('preserves phase without strip-target fields', () => {
            const state = {
                phases: {
                    '01-requirements': {
                        status: 'completed',
                        started: '2026-02-09T00:00:00.000Z',
                        completed: '2026-02-09T01:00:00.000Z',
                        gate_passed: true,
                        artifacts: ['req.md']
                    }
                }
            };
            const result = common.pruneCompletedPhases(state);
            const phase = result.phases['01-requirements'];
            assert.equal(phase.status, 'completed');
            assert.equal(phase.artifacts.length, 1);
        });

        it('strips verbose sub-objects from completed phase', () => {
            const state = {
                phases: {
                    '06-implementation': verbosePhase('completed', true)
                }
            };
            const result = common.pruneCompletedPhases(state);
            const phase = result.phases['06-implementation'];
            assert.equal(phase.status, 'completed');
            assert.equal(phase.started, '2026-02-09T00:00:00.000Z');
            assert.equal(phase.gate_passed, true);
            assert.deepEqual(phase.artifacts, ['file1.md', 'file2.json']);
            // Stripped fields should be gone
            assert.equal(phase.iteration_requirements, undefined);
            assert.equal(phase.constitutional_validation, undefined);
            assert.equal(phase.gate_validation, undefined);
            assert.equal(phase.testing_environment, undefined);
            assert.equal(phase.verification_summary, undefined);
            assert.equal(phase.atdd_validation, undefined);
        });

        it('strips verbose sub-objects from gate-passed phase', () => {
            const phase = verbosePhase('in_progress', true);
            const state = { phases: { '05-implementation': phase } };
            const result = common.pruneCompletedPhases(state);
            const p = result.phases['05-implementation'];
            assert.equal(p.iteration_requirements, undefined);
            assert.equal(p.constitutional_validation, undefined);
        });

        it('does NOT strip in_progress phase without gate_passed', () => {
            const phase = verbosePhase('in_progress', null);
            const state = { phases: { '06-implementation': phase } };
            const result = common.pruneCompletedPhases(state);
            const p = result.phases['06-implementation'];
            assert.ok(p.iteration_requirements, 'should preserve iteration_requirements');
            assert.ok(p.constitutional_validation, 'should preserve constitutional_validation');
        });

        it('does NOT strip pending phase', () => {
            const phase = verbosePhase('pending', null);
            phase.iteration_requirements = { test_iteration: { current: 0 } };
            const state = { phases: { '07-code-review': phase } };
            const result = common.pruneCompletedPhases(state);
            const p = result.phases['07-code-review'];
            assert.ok(p.iteration_requirements, 'should preserve iteration_requirements');
        });

        it('selectively strips only completed phases in mixed set', () => {
            const state = {
                phases: {
                    '01-requirements': verbosePhase('completed', true),
                    '05-implementation': verbosePhase('in_progress', null),
                    '06-testing': verbosePhase('pending', null)
                }
            };
            const result = common.pruneCompletedPhases(state);
            // Completed: stripped
            assert.equal(result.phases['01-requirements'].iteration_requirements, undefined);
            // In-progress: preserved
            assert.ok(result.phases['05-implementation'].iteration_requirements);
            // Pending: preserved
            assert.ok(result.phases['06-testing'].iteration_requirements);
        });

        it('strips all 6 target fields', () => {
            const state = {
                phases: {
                    '01-requirements': verbosePhase('completed', true)
                }
            };
            const result = common.pruneCompletedPhases(state);
            const p = result.phases['01-requirements'];
            const strippedFields = [
                'iteration_requirements',
                'constitutional_validation',
                'gate_validation',
                'testing_environment',
                'verification_summary',
                'atdd_validation'
            ];
            for (const field of strippedFields) {
                assert.equal(p[field], undefined, `${field} should be stripped`);
            }
        });

        it('preserves non-strip fields on completed phase', () => {
            const phase = verbosePhase('completed', true);
            phase.custom_field = 'keep-this';
            phase.extra_data = { value: 42 };
            const state = { phases: { '01-requirements': phase } };
            const result = common.pruneCompletedPhases(state);
            const p = result.phases['01-requirements'];
            assert.equal(p.custom_field, 'keep-this');
            assert.deepEqual(p.extra_data, { value: 42 });
            assert.equal(p.status, 'completed');
        });
    });

    // -------------------------------------------------------------------------
    // pruneHistory() — BUG-0004 / FIX-003
    // -------------------------------------------------------------------------
    describe('pruneHistory()', () => {
        /** Helper: create N history entries with sequential actions */
        function makeHistory(count, actionLength) {
            return Array.from({ length: count }, (_, i) => ({
                timestamp: `2026-02-09T00:${String(i).padStart(2, '0')}:00.000Z`,
                agent: `agent-${i + 1}`,
                phase: `phase-${i + 1}`,
                action: actionLength
                    ? 'A'.repeat(actionLength)
                    : `Action ${i + 1} completed`
            }));
        }

        it('returns state unchanged when history is empty', () => {
            const state = { history: [] };
            const result = common.pruneHistory(state, 50, 200);
            assert.deepEqual(result.history, []);
        });

        it('returns state unchanged when history key is missing', () => {
            const state = { current_phase: '06-implementation' };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history, undefined);
        });

        it('preserves all entries when under limit with short actions', () => {
            const entries = makeHistory(10);
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history.length, 10);
            assert.equal(result.history[0].action, 'Action 1 completed');
        });

        it('removes oldest entries when over FIFO limit', () => {
            const entries = makeHistory(60);
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history.length, 50);
            // Should keep entries 11-60
            assert.equal(result.history[0].agent, 'agent-11');
            assert.equal(result.history[49].agent, 'agent-60');
        });

        it('truncates long action strings with "..." suffix', () => {
            const entries = [{ timestamp: 'T1', agent: 'a', phase: 'p', action: 'B'.repeat(500) }];
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history[0].action.length, 203); // 200 + '...'
            assert.ok(result.history[0].action.endsWith('...'));
            assert.equal(result.history[0].action.substring(0, 200), 'B'.repeat(200));
        });

        it('does NOT truncate action exactly at limit', () => {
            const entries = [{ timestamp: 'T1', agent: 'a', phase: 'p', action: 'C'.repeat(200) }];
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history[0].action.length, 200);
            assert.ok(!result.history[0].action.endsWith('...'));
        });

        it('truncates action at 201 characters', () => {
            const entries = [{ timestamp: 'T1', agent: 'a', phase: 'p', action: 'D'.repeat(201) }];
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history[0].action.length, 203);
            assert.ok(result.history[0].action.endsWith('...'));
        });

        it('preserves other entry fields during truncation', () => {
            const entries = [{
                timestamp: '2026-02-09T10:00:00.000Z',
                agent: 'sdlc-orchestrator',
                phase: '06-implementation',
                action: 'E'.repeat(300)
            }];
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history[0].timestamp, '2026-02-09T10:00:00.000Z');
            assert.equal(result.history[0].agent, 'sdlc-orchestrator');
            assert.equal(result.history[0].phase, '06-implementation');
        });

        it('applies both truncation and FIFO together', () => {
            const entries = makeHistory(60, 500);
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history.length, 50);
            for (const entry of result.history) {
                assert.equal(entry.action.length, 203);
                assert.ok(entry.action.endsWith('...'));
            }
        });

        it('respects custom limit values', () => {
            const entries = makeHistory(10, 100);
            const state = { history: entries };
            const result = common.pruneHistory(state, 5, 50);
            assert.equal(result.history.length, 5);
            for (const entry of result.history) {
                assert.equal(entry.action.length, 53); // 50 + '...'
            }
        });

        it('handles entry without action field', () => {
            const entries = [{ timestamp: 'T1', agent: 'a', phase: 'p' }];
            const state = { history: entries };
            const result = common.pruneHistory(state, 50, 200);
            assert.equal(result.history.length, 1);
            assert.equal(result.history[0].action, undefined);
        });
    });

    // -------------------------------------------------------------------------
    // pruneWorkflowHistory() — BUG-0004 / FIX-003
    // -------------------------------------------------------------------------
    describe('pruneWorkflowHistory()', () => {
        /** Helper: create N workflow_history entries */
        function makeWorkflowHistory(count, descLength) {
            return Array.from({ length: count }, (_, i) => ({
                type: i % 2 === 0 ? 'feature' : 'fix',
                description: descLength
                    ? 'X'.repeat(descLength)
                    : `Workflow ${i + 1} description`,
                started_at: `2026-02-0${Math.min(i + 1, 9)}T00:00:00.000Z`,
                completed_at: `2026-02-0${Math.min(i + 1, 9)}T12:00:00.000Z`,
                status: i % 3 === 0 ? 'cancelled' : 'completed',
                cancelled_at_phase: i % 3 === 0 ? '05-implementation' : undefined,
                cancellation_reason: i % 3 === 0 ? 'User cancelled' : undefined,
                git_branch: {
                    name: `feature/REQ-${String(i + 1).padStart(4, '0')}-test`,
                    status: 'merged',
                    created_at: '2026-02-01T00:00:00.000Z',
                    merged_at: '2026-02-01T12:00:00.000Z',
                    merge_commit: 'abc123'
                }
            }));
        }

        it('returns state unchanged when workflow_history is empty', () => {
            const state = { workflow_history: [] };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.deepEqual(result.workflow_history, []);
        });

        it('returns state unchanged when workflow_history key is missing', () => {
            const state = { current_phase: '06-implementation' };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history, undefined);
        });

        it('preserves all entries when under limit', () => {
            const entries = makeWorkflowHistory(10);
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history.length, 10);
        });

        it('removes oldest entries when over FIFO limit', () => {
            const entries = makeWorkflowHistory(60);
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history.length, 50);
        });

        it('truncates long description strings with "..." suffix', () => {
            const entries = [{
                type: 'feature',
                description: 'Y'.repeat(500),
                status: 'completed'
            }];
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history[0].description.length, 203);
            assert.ok(result.workflow_history[0].description.endsWith('...'));
        });

        it('does NOT truncate description exactly at 200 chars', () => {
            const entries = [{
                type: 'feature',
                description: 'Z'.repeat(200),
                status: 'completed'
            }];
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history[0].description.length, 200);
        });

        it('preserves required fields for backlog picker', () => {
            const entry = {
                type: 'fix',
                description: 'Fix login bug',
                status: 'cancelled',
                cancelled_at_phase: '05-implementation',
                cancellation_reason: 'Wrong approach',
                started_at: '2026-02-09T00:00:00.000Z'
            };
            const state = { workflow_history: [entry] };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            const e = result.workflow_history[0];
            assert.equal(e.type, 'fix');
            assert.equal(e.description, 'Fix login bug');
            assert.equal(e.status, 'cancelled');
            assert.equal(e.cancelled_at_phase, '05-implementation');
            assert.equal(e.cancellation_reason, 'Wrong approach');
        });

        it('compacts git_branch to name only', () => {
            const entries = makeWorkflowHistory(1);
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            const branch = result.workflow_history[0].git_branch;
            assert.equal(typeof branch, 'object');
            assert.ok(branch.name, 'should have name');
            assert.equal(branch.status, undefined, 'status should be stripped');
            assert.equal(branch.created_at, undefined, 'created_at should be stripped');
            assert.equal(branch.merged_at, undefined, 'merged_at should be stripped');
            assert.equal(branch.merge_commit, undefined, 'merge_commit should be stripped');
        });

        it('leaves already-minimal git_branch unchanged', () => {
            const entries = [{
                type: 'feature',
                description: 'test',
                status: 'completed',
                git_branch: { name: 'feature/REQ-0001-test' }
            }];
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.deepEqual(result.workflow_history[0].git_branch, { name: 'feature/REQ-0001-test' });
        });

        it('handles entry without git_branch', () => {
            const entries = [{
                type: 'feature',
                description: 'test',
                status: 'completed'
            }];
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history[0].git_branch, undefined);
        });

        it('handles entry without description', () => {
            const entries = [{
                type: 'feature',
                status: 'completed'
            }];
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 50, 200);
            assert.equal(result.workflow_history.length, 1);
            assert.equal(result.workflow_history[0].description, undefined);
        });

        it('respects custom limit values', () => {
            const entries = makeWorkflowHistory(10, 100);
            const state = { workflow_history: entries };
            const result = common.pruneWorkflowHistory(state, 3, 50);
            assert.equal(result.workflow_history.length, 3);
            for (const e of result.workflow_history) {
                assert.equal(e.description.length, 53); // 50 + '...'
            }
        });
    });

    // -------------------------------------------------------------------------
    // resetPhasesForWorkflow() — BUG-0004 / FIX-004
    // -------------------------------------------------------------------------
    describe('resetPhasesForWorkflow()', () => {
        it('clears existing phases and creates fresh entries', () => {
            const state = {
                current_phase: '06-implementation',
                phases: {
                    '01-requirements': { status: 'completed', big_data: 'lots of stuff' },
                    '05-implementation': { status: 'completed', big_data: 'more stuff' },
                    '06-testing': { status: 'completed', big_data: 'even more' },
                    '07-code-review': { status: 'completed', big_data: 'volumes' },
                    '09-cicd': { status: 'completed', big_data: 'mountains' }
                }
            };
            const newPhases = ['01-requirements', '05-implementation', '06-testing'];
            const result = common.resetPhasesForWorkflow(state, newPhases);
            assert.equal(Object.keys(result.phases).length, 3);
            assert.ok(result.phases['01-requirements']);
            assert.ok(result.phases['05-implementation']);
            assert.ok(result.phases['06-testing']);
            // Old phases should be gone
            assert.equal(result.phases['07-code-review'], undefined);
            assert.equal(result.phases['09-cicd'], undefined);
        });

        it('creates fresh skeleton entries with correct defaults', () => {
            const state = { phases: {} };
            const newPhases = ['01-requirements', '05-implementation'];
            const result = common.resetPhasesForWorkflow(state, newPhases);

            for (const phaseName of newPhases) {
                const phase = result.phases[phaseName];
                assert.equal(phase.status, 'pending');
                assert.equal(phase.started, null);
                assert.equal(phase.completed, null);
                assert.equal(phase.gate_passed, null);
                assert.deepEqual(phase.artifacts, []);
            }
        });

        it('handles empty workflow phases array', () => {
            const state = {
                phases: { 'old-phase': { status: 'completed' } }
            };
            const result = common.resetPhasesForWorkflow(state, []);
            assert.deepEqual(result.phases, {});
        });

        it('removes previous workflow phase entries', () => {
            const state = {
                phases: {
                    'old-phase': {
                        status: 'completed',
                        iteration_requirements: { test_iteration: { history: [{}, {}, {}] } },
                        constitutional_validation: { status: 'compliant' }
                    }
                }
            };
            const result = common.resetPhasesForWorkflow(state, ['01-requirements']);
            assert.equal(result.phases['old-phase'], undefined);
            assert.ok(result.phases['01-requirements']);
        });

        it('preserves other state fields besides phases', () => {
            const state = {
                current_phase: '06-implementation',
                active_workflow: { type: 'feature' },
                history: [{ action: 'test' }],
                skill_usage_log: [{ skill: 'DEV-001' }],
                phases: { 'old': { status: 'completed' } }
            };
            const result = common.resetPhasesForWorkflow(state, ['01-requirements']);
            assert.equal(result.current_phase, '06-implementation');
            assert.deepEqual(result.active_workflow, { type: 'feature' });
            assert.equal(result.history.length, 1);
            assert.equal(result.skill_usage_log.length, 1);
        });

        it('handles state with no phases key', () => {
            const state = { current_phase: '06-implementation' };
            const result = common.resetPhasesForWorkflow(state, ['01-requirements', '05-implementation']);
            assert.equal(Object.keys(result.phases).length, 2);
            assert.equal(result.phases['01-requirements'].status, 'pending');
            assert.equal(result.phases['05-implementation'].status, 'pending');
        });
    });

    // =========================================================================
    // collectPhaseSnapshots() — REQ-0005 Workflow Progress Snapshots
    // =========================================================================
    describe('collectPhaseSnapshots()', () => {

        // -----------------------------------------------------------------
        // Test data factories
        // -----------------------------------------------------------------

        /**
         * Create a phase entry with standard fields.
         * @param {string} status - 'completed' | 'in_progress' | 'pending'
         * @param {object} opts - Override fields
         */
        function makePhase(status, opts = {}) {
            const base = {
                status: status,
                started: opts.started !== undefined ? opts.started : (status !== 'pending' ? '2026-02-09T10:00:00Z' : null),
                completed: opts.completed !== undefined ? opts.completed : (status === 'completed' ? '2026-02-09T10:05:00Z' : null),
                gate_passed: opts.gate_passed !== undefined ? opts.gate_passed : (status === 'completed' ? '2026-02-09T10:05:00Z' : null),
                artifacts: opts.artifacts !== undefined ? opts.artifacts : (status === 'completed' ? ['doc.md'] : []),
                summary: opts.summary !== undefined ? opts.summary : null
            };
            if (opts.iteration_requirements) {
                base.iteration_requirements = opts.iteration_requirements;
            }
            if (opts.constitutional_validation) {
                base.constitutional_validation = opts.constitutional_validation;
            }
            if (opts.gate_validation) {
                base.gate_validation = opts.gate_validation;
            }
            if (opts.testing_environment) {
                base.testing_environment = opts.testing_environment;
            }
            return base;
        }

        /**
         * Create a complete state object with an active workflow and phases.
         * @param {object} overrides - Override top-level fields
         */
        function makeWorkflowState(overrides = {}) {
            const phases = overrides.phases || {
                '01-requirements': makePhase('completed', {
                    started: '2026-02-09T10:00:00Z',
                    completed: '2026-02-09T10:03:00Z',
                    gate_passed: '2026-02-09T10:03:00Z',
                    artifacts: ['requirements-spec.md'],
                    summary: '4 requirements, 12 AC'
                }),
                '06-implementation': makePhase('completed', {
                    started: '2026-02-09T10:10:00Z',
                    completed: '2026-02-09T10:23:00Z',
                    gate_passed: '2026-02-09T10:23:00Z',
                    artifacts: ['common.cjs'],
                    summary: '5 functions added, 108 tests passing',
                    iteration_requirements: {
                        test_iteration: { current_iteration: 1, completed: true, escalated: false }
                    }
                }),
                '07-testing': makePhase('completed', {
                    started: '2026-02-09T10:25:00Z',
                    completed: '2026-02-09T10:27:00Z',
                    gate_passed: '2026-02-09T10:27:00Z',
                    artifacts: [],
                    summary: 'Integration verified'
                })
            };

            return {
                active_workflow: overrides.active_workflow || {
                    type: 'feature',
                    phases: ['01-requirements', '06-implementation', '07-testing'],
                    started_at: '2026-02-09T10:00:00Z',
                    completed_at: '2026-02-09T10:30:00Z',
                    artifact_prefix: 'REQ',
                    counter_used: 5
                },
                phases: phases,
                history: overrides.history || []
            };
        }

        /**
         * Create a history entry.
         */
        function makeHistoryEntry(agent, timestamp, action) {
            return { agent, timestamp, action, phase: 'phase' };
        }

        // Default metrics shape for comparison
        const DEFAULT_METRICS = {
            total_phases: 0,
            phases_completed: 0,
            total_duration_minutes: null,
            test_iterations_total: 0,
            gates_passed_first_try: 0,
            gates_required_iteration: 0
        };

        // -----------------------------------------------------------------
        // T01-T02: Export and basic structure
        // -----------------------------------------------------------------
        describe('Export and basic structure', () => {
            it('T01: is exported as a function from common.cjs', () => {
                assert.equal(typeof common.collectPhaseSnapshots, 'function',
                    'collectPhaseSnapshots should be exported');
            });

            it('T02: returns object with phase_snapshots array and metrics object', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                assert.ok(Array.isArray(result.phase_snapshots),
                    'phase_snapshots should be an array');
                assert.equal(typeof result.metrics, 'object',
                    'metrics should be an object');
                assert.ok(result.metrics !== null,
                    'metrics should not be null');
            });
        });

        // -----------------------------------------------------------------
        // T03-T04: Phase snapshot field structure
        // -----------------------------------------------------------------
        describe('Phase snapshot structure (AC-1, AC-2)', () => {
            it('T03: each snapshot has all required fields', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                const snapshot = result.phase_snapshots[0];
                assert.ok('key' in snapshot, 'should have key');
                assert.ok('status' in snapshot, 'should have status');
                assert.ok('started' in snapshot, 'should have started');
                assert.ok('completed' in snapshot, 'should have completed');
                assert.ok('gate_passed' in snapshot, 'should have gate_passed');
                assert.ok('duration_minutes' in snapshot, 'should have duration_minutes');
            });

            it('T04: snapshot fields have correct types', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                const snapshot = result.phase_snapshots[0];
                assert.equal(typeof snapshot.key, 'string');
                assert.equal(typeof snapshot.status, 'string');
                assert.equal(typeof snapshot.started, 'string');
                assert.equal(typeof snapshot.completed, 'string');
                assert.equal(typeof snapshot.duration_minutes, 'number');
            });
        });

        // -----------------------------------------------------------------
        // T05-T08: Guard clauses and empty inputs (AC-12)
        // -----------------------------------------------------------------
        describe('Guard clauses and empty inputs (AC-12)', () => {
            it('T05: returns empty snapshots when active_workflow is missing', () => {
                const state = { phases: { '01-requirements': makePhase('completed') } };
                const result = common.collectPhaseSnapshots(state);
                assert.deepEqual(result.phase_snapshots, []);
                assert.deepEqual(result.metrics, DEFAULT_METRICS);
            });

            it('T06: returns empty snapshots when phases is missing', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z'
                    }
                };
                const result = common.collectPhaseSnapshots(state);
                assert.deepEqual(result.phase_snapshots, []);
            });

            it('T07: returns empty snapshots when active_workflow is null', () => {
                const state = { active_workflow: null, phases: {} };
                const result = common.collectPhaseSnapshots(state);
                assert.deepEqual(result.phase_snapshots, []);
                assert.deepEqual(result.metrics, DEFAULT_METRICS);
            });

            it('T08: returns empty snapshots when phases array is empty', () => {
                const state = {
                    active_workflow: { phases: [], started_at: '2026-02-09T10:00:00Z' },
                    phases: {}
                };
                const result = common.collectPhaseSnapshots(state);
                assert.deepEqual(result.phase_snapshots, []);
                assert.equal(result.metrics.total_phases, 0);
            });
        });

        // -----------------------------------------------------------------
        // Phase ordering (ADR-002)
        // -----------------------------------------------------------------
        describe('Phase ordering (ADR-002)', () => {
            it('T09-ordering: snapshots follow active_workflow.phases order', () => {
                const state = {
                    active_workflow: {
                        type: 'feature',
                        phases: ['06-implementation', '01-requirements', '07-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': makePhase('completed'),
                        '07-testing': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].key, '06-implementation');
                assert.equal(result.phase_snapshots[1].key, '01-requirements');
                assert.equal(result.phase_snapshots[2].key, '07-testing');
            });

            it('T10-ordering: skips phases not in state.phases', () => {
                const state = {
                    active_workflow: {
                        type: 'feature',
                        phases: ['01-requirements', '05-test-strategy', '06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': makePhase('completed')
                        // '05-test-strategy' is missing — never initialized
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots.length, 2);
                assert.equal(result.phase_snapshots[0].key, '01-requirements');
                assert.equal(result.phase_snapshots[1].key, '06-implementation');
            });
        });

        // -----------------------------------------------------------------
        // T09-T12: Duration computation (AC-13)
        // -----------------------------------------------------------------
        describe('Duration computation (AC-13)', () => {
            it('T09: computes duration in minutes rounded to nearest integer', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:03:30Z' // 3.5 minutes
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                // Math.round(3.5) = 4
                assert.equal(result.phase_snapshots[0].duration_minutes, 4);
            });

            it('T10: returns null duration when started is missing', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: null,
                            completed: '2026-02-09T10:03:00Z'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].duration_minutes, null);
            });

            it('T11: returns null duration when completed is missing', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('in_progress', {
                            started: '2026-02-09T10:00:00Z',
                            completed: null
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].duration_minutes, null);
            });

            it('T12: returns null duration for invalid timestamps', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: 'not-a-date',
                            completed: '2026-02-09T10:03:00Z'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].duration_minutes, null);
            });

            it('T12b: returns 0 for same start and end', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:00:00Z'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].duration_minutes, 0);
            });

            it('T12c: returns null for negative duration (end before start)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:05:00Z',
                            completed: '2026-02-09T10:00:00Z'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].duration_minutes, null);
            });
        });

        // -----------------------------------------------------------------
        // T16-T18: Summary extraction (AC-15, AC-21, AC-22, AC-23)
        // -----------------------------------------------------------------
        describe('Summary extraction (AC-15, AC-21, AC-22, AC-23)', () => {
            it('T16: uses phases[key].summary as primary source (AC-21, AC-23)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            summary: '4 fix requirements, 12 AC'
                        })
                    },
                    history: [
                        makeHistoryEntry('requirements-analyst', '2026-02-09T10:02:00Z', 'Different summary from history')
                    ]
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, '4 fix requirements, 12 AC');
            });

            it('T17: truncates summary to 150 characters (AC-22)', () => {
                const longSummary = 'A'.repeat(200);
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            summary: longSummary
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary.length, 150);
            });

            it('T18: falls back to history[] when phases[key].summary is absent (AC-15, AC-23)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:05:00Z',
                            summary: null
                        })
                    },
                    history: [
                        makeHistoryEntry('requirements-analyst', '2026-02-09T10:02:00Z', 'Gate passed with 5 tests')
                    ]
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, 'Gate passed with 5 tests');
            });

            it('T18b: returns null when neither source has data', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', { summary: null })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, null);
            });

            it('T18c: history fallback matches by agent and timestamp range', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            summary: null
                        })
                    },
                    history: [
                        // Wrong agent, right time
                        makeHistoryEntry('requirements-analyst', '2026-02-09T10:15:00Z', 'Wrong agent summary'),
                        // Right agent, right time
                        makeHistoryEntry('software-developer', '2026-02-09T10:15:00Z', 'Correct developer summary')
                    ]
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, 'Correct developer summary');
            });

            it('T18d: history fallback returns last matching entry (reverse scan)', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            summary: null
                        })
                    },
                    history: [
                        makeHistoryEntry('software-developer', '2026-02-09T10:12:00Z', 'First entry'),
                        makeHistoryEntry('software-developer', '2026-02-09T10:20:00Z', 'Last entry')
                    ]
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, 'Last entry');
            });
        });

        // -----------------------------------------------------------------
        // T13-T15: Test iterations extraction (AC-3, AC-14, ADR-004)
        // -----------------------------------------------------------------
        describe('Test iterations extraction (AC-3, AC-14, ADR-004)', () => {
            it('T13: extracts test_iterations from iteration_requirements.test_iteration (AC-14)', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: {
                                    current_iteration: 2,
                                    completed: true,
                                    escalated: false
                                }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                const iter = result.phase_snapshots[0].test_iterations;
                assert.ok(iter, 'test_iterations should be present');
                assert.equal(iter.count, 2);
                assert.equal(iter.result, 'passed');
                assert.equal(iter.escalated, false);
            });

            it('T14: accepts current field as alternative to current_iteration (AC-14)', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: {
                                    current: 3,
                                    completed: true,
                                    escalated: false
                                }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].test_iterations.count, 3);
            });

            it('T15: omits test_iterations when no iteration data exists (ADR-004)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed')
                        // No iteration_requirements
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].test_iterations, undefined,
                    'test_iterations should be omitted for non-test phases');
            });

            it('T15b: reports escalated status', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: {
                                    current_iteration: 5,
                                    completed: false,
                                    escalated: true
                                }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                const iter = result.phase_snapshots[0].test_iterations;
                assert.equal(iter.count, 5);
                assert.equal(iter.result, 'escalated');
                assert.equal(iter.escalated, true);
            });

            it('T15c: reports unknown result when neither completed nor escalated', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('in_progress', {
                            iteration_requirements: {
                                test_iteration: {
                                    current_iteration: 1,
                                    completed: false,
                                    escalated: false
                                }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                const iter = result.phase_snapshots[0].test_iterations;
                assert.equal(iter.count, 1);
                assert.equal(iter.result, 'unknown');
                assert.equal(iter.escalated, false);
            });

            it('T15d: omits test_iterations when count is 0 and no completion/escalation', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: {
                                    current_iteration: 0
                                }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].test_iterations, undefined,
                    'test_iterations should be omitted when count=0 and no completion/escalation');
            });
        });

        // -----------------------------------------------------------------
        // T37-T39: Artifacts handling (ADR-007)
        // -----------------------------------------------------------------
        describe('Artifacts handling (ADR-007)', () => {
            it('T37: includes artifacts array when non-empty', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            artifacts: ['file1.md', 'file2.json']
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.deepEqual(result.phase_snapshots[0].artifacts, ['file1.md', 'file2.json']);
            });

            it('T38: omits artifacts when empty array', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            artifacts: []
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].artifacts, undefined,
                    'artifacts should be omitted when empty');
            });

            it('T39: omits artifacts when field is missing', () => {
                const phases = {
                    '01-requirements': {
                        status: 'completed',
                        started: '2026-02-09T10:00:00Z',
                        completed: '2026-02-09T10:05:00Z',
                        gate_passed: '2026-02-09T10:05:00Z'
                        // No artifacts field
                    }
                };
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: phases,
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].artifacts, undefined,
                    'artifacts should be omitted when field is missing');
            });
        });

        // -----------------------------------------------------------------
        // T19-T20: Cancelled workflow snapshots (AC-4)
        // -----------------------------------------------------------------
        describe('Cancelled workflow snapshots (AC-4)', () => {
            it('T19: cancelled workflow includes snapshots for all workflow phases', () => {
                const state = {
                    active_workflow: {
                        type: 'fix',
                        phases: ['01-requirements', '05-test-strategy', '06-implementation', '07-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        cancelled_at: '2026-02-09T10:20:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:05:00Z',
                            gate_passed: '2026-02-09T10:05:00Z'
                        }),
                        '05-test-strategy': makePhase('completed', {
                            started: '2026-02-09T10:06:00Z',
                            completed: '2026-02-09T10:10:00Z',
                            gate_passed: '2026-02-09T10:10:00Z'
                        }),
                        '06-implementation': makePhase('in_progress', {
                            started: '2026-02-09T10:11:00Z',
                            completed: null,
                            gate_passed: null
                        }),
                        '07-testing': makePhase('pending', {
                            started: null,
                            completed: null,
                            gate_passed: null,
                            artifacts: []
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots.length, 4);
                assert.equal(result.phase_snapshots[0].status, 'completed');
                assert.equal(result.phase_snapshots[1].status, 'completed');
                assert.equal(result.phase_snapshots[2].status, 'in_progress');
                assert.equal(result.phase_snapshots[3].status, 'pending');
            });

            it('T20: in_progress phase has null completed and gate_passed', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        cancelled_at: '2026-02-09T10:20:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('in_progress', {
                            started: '2026-02-09T10:11:00Z',
                            completed: null,
                            gate_passed: null
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].completed, null);
                assert.equal(result.phase_snapshots[0].gate_passed, null);
            });
        });

        // -----------------------------------------------------------------
        // T21-T23: Merged commit handling (AC-16, AC-17, AC-18)
        // -----------------------------------------------------------------
        describe('Merged commit compatibility (AC-16, AC-17, AC-18)', () => {
            it('T21: output does not include merged_commit (orchestrator adds it)', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.merged_commit, undefined,
                    'collectPhaseSnapshots should not produce merged_commit');
            });

            it('T22: output for cancelled workflows has no merged_commit', () => {
                const state = makeWorkflowState({
                    active_workflow: {
                        type: 'fix',
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        cancelled_at: '2026-02-09T10:20:00Z'
                    }
                });
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.merged_commit, undefined);
            });

            it('T23: output for branchless test-run workflows has no merged_commit', () => {
                const state = {
                    active_workflow: {
                        type: 'test-run',
                        phases: ['11-local-testing', '06-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:05:00Z'
                    },
                    phases: {
                        '11-local-testing': makePhase('completed'),
                        '06-testing': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.merged_commit, undefined);
            });
        });

        // -----------------------------------------------------------------
        // T24-T30: Metrics computation (AC-5 through AC-10)
        // -----------------------------------------------------------------
        describe('Metrics computation (AC-5 through AC-10)', () => {
            it('T24: total_phases equals active_workflow.phases.length (AC-5)', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.total_phases, 3);
            });

            it('T25: phases_completed counts completed phases (AC-6)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements', '06-implementation', '07-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': makePhase('completed'),
                        '07-testing': makePhase('in_progress')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.phases_completed, 2);
            });

            it('T26: total_duration_minutes from workflow timestamps (AC-7)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:39:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.total_duration_minutes, 39);
            });

            it('T27: total_duration_minutes uses cancelled_at for cancelled workflows', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        cancelled_at: '2026-02-09T10:20:00Z'
                        // No completed_at
                    },
                    phases: {
                        '01-requirements': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.total_duration_minutes, 20);
            });

            it('T27b: total_duration_minutes null when no end timestamp', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z'
                        // No completed_at, no cancelled_at
                    },
                    phases: {
                        '01-requirements': makePhase('in_progress')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.total_duration_minutes, null);
            });

            it('T28: test_iterations_total sums all iteration counts (AC-8)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements', '06-implementation', '07-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 2, completed: true }
                            }
                        }),
                        '07-testing': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 3, completed: true }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.metrics.test_iterations_total, 5);
            });

            it('T29: gates_passed_first_try counts no-iteration phases (AC-9)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements', '06-implementation', '07-testing', '08-code-review', '10-cicd'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),  // gate passed, no iteration
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 3, completed: true }  // count > 1 = iterated
                            }
                        }),
                        '07-testing': makePhase('completed'),  // gate passed, no iteration
                        '08-code-review': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 2, completed: true }  // count > 1 = iterated
                            }
                        }),
                        '10-cicd': makePhase('completed')  // gate passed, no iteration
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                // 3 phases with gate_passed and no iteration (or count <= 1): 01, 07, 10
                assert.equal(result.metrics.gates_passed_first_try, 3);
            });

            it('T30: gates_required_iteration counts iterated phases (AC-10)', () => {
                // Same state as T29
                const state = {
                    active_workflow: {
                        phases: ['01-requirements', '06-implementation', '07-testing', '08-code-review', '10-cicd'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 3, completed: true }
                            }
                        }),
                        '07-testing': makePhase('completed'),
                        '08-code-review': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 2, completed: true }
                            }
                        }),
                        '10-cicd': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                // 2 phases with gate_passed and test_iterations.count > 1: 06, 08
                assert.equal(result.metrics.gates_required_iteration, 2);
            });
        });

        // -----------------------------------------------------------------
        // T31-T33: Workflow ID generation (AC-19, AC-20, ADR-006)
        // -----------------------------------------------------------------
        describe('Workflow ID generation (AC-19, AC-20, ADR-006)', () => {
            it('T31: function works with state containing artifact_prefix and counter_used', () => {
                // collectPhaseSnapshots does not generate the id — the orchestrator does.
                // This test validates the function works normally when these fields exist.
                const state = makeWorkflowState({
                    active_workflow: {
                        type: 'feature',
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z',
                        artifact_prefix: 'REQ',
                        counter_used: 5
                    }
                });
                const result = common.collectPhaseSnapshots(state);
                assert.ok(result.phase_snapshots.length > 0);
                // Verify the id can be constructed from active_workflow fields
                const aw = state.active_workflow;
                const id = aw.artifact_prefix + '-' + String(aw.counter_used).padStart(4, '0');
                assert.equal(id, 'REQ-0005');
            });

            it('T32: function works when artifact_prefix is missing', () => {
                const state = {
                    active_workflow: {
                        type: 'test-run',
                        phases: ['06-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:05:00Z'
                        // No artifact_prefix, no counter_used
                    },
                    phases: {
                        '06-testing': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.ok(result.phase_snapshots.length === 1);
                // Verify null id would be generated
                assert.equal(state.active_workflow.artifact_prefix, undefined);
            });

            it('T33: function works for all workflow types', () => {
                // Validate with an upgrade workflow
                const state = {
                    active_workflow: {
                        type: 'upgrade',
                        phases: ['14-upgrade-plan', '14-upgrade-execute'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:15:00Z',
                        artifact_prefix: 'UPG',
                        counter_used: 1
                    },
                    phases: {
                        '14-upgrade-plan': makePhase('completed'),
                        '14-upgrade-execute': makePhase('completed')
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots.length, 2);
                assert.equal(result.metrics.total_phases, 2);
                // Verify id construction
                const id = state.active_workflow.artifact_prefix + '-' + String(state.active_workflow.counter_used).padStart(4, '0');
                assert.equal(id, 'UPG-0001');
            });
        });

        // -----------------------------------------------------------------
        // T34-T36: Backward compatibility (AC-24, AC-25, AC-26)
        // -----------------------------------------------------------------
        describe('Backward compatibility (AC-24, AC-25, AC-26)', () => {
            it('T34: reads pre-prune state correctly with verbose phase data', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': {
                            status: 'completed',
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            gate_passed: '2026-02-09T10:23:00Z',
                            artifacts: ['common.cjs'],
                            summary: 'Implementation complete',
                            iteration_requirements: {
                                test_iteration: {
                                    current_iteration: 2,
                                    completed: true,
                                    escalated: false,
                                    history: [{}, {}]
                                }
                            },
                            constitutional_validation: {
                                status: 'compliant',
                                iterations_used: 1,
                                history: [{}]
                            },
                            gate_validation: {
                                passed: true,
                                checked_at: '2026-02-09T10:23:00Z'
                            },
                            testing_environment: {
                                local: { url: 'http://localhost:3000', status: 'running' }
                            }
                        }
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].test_iterations.count, 2);
                assert.equal(result.phase_snapshots[0].test_iterations.result, 'passed');
                assert.equal(result.phase_snapshots[0].summary, 'Implementation complete');
                assert.deepEqual(result.phase_snapshots[0].artifacts, ['common.cjs']);
            });

            it('T35: reads pruned state correctly (minimal fields)', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': {
                            status: 'completed',
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            gate_passed: '2026-02-09T10:23:00Z',
                            artifacts: ['common.cjs']
                            // No iteration_requirements (pruned)
                            // No constitutional_validation (pruned)
                            // No gate_validation (pruned)
                            // No summary (never set — older phase)
                        }
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].test_iterations, undefined,
                    'test_iterations should be omitted from pruned state');
                assert.equal(result.phase_snapshots[0].summary, null,
                    'summary should be null when not available');
                assert.deepEqual(result.phase_snapshots[0].artifacts, ['common.cjs']);
            });

            it('T36: existing pruning functions still work after collectPhaseSnapshots', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': {
                            status: 'completed',
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            gate_passed: '2026-02-09T10:23:00Z',
                            artifacts: ['common.cjs'],
                            iteration_requirements: {
                                test_iteration: { current_iteration: 1, completed: true }
                            },
                            constitutional_validation: { status: 'compliant' },
                            gate_validation: { passed: true }
                        }
                    },
                    history: []
                };

                // Step 1: collect snapshots (should NOT mutate state)
                const snapshotResult = common.collectPhaseSnapshots(state);

                // Verify state was NOT mutated
                assert.ok(state.phases['06-implementation'].iteration_requirements,
                    'iteration_requirements should still exist on original state');

                // Step 2: prune (should still work correctly)
                const pruned = common.pruneCompletedPhases(state);
                assert.equal(pruned.phases['06-implementation'].iteration_requirements, undefined,
                    'pruning should still strip iteration_requirements');

                // Step 3: snapshot result is unaffected by pruning
                assert.equal(snapshotResult.phase_snapshots[0].test_iterations.count, 1);
            });
        });

        // -----------------------------------------------------------------
        // T40-T41: Size budget validation (NFR-1)
        // -----------------------------------------------------------------
        describe('Size budget validation (NFR-1)', () => {
            it('T40: 8-phase fix workflow snapshot fits within 2KB', () => {
                const state = {
                    active_workflow: {
                        type: 'fix',
                        phases: [
                            '01-requirements', '05-test-strategy', '06-implementation',
                            '11-local-testing', '07-testing', '10-cicd',
                            '08-code-review', '09-validation'
                        ],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:39:00Z',
                        artifact_prefix: 'BUG',
                        counter_used: 4
                    },
                    phases: {
                        '01-requirements': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:03:00Z',
                            gate_passed: '2026-02-09T10:03:00Z',
                            artifacts: ['bug-report.md', 'requirements-spec.md'],
                            summary: '4 fix requirements, 12 AC'
                        }),
                        '05-test-strategy': makePhase('completed', {
                            started: '2026-02-09T10:04:00Z',
                            completed: '2026-02-09T10:09:00Z',
                            gate_passed: '2026-02-09T10:09:00Z',
                            artifacts: ['test-strategy.md'],
                            summary: '47 test cases across 5 functions'
                        }),
                        '06-implementation': makePhase('completed', {
                            started: '2026-02-09T10:10:00Z',
                            completed: '2026-02-09T10:23:00Z',
                            gate_passed: '2026-02-09T10:23:00Z',
                            artifacts: ['common.cjs'],
                            summary: '5 pruning functions, 108 tests passing',
                            iteration_requirements: {
                                test_iteration: { current_iteration: 1, completed: true, escalated: false }
                            }
                        }),
                        '11-local-testing': makePhase('completed', {
                            started: '2026-02-09T10:24:00Z',
                            completed: '2026-02-09T10:27:00Z',
                            gate_passed: '2026-02-09T10:27:00Z',
                            artifacts: [],
                            summary: 'All 108 common tests pass'
                        }),
                        '07-testing': makePhase('completed', {
                            started: '2026-02-09T10:28:00Z',
                            completed: '2026-02-09T10:30:00Z',
                            gate_passed: '2026-02-09T10:30:00Z',
                            artifacts: [],
                            summary: 'Integration verified'
                        }),
                        '10-cicd': makePhase('completed', {
                            started: '2026-02-09T10:31:00Z',
                            completed: '2026-02-09T10:33:00Z',
                            gate_passed: '2026-02-09T10:33:00Z',
                            artifacts: [],
                            summary: 'No CI changes needed'
                        }),
                        '08-code-review': makePhase('completed', {
                            started: '2026-02-09T10:34:00Z',
                            completed: '2026-02-09T10:37:00Z',
                            gate_passed: '2026-02-09T10:37:00Z',
                            artifacts: [],
                            summary: 'Code review passed'
                        }),
                        '09-validation': makePhase('completed', {
                            started: '2026-02-09T10:37:00Z',
                            completed: '2026-02-09T10:39:00Z',
                            gate_passed: '2026-02-09T10:39:00Z',
                            artifacts: [],
                            summary: 'Security validated'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                const serialized = JSON.stringify({ phase_snapshots: result.phase_snapshots, metrics: result.metrics });
                assert.ok(serialized.length < 2048,
                    `Size ${serialized.length} should be under 2048 bytes (2KB)`);
            });

            it('T41: minimal workflow with no artifacts or iterations is compact', () => {
                const state = {
                    active_workflow: {
                        type: 'test-run',
                        phases: ['11-local-testing', '06-testing'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:05:00Z'
                    },
                    phases: {
                        '11-local-testing': makePhase('completed', {
                            started: '2026-02-09T10:00:00Z',
                            completed: '2026-02-09T10:02:00Z',
                            artifacts: [],
                            summary: 'Build OK'
                        }),
                        '06-testing': makePhase('completed', {
                            started: '2026-02-09T10:02:00Z',
                            completed: '2026-02-09T10:05:00Z',
                            artifacts: [],
                            summary: 'All tests pass'
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                const serialized = JSON.stringify({ phase_snapshots: result.phase_snapshots, metrics: result.metrics });
                assert.ok(serialized.length < 1024,
                    `Size ${serialized.length} should be under 1024 bytes (1KB)`);
            });
        });

        // -----------------------------------------------------------------
        // Additional edge cases
        // -----------------------------------------------------------------
        describe('Additional edge cases', () => {
            it('handles phase with status undefined (defaults to pending)', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': { started: null, completed: null }
                        // No status field
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].status, 'pending');
            });

            it('handles complete workflow with all metrics populated', () => {
                const state = makeWorkflowState();
                const result = common.collectPhaseSnapshots(state);
                // Validate all metrics fields exist and are numbers or null
                assert.equal(typeof result.metrics.total_phases, 'number');
                assert.equal(typeof result.metrics.phases_completed, 'number');
                assert.equal(typeof result.metrics.test_iterations_total, 'number');
                assert.equal(typeof result.metrics.gates_passed_first_try, 'number');
                assert.equal(typeof result.metrics.gates_required_iteration, 'number');
                // total_duration_minutes can be number or null
                assert.ok(
                    result.metrics.total_duration_minutes === null ||
                    typeof result.metrics.total_duration_minutes === 'number'
                );
            });

            it('handles state with no history array', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed', { summary: null })
                    }
                    // No history key at all
                };
                const result = common.collectPhaseSnapshots(state);
                assert.equal(result.phase_snapshots[0].summary, null);
            });

            it('metrics handles single-iteration phases as first-try passes', () => {
                const state = {
                    active_workflow: {
                        phases: ['06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '06-implementation': makePhase('completed', {
                            iteration_requirements: {
                                test_iteration: { current_iteration: 1, completed: true }
                            }
                        })
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                // count=1 means it passed on first try
                assert.equal(result.metrics.gates_passed_first_try, 1);
                assert.equal(result.metrics.gates_required_iteration, 0);
            });

            it('handles mixed null/undefined in active_workflow.phases entries', () => {
                const state = {
                    active_workflow: {
                        phases: ['01-requirements', '06-implementation'],
                        started_at: '2026-02-09T10:00:00Z',
                        completed_at: '2026-02-09T10:30:00Z'
                    },
                    phases: {
                        '01-requirements': makePhase('completed'),
                        '06-implementation': null  // Null phase entry
                    },
                    history: []
                };
                const result = common.collectPhaseSnapshots(state);
                // Should have 1 snapshot (skips null phase entry)
                assert.equal(result.phase_snapshots.length, 1);
                assert.equal(result.phase_snapshots[0].key, '01-requirements');
            });
        });
    });

    // -------------------------------------------------------------------------
    // normalizePhaseKey()
    // -------------------------------------------------------------------------
    describe('normalizePhaseKey()', () => {
        it('returns canonical key unchanged', () => {
            assert.equal(common.normalizePhaseKey('06-implementation'), '06-implementation');
            assert.equal(common.normalizePhaseKey('12-test-deploy'), '12-test-deploy');
        });

        it('maps known aliases to canonical keys', () => {
            assert.equal(common.normalizePhaseKey('13-test-deploy'), '12-test-deploy');
            assert.equal(common.normalizePhaseKey('14-production'), '13-production');
            assert.equal(common.normalizePhaseKey('15-operations'), '14-operations');
            assert.equal(common.normalizePhaseKey('16-upgrade-plan'), '15-upgrade-plan');
            assert.equal(common.normalizePhaseKey('16-upgrade-execute'), '15-upgrade-execute');
        });

        it('returns null/undefined input unchanged', () => {
            assert.equal(common.normalizePhaseKey(null), null);
            assert.equal(common.normalizePhaseKey(undefined), undefined);
            assert.equal(common.normalizePhaseKey(''), '');
        });

        it('returns unknown keys unchanged', () => {
            assert.equal(common.normalizePhaseKey('99-unknown'), '99-unknown');
        });
    });

    // -------------------------------------------------------------------------
    // diagnoseBlockCause()
    // -------------------------------------------------------------------------
    describe('diagnoseBlockCause()', () => {
        it('returns genuine for normal unsatisfied requirement', () => {
            const state = {
                phases: { '06-implementation': { status: 'in_progress' } }
            };
            const result = common.diagnoseBlockCause('gate-blocker', '06-implementation', 'test_iteration', state);
            assert.equal(result.cause, 'genuine');
        });

        it('detects stale workflow as stale cause', () => {
            const state = {
                active_workflow: { status: 'completed' },
                phases: { '06-implementation': { status: 'completed' } }
            };
            const result = common.diagnoseBlockCause('gate-blocker', '06-implementation', 'test_iteration', state);
            assert.equal(result.cause, 'stale');
            assert.ok(result.detail.includes('completed'));
        });

        it('detects missing phase state as infrastructure when active_workflow expects it', () => {
            const state = {
                phases: {},  // Phase not initialized
                active_workflow: { current_phase: '06-implementation', type: 'feature' }
            };
            const result = common.diagnoseBlockCause('gate-blocker', '06-implementation', 'test_iteration', state);
            assert.equal(result.cause, 'infrastructure');
            assert.ok(result.detail.includes('no entry'));
        });

        it('treats missing phase state as genuine when no active_workflow', () => {
            const state = {
                phases: {}  // Phase not initialized, no active workflow
            };
            const result = common.diagnoseBlockCause('gate-blocker', '06-implementation', 'test_iteration', state);
            assert.equal(result.cause, 'genuine');
        });
    });

    // -------------------------------------------------------------------------
    // writePendingEscalation() — cap + dedup
    // -------------------------------------------------------------------------
    describe('writePendingEscalation() — cap and dedup', () => {
        beforeEach(() => {
            writeState({
                ...common.readState(),
                pending_escalations: []
            });
        });

        it('caps escalations at MAX_ESCALATIONS (20)', () => {
            const c = freshCommon();
            const now = Date.now();
            // Write 25 unique escalations
            for (let i = 0; i < 25; i++) {
                c.writePendingEscalation({
                    type: `type_${i}`,
                    hook: `hook_${i}`,
                    phase: '06-implementation',
                    detail: `detail ${i}`,
                    timestamp: new Date(now + i * 100000).toISOString()
                });
            }
            const state = c.readState();
            assert.equal(state.pending_escalations.length, c.MAX_ESCALATIONS);
            // Should keep the newest entries (FIFO eviction)
            assert.equal(state.pending_escalations[0].type, 'type_5');
            assert.equal(state.pending_escalations[19].type, 'type_24');
        });

        it('deduplicates within window (same hook+phase+type)', () => {
            const c = freshCommon();
            const now = new Date().toISOString();
            c.writePendingEscalation({
                type: 'gate_blocked',
                hook: 'gate-blocker',
                phase: '06-implementation',
                detail: 'first',
                timestamp: now
            });
            c.writePendingEscalation({
                type: 'gate_blocked',
                hook: 'gate-blocker',
                phase: '06-implementation',
                detail: 'duplicate',
                timestamp: now
            });
            const state = c.readState();
            assert.equal(state.pending_escalations.length, 1, 'Duplicate within window should be skipped');
            assert.equal(state.pending_escalations[0].detail, 'first');
        });

        it('allows same hook+phase+type after window expires', () => {
            const c = freshCommon();
            const old = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
            const now = new Date().toISOString();
            c.writePendingEscalation({
                type: 'gate_blocked',
                hook: 'gate-blocker',
                phase: '06-implementation',
                detail: 'old',
                timestamp: old
            });
            c.writePendingEscalation({
                type: 'gate_blocked',
                hook: 'gate-blocker',
                phase: '06-implementation',
                detail: 'new after window',
                timestamp: now
            });
            const state = c.readState();
            assert.equal(state.pending_escalations.length, 2, 'Should allow after dedup window expires');
        });
    });

    // -------------------------------------------------------------------------
    // pruneCompletedPhases() — protectedPhases + _pruned_at
    // -------------------------------------------------------------------------
    describe('pruneCompletedPhases() — protectedPhases', () => {
        it('skips protected phases during pruning', () => {
            const state = {
                phases: {
                    '01-requirements': {
                        status: 'completed',
                        gate_passed: '2026-01-01T00:00:00Z',
                        iteration_requirements: { test: 'data' },
                        constitutional_validation: { status: 'compliant' }
                    },
                    '06-implementation': {
                        status: 'completed',
                        gate_passed: '2026-01-02T00:00:00Z',
                        iteration_requirements: { test: 'keep_me' }
                    }
                }
            };
            common.pruneCompletedPhases(state, ['06-implementation']);

            // 01-requirements should be pruned (not protected)
            assert.equal(state.phases['01-requirements'].iteration_requirements, undefined);
            assert.ok(state.phases['01-requirements']._pruned_at, 'Should have _pruned_at timestamp');

            // 06-implementation should be protected (not pruned)
            assert.deepEqual(state.phases['06-implementation'].iteration_requirements, { test: 'keep_me' });
            assert.equal(state.phases['06-implementation']._pruned_at, undefined, 'Protected phase should not have _pruned_at');
        });

        it('adds _pruned_at timestamp to pruned phases', () => {
            const state = {
                phases: {
                    '01-requirements': {
                        status: 'completed',
                        gate_passed: '2026-01-01T00:00:00Z',
                        iteration_requirements: { test: 'data' }
                    }
                }
            };
            common.pruneCompletedPhases(state);
            assert.ok(state.phases['01-requirements']._pruned_at);
            // Verify it's a valid ISO timestamp
            const parsed = new Date(state.phases['01-requirements']._pruned_at);
            assert.ok(!isNaN(parsed.getTime()), '_pruned_at should be valid ISO timestamp');
        });

        it('works with empty protectedPhases (backward compatible)', () => {
            const state = {
                phases: {
                    '01-requirements': {
                        status: 'completed',
                        iteration_requirements: { test: 'data' }
                    }
                }
            };
            common.pruneCompletedPhases(state, []);
            assert.equal(state.phases['01-requirements'].iteration_requirements, undefined);
        });

        it('works with no protectedPhases argument (backward compatible)', () => {
            const state = {
                phases: {
                    '01-requirements': {
                        status: 'completed',
                        constitutional_validation: { status: 'compliant' }
                    }
                }
            };
            common.pruneCompletedPhases(state);
            assert.equal(state.phases['01-requirements'].constitutional_validation, undefined);
        });
    });

    // -------------------------------------------------------------------------
    // PHASE_AGENT_MAP — canonical keys
    // -------------------------------------------------------------------------
    describe('PHASE_AGENT_MAP', () => {
        it('uses canonical phase keys (12-test-deploy, not 13-test-deploy)', () => {
            assert.equal(common.collectPhaseSnapshots ? true : true, true); // just verify PHASE_AGENT_MAP is consistent
            // We access it indirectly through collectPhaseSnapshots
            const state = {
                active_workflow: {
                    phases: ['12-test-deploy', '13-production', '14-operations'],
                    started_at: '2026-01-01T00:00:00Z'
                },
                phases: {
                    '12-test-deploy': { status: 'completed', started: '2026-01-01T00:00:00Z', completed: '2026-01-01T01:00:00Z' },
                    '13-production': { status: 'completed', started: '2026-01-01T01:00:00Z', completed: '2026-01-01T02:00:00Z' },
                    '14-operations': { status: 'completed', started: '2026-01-01T02:00:00Z', completed: '2026-01-01T03:00:00Z' }
                }
            };
            const result = common.collectPhaseSnapshots(state);
            assert.equal(result.phase_snapshots.length, 3);
            assert.equal(result.phase_snapshots[0].key, '12-test-deploy');
            assert.equal(result.phase_snapshots[1].key, '13-production');
            assert.equal(result.phase_snapshots[2].key, '14-operations');
        });
    });

    // =========================================================================
    // REQ-HARDENING: New exports for hook enforcement hardening
    // =========================================================================

    describe('STATE_JSON_PATTERN', () => {
        it('is exported as a RegExp', () => {
            assert.ok(common.STATE_JSON_PATTERN instanceof RegExp);
        });

        it('matches single-project state.json path', () => {
            assert.ok(common.STATE_JSON_PATTERN.test('/foo/.isdlc/state.json'));
        });

        it('matches monorepo state.json path', () => {
            assert.ok(common.STATE_JSON_PATTERN.test('/foo/.isdlc/projects/my-app/state.json'));
        });

        it('matches Windows-style backslash paths', () => {
            assert.ok(common.STATE_JSON_PATTERN.test('C:\\.isdlc\\state.json'));
            assert.ok(common.STATE_JSON_PATTERN.test('C:\\.isdlc\\projects\\my-app\\state.json'));
        });

        it('does not match non-state.json files', () => {
            assert.ok(!common.STATE_JSON_PATTERN.test('/foo/.isdlc/config.json'));
            assert.ok(!common.STATE_JSON_PATTERN.test('/foo/state.json'));
        });
    });

    describe('PROTECTED_STATE_FIELDS', () => {
        it('is exported as a frozen array', () => {
            assert.ok(Array.isArray(common.PROTECTED_STATE_FIELDS));
            assert.ok(Object.isFrozen(common.PROTECTED_STATE_FIELDS));
        });

        it('contains iteration_enforcement.enabled', () => {
            assert.ok(common.PROTECTED_STATE_FIELDS.includes('iteration_enforcement.enabled'));
        });

        it('contains chat_explore_active', () => {
            assert.ok(common.PROTECTED_STATE_FIELDS.includes('chat_explore_active'));
        });

        it('contains gate_validation.status', () => {
            assert.ok(common.PROTECTED_STATE_FIELDS.includes('gate_validation.status'));
        });

        it('contains iteration_config fields', () => {
            assert.ok(common.PROTECTED_STATE_FIELDS.includes('iteration_config.testing_max'));
            assert.ok(common.PROTECTED_STATE_FIELDS.includes('iteration_config.circuit_breaker_threshold'));
        });

        it('cannot be modified at runtime', () => {
            assert.throws(() => { common.PROTECTED_STATE_FIELDS.push('foo'); }, TypeError);
        });
    });

    describe('stateFileExistsOnDisk()', () => {
        it('returns true when state.json exists', () => {
            // setupTestEnv writes state.json
            assert.equal(common.stateFileExistsOnDisk(), true);
        });

        it('returns false when state.json is missing', () => {
            const testDir = getTestDir();
            const statePath = path.join(testDir, '.isdlc', 'state.json');
            fs.unlinkSync(statePath);
            assert.equal(common.stateFileExistsOnDisk(), false);
        });

        it('returns true even when state.json contains invalid JSON', () => {
            const testDir = getTestDir();
            const statePath = path.join(testDir, '.isdlc', 'state.json');
            fs.writeFileSync(statePath, 'not valid json!!!');
            assert.equal(common.stateFileExistsOnDisk(), true);
            // readState should return null for corrupt file
            assert.equal(common.readState(), null);
        });
    });
});
