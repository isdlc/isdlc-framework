/**
 * Unit tests for state-card-composer.js (REQ-GH-253, BUG-GH-265)
 *
 * Verifies outer affordance card composition for user-facing states.
 *
 * Traces to: FR-001, AC-001-01, AC-001-02
 * Test runner: node:test (ESM, Article XIII)
 *
 * Cases SC-01..SC-04: REQ-GH-253 baseline (skipped pending broader scope).
 * Cases SC-10, SC-11, SC-13: BUG-GH-265 T010 — rendering_mandate +
 *   content_coverage inlining via composer (red-green TDD).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeStateCard } from '../../../../src/core/roundtable/state-card-composer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source JSON is the test fixture (per test-strategy.md §2.2): load from the
// shipped state-cards directory, do not duplicate into in-test literals.
const STATE_CARDS_DIR = resolve(
  __dirname,
  '../../../../src/isdlc/config/roundtable/state-cards'
);

function loadCard(filename) {
  return JSON.parse(readFileSync(resolve(STATE_CARDS_DIR, filename), 'utf8'));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONVERSATION_STATE = {
  name: 'CONVERSATION',
  presenter: null,
  template: 'conversation.json'
};

const CONTEXT = {
  active_personas: ['Maya', 'Alex', 'Jordan'],
  rendering_mode: 'bulleted_by_domain',
  amendment_cycles: 0,
  topic_coverage: {},
  preferred_tools: ['mcp__isdlc-embedding__isdlc_embedding_semantic_search', 'mcp__code-index-mcp__search_code_advanced'],
  valid_transitions: ['scope_accepted'],
  active_template: 'roundtable-opening'
};

// ---------------------------------------------------------------------------
// SC-01: Compose card for CONVERSATION state (positive, AC-001-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 state-card-composer', () => {

  it.skip('SC-01: composes card with all required fields for CONVERSATION state', () => {
    // Given: the current state is CONVERSATION with active personas and tools
    // When: composeStateCard(CONVERSATION_STATE, CONTEXT) is called
    // Then: the card includes personas, rendering_mode, invariants, valid_transitions, active_template, preferred_tools
    // const card = composeStateCard(CONVERSATION_STATE, CONTEXT);
    // assert.ok(card.includes('Maya'));
    // assert.ok(card.includes('bulleted_by_domain'));
    // assert.ok(card.includes('scope_accepted'));
  });

  // SC-02: Card for confirmation state includes template reference (positive)
  it.skip('SC-02: confirmation state card includes full template reference', () => {
    // Given: the current state is PRESENTING_REQUIREMENTS
    // When: composeStateCard is called
    // Then: the card references the requirements confirmation template
    // const state = { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'requirements.template.json' };
    // const card = composeStateCard(state, CONTEXT);
    // assert.ok(card.includes('requirements.template.json'));
  });

  // SC-03: Card does not exceed 40-line output contract (positive)
  it.skip('SC-03: composed card is at most 40 lines', () => {
    // Given: any valid state and context
    // When: composeStateCard is called
    // Then: the result has <= 40 lines
    // const card = composeStateCard(CONVERSATION_STATE, CONTEXT);
    // const lineCount = card.split('\n').length;
    // assert.ok(lineCount <= 40, `card has ${lineCount} lines, max 40`);
  });

  // SC-04: Composition completes within 200ms budget (NFR-003)
  it.skip('SC-04: composition completes within 200ms performance budget', () => {
    // Given: a valid state and context
    // When: composeStateCard is called 10 times
    // Then: p95 duration < 200ms
    // const times = [];
    // for (let i = 0; i < 10; i++) {
    //   const start = performance.now();
    //   composeStateCard(CONVERSATION_STATE, CONTEXT);
    //   times.push(performance.now() - start);
    // }
    // times.sort((a, b) => a - b);
    // const p95 = times[Math.floor(times.length * 0.95)];
    // assert.ok(p95 < 200, `p95 composition time ${p95.toFixed(1)}ms exceeds 200ms budget`);
  });

  // -------------------------------------------------------------------------
  // BUG-GH-265 T010 — renderCard inlines rendering_mandate + content_coverage
  // -------------------------------------------------------------------------

  // SC-10: PRESENTING_TASKS card includes 4_column_traceability_table mandate
  // Canary symptom from bug-report.md (P0 — AC-001-01)
  it('SC-10: PRESENTING_TASKS card inlines rendering_mandate', () => {
    // Given: real card source loaded from src/isdlc/config/roundtable/state-cards/
    const cardSource = loadCard('presenting-tasks.card.json');
    const mandate = cardSource.rendering_mandate;
    assert.ok(mandate, 'fixture sanity: presenting-tasks.card.json must define rendering_mandate');

    // When: composeStateCard is invoked for PRESENTING_TASKS
    const card = composeStateCard('PRESENTING_TASKS', {});

    // Then: the rendering_mandate header and its key fields appear inline
    assert.match(card, /Rendering Mandate:/i, 'card must include a Rendering Mandate header');
    assert.ok(
      card.includes(mandate.format),
      `card must include format value "${mandate.format}"`
    );
    assert.ok(
      card.includes(mandate.style),
      `card must include style value "${mandate.style}"`
    );

    // And: each column from the source rendering_mandate.columns appears
    for (const column of mandate.columns) {
      assert.ok(
        card.includes(column),
        `card must include column "${column}" from rendering_mandate`
      );
    }

    // And: each ban from the source rendering_mandate.bans appears
    for (const ban of mandate.bans) {
      assert.ok(
        card.includes(ban),
        `card must include banned format "${ban}" from rendering_mandate`
      );
    }

    // Negative: bare "Template: traceability.template.json" line without any
    // surrounding inlined mandate content is the broken behavior. Allow the
    // Template line to still be present, but require Rendering Mandate output
    // to coexist with it.
    if (/^Template:\s*traceability\.template\.json\s*$/m.test(card)) {
      assert.match(
        card,
        /Rendering Mandate:/i,
        'if Template line present, mandate content must accompany it'
      );
    }
  });

  // SC-11: PRESENTING_REQUIREMENTS card includes content_coverage list
  // (AC-001-02)
  it('SC-11: PRESENTING_REQUIREMENTS card inlines content_coverage', () => {
    // Given: real card source loaded from disk
    const cardSource = loadCard('presenting-requirements.card.json');
    const coverage = cardSource.content_coverage;
    assert.ok(
      Array.isArray(coverage) && coverage.length > 0,
      'fixture sanity: presenting-requirements.card.json must define content_coverage'
    );

    // When: composeStateCard is invoked for PRESENTING_REQUIREMENTS
    const card = composeStateCard('PRESENTING_REQUIREMENTS', {});

    // Then: a Content Coverage header and each item appear inline
    assert.match(card, /Content Coverage/i, 'card must include a Content Coverage header');
    for (const item of coverage) {
      assert.ok(
        card.includes(item),
        `card must include content_coverage item "${item}"`
      );
    }
  });

  // SC-13: states without confirmation templates are unchanged
  // (regression guard — AC-001-01, AC-001-02)
  it('SC-13: CONVERSATION/AMENDING cards do not get over-inlined', () => {
    // Given: states whose source cards have neither rendering_mandate nor
    // content_coverage
    const cases = ['CONVERSATION', 'AMENDING'];

    for (const stateName of cases) {
      // When: composeStateCard runs for a non-confirmation state
      const card = composeStateCard(stateName, {});

      // Then: composition returns a non-empty string (no exception, no minimal
      // fallback unless the source genuinely lacks fields)
      assert.ok(typeof card === 'string' && card.length > 0, `${stateName}: card composes to a string`);

      // And: the new inline sections are NOT injected for these states
      assert.doesNotMatch(
        card,
        /Rendering Mandate:/i,
        `${stateName}: must not emit Rendering Mandate section`
      );
      assert.doesNotMatch(
        card,
        /Content Coverage/i,
        `${stateName}: must not emit Content Coverage section`
      );
    }
  });

});
