/**
 * Unit tests for traceability.template.json — REQ-GH-223 FR-008
 * Test cases TT-01 through TT-03 from test strategy (updated for v2.0 4-column format)
 *
 * Test ID prefix: TT- (Traceability Template)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const templatePath = join(process.cwd(), 'src/claude/hooks/config/templates/traceability.template.json');
const template = JSON.parse(readFileSync(templatePath, 'utf8'));

// TT-01: All 4 columns present
describe('TT-01: Column presence', () => {
  it('template has all 4 required columns', () => {
    const columns = template.format.columns;
    assert.equal(columns.length, 4);
    const keys = columns.map(c => c.key);
    assert.ok(keys.includes('fr_id'));
    assert.ok(keys.includes('requirement'));
    assert.ok(keys.includes('design_blast_radius'));
    assert.ok(keys.includes('related_tasks'));
  });
});

// TT-02: Scoping rules for all 4 domains
describe('TT-02: Domain scoping rules', () => {
  it('scoping_rules has entries for all 4 domains', () => {
    const rules = template.format.scoping_rules;
    assert.ok('requirements' in rules);
    assert.ok('architecture' in rules);
    assert.ok('design' in rules);
    assert.ok('tasks' in rules);
  });
});

// TT-03: Content guidance present for narrative columns
describe('TT-03: Content guidance', () => {
  it('content_guidance exists for requirement, design, and tasks columns', () => {
    const guidance = template.format.content_guidance;
    assert.ok('requirement_column' in guidance);
    assert.ok('design_column' in guidance);
    assert.ok('tasks_column' in guidance);
    // Guidance should discourage raw IDs/file paths
    assert.ok(guidance.requirement_column.includes('Do NOT list AC IDs'));
    assert.ok(guidance.design_column.includes('Do NOT list file paths'));
  });
});
