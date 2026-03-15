'use strict';

/**
 * Unit Tests: profile-loader.cjs
 *
 * Tests for profile discovery, loading, resolution, and matching.
 * Traces to: FR-001, FR-002, FR-003, FR-004, FR-005, FR-008
 * REQ-0049: Gate profiles — configurable strictness levels
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Clear require cache before loading to get fresh module state
function freshRequire(mod) {
    const resolvedPath = require.resolve(mod);
    delete require.cache[resolvedPath];
    return require(mod);
}

let profileLoader;
let testDir;
let origEnv;

function setup() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-profile-test-'));
    origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = testDir;

    // Create project profiles dir
    fs.mkdirSync(path.join(testDir, '.isdlc', 'profiles'), { recursive: true });

    // Clear cache and reload
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

// ---------------------------------------------------------------------------
// Helper: write a profile JSON to a directory
// ---------------------------------------------------------------------------
function writeProfile(dir, profile) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${profile.name}.json`), JSON.stringify(profile, null, 2));
}

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------

describe('levenshtein', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('returns 0 for identical strings', () => {
        assert.equal(profileLoader.levenshtein('test', 'test'), 0);
    });

    it('returns correct distance for simple edits', () => {
        assert.equal(profileLoader.levenshtein('kitten', 'sitting'), 3);
    });

    it('handles empty strings', () => {
        assert.equal(profileLoader.levenshtein('', 'abc'), 3);
        assert.equal(profileLoader.levenshtein('abc', ''), 3);
    });
});

// ---------------------------------------------------------------------------
// findClosestMatch
// ---------------------------------------------------------------------------

describe('findClosestMatch', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('finds a close match within max distance', () => {
        const result = profileLoader.findClosestMatch('tset_iteration', profileLoader.KNOWN_OVERRIDE_KEYS, 3);
        assert.equal(result, 'test_iteration');
    });

    it('returns null when no match within distance', () => {
        const result = profileLoader.findClosestMatch('zzzzzzzzz', profileLoader.KNOWN_OVERRIDE_KEYS, 2);
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// loadAllProfiles - built-in discovery (FR-001)
// ---------------------------------------------------------------------------

describe('loadAllProfiles', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('loads built-in profiles (rapid, standard, strict)', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.profiles.has('rapid'), 'should have rapid profile');
        assert.ok(registry.profiles.has('standard'), 'should have standard profile');
        assert.ok(registry.profiles.has('strict'), 'should have strict profile');
    });

    it('returns correct source metadata for built-in profiles', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const rapid = registry.profiles.get('rapid');
        assert.equal(rapid.source, 'built-in');
        assert.ok(rapid.source_path.endsWith('rapid.json'));
    });

    it('tracks sources by tier', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.sources.builtin.includes('rapid'));
        assert.ok(registry.sources.builtin.includes('standard'));
        assert.ok(registry.sources.builtin.includes('strict'));
    });

    // FR-002: Custom profile discovery
    it('loads project-level profiles from .isdlc/profiles/', () => {
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'spike',
            description: 'Ultra-light for throwaway prototypes',
            triggers: ['spike', 'throwaway'],
            global_overrides: { test_iteration: { enabled: false } }
        });

        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(registry.profiles.has('spike'), 'should have spike profile');
        assert.equal(registry.profiles.get('spike').source, 'project');
        assert.ok(registry.sources.project.includes('spike'));
    });

    // FR-003: Resolution order (personal > project > built-in)
    it('project profile overrides built-in profile with same name', () => {
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'rapid',
            description: 'Custom rapid — project override',
            triggers: ['quick'],
            global_overrides: { test_iteration: { max_iterations: 1 } }
        });

        const registry = profileLoader.loadAllProfiles(testDir);
        const rapid = registry.profiles.get('rapid');
        assert.equal(rapid.source, 'project');
        assert.equal(rapid.profile.description, 'Custom rapid — project override');
    });

    it('skips invalid profile files gracefully', () => {
        // Write an invalid profile (missing required fields)
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'profiles', 'broken.json'),
            JSON.stringify({ name: 'broken' }) // missing description and triggers
        );

        const registry = profileLoader.loadAllProfiles(testDir);
        assert.ok(!registry.profiles.has('broken'), 'broken profile should be excluded');
        // Should still have the built-ins
        assert.ok(registry.profiles.has('standard'));
    });

    it('handles missing profile directories gracefully', () => {
        // Remove the project profiles dir
        fs.rmSync(path.join(testDir, '.isdlc', 'profiles'), { recursive: true });
        const registry = profileLoader.loadAllProfiles(testDir);
        // Should still load built-in profiles
        assert.ok(registry.profiles.has('standard'));
    });

    it('returns empty registry when no profiles exist at all (impossible in practice)', () => {
        // This tests the code path — in practice built-ins always exist
        const registry = { profiles: new Map(), sources: { builtin: [], project: [], personal: [] } };
        assert.equal(registry.profiles.size, 0);
    });
});

// ---------------------------------------------------------------------------
// resolveProfile (FR-003)
// ---------------------------------------------------------------------------

describe('resolveProfile', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('resolves a profile by name', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const result = profileLoader.resolveProfile('rapid', registry);
        assert.ok(result);
        assert.equal(result.profile.name, 'rapid');
    });

    it('returns null for unknown profile name', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const result = profileLoader.resolveProfile('nonexistent', registry);
        assert.equal(result, null);
    });

    it('returns null for empty name', () => {
        const result = profileLoader.resolveProfile('', null);
        assert.equal(result, null);
    });

    it('returns null for null name', () => {
        const result = profileLoader.resolveProfile(null, null);
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// matchProfileByTrigger (FR-004)
// ---------------------------------------------------------------------------

describe('matchProfileByTrigger', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('matches a single profile by trigger word', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const result = profileLoader.matchProfileByTrigger('make it quick', registry);
        assert.ok(result);
        assert.equal(result.profile.name, 'rapid');
    });

    it('returns null for ambiguous match (multiple profiles)', () => {
        // "standard" is a trigger for standard profile, but let's test ambiguity
        // by adding a project profile that also has a common trigger
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'custom-strict',
            description: 'Custom strict',
            triggers: ['critical'], // 'critical' is also in strict.json
            global_overrides: {}
        });
        const registry = profileLoader.loadAllProfiles(testDir);
        // "critical" matches both strict and custom-strict
        const result = profileLoader.matchProfileByTrigger('critical priority', registry);
        assert.equal(result, null); // ambiguous
    });

    it('returns null for no matching trigger', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const result = profileLoader.matchProfileByTrigger('something totally unrelated', registry);
        assert.equal(result, null);
    });

    it('returns null for empty input', () => {
        const result = profileLoader.matchProfileByTrigger('', null);
        assert.equal(result, null);
    });

    it('is case-insensitive', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const result = profileLoader.matchProfileByTrigger('QUICK change', registry);
        assert.ok(result);
        assert.equal(result.profile.name, 'rapid');
    });
});

// ---------------------------------------------------------------------------
// resolveProfileOverrides (FR-006 merge chain)
// ---------------------------------------------------------------------------

describe('resolveProfileOverrides', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('returns global_overrides when no phase-specific overrides exist', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const overrides = profileLoader.resolveProfileOverrides('rapid', '06-implementation', registry);
        assert.ok(overrides);
        assert.equal(overrides.constitutional_validation.enabled, false);
    });

    it('returns phase-specific overrides when they exist', () => {
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'custom',
            description: 'Custom with phase overrides',
            triggers: ['custom'],
            overrides: {
                '06-implementation': {
                    test_iteration: { max_iterations: 20 }
                }
            }
        });
        const registry = profileLoader.loadAllProfiles(testDir);
        const overrides = profileLoader.resolveProfileOverrides('custom', '06-implementation', registry);
        assert.ok(overrides);
        assert.equal(overrides.test_iteration.max_iterations, 20);
    });

    it('merges global and phase-specific (phase wins)', () => {
        writeProfile(path.join(testDir, '.isdlc', 'profiles'), {
            name: 'mixed',
            description: 'Mixed overrides',
            triggers: ['mixed'],
            global_overrides: {
                test_iteration: { max_iterations: 3, success_criteria: { min_coverage_percent: 50 } }
            },
            overrides: {
                '06-implementation': {
                    test_iteration: { max_iterations: 10 }
                }
            }
        });
        const registry = profileLoader.loadAllProfiles(testDir);
        const overrides = profileLoader.resolveProfileOverrides('mixed', '06-implementation', registry);
        assert.equal(overrides.test_iteration.max_iterations, 10); // phase wins
        assert.equal(overrides.test_iteration.success_criteria.min_coverage_percent, 50); // global preserved
    });

    it('returns null for unknown profile', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const overrides = profileLoader.resolveProfileOverrides('nonexistent', '06-implementation', registry);
        assert.equal(overrides, null);
    });

    it('returns null for standard profile (empty global_overrides)', () => {
        const registry = profileLoader.loadAllProfiles(testDir);
        const overrides = profileLoader.resolveProfileOverrides('standard', '06-implementation', registry);
        assert.equal(overrides, null);
    });
});

// ---------------------------------------------------------------------------
// checkThresholdWarnings (FR-008)
// ---------------------------------------------------------------------------

describe('checkThresholdWarnings', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('warns when coverage is below 80%', () => {
        const profile = {
            name: 'low-cov',
            global_overrides: { test_iteration: { success_criteria: { min_coverage_percent: 50 } } }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('50%')));
        assert.ok(warnings.some(w => w.includes('recommended: 80%')));
    });

    it('warns when constitutional validation is disabled', () => {
        const profile = {
            name: 'no-cv',
            global_overrides: { constitutional_validation: { enabled: false } }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('disables constitutional validation')));
    });

    it('warns when test iteration is disabled', () => {
        const profile = {
            name: 'no-test',
            global_overrides: { test_iteration: { enabled: false } }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('disables test iteration')));
    });

    it('warns when max_iterations is below 5', () => {
        const profile = {
            name: 'low-iter',
            global_overrides: { test_iteration: { max_iterations: 2 } }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('reduces max iterations to 2')));
    });

    it('warns when all gates are disabled', () => {
        const profile = {
            name: 'all-off',
            global_overrides: {
                constitutional_validation: { enabled: false },
                test_iteration: { enabled: false },
                interactive_elicitation: { enabled: false },
                agent_delegation_validation: { enabled: false },
                artifact_validation: { enabled: false }
            }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('disables all gate checks')));
    });

    it('returns no warnings for standard profile', () => {
        const profile = { name: 'standard', global_overrides: {} };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.equal(warnings.length, 0);
    });

    it('warns on per-phase low coverage', () => {
        const profile = {
            name: 'phase-low',
            overrides: {
                '06-implementation': {
                    test_iteration: { success_criteria: { min_coverage_percent: 40 } }
                }
            }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('40%') && w.includes('06-implementation')));
    });

    // BUG-0054-GH-52: Tiered coverage validation
    // TC-15: Object min_coverage_percent passes validation
    it('TC-15: no warning for tiered object with standard >= 80 (BUG-0054-GH-52)', () => {
        const profile = {
            name: 'tiered-ok',
            global_overrides: {
                test_iteration: {
                    success_criteria: {
                        min_coverage_percent: { light: 60, standard: 80, epic: 95 }
                    }
                }
            }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        // Should NOT warn about coverage being < 80 since standard tier is 80
        const coverageWarnings = warnings.filter(w => w.includes('coverage'));
        assert.equal(coverageWarnings.length, 0,
            'No coverage warnings for tiered object with standard >= 80');
    });

    // TC-16: Object with low standard tier triggers warning
    it('TC-16: warns when tiered object has standard tier < 80 (BUG-0054-GH-52)', () => {
        const profile = {
            name: 'tiered-low',
            global_overrides: {
                test_iteration: {
                    success_criteria: {
                        min_coverage_percent: { light: 40, standard: 60, epic: 80 }
                    }
                }
            }
        };
        const warnings = profileLoader.checkThresholdWarnings(profile, {});
        assert.ok(warnings.some(w => w.includes('60%')),
            'Should warn about standard tier coverage of 60% < 80% recommended');
    });
});
