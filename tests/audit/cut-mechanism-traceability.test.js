/**
 * Cut-to-Mechanism Traceability Verification
 *
 * Traces: FR-007, NFR-005
 *
 * For each entry in the audit traceability log, verify that the
 * mechanism destination exists:
 * - Compliance engine rules: rule ID exists in conversational-rules.json
 * - Template/definitions: field/content exists in the target file
 * - Dead/deleted (B5): confirm it is classified as B5
 *
 * Uses node:test + node:assert/strict.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

// --- Helper: Read and parse the traceability log ---

function readTraceabilityLog() {
  const logPath = path.join(
    ROOT,
    'docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/audit-traceability.md'
  );
  const content = fs.readFileSync(logPath, 'utf-8');
  return content;
}

/**
 * Parse markdown table rows from a section of the traceability log.
 * Returns array of { num, section, bucket, destination, verification }.
 */
function parseTableRows(content, sectionHeader) {
  const sectionStart = content.indexOf(sectionHeader);
  if (sectionStart === -1) return [];

  // Find the table after the section header
  const afterHeader = content.slice(sectionStart);
  const lines = afterHeader.split('\n');

  const rows = [];
  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect table header row (starts with |) and separator row (|---|)
    if (trimmed.startsWith('| #') || /^\|[\s-]+\|/.test(trimmed)) {
      inTable = true;
      if (/^\|[\s-]+\|/.test(trimmed)) {
        headerPassed = true;
      }
      continue;
    }

    // End of table
    if (inTable && headerPassed && !trimmed.startsWith('|')) {
      break;
    }

    if (inTable && headerPassed && trimmed.startsWith('|')) {
      const cells = trimmed
        .split('|')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      if (cells.length >= 4) {
        rows.push({
          num: cells[0],
          section: cells[1],
          bucket: cells[2],
          destination: cells[3],
          verification: cells[4] || ''
        });
      }
    }
  }

  return rows;
}

// --- Load mechanism targets ---

function loadConversationalRules() {
  const rulesPath = path.join(ROOT, 'src/isdlc/config/conversational-rules.json');
  return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
}

function loadCoreJson() {
  const corePath = path.join(ROOT, 'src/isdlc/config/roundtable/core.json');
  return JSON.parse(fs.readFileSync(corePath, 'utf-8'));
}

function loadAnalyzeJson() {
  const analyzePath = path.join(ROOT, 'src/isdlc/config/roundtable/analyze.json');
  return JSON.parse(fs.readFileSync(analyzePath, 'utf-8'));
}

function loadBugGatherJson() {
  const bgPath = path.join(ROOT, 'src/isdlc/config/roundtable/bug-gather.json');
  return JSON.parse(fs.readFileSync(bgPath, 'utf-8'));
}

function stateCardExists(cardName) {
  const cardPath = path.join(ROOT, 'src/isdlc/config/roundtable/state-cards', cardName);
  return fs.existsSync(cardPath);
}

// --- Extract rule IDs from conversational-rules.json ---

function getRuleIds(rules) {
  return new Set(rules.rules.map(r => r.id));
}

// --- Extract a nested field from an object using dot notation ---

function getNestedField(obj, dotPath) {
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// --- Tests ---

describe('Audit Traceability Log: roundtable-analyst.md deletions', () => {
  const content = readTraceabilityLog();
  const rows = parseTableRows(content, '## roundtable-analyst.md Deletions');
  const rules = loadConversationalRules();
  const ruleIds = getRuleIds(rules);
  const core = loadCoreJson();
  const analyze = loadAnalyzeJson();

  it('should have parsed at least 20 deletion rows', () => {
    assert.ok(rows.length >= 20, `Expected >= 20 rows, got ${rows.length}`);
  });

  it('should verify all compliance engine rule IDs exist in conversational-rules.json', () => {
    const complianceRows = rows.filter(r =>
      r.destination.includes('compliance engine') &&
      r.destination.includes('conversational-rules.json')
    );

    assert.ok(complianceRows.length > 0, 'Expected at least one compliance engine row');

    for (const row of complianceRows) {
      // Extract rule ID from verification column (format: "Rule ID: `rule-name`")
      const ruleIdMatch = row.verification.match(/Rule ID: `([^`]+)`/);
      if (ruleIdMatch) {
        const ruleId = ruleIdMatch[1];
        assert.ok(
          ruleIds.has(ruleId),
          `Rule ID "${ruleId}" from "${row.section}" not found in conversational-rules.json`
        );
      }
    }
  });

  it('should verify all hook-enforced rules reference existing hooks', () => {
    // Filter for rows that reference .cjs hook files (not .json config files)
    const hookRows = rows.filter(r =>
      r.destination.includes('compliance engine:') &&
      r.destination.includes('.cjs')
    );

    const knownHooks = [
      'participation-gate-enforcer.cjs',
      'tasks-as-table-validator.cjs',
      'persona-extension-composer-validator.cjs',
      'state-file-guard.cjs',
      'branch-guard.cjs'
    ];

    for (const row of hookRows) {
      const matchesKnownHook = knownHooks.some(h => row.destination.includes(h));
      assert.ok(
        matchesKnownHook,
        `Hook reference in "${row.section}" destination "${row.destination}" does not match any known hook`
      );
    }
  });

  it('should verify core.json persona_model.core_personas exists (S4.1)', () => {
    const personas = getNestedField(core, 'persona_model.core_personas');
    assert.ok(Array.isArray(personas), 'core.json persona_model.core_personas should be an array');
    assert.ok(personas.length >= 3, 'Should have at least 3 core personas');

    const names = personas.map(p => p.name);
    assert.ok(names.includes('Maya'), 'Maya should be in core personas');
    assert.ok(names.includes('Alex'), 'Alex should be in core personas');
    assert.ok(names.includes('Jordan'), 'Jordan should be in core personas');
  });

  it('should verify core.json persona_model.promotion_schema exists (S4.3)', () => {
    const schema = getNestedField(core, 'persona_model.promotion_schema');
    assert.ok(schema != null, 'core.json persona_model.promotion_schema should exist');
    assert.ok(schema.required_fields != null, 'promotion_schema.required_fields should exist');
    assert.ok(schema.extension_points != null, 'promotion_schema.extension_points should exist');
    assert.ok(schema.extension_points.analyze != null, 'extension_points.analyze should exist');
    assert.ok(schema.conflict_resolution === 'first_declared_wins', 'conflict_resolution should be first_declared_wins');
  });

  it('should verify analyze.json states exist for PRESENTING_* states (S7.1)', () => {
    const stateNames = [
      'PRESENTING_REQUIREMENTS',
      'PRESENTING_ARCHITECTURE',
      'PRESENTING_DESIGN',
      'PRESENTING_TASKS'
    ];
    for (const state of stateNames) {
      assert.ok(
        analyze.states[state] != null,
        `analyze.json states.${state} should exist`
      );
    }
  });

  it('should verify state cards exist for analyze workflow states', () => {
    const expectedCards = [
      'presenting-requirements.card.json',
      'presenting-architecture.card.json',
      'presenting-design.card.json',
      'presenting-tasks.card.json'
    ];
    for (const card of expectedCards) {
      assert.ok(
        stateCardExists(card),
        `State card ${card} should exist in state-cards directory`
      );
    }
  });

  it('should verify analyze.json tier_rules exist (S10.2)', () => {
    assert.ok(analyze.tier_rules != null, 'analyze.json tier_rules should exist');
    assert.ok(analyze.tier_rules.standard != null, 'tier_rules.standard should exist');
    assert.ok(analyze.tier_rules.light != null, 'tier_rules.light should exist');
    assert.ok(analyze.tier_rules.trivial != null, 'tier_rules.trivial should exist');
  });

  it('should verify core.json artifact_ownership.analyze exists (C.1)', () => {
    const ownership = getNestedField(core, 'artifact_ownership.analyze');
    assert.ok(ownership != null, 'core.json artifact_ownership.analyze should exist');
    assert.ok(ownership.requirements != null, 'artifact_ownership.analyze.requirements should exist');
    assert.ok(ownership.architecture != null, 'artifact_ownership.analyze.architecture should exist');
    assert.ok(ownership.design != null, 'artifact_ownership.analyze.design should exist');
  });

  it('should verify all B5 (dead/deleted) rows are classified as B5', () => {
    const deadRows = rows.filter(r => r.destination.startsWith('dead/deleted'));
    for (const row of deadRows) {
      assert.ok(
        row.bucket.includes('B5') || row.bucket.includes('dead') || row.bucket.includes('dormant'),
        `Dead/deleted destination "${row.section}" should be bucket B5, got "${row.bucket}"`
      );
    }
  });

  it('should verify written_template_ref in PRESENTING_TASKS (S12.3)', () => {
    const tasksState = analyze.states.PRESENTING_TASKS;
    assert.ok(
      tasksState.written_template_ref === 'tasks.template.json',
      'PRESENTING_TASKS.written_template_ref should be tasks.template.json'
    );
  });
});

describe('Audit Traceability Log: bug-roundtable-analyst.md deletions', () => {
  const content = readTraceabilityLog();
  const rows = parseTableRows(content, '## bug-roundtable-analyst.md Deletions');
  const rules = loadConversationalRules();
  const ruleIds = getRuleIds(rules);
  const core = loadCoreJson();
  const bugGather = loadBugGatherJson();

  it('should have parsed at least 20 deletion rows', () => {
    assert.ok(rows.length >= 20, `Expected >= 20 rows, got ${rows.length}`);
  });

  it('should verify all compliance engine rule IDs exist in conversational-rules.json', () => {
    const complianceRows = rows.filter(r =>
      r.destination.includes('conversational-rules.json')
    );

    for (const row of complianceRows) {
      const ruleIdMatch = row.verification.match(/Rule ID: `([^`]+)`/);
      if (ruleIdMatch) {
        const ruleId = ruleIdMatch[1];
        assert.ok(
          ruleIds.has(ruleId),
          `Rule ID "${ruleId}" from "${row.section}" not found in conversational-rules.json`
        );
      }
    }
  });

  it('should verify core.json agent_metadata.bug_gather exists (frontmatter)', () => {
    const metadata = getNestedField(core, 'agent_metadata.bug_gather');
    assert.ok(metadata != null, 'core.json agent_metadata.bug_gather should exist');
    assert.ok(metadata.name != null, 'agent_metadata.bug_gather.name should exist');
    assert.ok(metadata.execution_mode != null, 'agent_metadata.bug_gather.execution_mode should exist');
  });

  it('should verify bug-gather.json states exist for PRESENTING_* states', () => {
    const stateNames = [
      'PRESENTING_BUG_SUMMARY',
      'PRESENTING_ROOT_CAUSE',
      'PRESENTING_FIX_STRATEGY',
      'PRESENTING_TASKS'
    ];
    for (const state of stateNames) {
      assert.ok(
        bugGather.states[state] != null,
        `bug-gather.json states.${state} should exist`
      );
    }
  });

  it('should verify state cards exist for bug-gather workflow states', () => {
    const expectedCards = [
      'presenting-bug-summary.card.json',
      'presenting-root-cause.card.json',
      'presenting-fix-strategy.card.json',
      'presenting-tasks.card.json'
    ];
    for (const card of expectedCards) {
      assert.ok(
        stateCardExists(card),
        `State card ${card} should exist in state-cards directory`
      );
    }
  });

  it('should verify core.json stop_wait_contract exists (S2)', () => {
    assert.ok(core.stop_wait_contract != null, 'core.json stop_wait_contract should exist');
    assert.ok(
      core.stop_wait_contract.one_exchange_per_turn === true,
      'stop_wait_contract.one_exchange_per_turn should be true'
    );
  });

  it('should verify core.json rendering_modes exists (S5)', () => {
    assert.ok(core.rendering_modes != null, 'core.json rendering_modes should exist');
    assert.ok(core.rendering_modes.bulleted != null, 'rendering_modes.bulleted should exist');
    assert.ok(core.rendering_modes.conversational != null, 'rendering_modes.conversational should exist');
    assert.ok(core.rendering_modes.silent != null, 'rendering_modes.silent should exist');
    assert.ok(
      Array.isArray(core.rendering_modes.shared_invariants),
      'rendering_modes.shared_invariants should be an array'
    );
  });

  it('should verify core.json conversation_rendering_rules exists (S6)', () => {
    const coreRules = core.conversation_rendering_rules;
    assert.ok(Array.isArray(coreRules), 'core.json conversation_rendering_rules should be an array');
    assert.ok(coreRules.length >= 11, 'Should have at least 11 rendering rules');
  });

  it('should verify core.json amending_semantics exists (S7 AMENDING)', () => {
    assert.ok(core.amending_semantics != null, 'core.json amending_semantics should exist');
    assert.ok(
      core.amending_semantics.restart_target.bug_gather === 'PRESENTING_BUG_SUMMARY',
      'amending_semantics.restart_target.bug_gather should be PRESENTING_BUG_SUMMARY'
    );
  });

  it('should verify core.json early_exit exists (S11)', () => {
    assert.ok(core.early_exit != null, 'core.json early_exit should exist');
    assert.ok(Array.isArray(core.early_exit.signals), 'early_exit.signals should be an array');
    assert.ok(Array.isArray(core.early_exit.protocol), 'early_exit.protocol should be an array');
  });

  it('should verify core.json accept/amend indicators exist (S8)', () => {
    assert.ok(Array.isArray(core.accept_indicators), 'core.json accept_indicators should be an array');
    assert.ok(Array.isArray(core.amend_indicators), 'core.json amend_indicators should be an array');
    assert.ok(core.ambiguous_default === 'amend', 'ambiguous_default should be "amend"');
    assert.ok(
      typeof core.confirmation_prompt === 'string',
      'confirmation_prompt should be a string'
    );
  });

  it('should verify bug-gather.json tier_rules exist (S10)', () => {
    assert.ok(bugGather.tier_rules != null, 'bug-gather.json tier_rules should exist');
    assert.ok(bugGather.tier_rules.standard != null, 'tier_rules.standard should exist');
    assert.ok(bugGather.tier_rules.light != null, 'tier_rules.light should exist');
    assert.ok(bugGather.tier_rules.light.fold != null, 'tier_rules.light.fold should exist for ROOT_CAUSE folding');
  });

  it('should verify bug-gather.json FINALIZING state has meta_json_update (S12)', () => {
    const finalizing = bugGather.states.FINALIZING;
    assert.ok(finalizing != null, 'bug-gather.json states.FINALIZING should exist');
    assert.ok(finalizing.meta_json_update != null, 'FINALIZING.meta_json_update should exist');
    assert.ok(
      Array.isArray(finalizing.meta_json_update.phases_completed),
      'meta_json_update.phases_completed should be an array'
    );
  });

  it('should verify all B5 (dead/deleted) rows are classified as B5', () => {
    const deadRows = rows.filter(r => r.destination.startsWith('dead/deleted'));
    for (const row of deadRows) {
      assert.ok(
        row.bucket.includes('B5') || row.bucket.includes('dead') || row.bucket.includes('duplicate') || row.bucket.includes('dormant'),
        `Dead/deleted destination "${row.section}" should be bucket B5, got "${row.bucket}"`
      );
    }
  });

  it('should verify core.json persona_model has bug_gather owns_states (S4)', () => {
    const personas = core.persona_model.core_personas;
    for (const p of personas) {
      assert.ok(
        p.owns_states.bug_gather != null,
        `Persona ${p.name} should have owns_states.bug_gather`
      );
    }
  });

  it('should verify bug-gather.json PRESENTING_BUG_SUMMARY has pre_presentation_action (S7)', () => {
    const state = bugGather.states.PRESENTING_BUG_SUMMARY;
    assert.ok(state != null, 'PRESENTING_BUG_SUMMARY state should exist');
    assert.ok(
      state.pre_presentation_action != null,
      'PRESENTING_BUG_SUMMARY should have pre_presentation_action for bug-report.md'
    );
  });
});

describe('Cross-file consistency checks', () => {
  const core = loadCoreJson();
  const analyze = loadAnalyzeJson();
  const bugGather = loadBugGatherJson();
  const rules = loadConversationalRules();
  const ruleIds = getRuleIds(rules);

  it('should have all rule IDs referenced in the traceability log present in conversational-rules.json', () => {
    const expectedRuleIds = [
      'elicitation-first',
      'sequential-domain-confirmation',
      'template-section-order',
      'bulleted-format',
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

    for (const ruleId of expectedRuleIds) {
      assert.ok(
        ruleIds.has(ruleId),
        `Expected rule ID "${ruleId}" to exist in conversational-rules.json`
      );
    }
  });

  it('should have analyze.json inherit from core.json', () => {
    assert.equal(analyze.inherits, 'core.json', 'analyze.json should inherit from core.json');
  });

  it('should have bug-gather.json inherit from core.json', () => {
    assert.equal(bugGather.inherits, 'core.json', 'bug-gather.json should inherit from core.json');
  });

  it('should have core.json artifact_ownership for both analyze and bug_gather', () => {
    assert.ok(core.artifact_ownership.analyze != null, 'artifact_ownership.analyze should exist');
    assert.ok(core.artifact_ownership.bug_gather != null, 'artifact_ownership.bug_gather should exist');
  });

  it('should have core.json amending_semantics with restart targets for both workflows', () => {
    assert.ok(
      core.amending_semantics.restart_target.analyze != null,
      'amending_semantics.restart_target.analyze should exist'
    );
    assert.ok(
      core.amending_semantics.restart_target.bug_gather != null,
      'amending_semantics.restart_target.bug_gather should exist'
    );
  });

  it('should have core.json promotion_schema extension_points for both workflows', () => {
    const ep = core.persona_model.promotion_schema.extension_points;
    assert.ok(Array.isArray(ep.analyze), 'extension_points.analyze should be an array');
    assert.ok(Array.isArray(ep.bug_gather), 'extension_points.bug_gather should be an array');
    assert.ok(ep.analyze.length >= 8, 'analyze should have at least 8 extension points');
    assert.ok(ep.bug_gather.length >= 8, 'bug_gather should have at least 8 extension points');
  });
});
