'use strict';

/**
 * Unit Tests: Compliance Engine — Bucket-2 Migrated Rules (GH-253)
 * ==================================================================
 * Tests for new check types added to engine.cjs for bucket-2 migrations
 * from roundtable-analyst.md and bug-roundtable-analyst.md.
 *
 * REQ-GH-253: Context manager hooks inject before delegation
 * Covers: T036 — Migrate bucket-2 rules to compliance engine
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let testDir;
let engine;

function createTestDir() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-bucket2-rules-test-'));
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
// Tests: schema-fields check type
// ---------------------------------------------------------------------------

describe('compliance-engine: schema-fields check type', () => {
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

    const META_JSON_RULE = {
        id: 'meta-json-finalization-schema',
        name: 'Meta.json Finalization Schema',
        check: {
            type: 'schema-fields',
            detect: 'meta_json_finalization',
            required_fields: ['analysis_status', 'phases_completed', 'topics_covered', 'recommended_scope', 'SESSION_RECORD']
        },
        corrective_guidance: 'Meta.json finalization must include required fields.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when all required fields present in JSON block', () => {
        const response = '```json\n{\n  "analysis_status": "analyzed",\n  "phases_completed": ["01"],\n  "topics_covered": ["auth"],\n  "recommended_scope": "standard",\n  "SESSION_RECORD": {"session_id": "abc"}\n}\n```';
        const verdict = engine.evaluateRules(response, [META_JSON_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing required fields in JSON block', () => {
        const response = '```json\n{\n  "analysis_status": "analyzed",\n  "phases_completed": ["01"]\n}\n```';
        const verdict = engine.evaluateRules(response, [META_JSON_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
        assert.equal(verdict.rule_id, 'meta-json-finalization-schema');
    });

    it('should pass when no JSON block and no relevant fields (not applicable)', () => {
        const response = 'Just some regular text with no JSON.';
        const verdict = engine.evaluateRules(response, [META_JSON_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing fields in non-block JSON-like text', () => {
        const response = 'Updated meta.json with "analysis_status": "analyzed" and "phases_completed": ["01"]';
        const verdict = engine.evaluateRules(response, [META_JSON_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should find nested required fields', () => {
        const response = '```json\n{\n  "meta": {\n    "analysis_status": "analyzed",\n    "phases_completed": ["01"],\n    "topics_covered": ["auth"],\n    "recommended_scope": "standard",\n    "SESSION_RECORD": {"session_id": "abc"}\n  }\n}\n```';
        const verdict = engine.evaluateRules(response, [META_JSON_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    const SESSION_RECORD_RULE = {
        id: 'session-record-schema',
        name: 'SESSION_RECORD Format',
        check: {
            type: 'schema-fields',
            detect: 'session_record',
            required_fields: ['session_id', 'slug', 'timestamp', 'topics']
        },
        corrective_guidance: 'SESSION_RECORD must include required fields.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should validate SESSION_RECORD schema with all fields', () => {
        const response = '```json\n{\n  "session_id": "sess-001",\n  "slug": "auth-feature",\n  "timestamp": "2026-04-15T10:00:00Z",\n  "topics": [{"name": "auth"}]\n}\n```';
        const verdict = engine.evaluateRules(response, [SESSION_RECORD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing SESSION_RECORD fields', () => {
        const response = '```json\n{\n  "session_id": "sess-001",\n  "slug": "auth-feature"\n}\n```';
        const verdict = engine.evaluateRules(response, [SESSION_RECORD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    const INFERENCE_LOG_RULE = {
        id: 'inference-log-schema',
        name: 'Inference Log Schema',
        check: {
            type: 'schema-fields',
            detect: 'inference_log',
            required_fields: ['assumption', 'trigger', 'confidence', 'topic', 'fr_ids']
        },
        corrective_guidance: 'Inference log entries must include required fields.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should validate inference log with all fields', () => {
        const response = '```json\n{\n  "assumption": "User wants OAuth",\n  "trigger": "mentioned Google login",\n  "confidence": "Medium",\n  "topic": "authentication",\n  "fr_ids": ["FR-001"]\n}\n```';
        const verdict = engine.evaluateRules(response, [INFERENCE_LOG_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing inference log fields', () => {
        const response = '```json\n{\n  "assumption": "User wants OAuth",\n  "trigger": "mentioned Google login"\n}\n```';
        const verdict = engine.evaluateRules(response, [INFERENCE_LOG_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    const COVERAGE_TRACKER_RULE = {
        id: 'coverage-tracker-schema',
        name: 'Coverage Tracker Schema',
        check: {
            type: 'schema-fields',
            detect: 'coverage_tracker',
            required_fields: ['coverage_pct', 'confidence', 'criteria_met', 'criteria_total']
        },
        corrective_guidance: 'Coverage tracker must maintain required fields.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should validate coverage tracker with all fields', () => {
        const response = '```json\n{\n  "coverage_pct": 85,\n  "confidence": "High",\n  "criteria_met": 7,\n  "criteria_total": 8\n}\n```';
        const verdict = engine.evaluateRules(response, [COVERAGE_TRACKER_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing coverage tracker fields', () => {
        const response = '```json\n{\n  "coverage_pct": 85,\n  "confidence": "High"\n}\n```';
        const verdict = engine.evaluateRules(response, [COVERAGE_TRACKER_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should fail open when check has no required_fields', () => {
        const emptyRule = {
            ...META_JSON_RULE,
            id: 'empty-check',
            check: { type: 'schema-fields', detect: 'test', required_fields: [] }
        };
        const response = '```json\n{}\n```';
        const verdict = engine.evaluateRules(response, [emptyRule], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should fail open when check has no detect field', () => {
        const noDetectRule = {
            ...META_JSON_RULE,
            id: 'no-detect',
            check: { type: 'schema-fields', required_fields: ['foo'] }
        };
        const response = '```json\n{"foo": 1}\n```';
        const verdict = engine.evaluateRules(response, [noDetectRule], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: accept-amend-parser check type
// ---------------------------------------------------------------------------

describe('compliance-engine: accept-amend-parser check type', () => {
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

    const ACCEPT_AMEND_RULE = {
        id: 'accept-amend-parser',
        name: 'Accept/Amend Indicator Matching',
        trigger_condition: {
            state: 'confirmation_active'
        },
        check: {
            type: 'accept-amend-parser',
            accept_indicators: ['accept', 'looks good', 'approved', 'yes', 'confirm', 'LGTM', 'fine', 'correct', 'agree'],
            amend_indicators: ['amend', 'change', 'revise', 'update', 'modify', 'no', 'not quite', 'needs work', 'redo'],
            ambiguous_default: 'amend'
        },
        corrective_guidance: 'Validate Accept/Amend classification.',
        severity: 'block',
        provider_scope: 'both'
    };

    it('should pass when no roundtable state is provided', () => {
        const response = 'Any text';
        const verdict = engine.evaluateRules(response, [ACCEPT_AMEND_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass when not in PRESENTING state', () => {
        const state = { confirmation_state: 'IDLE' };
        const response = 'Any text';
        const verdict = engine.evaluateRules(response, [ACCEPT_AMEND_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass when summary includes Accept/Amend prompt', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = '## Functional Requirements\n\n- FR-001: User login\n\n**Accept** this summary or **Amend** to discuss changes?';
        const verdict = engine.evaluateRules(response, [ACCEPT_AMEND_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect simultaneous accept and amend actions', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = 'Proceeding with accept. Also entering amending state due to concerns.';
        const verdict = engine.evaluateRules(response, [ACCEPT_AMEND_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should detect missing Accept/Amend prompt in lengthy summary', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        // Long summary content without accept/amend prompt
        const response = '## Functional Requirements\n\n- FR-001: User login with OAuth2\n- FR-002: Session management\n- FR-003: Password reset flow\n\n## Assumptions and Inferences\n\n- Assumed OAuth2 provider is Google\n- Inferred session timeout is 30 minutes\n\n## Prioritization\n\n- P0: FR-001\n- P1: FR-002, FR-003\n\nThat concludes the requirements summary.';
        const verdict = engine.evaluateRules(response, [ACCEPT_AMEND_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });
});

// ---------------------------------------------------------------------------
// Tests: confirmation-state-tracking check type
// ---------------------------------------------------------------------------

describe('compliance-engine: confirmation-state-tracking check type', () => {
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

    const STATE_TRACKING_RULE = {
        id: 'confirmation-state-tracking',
        name: 'Confirmation State Tracking',
        check: {
            type: 'confirmation-state-tracking',
            required_tracking_fields: [
                'confirmation_state', 'accepted_domains', 'applicable_domains',
                'summary_cache', 'amendment_cycles'
            ]
        },
        corrective_guidance: 'Maintain all tracking fields.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when all tracking fields present', () => {
        const state = {
            confirmation_state: 'PRESENTING_REQUIREMENTS',
            accepted_domains: [],
            applicable_domains: ['requirements', 'architecture', 'design', 'tasks'],
            summary_cache: {},
            amendment_cycles: 0
        };
        const verdict = engine.evaluateRules('response', [STATE_TRACKING_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing tracking fields', () => {
        const state = {
            confirmation_state: 'PRESENTING_REQUIREMENTS',
            accepted_domains: []
            // Missing: applicable_domains, summary_cache, amendment_cycles
        };
        const verdict = engine.evaluateRules('response', [STATE_TRACKING_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should pass when in IDLE state (not in confirmation flow)', () => {
        const state = { confirmation_state: 'IDLE' };
        const verdict = engine.evaluateRules('response', [STATE_TRACKING_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass when in COMPLETE state', () => {
        const state = { confirmation_state: 'COMPLETE' };
        const verdict = engine.evaluateRules('response', [STATE_TRACKING_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass when no roundtable state', () => {
        const verdict = engine.evaluateRules('response', [STATE_TRACKING_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: confidence-indicator check type
// ---------------------------------------------------------------------------

describe('compliance-engine: confidence-indicator check type', () => {
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

    const CONFIDENCE_RULE = {
        id: 'confidence-indicator-format',
        name: 'Confidence Indicator Format',
        check: {
            type: 'confidence-indicator',
            format_pattern: '\\*\\*Confidence\\*\\*:\\s*(High|Medium|Low)',
            require_in_states: ['PRESENTING_REQUIREMENTS']
        },
        corrective_guidance: 'Include properly formatted confidence indicators.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when confidence indicator present in requirements', () => {
        const response = '## Functional Requirements\n\n- FR-001: Login\n\n## Assumptions and Inferences\n\n- Assumed OAuth\n\n**Confidence**: High';
        const verdict = engine.evaluateRules(response, [CONFIDENCE_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing confidence in requirements content', () => {
        const response = '## Functional Requirements\n\n- FR-001: Login\n\n## Assumptions and Inferences\n\n- Assumed OAuth';
        const verdict = engine.evaluateRules(response, [CONFIDENCE_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should skip non-requirements content', () => {
        const response = '## Architecture Options\n\n- Option A: Microservices\n\n## Technology Decisions\n\n- Use Node.js';
        const verdict = engine.evaluateRules(response, [CONFIDENCE_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass with Medium confidence level', () => {
        const response = '## Functional Requirements\n\n- FR-001: Login\n\n## Assumptions and Inferences\n\n- Assumed OAuth\n\n**Confidence**: Medium';
        const verdict = engine.evaluateRules(response, [CONFIDENCE_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass with Low confidence level', () => {
        const response = '## Functional Requirements\n\n- FR-001: Login\n\n## Assumptions and Inferences\n\n- Assumed OAuth\n\n**Confidence**: Low';
        const verdict = engine.evaluateRules(response, [CONFIDENCE_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: framework-internals-guard check type
// ---------------------------------------------------------------------------

describe('compliance-engine: framework-internals-guard check type', () => {
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

    const GUARD_RULE = {
        id: 'framework-internals-guard',
        name: 'Framework Internals Guard',
        check: {
            type: 'framework-internals-guard',
            blocked_paths: ['state.json', 'active_workflow', 'hooks/', 'workflows.json', 'common.cjs']
        },
        corrective_guidance: 'Do not read framework internals.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when no framework internals referenced', () => {
        const response = 'Analyzing the user authentication module in src/auth/login.ts...';
        const verdict = engine.evaluateRules(response, [GUARD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect Read tool call targeting state.json', () => {
        const response = 'Let me check the current state. "file_path": ".isdlc/state.json"';
        const verdict = engine.evaluateRules(response, [GUARD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should detect Read tool call targeting hooks/', () => {
        const response = 'Reading file contents of "file_path": "src/claude/hooks/some-hook.cjs"';
        const verdict = engine.evaluateRules(response, [GUARD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should detect Read tool call targeting workflows.json', () => {
        const response = '"file_path": ".isdlc/workflows.json" — checking workflow config';
        const verdict = engine.evaluateRules(response, [GUARD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should pass for normal file paths mentioning similar words', () => {
        const response = 'The user has a state machine implementation in src/core/state-machine.js';
        const verdict = engine.evaluateRules(response, [GUARD_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: contributing-persona-rules check type
// ---------------------------------------------------------------------------

describe('compliance-engine: contributing-persona-rules check type', () => {
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

    const PERSONA_RULE = {
        id: 'contributing-persona-rules',
        name: 'Contributing Persona Rules',
        trigger_condition: {
            state: 'confirmation_active'
        },
        check: {
            type: 'contributing-persona-rules',
            forbidden_patterns: [
                'new.*template.*for.*persona',
                'creating.*state.*for.*contributing',
                'contributing.*persona.*owns.*state',
                'adding.*confirmation.*stage.*for'
            ]
        },
        corrective_guidance: 'Contributing personas must not create new templates or own states.',
        severity: 'block',
        provider_scope: 'both'
    };

    it('should pass for normal contributing persona behavior', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = '**Security**:\n- Observed that OAuth tokens need rotation\n- Recommend PKCE flow for mobile';
        const verdict = engine.evaluateRules(response, [PERSONA_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect creating new template for contributing persona', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = 'Creating a new template for the Security persona to present separately.';
        const verdict = engine.evaluateRules(response, [PERSONA_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should detect contributing persona owning a state', () => {
        const state = { confirmation_state: 'PRESENTING_REQUIREMENTS' };
        const response = 'The contributing persona now owns state PRESENTING_SECURITY.';
        const verdict = engine.evaluateRules(response, [PERSONA_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should detect contributing persona with Accept/Amend prompt', () => {
        const state = {
            confirmation_state: 'PRESENTING_REQUIREMENTS',
            active_contributing_personas: ['Security']
        };
        const response = '**Security**: Here is the security analysis.\n\nDo you accept or amend?';
        const verdict = engine.evaluateRules(response, [PERSONA_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should pass when no PRESENTING state', () => {
        const state = { confirmation_state: 'IDLE' };
        const response = 'Creating a new template for persona is fine here.';
        const verdict = engine.evaluateRules(response, [PERSONA_RULE], {}, state, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: persona-loading-validation check type
// ---------------------------------------------------------------------------

describe('compliance-engine: persona-loading-validation check type', () => {
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

    const LOADING_RULE = {
        id: 'persona-loading-validation',
        name: 'Persona Loading Validation',
        check: {
            type: 'persona-loading-validation',
            required_personas: ['Maya', 'Alex', 'Jordan'],
            loading_indicators: ['PERSONA_CONTEXT', 'persona-maya', 'persona-alex', 'persona-jordan', 'persona loaded']
        },
        corrective_guidance: 'All three personas must be loaded.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when all personas mentioned in loading context', () => {
        const response = 'Loading from PERSONA_CONTEXT: Maya (Business Analyst), Alex (Solutions Architect), Jordan (System Designer) — all persona loaded successfully.';
        const verdict = engine.evaluateRules(response, [LOADING_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing persona in loading context', () => {
        const response = 'Loading from PERSONA_CONTEXT: Maya (Business Analyst), Alex (Solutions Architect) — persona loaded.';
        const verdict = engine.evaluateRules(response, [LOADING_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should skip when no loading indicators present', () => {
        const response = 'Starting the analysis of the authentication feature.';
        const verdict = engine.evaluateRules(response, [LOADING_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect loading from files with missing persona', () => {
        const response = 'Reading persona-maya.md and persona-alex.md — persona loaded.';
        const verdict = engine.evaluateRules(response, [LOADING_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });
});

// ---------------------------------------------------------------------------
// Tests: dispatch-payload-fields check type
// ---------------------------------------------------------------------------

describe('compliance-engine: dispatch-payload-fields check type', () => {
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

    const DISPATCH_RULE = {
        id: 'dispatch-payload-fields',
        name: 'Dispatch Payload Fields',
        check: {
            type: 'dispatch-payload-fields',
            required_context_fields: ['project_architecture', 'tech_stack', 'entry_points', 'test_framework'],
            detect: 'dispatch_payload'
        },
        corrective_guidance: 'Include required context fields in dispatch payloads.',
        severity: 'warn',
        provider_scope: 'both'
    };

    it('should pass when all context fields present in delegation', () => {
        const response = 'Spawning tracing-orchestrator delegation with: project_architecture=monolith, tech_stack=node/express, entry_points=src/index.js, test_framework=jest, BUG_REPORT_PATH=docs/bug-report.md, ANALYSIS_MODE=true';
        const verdict = engine.evaluateRules(response, [DISPATCH_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should detect missing context fields in delegation', () => {
        const response = 'Spawning tracing-orchestrator delegation with: project_architecture=monolith, BUG_REPORT_PATH=docs/bug-report.md';
        const verdict = engine.evaluateRules(response, [DISPATCH_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, true);
    });

    it('should skip when response is not a delegation', () => {
        const response = 'The user wants to add an authentication feature using OAuth2.';
        const verdict = engine.evaluateRules(response, [DISPATCH_RULE], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });

    it('should pass when empty required_context_fields', () => {
        const emptyRule = { ...DISPATCH_RULE, id: 'empty-dispatch', check: { type: 'dispatch-payload-fields', required_context_fields: [] } };
        const response = 'dispatch payload with nothing';
        const verdict = engine.evaluateRules(response, [emptyRule], {}, null, 'claude');
        assert.equal(verdict.violation, false);
    });
});

// ---------------------------------------------------------------------------
// Tests: loadRules loads new rules from full config
// ---------------------------------------------------------------------------

describe('compliance-engine: loads bucket-2 rules from conversational-rules.json', () => {
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

    it('should load all rules from the full conversational-rules.json', () => {
        // Copy the actual production rules file
        const srcRules = path.resolve(__dirname, '..', '..', '..', 'isdlc', 'config', 'conversational-rules.json');
        const destRules = path.join(testDir, '.isdlc', 'config', 'conversational-rules.json');
        fs.copyFileSync(srcRules, destRules);

        const rules = engine.loadRules(destRules);
        assert.ok(rules.length >= 19, `Expected at least 19 rules (4 original + 15 bucket-2), got ${rules.length}`);

        // Verify all bucket-2 rule IDs exist
        const ruleIds = rules.map(r => r.id);
        const expectedIds = [
            'bulleted-format',
            'sequential-domain-confirmation',
            'elicitation-first',
            'template-section-order',
            'persona-loading-validation',
            'contributing-persona-rules',
            'confirmation-state-tracking',
            'accept-amend-parser',
            'meta-json-acceptance-state',
            'inference-log-schema',
            'coverage-tracker-schema',
            'meta-json-finalization-schema',
            'progressive-meta-updates',
            'confidence-indicator-format',
            'session-record-schema',
            'artifact-thresholds',
            'phases-completed-population',
            'framework-internals-guard',
            'dispatch-payload-fields'
        ];

        for (const id of expectedIds) {
            assert.ok(ruleIds.includes(id), `Missing rule: ${id}`);
        }
    });

    it('every rule should have valid required fields', () => {
        const srcRules = path.resolve(__dirname, '..', '..', '..', 'isdlc', 'config', 'conversational-rules.json');
        const destRules = path.join(testDir, '.isdlc', 'config', 'conversational-rules.json');
        fs.copyFileSync(srcRules, destRules);

        const rules = engine.loadRules(destRules);

        for (const rule of rules) {
            assert.ok(rule.id, `Rule missing id`);
            assert.ok(rule.name, `Rule ${rule.id} missing name`);
            assert.ok(rule.check, `Rule ${rule.id} missing check`);
            assert.ok(rule.check.type, `Rule ${rule.id} missing check.type`);
            assert.ok(rule.corrective_guidance, `Rule ${rule.id} missing corrective_guidance`);
            assert.ok(rule.severity, `Rule ${rule.id} missing severity`);
            assert.ok(rule.provider_scope, `Rule ${rule.id} missing provider_scope`);
        }
    });
});
