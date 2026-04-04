/**
 * Unit tests for traceability.template.json — REQ-GH-223 FR-008
 * Test cases TT-01 through TT-03 from test strategy
 *
 * Test ID prefix: TT- (Traceability Template)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const templatePath = join(process.cwd(), 'src/claude/hooks/config/templates/traceability.template.json');
const template = JSON.parse(readFileSync(templatePath, 'utf8'));

// TT-01: All 5 columns present
describe('TT-01: Column presence', () => {
  it('template has all 5 required columns', () => {
    const columns = template.format.columns;
    assert.equal(columns.length, 5);
    const keys = columns.map(c => c.key);
    assert.ok(keys.includes('requirement'));
    assert.ok(keys.includes('acceptance_criteria'));
    assert.ok(keys.includes('tasks'));
    assert.ok(keys.includes('files'));
    assert.ok(keys.includes('coverage'));
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

// TT-03: includes_description flag
describe('TT-03: Description inclusion flags', () => {
  it('requirement, acceptance_criteria, and tasks have includes_description: true', () => {
    const columns = template.format.columns;
    const withDesc = columns.filter(c => c.includes_description);
    const keys = withDesc.map(c => c.key);
    assert.ok(keys.includes('requirement'));
    assert.ok(keys.includes('acceptance_criteria'));
    assert.ok(keys.includes('tasks'));
    assert.equal(keys.length, 3);
  });
});
