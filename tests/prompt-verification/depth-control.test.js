/**
 * Prompt Content Verification Tests: REQ-0046 Depth Control
 *
 * These tests verify that roundtable-analyst.md, isdlc.md, and topic files
 * contain the required content patterns for the dynamic depth control feature
 * (7 FRs, 19 ACs).
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0046-roundtable-depth-control-adaptive-brief-standard-deep
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Test constants
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const TOPICS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'skills', 'analysis-topics');

const TOPIC_IDS = [
  'problem-discovery',
  'requirements',
  'technical-analysis',
  'architecture',
  'specification',
  'security'
];

const INFERENCE_FIELDS = ['assumption', 'trigger', 'confidence', 'topic'];
const SCOPE_VALUES = ['trivial', 'light', 'standard', 'epic'];

// Helper: read file with caching
const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

function readTopicFile(topicId) {
  // Topic files are in subdirectories named by topic_id
  const topicDir = join(TOPICS_DIR, topicId);
  const files = readdirSync(topicDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) throw new Error(`No .md file found in ${topicDir}`);
  return readFile(join(topicDir, files[0]));
}

// =============================================================================
// TG-01: Dynamic Depth Sensing (FR-001)
// Traces to: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
// =============================================================================

describe('TG-01: Dynamic Depth Sensing (FR-001)', () => {

  // TC-01.1 [P0]: Depth sensing protocol exists
  it('TC-01.1 [P0]: Dynamic depth sensing protocol exists in roundtable-analyst.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('depth') && lower.includes('sens'),
      'roundtable-analyst.md must contain depth sensing protocol'
    );
  });

  // TC-01.2 [P0]: LLM-judged, not rule-based
  it('TC-01.2 [P0]: Depth is LLM-judged based on user signals, not keyword rules', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('answer length') || lower.includes('engagement') || lower.includes('tone') || lower.includes('signal')),
      'Must reference user signals (answer length, engagement, tone) for depth calibration'
    );
    // Should NOT contain prescriptive keyword detection lists
    assert.ok(
      !lower.includes('signal_words') && !lower.includes('signal words: ['),
      'Must NOT contain static signal word detection lists'
    );
  });

  // TC-01.3 [P0]: Per-topic independence
  it('TC-01.3 [P0]: Depth operates independently per topic', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('per topic') || lower.includes('per-topic') || lower.includes('independently') || lower.includes('each topic'),
      'Depth sensing must operate independently per topic'
    );
  });

  // TC-01.4 [P0]: Depth is calibrated per topic (semantic of topic-file depth_guidance preserved)
  // Note: the explicit `depth_guidance` term was consolidated in the REQ-GH-235 rewrite;
  // the semantic contract (per-topic depth calibration) is preserved via §9.3 Dynamic Depth Sensing.
  it('TC-01.4 [P0]: Depth is calibrated per topic for behavioral calibration', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('calibrat') && (lower.includes('per topic') || lower.includes('per-topic')),
      'Must reference per-topic depth calibration (preserves topic-file depth_guidance semantic)'
    );
  });

  // TC-01.5 [P0]: Minimum coverage guardrail
  it('TC-01.5 [P0]: Minimum coverage guardrail prevents topic skip at brief depth', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('minimum') || lower.includes('guardrail')) && lower.includes('coverage'),
      'Must include minimum coverage guardrail even at brief depth'
    );
  });
});

// =============================================================================
// TG-02: Bidirectional Depth Adjustment (FR-002)
// Traces to: FR-002, AC-002-01, AC-002-02
// =============================================================================

describe('TG-02: Bidirectional Depth Adjustment (FR-002)', () => {

  // TC-02.1 [P0]: Depth reduces on brevity signals (REQ-GH-235 rephrasing)
  // The rewrite phrases this as "Short terse answers -> brief" and "Bidirectional adjustment".
  // Semantic contract preserved: depth responds to user signals.
  it('TC-02.1 [P0]: Reduces depth when user signals brevity (terse answers -> brief)', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('terse') || lower.includes('short')) && lower.includes('brief'),
      'Must reduce depth when user signals brevity (e.g. terse/short answers -> brief depth)'
    );
    // Bidirectional adjustment covers both acceleration and deepening
    assert.ok(
      lower.includes('bidirectional adjustment') || lower.includes('depth can go up or down'),
      'Must document bidirectional depth adjustment'
    );
  });

  // TC-02.2 [P0]: Depth deepens on engagement signals (REQ-GH-235 rephrasing)
  // The rewrite phrases this as "Detailed multi-sentence answers -> deep".
  it('TC-02.2 [P0]: Deepens when user signals engagement (detailed answers -> deep)', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('detailed') || lower.includes('multi-sentence')) && lower.includes('deep'),
      'Must deepen probing when user signals engagement (detailed answers -> deep)'
    );
  });
});

// =============================================================================
// TG-03: Inference Tracking (FR-003)
// Traces to: FR-003, AC-003-01, AC-003-02, AC-003-03
// =============================================================================

describe('TG-03: Inference Tracking (FR-003)', () => {

  // TC-03.1 [P0]: Inference log protocol exists
  it('TC-03.1 [P0]: Inference logging protocol exists in roundtable-analyst.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('inference') && (lower.includes('log') || lower.includes('track')),
      'Must contain inference logging/tracking protocol'
    );
  });

  // TC-03.2 [P0]: Required inference fields documented
  it('TC-03.2 [P0]: Inference entries include assumption, trigger, confidence, topic', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    for (const field of INFERENCE_FIELDS) {
      assert.ok(
        lower.includes(field),
        `Inference entry must include field: ${field}`
      );
    }
  });

  // TC-03.3 [P0]: Confidence levels defined
  it('TC-03.3 [P0]: Confidence levels are Medium and Low', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('Medium') && content.includes('Low'),
      'Must define Medium and Low confidence levels for inferences'
    );
  });

  // TC-03.4 [P0]: Codebase-only inferences tagged Low
  it('TC-03.4 [P0]: Codebase-only inferences tagged as Low confidence', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('codebase') && lower.includes('low'),
      'Inferences from codebase alone must be tagged Low confidence'
    );
  });
});

// =============================================================================
// TG-04: Tiered Assumption Views (FR-004)
// Traces to: FR-004, AC-004-01, AC-004-02, AC-004-03, AC-004-04
// =============================================================================

describe('TG-04: Tiered Assumption Views (FR-004)', () => {

  // TC-04.1 [P0]: Assumptions section in confirmation summaries
  it('TC-04.1 [P0]: Confirmation summaries include Assumptions section', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('assumption') && lower.includes('confirmation'),
      'Confirmation summaries must include an Assumptions section'
    );
  });

  // TC-04.2 [P0]: Topic-level default view
  it('TC-04.2 [P0]: Default view groups assumptions by topic with count', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('topic') || lower.includes('group')) && lower.includes('assumption'),
      'Default view must group assumptions by topic'
    );
  });

  // TC-04.3 [P0]: FR-level detail on demand
  it('TC-04.3 [P0]: FR-level detail available on user request', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('detail') || lower.includes('expand')) && (lower.includes('fr') || lower.includes('fr-level')),
      'FR-level detail must be available on demand'
    );
  });

  // TC-04.4 [P0]: Conversational interaction (no menus)
  it('TC-04.4 [P0]: Tiered view is conversational, not menu-based', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('conversational') || lower.includes('naturally') || lower.includes('ask'),
      'Tiered view interaction must be conversational'
    );
  });
});

// =============================================================================
// TG-05: Scope Recommendation (FR-005)
// Traces to: FR-005, AC-005-01, AC-005-02, AC-005-03, AC-005-04
// =============================================================================

describe('TG-05: Scope Recommendation (FR-005)', () => {

  // TC-05.1 [P0]: Scope recommendation protocol exists
  it('TC-05.1 [P0]: Scope recommendation protocol exists in roundtable-analyst.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('scope') && lower.includes('recommend'),
      'Must contain scope recommendation protocol'
    );
  });

  // TC-05.2 [P0]: All four scope values documented
  it('TC-05.2 [P0]: All four scope values (trivial/light/standard/epic) documented', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    for (const scope of SCOPE_VALUES) {
      assert.ok(
        lower.includes(scope),
        `Must document scope value: ${scope}`
      );
    }
  });

  // TC-05.3 [P0]: User confirmation of scope
  it('TC-05.3 [P0]: Scope recommendation confirmed with user before recording', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('recommended_scope') || lower.includes('scope'),
      'Must document scope output field'
    );
    assert.ok(
      lower.includes('confirm') || lower.includes('agreed') || lower.includes('user_confirmed'),
      'Must confirm scope with user'
    );
  });

  // TC-05.4 [P0]: recommended_scope written to meta.json
  it('TC-05.4 [P0]: recommended_scope field written to meta.json', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('recommended_scope') && content.includes('meta.json'),
      'Must write recommended_scope to meta.json'
    );
  });
});

// =============================================================================
// TG-06: --light Flag Deprecation (FR-006)
// Traces to: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04
// =============================================================================

describe('TG-06: --light Flag Deprecation (FR-006)', () => {

  // TC-06.1 [P1]: Deprecation notice in isdlc.md
  it('TC-06.1 [P1]: isdlc.md contains --light deprecation notice', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('deprecated') && lower.includes('--light'),
      'isdlc.md must contain --light deprecation notice'
    );
  });

  // TC-06.2 [P1]: Transition period documented
  it('TC-06.2 [P1]: Transition period where --light sets starting suggestion', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('transition') || lower.includes('starting suggestion') || lower.includes('pre-set')),
      'Must document transition period for --light flag'
    );
  });

  // TC-06.3 [P1]: recommended_scope consumed by build workflow
  it('TC-06.3 [P1]: Build workflow references recommended_scope from meta.json', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('recommended_scope'),
      'Build workflow must reference recommended_scope from meta.json'
    );
  });

  // TC-06.4 [P1]: Roundtable ignores --light for depth
  it('TC-06.4 [P1]: Roundtable agent does not use --light for depth calibration', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    // The roundtable should NOT have --light-to-depth mapping
    // It should reference dynamic sensing instead
    assert.ok(
      lower.includes('depth') && lower.includes('dynamic'),
      'Roundtable must use dynamic depth sensing (not --light flag)'
    );
  });
});

// =============================================================================
// TG-07: Topic File Calibration (FR-007)
// Traces to: FR-007, AC-007-01, AC-007-02
// =============================================================================

describe('TG-07: Topic File Calibration (FR-007)', () => {

  // TC-07.1 [P0]: All 6 topic files have depth_guidance
  it('TC-07.1 [P0]: All 6 topic files contain depth_guidance section', () => {
    for (const topicId of TOPIC_IDS) {
      const content = readTopicFile(topicId);
      assert.ok(
        content.includes('depth_guidance'),
        `Topic file ${topicId} must contain depth_guidance`
      );
    }
  });

  // TC-07.2 [P0]: depth_guidance uses behavioral descriptions
  it('TC-07.2 [P0]: depth_guidance uses behavioral descriptions (behavior/acceptance/inference_policy)', () => {
    for (const topicId of TOPIC_IDS) {
      const content = readTopicFile(topicId);
      const lower = content.toLowerCase();
      assert.ok(
        lower.includes('behavior') || lower.includes('acceptance') || lower.includes('inference_policy'),
        `Topic file ${topicId} depth_guidance must include behavioral keys (behavior, acceptance, inference_policy)`
      );
    }
  });

  // TC-07.3 [P0]: No prescriptive exchange counts in depth_guidance
  it('TC-07.3 [P0]: depth_guidance does not contain prescriptive exchange counts', () => {
    for (const topicId of TOPIC_IDS) {
      const content = readTopicFile(topicId);
      // Extract depth_guidance section
      const dgStart = content.indexOf('depth_guidance');
      if (dgStart === -1) continue;
      const dgSection = content.substring(dgStart, dgStart + 500);
      // Should not contain patterns like "1-2 questions" or "3-5 exchanges"
      assert.ok(
        !dgSection.match(/\d+-\d+\s+(question|exchange)/i),
        `Topic file ${topicId} depth_guidance must not contain prescriptive exchange counts like "1-2 questions"`
      );
    }
  });

  // TC-07.4 [P0]: Static sufficiency table removed from roundtable-analyst.md
  it('TC-07.4 [P0]: Static sizing-tier-to-depth mapping removed from roundtable-analyst.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    // The old static table mapped sizing tiers to exchange counts
    // It should be replaced by dynamic depth sensing instructions
    assert.ok(
      !content.includes('| light |') || !content.match(/\|\s*light\s*\|\s*\d+/),
      'Static tier-to-exchange-count mapping table must be removed'
    );
  });
});

// =============================================================================
// TG-08: Cross-File Consistency
// Traces to: All FRs, integration guards
// =============================================================================

describe('TG-08: Cross-File Consistency', () => {

  // TC-08.1 [P1]: No new hooks added
  // Note: hook count is environmental and tracks framework growth, not this REQ-0046 rewrite.
  // Guardrail prevents accidental additions during a prompt-only change. Counts are updated
  // when the framework intentionally adds new hooks.
  it('TC-08.1 [P1]: No new hooks added (zero runtime code change)', () => {
    const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs') && !f.includes('.test.'));
    assert.equal(
      hookFiles.length, 37,
      `Expected 37 hook files, found ${hookFiles.length}`
    );
  });

  // TC-08.2 [P1]: No new runtime dependencies
  // Note: dependency list is environmental and tracks framework growth, not this REQ-0046 rewrite.
  it('TC-08.2 [P1]: No new runtime dependencies', () => {
    const pkg = JSON.parse(readFile(join(PROJECT_ROOT, 'package.json')));
    const deps = Object.keys(pkg.dependencies || {}).sort();
    assert.deepStrictEqual(
      deps,
      ['chalk', 'fs-extra', 'js-yaml', 'onnxruntime-node', 'prompts', 'semver'],
      'Runtime dependencies must remain stable as snapshot'
    );
  });

  // TC-08.3 [P1]: ROUNDTABLE_COMPLETE signal preserved
  it('TC-08.3 [P1]: ROUNDTABLE_COMPLETE signal unchanged', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('ROUNDTABLE_COMPLETE'),
      'ROUNDTABLE_COMPLETE must remain the final signal'
    );
  });

  // TC-08.4 [P1]: Depth sensing invisible to user (NFR-002)
  it('TC-08.4 [P1]: No depth mode announcements in roundtable protocol', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('never announce') || lower.includes('invisible') || lower.includes('do not announce'),
      'Must explicitly prohibit announcing depth changes to user'
    );
  });
});
