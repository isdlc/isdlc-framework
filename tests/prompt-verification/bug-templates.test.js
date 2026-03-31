/**
 * Prompt Content Verification Tests: REQ-GH-218 Bug-Specific Confirmation Templates
 *
 * These tests verify that the 3 bug-specific confirmation templates
 * have valid JSON schema and required sections matching the design spec.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .json files, validate schema structure
 *
 * Traces to: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks', 'config', 'templates');
const DUAL_TEMPLATES_DIR = join(PROJECT_ROOT, '.claude', 'hooks', 'config', 'templates');

function readTemplate(name) {
  const filePath = join(TEMPLATES_DIR, name);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function readFeatureTemplate(name) {
  const filePath = join(TEMPLATES_DIR, name);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('Bug-Specific Confirmation Templates (FR-004)', () => {

  // TC-001
  describe('bug-summary.template.json', () => {
    it('has valid schema with domain, version, and format fields (TC-001, AC-004-01)', () => {
      const template = readTemplate('bug-summary.template.json');
      assert.equal(template.domain, 'bug-summary');
      assert.ok(template.version, 'version field must exist');
      assert.equal(template.format.format_type, 'bulleted');
      assert.ok(Array.isArray(template.format.section_order), 'section_order must be an array');
      assert.ok(Array.isArray(template.format.required_sections), 'required_sections must be an array');
    });

    // TC-002
    it('has required sections: severity, reproduction_steps, affected_area (TC-002, AC-004-01)', () => {
      const template = readTemplate('bug-summary.template.json');
      const required = template.format.required_sections;
      assert.ok(required.includes('severity'), 'must include severity');
      assert.ok(required.includes('reproduction_steps'), 'must include reproduction_steps');
      assert.ok(required.includes('affected_area'), 'must include affected_area');
    });
  });

  // TC-003
  describe('root-cause.template.json', () => {
    it('has valid schema with domain, version, and format fields (TC-003, AC-004-02)', () => {
      const template = readTemplate('root-cause.template.json');
      assert.equal(template.domain, 'root-cause');
      assert.ok(template.version, 'version field must exist');
      assert.equal(template.format.format_type, 'bulleted');
      assert.ok(Array.isArray(template.format.section_order), 'section_order must be an array');
      assert.ok(Array.isArray(template.format.required_sections), 'required_sections must be an array');
    });

    // TC-004
    it('has required sections: hypotheses, affected_code_paths (TC-004, AC-004-02)', () => {
      const template = readTemplate('root-cause.template.json');
      const required = template.format.required_sections;
      assert.ok(required.includes('hypotheses'), 'must include hypotheses');
      assert.ok(required.includes('affected_code_paths'), 'must include affected_code_paths');
    });
  });

  // TC-005
  describe('fix-strategy.template.json', () => {
    it('has valid schema with domain, version, and format fields (TC-005, AC-003-01, AC-004-03)', () => {
      const template = readTemplate('fix-strategy.template.json');
      assert.equal(template.domain, 'fix-strategy');
      assert.ok(template.version, 'version field must exist');
      assert.equal(template.format.format_type, 'bulleted');
      assert.ok(Array.isArray(template.format.section_order), 'section_order must be an array');
      assert.ok(Array.isArray(template.format.required_sections), 'required_sections must be an array');
    });

    // TC-006
    it('has required sections: approaches, recommended_approach, regression_risk (TC-006, AC-003-01, AC-003-02, AC-003-03)', () => {
      const template = readTemplate('fix-strategy.template.json');
      const required = template.format.required_sections;
      assert.ok(required.includes('approaches'), 'must include approaches');
      assert.ok(required.includes('recommended_approach'), 'must include recommended_approach');
      assert.ok(required.includes('regression_risk'), 'must include regression_risk');
    });
  });

  // TC-007
  describe('Schema consistency with feature templates', () => {
    it('all bug templates have same top-level keys as feature templates (TC-007, AC-004-01, AC-004-02, AC-004-03)', () => {
      const featureTemplate = readFeatureTemplate('requirements.template.json');
      const featureKeys = Object.keys(featureTemplate).sort();

      for (const name of ['bug-summary.template.json', 'root-cause.template.json', 'fix-strategy.template.json']) {
        const bugTemplate = readTemplate(name);
        const bugKeys = Object.keys(bugTemplate).sort();
        assert.deepEqual(bugKeys, featureKeys, `${name} must have same top-level keys as feature templates`);
      }
    });
  });

  // TC-008
  describe('Dogfooding dual-file consistency', () => {
    it('templates in .claude/ match templates in src/claude/ (TC-008, FR-004)', () => {
      for (const name of ['bug-summary.template.json', 'root-cause.template.json', 'fix-strategy.template.json']) {
        const srcPath = join(TEMPLATES_DIR, name);
        const dualPath = join(DUAL_TEMPLATES_DIR, name);

        if (existsSync(dualPath)) {
          const srcContent = readFileSync(srcPath, 'utf-8');
          const dualContent = readFileSync(dualPath, 'utf-8');
          assert.equal(srcContent, dualContent, `${name} must be identical in src/ and .claude/`);
        }
      }
    });
  });

  // TC-009
  describe('Section order uniqueness', () => {
    it('no duplicate entries in any template section_order (TC-009, FR-004)', () => {
      for (const name of ['bug-summary.template.json', 'root-cause.template.json', 'fix-strategy.template.json']) {
        const template = readTemplate(name);
        const sections = template.format.section_order;
        const unique = [...new Set(sections)];
        assert.equal(sections.length, unique.length, `${name} section_order must have no duplicates`);
      }
    });
  });
});
