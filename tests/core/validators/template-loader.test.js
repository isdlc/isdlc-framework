/**
 * Template Loader Unit Tests
 * ============================
 * REQ-GH-213: Inline Contract Enforcement (FR-004)
 * AC-004-01, AC-004-02, AC-004-04
 *
 * Tests: TL-01 to TL-08
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadTemplate, loadAllTemplates } from '../../../src/core/validators/template-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir;
let shippedDir;
let overrideDir;

function setup() {
  tempDir = mkdtempSync(join(tmpdir(), 'tl-test-'));
  shippedDir = join(tempDir, 'shipped');
  overrideDir = join(tempDir, 'override');
  mkdirSync(shippedDir, { recursive: true });
  mkdirSync(overrideDir, { recursive: true });
}

function cleanup() {
  rmSync(tempDir, { recursive: true, force: true });
}

function writeTemplate(dir, domain, content) {
  writeFileSync(
    join(dir, `${domain}.template.json`),
    JSON.stringify(content)
  );
}

// ---------------------------------------------------------------------------
// TL: Template Loader Tests
// ---------------------------------------------------------------------------

describe('Template Loader', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('TL-01: loadTemplate returns shipped default when no override exists', () => {
    const template = {
      domain: 'requirements',
      version: '1.0.0',
      format: { format_type: 'bulleted' }
    };
    writeTemplate(shippedDir, 'requirements', template);

    const result = loadTemplate('requirements', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result, template);
  });

  it('TL-02: loadTemplate returns user override when override exists', () => {
    const shipped = {
      domain: 'requirements',
      version: '1.0.0',
      format: { format_type: 'bulleted' }
    };
    const override = {
      domain: 'requirements',
      version: '2.0.0',
      format: { format_type: 'numbered' }
    };
    writeTemplate(shippedDir, 'requirements', shipped);
    writeTemplate(overrideDir, 'requirements', override);

    const result = loadTemplate('requirements', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result, override);
    assert.equal(result.version, '2.0.0');
  });

  it('TL-03: loadTemplate returns null when neither exists', () => {
    const result = loadTemplate('requirements', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.equal(result, null);
  });

  it('TL-04: loadTemplate handles malformed JSON gracefully (returns null or shipped)', () => {
    // Write malformed JSON to override
    writeFileSync(
      join(overrideDir, 'requirements.template.json'),
      'not valid json {'
    );

    // No shipped fallback — should return null
    const result = loadTemplate('requirements', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.equal(result, null);
  });

  it('TL-04b: loadTemplate falls back to shipped when override is malformed', () => {
    const shipped = {
      domain: 'requirements',
      version: '1.0.0',
      format: { format_type: 'bulleted' }
    };
    writeTemplate(shippedDir, 'requirements', shipped);

    // Write malformed JSON to override
    writeFileSync(
      join(overrideDir, 'requirements.template.json'),
      'not valid json {'
    );

    const result = loadTemplate('requirements', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result, shipped);
  });

  it('TL-05: loadAllTemplates returns map of all domains', () => {
    const reqs = { domain: 'requirements', version: '1.0.0', format: { format_type: 'bulleted' } };
    const arch = { domain: 'architecture', version: '1.0.0', format: { format_type: 'bulleted' } };
    const design = { domain: 'design', version: '1.0.0', format: { format_type: 'bulleted' } };
    const tasks = { domain: 'tasks', version: '1.0.0', format: { format_type: 'table' } };

    writeTemplate(shippedDir, 'requirements', reqs);
    writeTemplate(shippedDir, 'architecture', arch);
    writeTemplate(shippedDir, 'design', design);
    writeTemplate(shippedDir, 'tasks', tasks);

    const result = loadAllTemplates({
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result.requirements, reqs);
    assert.deepEqual(result.architecture, arch);
    assert.deepEqual(result.design, design);
    assert.deepEqual(result.tasks, tasks);
    assert.equal(Object.keys(result).length, 4);
  });

  it('TL-06: loadAllTemplates merges shipped and override per-domain', () => {
    const shippedReqs = { domain: 'requirements', version: '1.0.0', format: { format_type: 'bulleted' } };
    const shippedArch = { domain: 'architecture', version: '1.0.0', format: { format_type: 'bulleted' } };
    const overrideReqs = { domain: 'requirements', version: '2.0.0', format: { format_type: 'numbered' } };

    writeTemplate(shippedDir, 'requirements', shippedReqs);
    writeTemplate(shippedDir, 'architecture', shippedArch);
    writeTemplate(overrideDir, 'requirements', overrideReqs);

    const result = loadAllTemplates({
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    // Requirements should be override version
    assert.deepEqual(result.requirements, overrideReqs);
    // Architecture should be shipped version
    assert.deepEqual(result.architecture, shippedArch);
  });

  it('TL-07: loadAllTemplates returns empty object when no templates found', () => {
    const result = loadAllTemplates({
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result, {});
  });

  it('TL-08: loadTemplate reads from correct file paths ({domain}.template.json)', () => {
    const template = { domain: 'design', version: '1.0.0', format: { format_type: 'bulleted' } };
    writeTemplate(shippedDir, 'design', template);

    // Verify it looks for design.template.json specifically
    const result = loadTemplate('design', {
      shippedPath: shippedDir,
      overridePath: overrideDir
    });

    assert.deepEqual(result, template);
    assert.equal(result.domain, 'design');
  });
});
