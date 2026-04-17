'use strict';

/**
 * Verification Tests: Bucket-3 Template Completeness (GH-253 T037)
 * ==================================================================
 * Verifies that all bucket-3 (template-bound) content from the audit of
 * roundtable-analyst.md and bug-roundtable-analyst.md is fully covered
 * by the structured definition/template files.
 *
 * REQ-GH-253: Context manager hooks inject before delegation
 * Covers: T037 — Migrate bucket-3 content to state/task card templates
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROUNDTABLE_DIR = path.resolve(__dirname, '..', '..', '..', 'isdlc', 'config', 'roundtable');

function readJson(relativePath) {
    const fullPath = path.join(ROUNDTABLE_DIR, relativePath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Core.json completeness
// ---------------------------------------------------------------------------

describe('T037: core.json — shared invariants completeness', () => {
    const core = readJson('core.json');

    it('should define all three rendering modes', () => {
        assert.ok(core.rendering_modes.bulleted, 'Missing bulleted mode');
        assert.ok(core.rendering_modes.conversational, 'Missing conversational mode');
        assert.ok(core.rendering_modes.silent, 'Missing silent mode');
    });

    it('should define shared invariants across rendering modes', () => {
        assert.ok(Array.isArray(core.rendering_modes.shared_invariants));
        assert.ok(core.rendering_modes.shared_invariants.length >= 6, 'Expected at least 6 shared invariants');
        assert.ok(core.rendering_modes.shared_invariants.includes('tasks_always_traceability_table'));
    });

    it('should define all three core personas with both analyze and bug_gather states', () => {
        const personas = core.persona_model.core_personas;
        assert.equal(personas.length, 3);

        const maya = personas.find(p => p.name === 'Maya');
        assert.ok(maya, 'Missing Maya');
        assert.equal(maya.domain, 'requirements');
        assert.ok(maya.owns_states.analyze, 'Maya missing analyze state');
        assert.ok(maya.owns_states.bug_gather, 'Maya missing bug_gather state');

        const alex = personas.find(p => p.name === 'Alex');
        assert.ok(alex, 'Missing Alex');
        assert.equal(alex.domain, 'architecture');
        assert.ok(alex.owns_states.analyze);
        assert.ok(alex.owns_states.bug_gather);

        const jordan = personas.find(p => p.name === 'Jordan');
        assert.ok(jordan, 'Missing Jordan');
        assert.equal(jordan.domain, 'design');
        assert.ok(jordan.owns_states.analyze);
        assert.ok(jordan.owns_states.bug_gather);
    });

    it('should define Lead persona with tasks ownership', () => {
        assert.ok(core.persona_model.lead, 'Missing Lead persona');
        assert.equal(core.persona_model.lead.domain, 'tasks');
        assert.ok(core.persona_model.lead.owns_states.analyze);
        assert.ok(core.persona_model.lead.owns_states.bug_gather);
    });

    it('should define contributing persona schema', () => {
        const schema = core.persona_model.contributing_persona_schema;
        assert.ok(schema, 'Missing contributing_persona_schema');
        assert.equal(schema.role_type, 'contributing');
        assert.ok(Array.isArray(schema.behavior));
        assert.ok(schema.behavior.includes('fold_into_core_states'));
        assert.ok(schema.behavior.includes('never_create_new_templates'));
        assert.ok(schema.behavior.includes('never_own_new_states'));
    });

    it('should define promotion schema with extension points for both workflows', () => {
        const promo = core.persona_model.promotion_schema;
        assert.ok(promo, 'Missing promotion_schema');
        assert.ok(Array.isArray(promo.extension_points.analyze));
        assert.ok(Array.isArray(promo.extension_points.bug_gather));
        assert.ok(promo.extension_points.analyze.length >= 8, 'Analyze needs at least 8 extension points');
        assert.ok(promo.extension_points.bug_gather.length >= 8, 'Bug-gather needs at least 8 extension points');
    });

    it('should define accept and amend indicators', () => {
        assert.ok(Array.isArray(core.accept_indicators));
        assert.ok(core.accept_indicators.length >= 5, 'Expected at least 5 accept indicators');
        assert.ok(core.accept_indicators.includes('accept'));
        assert.ok(core.accept_indicators.includes('LGTM'));

        assert.ok(Array.isArray(core.amend_indicators));
        assert.ok(core.amend_indicators.length >= 5, 'Expected at least 5 amend indicators');
        assert.ok(core.amend_indicators.includes('amend'));
    });

    it('should define ambiguous_default as amend', () => {
        assert.equal(core.ambiguous_default, 'amend');
    });

    it('should define amending semantics with restart targets for both workflows', () => {
        assert.ok(core.amending_semantics, 'Missing amending_semantics');
        assert.ok(core.amending_semantics.restart_target.analyze);
        assert.ok(core.amending_semantics.restart_target.bug_gather);
    });

    it('should define early_exit signals', () => {
        assert.ok(core.early_exit, 'Missing early_exit');
        assert.ok(Array.isArray(core.early_exit.signals));
        assert.ok(core.early_exit.signals.length >= 3);
    });

    it('should define participation gate requirements', () => {
        assert.ok(core.participation_gate, 'Missing participation_gate');
        assert.equal(core.participation_gate.required_contributions_before_first_confirmation, 3);
        assert.ok(Array.isArray(core.participation_gate.required_voices));
        assert.equal(core.participation_gate.required_voices.length, 3);
    });

    it('should define conversation rendering rules', () => {
        assert.ok(Array.isArray(core.conversation_rendering_rules));
        assert.ok(core.conversation_rendering_rules.length >= 11);
    });

    it('should define stop/wait contract', () => {
        assert.ok(core.stop_wait_contract);
        assert.equal(core.stop_wait_contract.one_exchange_per_turn, true);
        assert.equal(core.stop_wait_contract.end_turn_after_question, true);
    });

    it('should define agent metadata for both workflows (bucket-3 from frontmatter)', () => {
        assert.ok(core.agent_metadata, 'Missing agent_metadata');
        assert.ok(core.agent_metadata.analyze, 'Missing analyze agent metadata');
        assert.ok(core.agent_metadata.bug_gather, 'Missing bug_gather agent metadata');
        assert.equal(core.agent_metadata.analyze.name, 'roundtable-analyst');
        assert.equal(core.agent_metadata.bug_gather.name, 'bug-roundtable-analyst');
    });

    it('should define artifact ownership for both workflows (bucket-3 from C.1)', () => {
        assert.ok(core.artifact_ownership, 'Missing artifact_ownership');
        assert.ok(core.artifact_ownership.analyze, 'Missing analyze artifact ownership');
        assert.ok(core.artifact_ownership.bug_gather, 'Missing bug_gather artifact ownership');

        // Verify analyze artifact mapping
        const analyzeOwnership = core.artifact_ownership.analyze;
        assert.ok(analyzeOwnership.requirements, 'Missing requirements ownership');
        assert.ok(analyzeOwnership.architecture, 'Missing architecture ownership');
        assert.ok(analyzeOwnership.design, 'Missing design ownership');
        assert.ok(analyzeOwnership.tasks, 'Missing tasks ownership');
        assert.equal(analyzeOwnership.requirements.owner, 'Maya');
        assert.equal(analyzeOwnership.architecture.owner, 'Alex');
        assert.equal(analyzeOwnership.design.owner, 'Jordan');
        assert.equal(analyzeOwnership.tasks.owner, 'Lead');

        // Verify bug_gather artifact mapping
        const bugOwnership = core.artifact_ownership.bug_gather;
        assert.ok(bugOwnership.bug_summary, 'Missing bug_summary ownership');
        assert.ok(bugOwnership.root_cause, 'Missing root_cause ownership');
        assert.ok(bugOwnership.fix_strategy, 'Missing fix_strategy ownership');
    });

    it('should define assumptions_and_inferences placement rule', () => {
        assert.ok(core.assumptions_and_inferences_placement, 'Missing A&I placement rule');
        assert.equal(core.assumptions_and_inferences_placement.rule, 'always_last_section');
        assert.equal(core.assumptions_and_inferences_placement.applies_to_all_confirmations, true);
    });
});

// ---------------------------------------------------------------------------
// Analyze workflow definition completeness
// ---------------------------------------------------------------------------

describe('T037: analyze.json — state machine and tier rules completeness', () => {
    const analyze = readJson('analyze.json');

    it('should define all required states', () => {
        const expectedStates = ['IDLE', 'CONVERSATION', 'PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS', 'AMENDING', 'TRIVIAL_SHOW', 'FINALIZING', 'COMPLETE'];
        for (const state of expectedStates) {
            assert.ok(analyze.states[state], `Missing state: ${state}`);
        }
    });

    it('should define tier rules for all tiers', () => {
        assert.ok(analyze.tier_rules.standard);
        assert.ok(analyze.tier_rules.epic);
        assert.ok(analyze.tier_rules.light);
        assert.ok(analyze.tier_rules.trivial);
    });

    it('should define light tier skip for PRESENTING_ARCHITECTURE', () => {
        assert.ok(analyze.tier_rules.light.skip_states);
        assert.ok(analyze.tier_rules.light.skip_states.includes('PRESENTING_ARCHITECTURE'));
    });

    it('should define trivial tier with empty domains and no accept_amend', () => {
        assert.deepEqual(analyze.tier_rules.trivial.domains_presented, []);
        assert.equal(analyze.tier_rules.trivial.accept_amend, false);
    });

    it('should define PRESENTING_REQUIREMENTS with tier-based transitions', () => {
        const state = analyze.states.PRESENTING_REQUIREMENTS;
        assert.ok(state.transitions.length >= 3);
        const lightTransition = state.transitions.find(t => t.condition.includes('light'));
        assert.ok(lightTransition, 'Missing light-tier transition');
        assert.equal(lightTransition.target, 'PRESENTING_DESIGN');
    });

    it('should define scope_recommendation', () => {
        assert.ok(analyze.scope_recommendation);
        assert.equal(analyze.scope_recommendation.timing, 'before_confirmation_sequence');
        assert.equal(analyze.scope_recommendation.user_can_override, true);
    });

    it('should define AMENDING with restart target PRESENTING_REQUIREMENTS', () => {
        const amending = analyze.states.AMENDING;
        assert.ok(amending.transitions.find(t => t.target === 'PRESENTING_REQUIREMENTS'));
    });

    it('should define FINALIZING with artifact list and batch_write_contract', () => {
        const finalizing = analyze.states.FINALIZING;
        assert.ok(Array.isArray(finalizing.artifact_list));
        assert.ok(finalizing.artifact_list.length >= 10, 'Expected at least 10 artifacts');
        assert.ok(finalizing.batch_write_contract);
    });

    it('should define COMPLETE with ROUNDTABLE_COMPLETE signal', () => {
        assert.equal(analyze.states.COMPLETE.emit, 'ROUNDTABLE_COMPLETE');
        assert.equal(analyze.states.COMPLETE.terminal, true);
    });
});

// ---------------------------------------------------------------------------
// Bug-gather workflow definition completeness
// ---------------------------------------------------------------------------

describe('T037: bug-gather.json — state machine and tier rules completeness', () => {
    const bugGather = readJson('bug-gather.json');

    it('should define all required bug-gather states', () => {
        const expectedStates = ['IDLE', 'CONVERSATION', 'PRESENTING_BUG_SUMMARY', 'PRESENTING_ROOT_CAUSE', 'PRESENTING_FIX_STRATEGY', 'PRESENTING_TASKS', 'AMENDING', 'FINALIZING', 'COMPLETE'];
        for (const state of expectedStates) {
            assert.ok(bugGather.states[state], `Missing state: ${state}`);
        }
    });

    it('should define bug-gather tier rules', () => {
        assert.ok(bugGather.tier_rules.standard);
        assert.ok(bugGather.tier_rules.epic);
        assert.ok(bugGather.tier_rules.light);
    });

    it('should define light tier fold of ROOT_CAUSE into FIX_STRATEGY', () => {
        assert.ok(bugGather.tier_rules.light.fold);
        assert.equal(bugGather.tier_rules.light.fold.source, 'PRESENTING_ROOT_CAUSE');
        assert.equal(bugGather.tier_rules.light.fold.into, 'PRESENTING_FIX_STRATEGY');
    });

    it('should define PRESENTING_BUG_SUMMARY with pre_presentation_action (bug-report.md write)', () => {
        const state = bugGather.states.PRESENTING_BUG_SUMMARY;
        assert.ok(state.pre_presentation_action);
        assert.equal(state.pre_presentation_action.action, 'write_bug_report');
        assert.equal(state.pre_presentation_action.file, 'bug-report.md');
    });

    it('should define PRESENTING_BUG_SUMMARY transition with tracing delegation', () => {
        const state = bugGather.states.PRESENTING_BUG_SUMMARY;
        const acceptTransition = state.transitions.find(t => t.condition === 'accept');
        assert.ok(acceptTransition.external_delegation);
        assert.equal(acceptTransition.external_delegation.agent, 'tracing-orchestrator');
        assert.ok(acceptTransition.external_delegation.fail_open.enabled);
    });

    it('should define AMENDING with restart to PRESENTING_BUG_SUMMARY', () => {
        const amending = bugGather.states.AMENDING;
        assert.ok(amending.transitions.find(t => t.target === 'PRESENTING_BUG_SUMMARY'));
    });

    it('should define FINALIZING with bug-specific cross-checks', () => {
        const finalizing = bugGather.states.FINALIZING;
        assert.ok(finalizing.cross_check);
        assert.ok(Array.isArray(finalizing.cross_check.rules));
        assert.ok(finalizing.cross_check.rules.length >= 2);
    });

    it('should define FINALIZING with artifact_exceptions for bug-report.md', () => {
        const finalizing = bugGather.states.FINALIZING;
        assert.ok(finalizing.artifact_exceptions);
        assert.ok(finalizing.artifact_exceptions['bug-report.md'], 'Missing bug-report.md exception');
    });

    it('should define COMPLETE with BUG_ROUNDTABLE_COMPLETE signal', () => {
        assert.equal(bugGather.states.COMPLETE.emit, 'BUG_ROUNDTABLE_COMPLETE');
        assert.equal(bugGather.states.COMPLETE.terminal, true);
    });

    it('should define depth calibration with shallow and deep ranges', () => {
        assert.ok(bugGather.depth_calibration);
        assert.ok(bugGather.depth_calibration.shallow);
        assert.ok(bugGather.depth_calibration.deep);
        assert.deepEqual(bugGather.depth_calibration.shallow.exchange_range, [3, 5]);
        assert.deepEqual(bugGather.depth_calibration.deep.exchange_range, [5, 8]);
    });

    it('should define CONVERSATION with Maya opening structure for bug framing', () => {
        const conversation = bugGather.states.CONVERSATION;
        assert.ok(conversation.opening);
        assert.ok(conversation.opening.maya_opening_structure);
        assert.ok(conversation.opening.maya_opening_structure.whats_broken);
        assert.ok(conversation.opening.maya_opening_structure.severity);
        assert.ok(conversation.opening.maya_opening_structure.reproduction);
    });

    it('should define meta_json_update with bug-specific fields', () => {
        const finalizing = bugGather.states.FINALIZING;
        assert.ok(finalizing.meta_json_update);
        assert.ok(Array.isArray(finalizing.meta_json_update.required_fields));
        assert.ok(finalizing.meta_json_update.required_fields.includes('bug_classification'));
        assert.ok(finalizing.meta_json_update.required_fields.includes('acceptance'));
    });
});

// ---------------------------------------------------------------------------
// State cards completeness
// ---------------------------------------------------------------------------

describe('T037: state cards — PRESENTING_* cards completeness', () => {
    it('should have all required state cards', () => {
        const stateCardsDir = path.join(ROUNDTABLE_DIR, 'state-cards');
        const expectedCards = [
            'presenting-requirements.card.json',
            'presenting-architecture.card.json',
            'presenting-design.card.json',
            'presenting-tasks.card.json',
            'presenting-bug-summary.card.json',
            'presenting-root-cause.card.json',
            'presenting-fix-strategy.card.json',
            'conversation.card.json',
            'finalizing.card.json'
        ];
        for (const card of expectedCards) {
            assert.ok(fs.existsSync(path.join(stateCardsDir, card)), `Missing state card: ${card}`);
        }
    });

    it('all PRESENTING_* cards should define template_ref, required_sections, and transitions', () => {
        const stateCardsDir = path.join(ROUNDTABLE_DIR, 'state-cards');
        const presentingCards = [
            'presenting-requirements.card.json',
            'presenting-architecture.card.json',
            'presenting-design.card.json',
            'presenting-tasks.card.json',
            'presenting-bug-summary.card.json',
            'presenting-root-cause.card.json',
            'presenting-fix-strategy.card.json'
        ];

        for (const cardFile of presentingCards) {
            const card = JSON.parse(fs.readFileSync(path.join(stateCardsDir, cardFile), 'utf8'));
            assert.ok(card.template_ref, `${cardFile} missing template_ref`);
            assert.ok(Array.isArray(card.required_sections), `${cardFile} missing required_sections`);
            assert.ok(card.transitions, `${cardFile} missing transitions`);
            assert.ok(card.accept_amend_prompt, `${cardFile} missing accept_amend_prompt`);
            assert.equal(card.post_prompt_action, 'STOP_and_RETURN', `${cardFile} missing STOP_and_RETURN`);
        }
    });

    it('presenting-requirements should define content_coverage for requirements confirmation', () => {
        const card = readJson('state-cards/presenting-requirements.card.json');
        assert.ok(Array.isArray(card.content_coverage));
        assert.ok(card.content_coverage.includes('FRs_with_IDs_titles_MoSCoW_priorities'));
        assert.ok(card.content_coverage.includes('confidence_levels_per_major_requirement_area'));
    });

    it('presenting-architecture should define content_coverage for architecture confirmation', () => {
        const card = readJson('state-cards/presenting-architecture.card.json');
        assert.ok(Array.isArray(card.content_coverage));
        assert.ok(card.content_coverage.includes('architecture_decisions_with_rationale'));
    });

    it('presenting-design should define content_coverage for design confirmation', () => {
        const card = readJson('state-cards/presenting-design.card.json');
        assert.ok(Array.isArray(card.content_coverage));
        assert.ok(card.content_coverage.includes('module_responsibilities_and_boundaries'));
    });

    it('presenting-tasks should define rendering mandate', () => {
        const card = readJson('state-cards/presenting-tasks.card.json');
        assert.ok(card.rendering_mandate);
        assert.equal(card.rendering_mandate.format, '4_column_traceability_table');
        assert.ok(Array.isArray(card.rendering_mandate.bans));
    });

    it('presenting-bug-summary should define pre_presentation_action for bug-report.md', () => {
        const card = readJson('state-cards/presenting-bug-summary.card.json');
        assert.ok(card.pre_presentation_action);
        assert.equal(card.pre_presentation_action.action, 'write_bug_report');
        assert.ok(card.pre_presentation_action.exception_note);
    });

    it('presenting-root-cause should define presentation_guidance', () => {
        const card = readJson('state-cards/presenting-root-cause.card.json');
        assert.ok(card.presentation_guidance);
        assert.ok(card.presentation_guidance.hypotheses);
        assert.ok(card.presentation_guidance.blast_radius);
    });

    it('presenting-fix-strategy should define presentation_guidance', () => {
        const card = readJson('state-cards/presenting-fix-strategy.card.json');
        assert.ok(card.presentation_guidance);
        assert.ok(card.presentation_guidance.approaches);
        assert.ok(card.presentation_guidance.regression_risk);
        assert.ok(card.presentation_guidance.test_gaps);
    });
});

// ---------------------------------------------------------------------------
// Finalizing card completeness
// ---------------------------------------------------------------------------

describe('T037: finalizing.card.json — finalization template completeness', () => {
    const card = readJson('state-cards/finalizing.card.json');

    it('should define batch write contract', () => {
        assert.ok(card.batch_write_contract);
        assert.equal(card.batch_write_contract.max_responses, 2);
        assert.ok(card.batch_write_contract.anti_pattern);
    });

    it('should define cross-check instructions for both workflows', () => {
        assert.ok(card.cross_check_instructions);
        assert.ok(Array.isArray(card.cross_check_instructions.analyze));
        assert.ok(Array.isArray(card.cross_check_instructions.bug_gather));
        assert.ok(card.cross_check_instructions.analyze.length >= 4, 'Analyze needs at least 4 cross-checks');
        assert.ok(card.cross_check_instructions.bug_gather.length >= 2, 'Bug-gather needs at least 2 cross-checks');
    });

    it('should define meta_json_finalization for both workflows', () => {
        assert.ok(card.meta_json_finalization);
        assert.ok(card.meta_json_finalization.analyze);
        assert.ok(card.meta_json_finalization.bug_gather);
    });

    it('should define analyze meta.json with SESSION_RECORD schema', () => {
        const analyze = card.meta_json_finalization.analyze;
        assert.ok(analyze.session_record_schema, 'Missing SESSION_RECORD schema');
        assert.ok(analyze.session_record_schema.session_id, 'Missing session_id');
        assert.ok(analyze.session_record_schema.slug, 'Missing slug');
        assert.ok(analyze.session_record_schema.timestamp, 'Missing timestamp');
        assert.ok(analyze.session_record_schema.topics, 'Missing topics');
    });

    it('should define analyze meta.json with phases_completed_mapping', () => {
        const analyze = card.meta_json_finalization.analyze;
        assert.ok(analyze.phases_completed_mapping, 'Missing phases_completed_mapping');
        assert.ok(analyze.phases_completed_mapping['01-requirements']);
        assert.ok(analyze.phases_completed_mapping['02-architecture']);
        assert.ok(analyze.phases_completed_mapping['03-design']);
    });

    it('should define bug_gather meta.json with bug_classification_fields', () => {
        const bugGather = card.meta_json_finalization.bug_gather;
        assert.ok(Array.isArray(bugGather.bug_classification_fields), 'Missing bug_classification_fields');
        assert.ok(bugGather.bug_classification_fields.includes('severity'));
        assert.ok(bugGather.bug_classification_fields.includes('category'));
    });

    it('should define progressive_meta_updates with checkpoints', () => {
        assert.ok(card.progressive_meta_updates);
        assert.ok(Array.isArray(card.progressive_meta_updates.checkpoints));
        assert.ok(card.progressive_meta_updates.checkpoints.includes('after_codebase_scan'));
        assert.ok(card.progressive_meta_updates.checkpoints.includes('on_early_exit'));
    });

    it('should define finalization sequence (3 turns)', () => {
        assert.ok(Array.isArray(card.finalization_sequence));
        assert.equal(card.finalization_sequence.length, 3);
        assert.equal(card.finalization_sequence[0].turn, 1);
        assert.equal(card.finalization_sequence[0].action, 'cross_check');
        assert.equal(card.finalization_sequence[1].action, 'parallel_batch_write');
        assert.equal(card.finalization_sequence[2].action, 'meta_json_and_completion');
    });

    it('should define written_tasks_format distinguishing on-screen from written format', () => {
        assert.ok(card.written_tasks_format, 'Missing written_tasks_format');
        assert.ok(card.written_tasks_format.on_screen_template);
        assert.ok(card.written_tasks_format.written_template);
        assert.ok(Array.isArray(card.written_tasks_format.written_format_rules));
        assert.ok(card.written_tasks_format.written_format_rules.length >= 4);
    });

    it('should define summary_persistence for both workflows', () => {
        assert.ok(card.summary_persistence, 'Missing summary_persistence');
        assert.ok(card.summary_persistence.analyze, 'Missing analyze summary persistence');
        assert.ok(card.summary_persistence.bug_gather, 'Missing bug_gather summary persistence');
        assert.ok(Array.isArray(card.summary_persistence.analyze.persist_at_finalization));
        assert.ok(Array.isArray(card.summary_persistence.bug_gather.persist_at_finalization));
    });

    it('should define completion_signals for both workflows', () => {
        assert.ok(card.completion_signals, 'Missing completion_signals');
        assert.equal(card.completion_signals.analyze, 'ROUNDTABLE_COMPLETE');
        assert.equal(card.completion_signals.bug_gather, 'BUG_ROUNDTABLE_COMPLETE');
    });
});

// ---------------------------------------------------------------------------
// Conversation card completeness
// ---------------------------------------------------------------------------

describe('T037: conversation.card.json — conversation state completeness', () => {
    const card = readJson('state-cards/conversation.card.json');

    it('should define deferred_scan with trigger', () => {
        assert.ok(card.deferred_scan);
        assert.equal(card.deferred_scan.trigger, 'after_first_user_reply');
        assert.ok(card.deferred_scan.note.includes('Maya'));
    });

    it('should define ask_vs_infer policy', () => {
        assert.ok(card.ask_vs_infer);
        assert.ok(card.ask_vs_infer.ask_when);
        assert.ok(card.ask_vs_infer.infer_when);
        assert.equal(card.ask_vs_infer.max_primary_questions_per_exchange, 1);
    });

    it('should define topic_coverage_plan with tracking fields', () => {
        assert.ok(card.topic_coverage_plan);
        assert.ok(Array.isArray(card.topic_coverage_plan.fields_per_topic));
        assert.ok(card.topic_coverage_plan.fields_per_topic.includes('coverage_pct'));
        assert.ok(card.topic_coverage_plan.fields_per_topic.includes('confidence'));
    });

    it('should define preferred_tools hierarchy', () => {
        assert.ok(card.preferred_tools);
        assert.ok(Array.isArray(card.preferred_tools.hierarchy));
        assert.equal(card.preferred_tools.hierarchy[0].tool, 'semantic_search');
    });
});

// ---------------------------------------------------------------------------
// Task cards completeness
// ---------------------------------------------------------------------------

describe('T037: task cards — sub-task definitions completeness', () => {
    it('should have all required task cards', () => {
        const taskCardsDir = path.join(ROUNDTABLE_DIR, 'task-cards');
        const expectedCards = [
            'scope-framing.task-card.json',
            'codebase-scan.task-card.json',
            'blast-radius.task-card.json',
            'options-research.task-card.json',
            'dependency-check.task-card.json',
            'tracing.task-card.json'
        ];
        for (const card of expectedCards) {
            assert.ok(fs.existsSync(path.join(taskCardsDir, card)), `Missing task card: ${card}`);
        }
    });

    it('tracing task card should define external delegation with fail_open', () => {
        const card = readJson('task-cards/tracing.task-card.json');
        assert.ok(card.external_delegation);
        assert.equal(card.external_delegation.agent, 'tracing-orchestrator');
        assert.equal(card.external_delegation.fail_open, true);
    });

    it('all task cards should define expected_output with fields', () => {
        const taskCardsDir = path.join(ROUNDTABLE_DIR, 'task-cards');
        const cards = fs.readdirSync(taskCardsDir).filter(f => f.endsWith('.json'));

        for (const cardFile of cards) {
            const card = JSON.parse(fs.readFileSync(path.join(taskCardsDir, cardFile), 'utf8'));
            assert.ok(card.expected_output, `${cardFile} missing expected_output`);
            assert.ok(card.expected_output.shape, `${cardFile} missing expected_output.shape`);
            assert.ok(card.expected_output.fields, `${cardFile} missing expected_output.fields`);
            assert.ok(card.completion_marker, `${cardFile} missing completion_marker`);
        }
    });
});
