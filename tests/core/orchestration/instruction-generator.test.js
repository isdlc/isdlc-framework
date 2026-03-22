/**
 * Unit tests for src/core/orchestration/instruction-generator.js
 *
 * Tests the instruction generation system: frozen template registry,
 * generateInstructions(), getInstructionPath(), listSupportedProviders().
 *
 * Requirements: REQ-0136 FR-001..FR-007
 * Test ID prefix: IG- (Instruction Generator)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  INSTRUCTION_TEMPLATES,
  generateInstructions,
  getInstructionPath,
  listSupportedProviders
} from '../../../src/core/orchestration/instruction-generator.js';

// ---------------------------------------------------------------------------
// Helper: minimal valid projectConfig
// ---------------------------------------------------------------------------

function createProjectConfig(overrides = {}) {
  return {
    projectName: 'test-project',
    projectRoot: '/tmp/test-project',
    constitution: 'All code must be tested. Security by design.',
    workflows: ['feature', 'fix', 'upgrade'],
    ...overrides
  };
}

// ===========================================================================
// FR-006: INSTRUCTION_TEMPLATES — frozen provider registry
// ===========================================================================

describe('FR-006: INSTRUCTION_TEMPLATES constant', () => {
  // IG-01: INSTRUCTION_TEMPLATES is frozen
  it('IG-01: is frozen (immutable at runtime)', () => {
    assert.ok(Object.isFrozen(INSTRUCTION_TEMPLATES),
      'INSTRUCTION_TEMPLATES must be frozen');
  });

  // IG-02: has exactly 4 providers
  it('IG-02: has exactly 4 providers', () => {
    const keys = Object.keys(INSTRUCTION_TEMPLATES);
    assert.equal(keys.length, 4, 'Should have 4 provider templates');
    assert.ok(keys.includes('claude'), 'Should include claude');
    assert.ok(keys.includes('codex'), 'Should include codex');
    assert.ok(keys.includes('cursor'), 'Should include cursor');
    assert.ok(keys.includes('windsurf'), 'Should include windsurf');
  });

  // IG-03: Claude template has correct fileName, format, sections
  it('IG-03: claude template has correct fileName, format, and sections', () => {
    const t = INSTRUCTION_TEMPLATES.claude;
    assert.equal(t.fileName, 'CLAUDE.md');
    assert.equal(t.format, 'markdown');
    assert.ok(Array.isArray(t.sections), 'sections must be an array');
    assert.ok(t.sections.includes('project_context'));
    assert.ok(t.sections.includes('workflow_commands'));
    assert.ok(t.sections.includes('constitution_summary'));
    assert.ok(t.sections.includes('agent_roster'));
    assert.ok(t.sections.includes('governance_rules'));
    assert.ok(t.sections.includes('hook_configuration'));
    assert.ok(t.sections.includes('session_cache_structure'));
  });

  // IG-04: Codex template has correct fileName, format, sections
  it('IG-04: codex template has correct fileName, format, and sections', () => {
    const t = INSTRUCTION_TEMPLATES.codex;
    assert.equal(t.fileName, 'CODEX.md');
    assert.equal(t.format, 'markdown');
    assert.ok(Array.isArray(t.sections), 'sections must be an array');
    assert.ok(t.sections.includes('project_context'));
    assert.ok(t.sections.includes('workflow_commands'));
    assert.ok(t.sections.includes('constitution_summary'));
    assert.ok(t.sections.includes('agent_roster'));
    assert.ok(t.sections.includes('governance_rules'));
    assert.ok(t.sections.includes('instruction_format_notes'));
    assert.ok(t.sections.includes('sandbox_constraints'));
  });

  // IG-05: Cursor template has correct fileName, format, sections
  it('IG-05: cursor template has correct fileName, format, and sections', () => {
    const t = INSTRUCTION_TEMPLATES.cursor;
    assert.equal(t.fileName, '.cursorrules');
    assert.equal(t.format, 'text');
    assert.ok(Array.isArray(t.sections));
    assert.ok(t.sections.includes('project_context'));
    assert.ok(t.sections.includes('workflow_commands'));
    assert.ok(t.sections.includes('constitution_summary'));
  });

  // IG-06: Windsurf template has correct fileName, format, sections
  it('IG-06: windsurf template has correct fileName, format, and sections', () => {
    const t = INSTRUCTION_TEMPLATES.windsurf;
    assert.equal(t.fileName, '.windsurfrules');
    assert.equal(t.format, 'text');
    assert.ok(Array.isArray(t.sections));
    assert.ok(t.sections.includes('project_context'));
    assert.ok(t.sections.includes('workflow_commands'));
    assert.ok(t.sections.includes('constitution_summary'));
  });

  // IG-07: Each template has required keys
  it('IG-07: every template has fileName, format, and sections keys', () => {
    for (const [name, template] of Object.entries(INSTRUCTION_TEMPLATES)) {
      assert.ok(typeof template.fileName === 'string',
        `${name}.fileName must be a string`);
      assert.ok(typeof template.format === 'string',
        `${name}.format must be a string`);
      assert.ok(Array.isArray(template.sections),
        `${name}.sections must be an array`);
      assert.ok(template.sections.length > 0,
        `${name}.sections must not be empty`);
    }
  });
});

// ===========================================================================
// FR-001: generateInstructions — Claude provider
// ===========================================================================

describe('FR-001: generateInstructions() — Claude provider', () => {
  const config = createProjectConfig();

  // IG-08: returns object with content, fileName, format
  it('IG-08: returns { content, fileName, format } for claude', () => {
    const result = generateInstructions('claude', config);
    assert.ok(typeof result.content === 'string', 'content must be a string');
    assert.equal(result.fileName, 'CLAUDE.md');
    assert.equal(result.format, 'markdown');
  });

  // IG-09: content includes project context
  it('IG-09: content includes project context section', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.includes('test-project'),
      'Content should include the project name');
  });

  // IG-10: content includes workflow commands
  it('IG-10: content includes workflow commands section', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('workflow') ||
      result.content.toLowerCase().includes('command'),
      'Content should include workflow commands reference');
  });

  // IG-11: content includes constitution summary
  it('IG-11: content includes constitution summary', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('constitution') ||
      result.content.toLowerCase().includes('security'),
      'Content should include constitution summary');
  });

  // IG-12: content includes agent roster
  it('IG-12: content includes agent roster', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('agent'),
      'Content should include agent roster');
  });

  // IG-13: content includes governance rules
  it('IG-13: content includes governance rules', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('governance') ||
      result.content.toLowerCase().includes('rules'),
      'Content should include governance rules');
  });

  // IG-14: Claude-specific: hook configuration section
  it('IG-14: content includes hook configuration section', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('hook'),
      'Claude content should include hook configuration');
  });

  // IG-15: Claude-specific: session cache section
  it('IG-15: content includes session cache section', () => {
    const result = generateInstructions('claude', config);
    assert.ok(result.content.toLowerCase().includes('session') ||
      result.content.toLowerCase().includes('cache'),
      'Claude content should include session cache structure');
  });
});

// ===========================================================================
// FR-001: generateInstructions — Codex provider
// ===========================================================================

describe('FR-001: generateInstructions() — Codex provider', () => {
  const config = createProjectConfig();

  // IG-16: codex includes codex-specific sections
  it('IG-16: codex output includes codex-specific sections', () => {
    const result = generateInstructions('codex', config);
    assert.equal(result.fileName, 'CODEX.md');
    assert.equal(result.format, 'markdown');
    assert.ok(typeof result.content === 'string');
  });

  // IG-17: codex includes instruction format notes
  it('IG-17: codex content includes instruction format notes', () => {
    const result = generateInstructions('codex', config);
    assert.ok(result.content.toLowerCase().includes('instruction') ||
      result.content.toLowerCase().includes('format'),
      'Codex content should include instruction format notes');
  });

  // IG-18: codex includes sandbox constraints
  it('IG-18: codex content includes sandbox constraints', () => {
    const result = generateInstructions('codex', config);
    assert.ok(result.content.toLowerCase().includes('sandbox') ||
      result.content.toLowerCase().includes('constraint'),
      'Codex content should include sandbox constraints');
  });
});

// ===========================================================================
// FR-001: generateInstructions — Cursor/Windsurf (text format)
// ===========================================================================

describe('FR-001: generateInstructions() — text format providers', () => {
  const config = createProjectConfig();

  // IG-19: cursor returns text format
  it('IG-19: cursor generates text format output', () => {
    const result = generateInstructions('cursor', config);
    assert.equal(result.format, 'text');
    assert.equal(result.fileName, '.cursorrules');
    assert.ok(typeof result.content === 'string');
    assert.ok(result.content.length > 0, 'Content should not be empty');
  });

  // IG-20: windsurf returns text format
  it('IG-20: windsurf generates text format output', () => {
    const result = generateInstructions('windsurf', config);
    assert.equal(result.format, 'text');
    assert.equal(result.fileName, '.windsurfrules');
    assert.ok(typeof result.content === 'string');
    assert.ok(result.content.length > 0, 'Content should not be empty');
  });
});

// ===========================================================================
// FR-001: generateInstructions — graceful degradation
// ===========================================================================

describe('FR-001: generateInstructions() — graceful degradation', () => {
  // IG-21: missing projectName -> still produces content
  it('IG-21: handles missing projectName gracefully', () => {
    const config = createProjectConfig({ projectName: undefined });
    const result = generateInstructions('claude', config);
    assert.ok(typeof result.content === 'string');
    assert.ok(result.content.length > 0,
      'Should produce content even without projectName');
  });

  // IG-22: missing constitution -> still produces content
  it('IG-22: handles missing constitution gracefully', () => {
    const config = createProjectConfig({ constitution: undefined });
    const result = generateInstructions('claude', config);
    assert.ok(typeof result.content === 'string');
    assert.ok(result.content.length > 0,
      'Should produce content even without constitution');
  });

  // IG-23: unknown provider throws
  it('IG-23: throws for unknown provider', () => {
    const config = createProjectConfig();
    assert.throws(
      () => generateInstructions('unknown-provider', config),
      /unknown.*provider|unsupported|not found/i,
      'Should throw for unknown provider'
    );
  });
});

// ===========================================================================
// FR-005: getInstructionPath
// ===========================================================================

describe('FR-005: getInstructionPath()', () => {
  // IG-24: returns correct paths for each provider
  it('IG-24: returns correct file paths for each provider', () => {
    const root = '/tmp/my-project';
    assert.equal(getInstructionPath('claude', root), join(root, 'CLAUDE.md'));
    assert.equal(getInstructionPath('codex', root), join(root, 'CODEX.md'));
    assert.equal(getInstructionPath('cursor', root), join(root, '.cursorrules'));
    assert.equal(getInstructionPath('windsurf', root), join(root, '.windsurfrules'));
  });

  it('IG-24b: throws for unknown provider', () => {
    assert.throws(
      () => getInstructionPath('unknown', '/tmp'),
      /unknown.*provider|unsupported|not found/i
    );
  });
});

// ===========================================================================
// FR-006: listSupportedProviders
// ===========================================================================

describe('FR-006: listSupportedProviders()', () => {
  // IG-25: returns 4 providers
  it('IG-25: returns array of 4 supported providers', () => {
    const providers = listSupportedProviders();
    assert.ok(Array.isArray(providers));
    assert.equal(providers.length, 4);
    assert.ok(providers.includes('claude'));
    assert.ok(providers.includes('codex'));
    assert.ok(providers.includes('cursor'));
    assert.ok(providers.includes('windsurf'));
  });
});
