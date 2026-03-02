/**
 * Tests for schema validation (REQ-0003)
 * Covers: validateSchema, loadSchema, canonical field names
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Setup test environment
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-schema-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    const configDir = path.join(isdlcDir, 'config');
    const schemasDir = path.join(configDir, 'schemas');
    fs.mkdirSync(schemasDir, { recursive: true });

    // Copy schema files from source
    const srcSchemas = path.join(__dirname, '..', 'config', 'schemas');
    if (fs.existsSync(srcSchemas)) {
        for (const file of fs.readdirSync(srcSchemas)) {
            fs.copyFileSync(path.join(srcSchemas, file), path.join(schemasDir, file));
        }
    }

    // Also create .claude/hooks/config/schemas for alternate path
    const claudeSchemasDir = path.join(tmpDir, '.claude', 'hooks', 'config', 'schemas');
    fs.mkdirSync(claudeSchemasDir, { recursive: true });
    if (fs.existsSync(srcSchemas)) {
        for (const file of fs.readdirSync(srcSchemas)) {
            fs.copyFileSync(path.join(srcSchemas, file), path.join(claudeSchemasDir, file));
        }
    }

    // Write minimal state.json
    fs.writeFileSync(path.join(isdlcDir, 'state.json'), JSON.stringify({
        framework_version: '0.1.0-alpha',
        current_phase: '01-requirements',
        skill_enforcement: { enabled: true, mode: 'observe' },
        iteration_enforcement: { enabled: true }
    }));

    return tmpDir;
}

function cleanupTestEnv(tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

// We need to require common.cjs with the right project root
function requireCommon(tmpDir) {
    // Clear require cache
    const commonPath = path.join(__dirname, '..', 'lib', 'common.cjs');
    delete require.cache[require.resolve(commonPath)];

    // Set env for project root
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    return require(commonPath);
}

describe('Schema Validation - loadSchema', () => {
    let tmpDir;
    let common;

    before(() => {
        tmpDir = setupTestEnv();
        common = requireCommon(tmpDir);
    });

    after(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        cleanupTestEnv(tmpDir);
    });

    it('loads constitutional-validation schema', () => {
        const schema = common.loadSchema('constitutional-validation');
        assert.ok(schema, 'Schema should be loaded');
        assert.strictEqual(schema.$id, 'constitutional-validation');
        assert.ok(schema.properties.completed, 'Should have completed property');
        assert.ok(schema.properties.iterations_used, 'Should have iterations_used property');
        assert.ok(schema.properties.status, 'Should have status property');
    });

    it('loads interactive-elicitation schema', () => {
        const schema = common.loadSchema('interactive-elicitation');
        assert.ok(schema, 'Schema should be loaded');
        assert.strictEqual(schema.$id, 'interactive-elicitation');
        assert.ok(schema.properties.final_selection, 'Should have final_selection property');
        assert.ok(schema.properties.menu_interactions, 'Should have menu_interactions property');
    });

    it('loads test-iteration schema', () => {
        const schema = common.loadSchema('test-iteration');
        assert.ok(schema, 'Schema should be loaded');
        assert.strictEqual(schema.$id, 'test-iteration');
        assert.ok(schema.properties.current_iteration, 'Should have current_iteration property');
    });

    it('returns null for non-existent schema', () => {
        const schema = common.loadSchema('does-not-exist');
        assert.strictEqual(schema, null);
    });

    it('returns null for malformed schema file', () => {
        // Write an invalid JSON file
        const schemasDir = path.join(tmpDir, '.claude', 'hooks', 'config', 'schemas');
        fs.writeFileSync(path.join(schemasDir, 'broken.schema.json'), 'not valid json{{{');

        // Clear cache for this schema
        common.loadSchema._cache_cleared = true;

        // The cache won't have this entry, so it will try to load
        // Since we can't easily clear the internal cache, test with a fresh require
        const common2 = requireCommon(tmpDir);
        const schema = common2.loadSchema('broken');
        assert.strictEqual(schema, null);
    });
});

describe('Schema Validation - validateSchema', () => {
    let tmpDir;
    let common;

    before(() => {
        tmpDir = setupTestEnv();
        common = requireCommon(tmpDir);
    });

    after(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        cleanupTestEnv(tmpDir);
    });

    // Constitutional Validation schema tests
    it('validates valid constitutional_validation data', () => {
        const data = {
            completed: true,
            status: 'compliant',
            iterations_used: 1,
            max_iterations: 5,
            articles_checked: ['I', 'IV', 'VII'],
            history: []
        };
        const result = common.validateSchema(data, 'constitutional-validation');
        assert.strictEqual(result.valid, true);
    });

    it('rejects constitutional_validation with missing required fields', () => {
        const data = {
            status: 'compliant'
            // missing completed and iterations_used
        };
        const result = common.validateSchema(data, 'constitutional-validation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.length >= 2, 'Should have at least 2 errors');
        assert.ok(result.errors.some(e => e.includes('completed')), 'Should mention completed');
        assert.ok(result.errors.some(e => e.includes('iterations_used')), 'Should mention iterations_used');
    });

    it('rejects constitutional_validation with invalid status enum', () => {
        const data = {
            completed: true,
            status: 'invalid_status',
            iterations_used: 1
        };
        const result = common.validateSchema(data, 'constitutional-validation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('enum')));
    });

    it('rejects constitutional_validation with wrong type for completed', () => {
        const data = {
            completed: 'yes',  // should be boolean
            status: 'compliant',
            iterations_used: 1
        };
        const result = common.validateSchema(data, 'constitutional-validation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('boolean')));
    });

    it('allows additional properties in constitutional_validation', () => {
        const data = {
            completed: true,
            status: 'compliant',
            iterations_used: 1,
            final_status: 'compliant',  // extra field - should be ignored
            total_iterations: 1,        // extra field - should be ignored
            custom_field: 'whatever'    // extra field
        };
        const result = common.validateSchema(data, 'constitutional-validation');
        assert.strictEqual(result.valid, true);
    });

    // Interactive Elicitation schema tests
    it('validates valid interactive_elicitation data', () => {
        const data = {
            completed: true,
            menu_interactions: 3,
            final_selection: 'continue',
            selections: ['adjust', 'continue'],
            steps_completed: ['discovery', 'personas']
        };
        const result = common.validateSchema(data, 'interactive-elicitation');
        assert.strictEqual(result.valid, true);
    });

    it('rejects interactive_elicitation with invalid final_selection', () => {
        const data = {
            completed: true,
            menu_interactions: 3,
            final_selection: 'invalid_selection'
        };
        const result = common.validateSchema(data, 'interactive-elicitation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('enum')));
    });

    it('rejects interactive_elicitation with non-integer menu_interactions', () => {
        const data = {
            completed: true,
            menu_interactions: 3.5
        };
        const result = common.validateSchema(data, 'interactive-elicitation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('integer')));
    });

    // Test Iteration schema tests
    it('validates valid test_iteration data', () => {
        const data = {
            completed: true,
            status: 'success',
            current_iteration: 2,
            max_iterations: 10,
            last_test_result: 'passed',
            history: []
        };
        const result = common.validateSchema(data, 'test-iteration');
        assert.strictEqual(result.valid, true);
    });

    it('rejects test_iteration with negative current_iteration', () => {
        const data = {
            completed: false,
            current_iteration: -1
        };
        const result = common.validateSchema(data, 'test-iteration');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('minimum')));
    });

    // Fail-open tests
    it('returns valid=true for non-existent schema (fail-open)', () => {
        const result = common.validateSchema({ anything: true }, 'non-existent-schema');
        assert.strictEqual(result.valid, true);
    });

    it('returns valid=true for null data with missing schema (fail-open)', () => {
        const result = common.validateSchema(null, 'non-existent-schema');
        assert.strictEqual(result.valid, true);
    });

    // Gate-blocker compatibility tests
    it('validates state written by orchestrator agent (canonical fields)', () => {
        const constValidation = {
            completed: true,
            current_iteration: 1,
            iterations_used: 1,
            max_iterations: 5,
            articles_checked: ['I', 'IV', 'VII', 'IX', 'XII'],
            status: 'compliant',
            history: [{
                iteration: 1,
                timestamp: '2026-02-08T17:00:00Z',
                violations: [],
                result: 'COMPLIANT'
            }]
        };
        const result = common.validateSchema(constValidation, 'constitutional-validation');
        assert.strictEqual(result.valid, true, 'Orchestrator-written state should validate');
    });

    it('validates elicitation state with final_selection (canonical)', () => {
        const elicitation = {
            required: true,
            completed: true,
            menu_interactions: 3,
            selections: ['initial', 'clarification', 'edge-cases'],
            steps_completed: ['Step 1', 'Step 2', 'Step 3'],
            started_at: '2026-02-08T16:50:00Z',
            last_menu_at: '2026-02-08T17:10:00Z',
            final_selection: 'continue'
        };
        const result = common.validateSchema(elicitation, 'interactive-elicitation');
        assert.strictEqual(result.valid, true, 'Elicitation state with final_selection should validate');
    });

    // Pending delegation schema tests
    it('validates valid pending_delegation data', () => {
        const data = {
            skill: 'sdlc',
            required_agent: 'sdlc-orchestrator',
            invoked_at: '2026-02-08T17:00:00Z',
            args: 'feature "Build auth"'
        };
        const result = common.validateSchema(data, 'pending-delegation');
        assert.strictEqual(result.valid, true);
    });

    it('rejects pending_delegation with missing required_agent', () => {
        const data = {
            skill: 'sdlc',
            invoked_at: '2026-02-08T17:00:00Z'
        };
        const result = common.validateSchema(data, 'pending-delegation');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('required_agent')));
    });

    // Skill usage entry schema tests
    it('validates valid skill_usage_entry data', () => {
        const data = {
            timestamp: '2026-02-08T17:00:00Z',
            agent: 'sdlc-orchestrator',
            agent_phase: 'all',
            current_phase: '01-requirements',
            description: 'Start feature workflow',
            status: 'executed',
            reason: 'authorized-orchestrator',
            enforcement_mode: 'observe'
        };
        const result = common.validateSchema(data, 'skill-usage-entry');
        assert.strictEqual(result.valid, true);
    });
});

describe('Schema Validation - Hook stdin schemas', () => {
    let tmpDir;
    let common;

    before(() => {
        tmpDir = setupTestEnv();
        common = requireCommon(tmpDir);
    });

    after(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        cleanupTestEnv(tmpDir);
    });

    it('validates PreToolUse stdin for Task tool', () => {
        const data = {
            tool_name: 'Task',
            tool_input: {
                subagent_type: 'software-developer',
                prompt: 'Implement feature',
                description: 'Build auth system'
            }
        };
        const result = common.validateSchema(data, 'hook-stdin-pretooluse');
        assert.strictEqual(result.valid, true);
    });

    it('validates PostToolUse stdin for Bash tool', () => {
        const data = {
            tool_name: 'Bash',
            tool_input: { command: 'npm test' },
            tool_result: 'All tests passed'
        };
        const result = common.validateSchema(data, 'hook-stdin-posttooluse');
        assert.strictEqual(result.valid, true);
    });

    it('rejects PreToolUse stdin without tool_name', () => {
        const data = {
            tool_input: { command: 'npm test' }
        };
        const result = common.validateSchema(data, 'hook-stdin-pretooluse');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('tool_name')));
    });
});
