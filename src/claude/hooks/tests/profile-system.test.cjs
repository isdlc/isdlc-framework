'use strict';

/**
 * System Tests: end-to-end profile workflows
 *
 * Tests the complete lifecycle: discover -> validate -> resolve -> merge -> gate check
 * Traces to: FR-001 through FR-012
 * REQ-0049: Gate profiles — configurable strictness levels
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function freshRequire(mod) {
    const resolvedPath = require.resolve(mod);
    delete require.cache[resolvedPath];
    return require(mod);
}

let profileLoader;
let testDir;
let origEnv;

function setup() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-profile-sys-test-'));
    origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = testDir;
    fs.mkdirSync(path.join(testDir, '.isdlc', 'profiles'), { recursive: true });
    profileLoader = freshRequire('../lib/profile-loader.cjs');
}

function teardown() {
    if (origEnv !== undefined) {
        process.env.CLAUDE_PROJECT_DIR = origEnv;
    } else {
        delete process.env.CLAUDE_PROJECT_DIR;
    }
    if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
}

function writeProfile(dir, profile) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${profile.name}.json`), JSON.stringify(profile, null, 2));
}

// ---------------------------------------------------------------------------
// Full lifecycle tests
// ---------------------------------------------------------------------------

describe('profile system - end-to-end', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('complete workflow: discover + validate + resolve + check warnings', () => {
        // 1. Create a custom project profile
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'team-rapid',
            description: 'Team-specific rapid profile with 70% coverage',
            triggers: ['team-quick', 'dev-mode'],
            global_overrides: {
                constitutional_validation: { enabled: false },
                test_iteration: {
                    max_iterations: 3,
                    success_criteria: { min_coverage_percent: 70 }
                }
            }
        });

        // 2. Load all profiles
        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.profiles.has('team-rapid'));
        assert.ok(registry.profiles.has('rapid'));
        assert.ok(registry.profiles.has('standard'));
        assert.ok(registry.profiles.has('strict'));
        assert.equal(registry.profiles.size, 4);

        // 3. Resolve by name
        const resolved = profileLoader.resolveProfile('team-rapid', registry);
        assert.equal(resolved.source, 'project');
        assert.equal(resolved.profile.description, 'Team-specific rapid profile with 70% coverage');

        // 4. Match by trigger
        const matched = profileLoader.matchProfileByTrigger('switch to dev-mode please', registry);
        assert.ok(matched);
        assert.equal(matched.profile.name, 'team-rapid');

        // 5. Get overrides for a phase
        const overrides = profileLoader.resolveProfileOverrides('team-rapid', '06-implementation', registry);
        assert.equal(overrides.constitutional_validation.enabled, false);
        assert.equal(overrides.test_iteration.max_iterations, 3);

        // 6. Check threshold warnings
        const warnings = profileLoader.checkThresholdWarnings(resolved.profile, {});
        assert.ok(warnings.some(w => w.includes('70%')));
        assert.ok(warnings.some(w => w.includes('disables constitutional validation')));
        assert.ok(warnings.some(w => w.includes('reduces max iterations to 3')));
    });

    it('validate + heal + re-validate workflow', () => {
        // 1. Write a profile with nested typos
        const fp = path.join(testDir, '.isdlc', 'profiles', 'typo-profile.json');
        fs.writeFileSync(fp, JSON.stringify({
            name: 'typo-profile',
            description: 'Profile with typos',
            triggers: ['typo'],
            global_overrids: { // typo — top level
                tset_iteration: { enabled: false } // typo — nested (only visible after top-level fix)
            }
        }, null, 2));

        // 2. First validate — finds top-level typo
        const result1 = profileLoader.validateProfile(fp);
        assert.equal(result1.valid, false);
        assert.ok(result1.suggestions.length >= 1);

        // 3. First heal — fixes top-level typo (global_overrids -> global_overrides)
        const healed1 = profileLoader.healProfile(fp, result1.suggestions);
        assert.equal(healed1, true);

        // 4. Second validate — now sees nested typo (tset_iteration) inside the corrected global_overrides
        const result2 = profileLoader.validateProfile(fp);
        assert.equal(result2.valid, false);
        assert.ok(result2.suggestions.some(s => s.suggested === 'test_iteration'));

        // 5. Second heal — fixes nested typo
        const healed2 = profileLoader.healProfile(fp, result2.suggestions);
        assert.equal(healed2, true);

        // 6. Final validate — should pass now
        const result3 = profileLoader.validateProfile(fp);
        assert.equal(result3.valid, true);
        assert.equal(result3.errors.length, 0);
    });

    it('three-tier precedence: personal > project > built-in', () => {
        // Create a personal profiles directory (simulated)
        const personalDir = path.join(testDir, 'personal-profiles');
        fs.mkdirSync(personalDir, { recursive: true });

        // We can't easily test personal profiles since they use os.homedir()
        // Instead, test project > built-in (which we can control)
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'rapid',
            description: 'Project-level rapid override',
            triggers: ['quick', 'fast'],
            global_overrides: {
                test_iteration: { max_iterations: 1 }
            }
        });

        const registry = profileLoader.loadAllProfiles(testDir);
        const rapid = registry.profiles.get('rapid');
        assert.equal(rapid.source, 'project');
        assert.equal(rapid.profile.description, 'Project-level rapid override');
        assert.equal(rapid.profile.global_overrides.test_iteration.max_iterations, 1);
    });

    it('graceful degradation: all profile dirs missing', () => {
        // Remove project profiles dir
        fs.rmSync(path.join(testDir, '.isdlc', 'profiles'), { recursive: true });
        // Built-in profiles should still work
        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.profiles.has('standard'));
        assert.ok(registry.profiles.has('rapid'));
        assert.ok(registry.profiles.has('strict'));
    });

    it('mixed valid and invalid profiles in same directory', () => {
        // Valid profile
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'good-custom',
            description: 'Valid custom profile',
            triggers: ['good'],
            global_overrides: {}
        });

        // Invalid profile (missing triggers)
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'profiles', 'bad-custom.json'),
            JSON.stringify({ name: 'bad-custom', description: 'Missing triggers' })
        );

        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.profiles.has('good-custom'));
        assert.ok(!registry.profiles.has('bad-custom'));
    });

    it('profile with both global and phase-specific overrides merges correctly', () => {
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'hybrid',
            description: 'Hybrid profile',
            triggers: ['hybrid'],
            global_overrides: {
                test_iteration: { max_iterations: 5, success_criteria: { min_coverage_percent: 70 } },
                constitutional_validation: { enabled: false }
            },
            overrides: {
                '06-implementation': {
                    test_iteration: { max_iterations: 15 }
                },
                '08-code-review': {
                    constitutional_validation: { enabled: true, max_iterations: 3 }
                }
            }
        });

        const registry = profileLoader.loadAllProfiles(testDir);

        // Phase 06: global + phase-specific merge (phase max_iterations wins)
        const implOverrides = profileLoader.resolveProfileOverrides('hybrid', '06-implementation', registry);
        assert.equal(implOverrides.test_iteration.max_iterations, 15); // phase wins
        assert.equal(implOverrides.test_iteration.success_criteria.min_coverage_percent, 70); // global
        assert.equal(implOverrides.constitutional_validation.enabled, false); // global

        // Phase 08: global + phase-specific merge (phase constitutional wins)
        const crOverrides = profileLoader.resolveProfileOverrides('hybrid', '08-code-review', registry);
        assert.equal(crOverrides.constitutional_validation.enabled, true); // phase wins
        assert.equal(crOverrides.constitutional_validation.max_iterations, 3); // phase
        assert.equal(crOverrides.test_iteration.max_iterations, 5); // global (no phase override)

        // Phase 01: only global (no phase-specific)
        const reqOverrides = profileLoader.resolveProfileOverrides('hybrid', '01-requirements', registry);
        assert.equal(reqOverrides.test_iteration.max_iterations, 5);
        assert.equal(reqOverrides.constitutional_validation.enabled, false);
    });

    it('built-in profiles are all valid', () => {
        const builtinDir = profileLoader.getBuiltinProfilesDir();
        const files = fs.readdirSync(builtinDir).filter(f => f.endsWith('.json'));
        assert.ok(files.length >= 3, 'should have at least 3 built-in profiles');

        for (const file of files) {
            const fp = path.join(builtinDir, file);
            const result = profileLoader.validateProfile(fp);
            assert.equal(result.valid, true, `Built-in profile ${file} should be valid: ${JSON.stringify(result.errors)}`);
        }
    });
});
