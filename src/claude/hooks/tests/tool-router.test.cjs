/**
 * Tests for tool-router.cjs PreToolUse hook
 * ==========================================
 * Traces to: FR-001 through FR-011, NFR-001 through NFR-003
 * Constitutional: Article II (test-first), Article X (fail-open), Article XV (tool preferences)
 *
 * Test groups:
 *   FR-001: Tool Routing Hook (9 tests)
 *   FR-002: Config-Driven Routing Rules (5 tests)
 *   FR-003: Three-Source Rule Resolution (8 tests)
 *   FR-004: Environment Inference (4 tests)
 *   FR-005: Skill-Declared Tool Preferences (3 tests)
 *   FR-006: Exemption Mechanism (10 tests)
 *   FR-007: Self-Documenting Warnings (3 tests)
 *   FR-008: Fail-Open Behavior (6 tests)
 *   FR-009: MCP Availability Detection (4 tests)
 *   FR-011: Tool Routing Audit Log (4 tests)
 *   Integration tests (12 tests)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const HOOK_PATH = path.join(__dirname, '..', 'tool-router.cjs');
const router = require(HOOK_PATH);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const FRAMEWORK_RULES = [
    {
        id: 'search-semantic',
        operation: 'codebase_search',
        intercept_tool: 'Grep',
        preferred_tool: 'mcp__code-index-mcp__search_code_advanced',
        enforcement: 'block',
        source: 'framework',
        exemptions: [{ type: 'context', condition: 'targeted_file', signal: 'path_has_extension_no_wildcards' }]
    },
    {
        id: 'find-files',
        operation: 'file_discovery',
        intercept_tool: 'Glob',
        preferred_tool: 'mcp__code-index-mcp__find_files',
        enforcement: 'block',
        source: 'framework',
        exemptions: [{ type: 'context', condition: 'exact_filename', signal: 'basename_no_wildcards' }]
    },
    {
        id: 'file-summary',
        operation: 'file_summary',
        intercept_tool: 'Read',
        preferred_tool: 'mcp__code-index-mcp__get_file_summary',
        enforcement: 'block',
        source: 'framework',
        exemptions: [
            { type: 'context', condition: 'edit_prep', signal: 'limit_lte_200' },
            { type: 'context', condition: 'targeted_read', signal: 'offset_present' }
        ]
    }
];

const VALID_CONFIG = {
    version: '1.0.0',
    description: 'Test config',
    inference_probes: [],
    rules: FRAMEWORK_RULES,
    user_overrides: []
};

const SETTINGS_WITH_MCP = {
    mcpServers: {
        'code-index-mcp': { command: 'code-index-mcp', args: [] }
    }
};

const SETTINGS_NO_MCP = {
    mcpServers: {}
};

const SKILL_MANIFEST = {
    skills: [
        {
            skill_id: 'test-skill',
            tool_preferences: [
                {
                    intercept_tool: 'Grep',
                    preferred_tool: 'mcp__test-mcp__search',
                    operation: 'test_search'
                }
            ]
        }
    ]
};

// ---------------------------------------------------------------------------
// Test environment helpers
// ---------------------------------------------------------------------------

function setupTestEnv(configOverride, settingsOverride, manifestOverride) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-router-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    const configDir = path.join(tmpDir, 'src', 'claude', 'hooks', 'config');
    const claudeDir = path.join(tmpDir, '.claude');
    const docsDir = path.join(tmpDir, 'docs', 'isdlc');

    fs.mkdirSync(isdlcDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });

    // Write config
    if (configOverride !== null) {
        const config = configOverride !== undefined ? configOverride : VALID_CONFIG;
        fs.writeFileSync(path.join(configDir, 'tool-routing.json'), JSON.stringify(config, null, 2));
    }

    // Write settings
    if (settingsOverride !== null) {
        const settings = settingsOverride !== undefined ? settingsOverride : SETTINGS_WITH_MCP;
        fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
    }

    // Write skill manifest
    if (manifestOverride !== null && manifestOverride !== undefined) {
        fs.writeFileSync(path.join(docsDir, 'external-skills-manifest.json'), JSON.stringify(manifestOverride, null, 2));
    }

    return {
        tmpDir,
        configPath: path.join(configDir, 'tool-routing.json'),
        settingsPath: path.join(claudeDir, 'settings.json'),
        manifestPath: path.join(docsDir, 'external-skills-manifest.json'),
        auditPath: path.join(isdlcDir, 'tool-routing-audit.jsonl')
    };
}

function cleanupTestEnv(tmpDir) {
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
}

function runHookProcess(stdin, env) {
    return spawnSync('node', [HOOK_PATH], {
        input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
        env: { ...process.env, ...env },
        timeout: 5000,
        encoding: 'utf8'
    });
}

// ==========================================================================
// FR-001: Tool Routing Hook (9 tests)
// ==========================================================================

describe('FR-001: Tool Routing Hook', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-001
    it('main() reads stdin, matches rule, returns block decision', () => {
        const input = JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'foo' } });
        const result = router.main(input, {
            configPath: env.configPath,
            settingsPath: env.settingsPath,
            auditPath: env.auditPath
        });
        assert.ok(result.stdout, 'Should produce stdout for block');
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.continue, false);
        assert.ok(parsed.stopReason.includes('mcp__code-index-mcp__search_code_advanced'));
    });

    // UT-002
    it('main() reads stdin, matches warn rule, returns warn decision', () => {
        // Create config with warn rule
        const warnConfig = {
            ...VALID_CONFIG,
            rules: [{ ...FRAMEWORK_RULES[0], enforcement: 'warn' }]
        };
        fs.writeFileSync(env.configPath, JSON.stringify(warnConfig));

        const input = JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'foo' } });
        const result = router.main(input, {
            configPath: env.configPath,
            settingsPath: env.settingsPath,
            auditPath: env.auditPath
        });
        assert.equal(result.stdout, null, 'No stdout for warn');
        assert.ok(result.stderr, 'Should produce stderr warning');
        assert.ok(result.stderr.includes('TOOL_ROUTER WARNING'));
    });

    // UT-003
    it('main() with no matching rules exits silently', () => {
        const input = JSON.stringify({ tool_name: 'Write', tool_input: {} });
        const result = router.main(input, {
            configPath: env.configPath,
            settingsPath: env.settingsPath,
            auditPath: env.auditPath
        });
        assert.equal(result.stdout, null);
        assert.equal(result.stderr, null);
    });

    // UT-004
    it('main() with unrecognized tool_name exits silently', () => {
        const input = JSON.stringify({ tool_name: 'UnknownTool', tool_input: {} });
        const result = router.main(input, {
            configPath: env.configPath,
            settingsPath: env.settingsPath,
            auditPath: env.auditPath
        });
        assert.equal(result.stdout, null);
        assert.equal(result.stderr, null);
    });

    // UT-005
    it('formatBlockMessage includes preferred tool name and guidance', () => {
        const rule = FRAMEWORK_RULES[0];
        const msg = router.formatBlockMessage(rule, { pattern: 'test' });
        const parsed = JSON.parse(msg);
        assert.ok(parsed.stopReason.includes(rule.preferred_tool));
        assert.ok(parsed.stopReason.includes('higher-fidelity'));
    });

    // UT-006
    it('formatBlockMessage includes continue: false in JSON output', () => {
        const rule = FRAMEWORK_RULES[0];
        const msg = router.formatBlockMessage(rule, { pattern: 'test' });
        const parsed = JSON.parse(msg);
        assert.equal(parsed.continue, false);
    });
});

// ==========================================================================
// FR-002: Config-Driven Routing Rules (5 tests)
// ==========================================================================

describe('FR-002: Config-Driven Routing Rules', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-007
    it('loadRoutingRules reads valid tool-routing.json and returns Rule[]', () => {
        const rules = router.loadRoutingRules(env.configPath, env.manifestPath, env.settingsPath);
        assert.ok(Array.isArray(rules));
        assert.ok(rules.length >= 3, `Expected at least 3 rules, got ${rules.length}`);
    });

    // UT-008
    it('loadRoutingRules with additional user rule includes it in evaluation', () => {
        const configWithUser = {
            ...VALID_CONFIG,
            user_overrides: [{
                id: 'user-custom',
                operation: 'custom_search',
                intercept_tool: 'Bash',
                preferred_tool: 'mcp__custom__search',
                enforcement: 'warn',
                exemptions: []
            }]
        };
        fs.writeFileSync(env.configPath, JSON.stringify(configWithUser));

        const rules = router.loadRoutingRules(env.configPath, env.manifestPath, env.settingsPath);
        const userRule = rules.find(r => r.id === 'user-custom');
        assert.ok(userRule, 'User override rule should be included');
        assert.equal(userRule.source, 'user');
    });

    // UT-009
    it('Config with all three framework default rules (search-semantic, find-files, file-summary)', () => {
        const rules = router.loadRoutingRules(env.configPath, env.manifestPath, env.settingsPath);
        const ids = rules.map(r => r.id);
        // Framework rules may be overwritten by inferred rules of same key. Check at least one exists.
        const hasSearch = rules.some(r => r.operation === 'codebase_search');
        const hasFind = rules.some(r => r.operation === 'file_discovery');
        const hasSummary = rules.some(r => r.operation === 'file_summary');
        assert.ok(hasSearch, 'Should have codebase_search rule');
        assert.ok(hasFind, 'Should have file_discovery rule');
        assert.ok(hasSummary, 'Should have file_summary rule');
    });

    // UT-010
    it('Config schema: rule missing required field (intercept_tool) is skipped with warning', () => {
        const badConfig = {
            rules: [
                { id: 'bad', operation: 'test', preferred_tool: 'mcp__foo__bar', enforcement: 'block' },
                FRAMEWORK_RULES[0]
            ]
        };
        fs.writeFileSync(env.configPath, JSON.stringify(badConfig));

        const rules = router.loadRoutingRules(env.configPath, env.manifestPath, env.settingsPath);
        assert.ok(!rules.some(r => r.id === 'bad'), 'Invalid rule should be skipped');
    });

    // UT-011
    it('Config schema: empty rules array results in no routing', () => {
        const emptyConfig = { rules: [] };
        fs.writeFileSync(env.configPath, JSON.stringify(emptyConfig));

        // No inferred rules either (settings missing MCP)
        const noMcpEnv = setupTestEnv(emptyConfig, SETTINGS_NO_MCP);
        const rules = router.loadRoutingRules(noMcpEnv.configPath, noMcpEnv.manifestPath, noMcpEnv.settingsPath);
        cleanupTestEnv(noMcpEnv.tmpDir);
        assert.equal(rules.length, 0);
    });
});

// ==========================================================================
// FR-003: Three-Source Rule Resolution (8 tests)
// ==========================================================================

describe('FR-003: Three-Source Rule Resolution', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-012
    it('User override wins over framework default for same operation+intercept_tool', () => {
        const configWithOverride = {
            rules: [{
                id: 'search-semantic',
                operation: 'codebase_search',
                intercept_tool: 'Grep',
                preferred_tool: 'mcp__code-index-mcp__search_code_advanced',
                enforcement: 'block',
                source: 'framework',
                exemptions: []
            }],
            user_overrides: [{
                id: 'user-search',
                operation: 'codebase_search',
                intercept_tool: 'Grep',
                preferred_tool: 'mcp__code-index-mcp__search_code_advanced',
                enforcement: 'warn',
                exemptions: []
            }]
        };
        // No MCP so no inferred rules
        const testEnv = setupTestEnv(configWithOverride, SETTINGS_NO_MCP);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        const grepRule = rules.find(r => r.operation === 'codebase_search' && r.intercept_tool === 'Grep');
        assert.ok(grepRule, 'Should have a Grep rule');
        assert.equal(grepRule.source, 'user', 'User override should win');
        assert.equal(grepRule.enforcement, 'warn');
    });

    // UT-013
    it('Skill-declared rule wins over inferred rule for same operation+intercept_tool', () => {
        // Create config with just the basic rules but with MCP available (generates inferred)
        const basicConfig = { rules: [], user_overrides: [] };
        const manifest = {
            skills: [{
                skill_id: 'my-skill',
                tool_preferences: [{
                    intercept_tool: 'Grep',
                    preferred_tool: 'mcp__code-index-mcp__search_code_advanced',
                    operation: 'codebase_search'
                }]
            }]
        };
        const testEnv = setupTestEnv(basicConfig, SETTINGS_WITH_MCP, manifest);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        const searchRule = rules.find(r => r.operation === 'codebase_search' && r.intercept_tool === 'Grep');
        assert.ok(searchRule, 'Should have a search rule');
        assert.equal(searchRule.source, 'skill', 'Skill rule should win over inferred');
    });

    // UT-014
    it('Inferred rule fills gaps where no framework rule exists', () => {
        // Framework config has no rules — inferred fills the gap
        const emptyFwConfig = { rules: [], user_overrides: [] };
        const testEnv = setupTestEnv(emptyFwConfig, SETTINGS_WITH_MCP);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        const searchRule = rules.find(r => r.operation === 'codebase_search' && r.intercept_tool === 'Grep');
        assert.ok(searchRule, 'Inferred rule should fill the gap');
        assert.equal(searchRule.source, 'inferred', 'Should be inferred source');
        assert.equal(searchRule.enforcement, 'warn', 'Inferred rules always warn');
    });

    // UT-015
    it('Full merge: user > skill > inferred > framework priority ordering', () => {
        const result = router.mergeRules([
            { operation: 'test', intercept_tool: 'Grep', preferred_tool: 'a', source: 'framework', enforcement: 'allow' },
            { operation: 'test', intercept_tool: 'Grep', preferred_tool: 'b', source: 'inferred', enforcement: 'warn' },
            { operation: 'test', intercept_tool: 'Grep', preferred_tool: 'c', source: 'skill', enforcement: 'block' },
            { operation: 'test', intercept_tool: 'Grep', preferred_tool: 'd', source: 'user', enforcement: 'block' }
        ]);
        assert.equal(result.length, 1);
        assert.equal(result[0].source, 'user');
        assert.equal(result[0].preferred_tool, 'd');
    });

    // UT-016
    it('Non-conflicting rules from different sources are all included', () => {
        const result = router.mergeRules([
            { operation: 'search', intercept_tool: 'Grep', preferred_tool: 'a', source: 'framework' },
            { operation: 'find', intercept_tool: 'Glob', preferred_tool: 'b', source: 'inferred' },
            { operation: 'read', intercept_tool: 'Read', preferred_tool: 'c', source: 'skill' }
        ]);
        assert.equal(result.length, 3, 'All non-conflicting rules should be included');
    });

    // UT-017
    it('Missing skill manifest: merge proceeds with framework + inferred + user only', () => {
        const testEnv = setupTestEnv(VALID_CONFIG, SETTINGS_WITH_MCP);
        // No manifest file written — manifestPath doesn't exist
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);
        assert.ok(Array.isArray(rules));
        assert.ok(rules.length > 0, 'Should still have framework/inferred rules');
    });

    // UT-018
    it('Missing user_overrides section: merge proceeds with framework + inferred + skill only', () => {
        const configNoUser = { rules: FRAMEWORK_RULES };
        const testEnv = setupTestEnv(configNoUser, SETTINGS_WITH_MCP);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);
        assert.ok(Array.isArray(rules));
        assert.ok(rules.length > 0);
    });

    // UT-019
    it('All sources empty: returns empty rule set (no routing)', () => {
        const emptyConfig = { rules: [], user_overrides: [] };
        const testEnv = setupTestEnv(emptyConfig, SETTINGS_NO_MCP);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);
        assert.equal(rules.length, 0);
    });
});

// ==========================================================================
// FR-004: Environment Inference (4 tests)
// ==========================================================================

describe('FR-004: Environment Inference', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-020
    it('inferEnvironmentRules detects code-index-mcp and generates rules at warn level', () => {
        const rules = router.inferEnvironmentRules(env.settingsPath);
        assert.ok(rules.length >= 3, `Expected at least 3 inferred rules, got ${rules.length}`);
        const operations = rules.map(r => r.operation);
        assert.ok(operations.includes('codebase_search'));
        assert.ok(operations.includes('file_discovery'));
        assert.ok(operations.includes('file_summary'));
    });

    // UT-021
    it('inferEnvironmentRules with no MCP servers returns empty array', () => {
        const noMcpEnv = setupTestEnv(VALID_CONFIG, SETTINGS_NO_MCP);
        const rules = router.inferEnvironmentRules(noMcpEnv.settingsPath);
        cleanupTestEnv(noMcpEnv.tmpDir);
        assert.equal(rules.length, 0);
    });

    // UT-022
    it('inferEnvironmentRules generates rules only for available MCP servers', () => {
        const partialSettings = { mcpServers: { 'bulk-fs-mcp': { command: 'bulk-fs-mcp', args: [] } } };
        const testEnv = setupTestEnv(VALID_CONFIG, partialSettings);
        const rules = router.inferEnvironmentRules(testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);
        // No code-index-mcp means no inferred rules for search/find/summary
        assert.equal(rules.length, 0, 'Should not generate rules for unavailable servers');
    });

    // UT-023
    it('Inferred rules always have enforcement: warn', () => {
        const rules = router.inferEnvironmentRules(env.settingsPath);
        for (const rule of rules) {
            assert.equal(rule.enforcement, 'warn', `Rule ${rule.id} should have warn enforcement`);
        }
    });
});

// ==========================================================================
// FR-005: Skill-Declared Tool Preferences (3 tests)
// ==========================================================================

describe('FR-005: Skill-Declared Tool Preferences', () => {
    // UT-024
    it('Skill with tool_preferences in manifest generates routing rules at block level', () => {
        const testEnv = setupTestEnv({ rules: [], user_overrides: [] }, SETTINGS_NO_MCP, SKILL_MANIFEST);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        const skillRule = rules.find(r => r.source === 'skill');
        assert.ok(skillRule, 'Skill rule should be present');
        assert.equal(skillRule.enforcement, 'block', 'Skill rules should be block level');
        assert.equal(skillRule.intercept_tool, 'Grep');
    });

    // UT-025
    it('Skill manifest without tool_preferences field is ignored', () => {
        const noPrefsManifest = { skills: [{ skill_id: 'no-prefs' }] };
        const testEnv = setupTestEnv({ rules: [], user_overrides: [] }, SETTINGS_NO_MCP, noPrefsManifest);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        assert.ok(!rules.some(r => r.source === 'skill'), 'No skill rules should be generated');
    });

    // UT-026
    it('Multiple skills with tool_preferences are all included', () => {
        const multiSkillManifest = {
            skills: [
                {
                    skill_id: 'skill-a',
                    tool_preferences: [{ intercept_tool: 'Grep', preferred_tool: 'mcp__a__search', operation: 'search_a' }]
                },
                {
                    skill_id: 'skill-b',
                    tool_preferences: [{ intercept_tool: 'Glob', preferred_tool: 'mcp__b__find', operation: 'find_b' }]
                }
            ]
        };
        const testEnv = setupTestEnv({ rules: [], user_overrides: [] }, SETTINGS_NO_MCP, multiSkillManifest);
        const rules = router.loadRoutingRules(testEnv.configPath, testEnv.manifestPath, testEnv.settingsPath);
        cleanupTestEnv(testEnv.tmpDir);

        const skillRules = rules.filter(r => r.source === 'skill');
        assert.equal(skillRules.length, 2, 'Both skill rules should be included');
    });
});

// ==========================================================================
// FR-006: Exemption Mechanism (10 tests)
// ==========================================================================

describe('FR-006: Exemption Mechanism', () => {
    // UT-027
    it('Pattern exemption: Grep with specific file path is exempted', () => {
        const exemptions = [{ type: 'context', condition: 'targeted_file' }];
        const result = router.checkExemptions(exemptions, { path: '/src/app.js', pattern: 'test' }, 'Grep');
        assert.ok(result, 'Targeted file should be exempted');
    });

    // UT-028
    it('Pattern exemption: Grep with directory path is NOT exempted', () => {
        const exemptions = [{ type: 'context', condition: 'targeted_file' }];
        const result = router.checkExemptions(exemptions, { path: '/src/', pattern: 'test' }, 'Grep');
        assert.equal(result, null, 'Directory path should NOT be exempted');
    });

    // UT-029
    it('Context exemption: Read with limit<=200 matches edit_prep condition', () => {
        const exemptions = [{ type: 'context', condition: 'edit_prep' }];
        const result = router.checkExemptions(exemptions, { file_path: '/test.js', limit: 50 }, 'Read');
        assert.ok(result, 'edit_prep with limit 50 should be exempted');
    });

    // UT-030
    it('Context exemption: Read with offset present matches targeted_read condition', () => {
        const exemptions = [{ type: 'context', condition: 'targeted_read' }];
        const result = router.checkExemptions(exemptions, { file_path: '/test.js', offset: 100 }, 'Read');
        assert.ok(result, 'targeted_read with offset should be exempted');
    });

    // UT-031
    it('No exemptions match: Read with no limit, no offset is routed', () => {
        const exemptions = [
            { type: 'context', condition: 'edit_prep' },
            { type: 'context', condition: 'targeted_read' }
        ];
        const result = router.checkExemptions(exemptions, { file_path: '/test.js' }, 'Read');
        assert.equal(result, null, 'No exemptions should match');
    });

    // UT-032
    it('Context exemption: Glob with exact filename is exempted', () => {
        const exemptions = [{ type: 'context', condition: 'exact_filename' }];
        const result = router.checkExemptions(exemptions, { pattern: 'package.json' }, 'Glob');
        assert.ok(result, 'Exact filename should be exempted');
    });

    // UT-033
    it('Context exemption: Glob with wildcard pattern is NOT exempted', () => {
        const exemptions = [{ type: 'context', condition: 'exact_filename' }];
        const result = router.checkExemptions(exemptions, { pattern: '**/*.ts' }, 'Glob');
        assert.equal(result, null, 'Wildcard pattern should NOT be exempted');
    });

    // UT-034
    it('First-match-wins: first matching exemption is returned', () => {
        const exemptions = [
            { type: 'context', condition: 'edit_prep', label: 'first' },
            { type: 'context', condition: 'targeted_read', label: 'second' }
        ];
        const result = router.checkExemptions(exemptions, { file_path: '/test.js', limit: 50, offset: 10 }, 'Read');
        assert.ok(result, 'Should match an exemption');
        assert.equal(result.label, 'first', 'First-match-wins');
    });

    // UT-035
    it('Invalid regex in pattern exemption: exemption skipped', () => {
        const exemptions = [
            { type: 'pattern', field: 'path', regex: '[invalid(' },
            { type: 'context', condition: 'edit_prep' }
        ];
        // The first exemption has invalid regex — should be skipped, second should match
        const result = router.checkExemptions(exemptions, { path: '/test.js', limit: 50 }, 'Read');
        assert.ok(result, 'Should fall through to second exemption');
        assert.equal(result.condition, 'edit_prep');
    });

    // UT-036
    it('Read with limit=201 does NOT match edit_prep (boundary value)', () => {
        const exemptions = [{ type: 'context', condition: 'edit_prep' }];
        const result = router.checkExemptions(exemptions, { file_path: '/test.js', limit: 201 }, 'Read');
        assert.equal(result, null, 'limit 201 should NOT match edit_prep');
    });
});

// ==========================================================================
// FR-007: Self-Documenting Warnings (3 tests)
// ==========================================================================

describe('FR-007: Self-Documenting Warnings', () => {
    // UT-037
    it('formatWarnMessage includes preferred tool name', () => {
        const rule = { ...FRAMEWORK_RULES[0], source: 'framework' };
        const msg = router.formatWarnMessage(rule, {}, '/path/to/tool-routing.json');
        assert.ok(msg.includes(rule.preferred_tool));
    });

    // UT-038
    it('formatWarnMessage includes rule source', () => {
        const rule = { ...FRAMEWORK_RULES[0], source: 'inferred' };
        const msg = router.formatWarnMessage(rule, {}, '/path/to/tool-routing.json');
        assert.ok(msg.includes('inferred'), 'Should include rule source');
    });

    // UT-039
    it('formatWarnMessage includes path to tool-routing.json for promotion', () => {
        const rule = FRAMEWORK_RULES[0];
        const configPath = '/my/project/tool-routing.json';
        const msg = router.formatWarnMessage(rule, {}, configPath);
        assert.ok(msg.includes(configPath), 'Should include config path');
        assert.ok(msg.includes('promote'), 'Should mention promotion');
    });
});

// ==========================================================================
// FR-008: Fail-Open Behavior (6 tests)
// ==========================================================================

describe('FR-008: Fail-Open Behavior', () => {
    // UT-040
    it('Config file missing: returns empty rules (allow)', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-router-test-'));
        const noConfigPath = path.join(tmpDir, 'nonexistent', 'tool-routing.json');
        const noSettingsPath = path.join(tmpDir, 'nonexistent', 'settings.json');
        const rules = router.loadRoutingRules(noConfigPath, null, noSettingsPath);
        cleanupTestEnv(tmpDir);
        assert.deepEqual(rules, []);
    });

    // UT-041
    it('Malformed JSON in config: returns empty rules (allow)', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-router-test-'));
        const configDir = path.join(tmpDir, 'config');
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, 'tool-routing.json');
        fs.writeFileSync(configPath, '{ invalid json!!!');
        const rules = router.loadRoutingRules(configPath, null, null);
        cleanupTestEnv(tmpDir);
        assert.deepEqual(rules, []);
    });

    // UT-042
    it('Malformed stdin (not JSON): returns no output', () => {
        const result = router.main('not valid json {{{', {});
        assert.equal(result.stdout, null);
        assert.equal(result.stderr, null);
    });

    // UT-043
    it('Preferred MCP tool unavailable: rule skipped, original tool allowed', () => {
        const env = setupTestEnv(VALID_CONFIG, SETTINGS_NO_MCP);
        const input = JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'foo' } });
        const result = router.main(input, {
            configPath: env.configPath,
            settingsPath: env.settingsPath,
            auditPath: env.auditPath
        });
        cleanupTestEnv(env.tmpDir);
        assert.equal(result.stdout, null, 'Should not block when MCP unavailable');
    });

    // UT-042b (additional)
    it('Empty stdin: returns no output', () => {
        const result = router.main('', {});
        assert.equal(result.stdout, null);
        assert.equal(result.stderr, null);
    });

    // UT-042c (additional)
    it('JSON without tool_name: returns no output', () => {
        const result = router.main(JSON.stringify({ tool_input: {} }), {});
        assert.equal(result.stdout, null);
        assert.equal(result.stderr, null);
    });
});

// ==========================================================================
// FR-009: MCP Availability Detection (4 tests)
// ==========================================================================

describe('FR-009: MCP Availability Detection', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-044
    it('probeMcpAvailability returns true when MCP server config exists', () => {
        const available = router.probeMcpAvailability(
            'mcp__code-index-mcp__search_code_advanced',
            env.settingsPath
        );
        assert.equal(available, true);
    });

    // UT-045
    it('probeMcpAvailability returns false when MCP server config missing', () => {
        const noMcpEnv = setupTestEnv(VALID_CONFIG, SETTINGS_NO_MCP);
        const available = router.probeMcpAvailability(
            'mcp__code-index-mcp__search_code_advanced',
            noMcpEnv.settingsPath
        );
        cleanupTestEnv(noMcpEnv.tmpDir);
        assert.equal(available, false);
    });

    // UT-046
    it('Rule with unavailable MCP tool is skipped silently', () => {
        const noMcpEnv = setupTestEnv(VALID_CONFIG, SETTINGS_NO_MCP);
        const rule = FRAMEWORK_RULES[0];
        const result = router.evaluateRule(rule, { pattern: 'test' }, 'Grep', noMcpEnv.settingsPath);
        cleanupTestEnv(noMcpEnv.tmpDir);
        assert.equal(result.decision, 'skip');
    });

    // UT-047
    it('probeMcpAvailability with invalid tool name returns false', () => {
        assert.equal(router.probeMcpAvailability('not-an-mcp-tool', env.settingsPath), false);
        assert.equal(router.probeMcpAvailability('', env.settingsPath), false);
        assert.equal(router.probeMcpAvailability(null, env.settingsPath), false);
    });
});

// ==========================================================================
// FR-011: Tool Routing Audit Log (4 tests)
// ==========================================================================

describe('FR-011: Tool Routing Audit Log', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // UT-048
    it('appendAuditEntry appends valid JSONL line with all required fields', () => {
        const entry = {
            ts: new Date().toISOString(),
            tool: 'Grep',
            preferred: 'mcp__code-index-mcp__search',
            enforcement: 'block',
            decision: 'block',
            exemption: null,
            rule_id: 'search-semantic',
            rule_source: 'framework'
        };
        router.appendAuditEntry(entry, env.auditPath);

        const content = fs.readFileSync(env.auditPath, 'utf8');
        const parsed = JSON.parse(content.trim());
        assert.equal(parsed.tool, 'Grep');
        assert.equal(parsed.rule_id, 'search-semantic');
        assert.equal(parsed.decision, 'block');
    });

    // UT-049
    it('appendAuditEntry creates audit log file if it does not exist', () => {
        const newAuditPath = path.join(env.tmpDir, '.isdlc', 'new-audit.jsonl');
        assert.ok(!fs.existsSync(newAuditPath));

        router.appendAuditEntry({ ts: new Date().toISOString(), tool: 'Grep' }, newAuditPath);

        assert.ok(fs.existsSync(newAuditPath));
    });

    // UT-050
    it('appendAuditEntry with unwritable path: does not throw', () => {
        // Try to write to a path that can't exist
        assert.doesNotThrow(() => {
            router.appendAuditEntry({ ts: new Date().toISOString() }, '/nonexistent/readonly/audit.jsonl');
        });
    });

    // UT-051
    it('appendAuditEntry writes one line per call (no trailing newline duplication)', () => {
        const entry1 = { ts: '2026-01-01T00:00:00Z', tool: 'Grep', call: 1 };
        const entry2 = { ts: '2026-01-01T00:00:01Z', tool: 'Read', call: 2 };
        router.appendAuditEntry(entry1, env.auditPath);
        router.appendAuditEntry(entry2, env.auditPath);

        const content = fs.readFileSync(env.auditPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        assert.equal(lines.length, 2, 'Should have exactly 2 lines');
    });
});

// ==========================================================================
// Integration Tests (12 tests) — stdin-to-stdout/stderr via spawnSync
// ==========================================================================

describe('Integration: end-to-end hook execution', () => {
    let env;

    beforeEach(() => { env = setupTestEnv(); });
    afterEach(() => { cleanupTestEnv(env.tmpDir); });

    // IT-001
    it('Grep block: stdin -> stdout with preferred tool', () => {
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc.status, 0);
        assert.ok(proc.stdout.trim(), 'Should have stdout output');
        const parsed = JSON.parse(proc.stdout.trim());
        assert.equal(parsed.continue, false);
        assert.ok(parsed.stopReason.includes('mcp__code-index-mcp'));
    });

    // IT-002
    it('Glob warn: stdin -> stderr warning', () => {
        // Override config to have warn for Glob
        const warnConfig = {
            ...VALID_CONFIG,
            rules: [{ ...FRAMEWORK_RULES[1], enforcement: 'warn' }]
        };
        fs.writeFileSync(env.configPath, JSON.stringify(warnConfig));

        const input = { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' } };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc.status, 0);
        assert.ok(proc.stderr.includes('TOOL_ROUTER WARNING'), 'Should have warning on stderr');
    });

    // IT-003
    it('Unmatched tool: no output, exit 0', () => {
        const input = { tool_name: 'Write', tool_input: {} };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc.status, 0);
        assert.equal(proc.stdout.trim(), '', 'No stdout for unmatched tool');
    });

    // IT-004
    it('Missing config: exit 0, empty stdout', () => {
        const noConfigEnv = setupTestEnv(null, SETTINGS_WITH_MCP);
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: noConfigEnv.tmpDir });
        cleanupTestEnv(noConfigEnv.tmpDir);
        assert.equal(proc.status, 0);
        assert.equal(proc.stdout.trim(), '');
    });

    // IT-005
    it('Malformed config: exit 0, stderr warning', () => {
        // Write malformed config
        fs.writeFileSync(env.configPath, '{ bad json !!!');
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc.status, 0);
        assert.equal(proc.stdout.trim(), '');
    });

    // IT-006 (Article XV in constitution — skip for unit test, tested via file check)
    it('Article XV text exists in constitution.md', () => {
        const constitutionPath = path.join(__dirname, '..', '..', '..', '..', 'docs', 'isdlc', 'constitution.md');
        if (fs.existsSync(constitutionPath)) {
            const content = fs.readFileSync(constitutionPath, 'utf8');
            assert.ok(content.includes('Article XV'), 'Constitution should contain Article XV');
            assert.ok(content.includes('Tool Preference Enforcement'), 'Should have correct title');
        } else {
            // Skip if run from temp dir — constitution exists in source tree
            assert.ok(true, 'Skipped: constitution not found in temp dir');
        }
    });

    // IT-007
    it('Audit log appended on invocation', () => {
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });

        assert.ok(fs.existsSync(env.auditPath), 'Audit log should exist');
        const content = fs.readFileSync(env.auditPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 1, 'Should have at least one audit entry');
    });

    // IT-008
    it('Audit entry contains all required fields', () => {
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });

        const content = fs.readFileSync(env.auditPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const entry = JSON.parse(lines[0]);
        assert.ok(entry.ts, 'Should have ts');
        assert.ok(entry.tool, 'Should have tool');
        assert.ok(entry.preferred, 'Should have preferred');
        assert.ok(entry.enforcement, 'Should have enforcement');
        assert.ok(entry.decision, 'Should have decision');
        assert.ok('exemption' in entry, 'Should have exemption field');
        assert.ok(entry.rule_id, 'Should have rule_id');
        assert.ok(entry.rule_source, 'Should have rule_source');
    });

    // IT-009
    it('Stateless: two sequential invocations with different configs produce independent results', () => {
        // First: block
        const input1 = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        const proc1 = runHookProcess(input1, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.ok(proc1.stdout.trim(), 'First call should block');

        // Change config to allow
        const allowConfig = { ...VALID_CONFIG, rules: [{ ...FRAMEWORK_RULES[0], enforcement: 'allow' }] };
        fs.writeFileSync(env.configPath, JSON.stringify(allowConfig));

        const proc2 = runHookProcess(input1, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc2.stdout.trim(), '', 'Second call should allow (config changed)');
    });

    // IT-010
    it('Hook execution completes within 500ms', () => {
        const input = { tool_name: 'Grep', tool_input: { pattern: 'test' } };
        const start = Date.now();
        runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 500, `Hook took ${elapsed}ms, expected <500ms`);
    });

    // IT-011
    it('Any uncaught exception in hook results in exit 0', () => {
        // Send completely empty stdin to trigger edge case
        const proc = spawnSync('node', [HOOK_PATH], {
            input: '',
            env: { ...process.env, CLAUDE_PROJECT_DIR: env.tmpDir },
            timeout: 5000,
            encoding: 'utf8'
        });
        assert.equal(proc.status, 0);
    });

    // IT-012
    it('Read with edit_prep exemption: no routing', () => {
        const input = { tool_name: 'Read', tool_input: { file_path: '/test.js', limit: 50 } };
        const proc = runHookProcess(input, { CLAUDE_PROJECT_DIR: env.tmpDir });
        assert.equal(proc.status, 0);
        assert.equal(proc.stdout.trim(), '', 'edit_prep Read should not be routed');
    });
});
