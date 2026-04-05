/**
 * Prompt Content Verification: Persona Extension Composition (REQ-GH-235)
 *
 * Verifies §4 Persona Model declares the contributing-default rule, the
 * promotion frontmatter schema, and the 5 named extension points. Also
 * verifies that all 4 existing contributing personas remain zero-touch.
 *
 * Traces to: FR-007 (AC-007-05), FR-005 (AC-005-01, AC-005-02, AC-005-06)
 * ATDD RED-state: scaffolds shipped in Phase 05 T001.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const AGENTS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'agents');

function readPrompt() {
  return readFileSync(ROUNDTABLE_ANALYST_PATH, 'utf8');
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

describe('REQ-GH-235 FR-005/FR-007: Persona Extension Composition', () => {
  it('AC-005-01: prompt declares contributing-default rule for added personas', () => {
    const content = readPrompt();
    assert.match(
      content,
      /(default.{0,30}to.{0,10}contributing|contributing.{0,10}by.{0,10}default|default.{0,30}role.{0,10}contributing)/i,
      'Prompt must declare contributing as the default role_type for added personas'
    );
  });

  it('AC-005-02: contributing personas do not create new templates/domains/states', () => {
    const content = readPrompt();
    assert.match(
      content,
      /contributing[\s\S]{0,300}?(fold|no.{0,20}new.{0,10}(template|state|domain|confirmation))/i,
      'Prompt must state that contributing personas fold into existing states'
    );
  });

  it('AC-005-03: promotion schema requires role_type=primary, owns_state, template, inserts_at', () => {
    const content = readPrompt();
    for (const field of ['role_type', 'owns_state', 'template', 'inserts_at']) {
      assert.match(content, new RegExp(field), `Promotion schema must name field: ${field}`);
    }
    assert.match(content, /role_type[\s\S]{0,50}?primary/i, 'role_type: primary must be declared');
  });

  it('AC-007-05: 5 named extension points declared', () => {
    const content = readPrompt();
    const expectedPoints = [
      'before:requirements',
      'after:requirements',
      'after:architecture',
      'after:design',
      'after:tasks'
    ];
    for (const point of expectedPoints) {
      assert.match(content, new RegExp(point.replace(':', ':?\\s*:?')), `Extension point ${point} must be declared`);
    }
  });

  it('AC-005-06: all 4 existing contributing personas remain zero-touch', () => {
    const personaFiles = readdirSync(AGENTS_DIR).filter(
      f => f.startsWith('persona-') && f.endsWith('.md')
    );
    assert.ok(personaFiles.length >= 4, `Expected at least 4 persona-*.md files, found ${personaFiles.length}`);

    let contributingCount = 0;
    for (const file of personaFiles) {
      const md = readFileSync(join(AGENTS_DIR, file), 'utf8');
      const fm = parseFrontmatter(md);
      if (fm && fm.role_type === 'contributing') {
        contributingCount++;
        // Zero-touch: must NOT have promotion-only fields
        assert.ok(!fm.owns_state || fm.owns_state === '', `${file} contributing must not have owns_state`);
        assert.ok(!fm.inserts_at || fm.inserts_at === '', `${file} contributing must not have inserts_at`);
      }
    }
    assert.ok(contributingCount >= 4, `Expected ≥4 contributing personas, found ${contributingCount}`);
  });
});
