/**
 * Agent Migration Validation Tests
 *
 * REQ-0042 / FR-003, FR-004, FR-005: Validates that agent markdown files
 * have been correctly migrated with Enhanced Search sections.
 *
 * REQ-0043 / FR-006, FR-007, FR-008, FR-009: Validates 4 additional agents
 * migrated with Enhanced Search sections (upgrade-engineer, execution-path-tracer,
 * cross-validation-verifier, roundtable-analyst).
 *
 * These tests validate structural properties of agent markdown files:
 * - Section presence (Enhanced Search heading)
 * - Content validation (modalities, fallback, availability check)
 * - Frontmatter preservation (not modified by migration)
 * - Existing section preservation (Grep/Glob references intact)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const projectRoot = resolve(__dirname, '..', '..');

// Agent file paths
const AGENTS = {
  'quick-scan-agent': join(projectRoot, 'src', 'claude', 'agents', 'quick-scan', 'quick-scan-agent.md'),
  'impact-analyzer': join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'impact-analyzer.md'),
  'entry-point-finder': join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'entry-point-finder.md'),
  'risk-assessor': join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'risk-assessor.md'),
  'architecture-analyzer': join(projectRoot, 'src', 'claude', 'agents', 'discover', 'architecture-analyzer.md'),
  'feature-mapper': join(projectRoot, 'src', 'claude', 'agents', 'discover', 'feature-mapper.md'),
  // REQ-0043: 4 additional agents
  'upgrade-engineer': join(projectRoot, 'src', 'claude', 'agents', '14-upgrade-engineer.md'),
  'execution-path-tracer': join(projectRoot, 'src', 'claude', 'agents', 'tracing', 'execution-path-tracer.md'),
  'cross-validation-verifier': join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'cross-validation-verifier.md'),
  'roundtable-analyst': join(projectRoot, 'src', 'claude', 'agents', 'roundtable-analyst.md'),
};

/**
 * Read an agent file and return its content.
 */
function readAgent(name) {
  return readFileSync(AGENTS[name], 'utf-8');
}

/**
 * Extract the YAML frontmatter from a markdown file.
 * Returns the raw frontmatter string (between --- markers).
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

/**
 * Check if a section heading exists in the markdown content.
 * Looks for "# ENHANCED SEARCH" or "## Enhanced Search" (case-insensitive).
 */
function hasEnhancedSearchSection(content) {
  return /^#{1,2}\s+ENHANCED\s+SEARCH/im.test(content);
}

/**
 * Extract the Enhanced Search section content (everything between the heading
 * and the next heading of same or higher level).
 */
function extractEnhancedSearchSection(content) {
  // Find the Enhanced Search heading
  const headingMatch = content.match(/^(#{1,2})\s+ENHANCED\s+SEARCH[^\n]*/im);
  if (!headingMatch) return '';

  const headingLevel = headingMatch[1].length;
  const startIdx = headingMatch.index + headingMatch[0].length;
  const rest = content.substring(startIdx);

  // Find the next heading of same or higher level
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s`, 'm');
  const nextMatch = rest.match(nextHeadingPattern);

  if (nextMatch) {
    return rest.substring(0, nextMatch.index);
  }
  return rest;
}

// ---------------------------------------------------------------------------
// TC-U-026: quick-scan-agent.md contains Enhanced Search section
// ---------------------------------------------------------------------------

describe('Quick Scan Agent migration (FR-003)', () => {
  it('TC-U-026: should contain Enhanced Search section', () => {
    const content = readAgent('quick-scan-agent');
    assert.ok(
      hasEnhancedSearchSection(content),
      'quick-scan-agent.md should contain an Enhanced Search section heading'
    );
  });

  // TC-U-027: Describes structural and lexical modalities
  it('TC-U-027: Enhanced Search section should describe structural and lexical modalities', () => {
    const content = readAgent('quick-scan-agent');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Enhanced Search section should mention structural modality'
    );
    assert.ok(
      /lexical/i.test(section),
      'Enhanced Search section should mention lexical modality'
    );
  });

  // TC-U-028: Preserves existing Grep/Glob instructions
  it('TC-U-028: should preserve existing Grep/Glob instructions', () => {
    const content = readAgent('quick-scan-agent');

    // Grep and Glob references should appear before the Enhanced Search section
    const enhancedIdx = content.search(/^#{1,2}\s+ENHANCED\s+SEARCH/im);
    const beforeEnhanced = content.substring(0, enhancedIdx > 0 ? enhancedIdx : content.length);

    assert.ok(
      /[Gg]rep/i.test(beforeEnhanced),
      'Grep references should exist before Enhanced Search section'
    );
    assert.ok(
      /[Gg]lob/i.test(beforeEnhanced),
      'Glob references should exist before Enhanced Search section'
    );
  });

  // TC-U-037: Describes hasEnhancedSearch() check
  it('TC-U-037: Enhanced Search section should describe availability check', () => {
    const content = readAgent('quick-scan-agent');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i.test(section),
      'Enhanced Search section should describe how to check if enhanced search is available'
    );
  });

  // TC-U-029: Frontmatter unchanged
  it('TC-U-029: frontmatter should contain expected agent name and skills', () => {
    const content = readAgent('quick-scan-agent');
    const frontmatter = extractFrontmatter(content);

    assert.ok(
      frontmatter.includes('name: quick-scan-agent'),
      'Frontmatter should have name: quick-scan-agent'
    );
    assert.ok(
      frontmatter.includes('QS-001'),
      'Frontmatter should include QS-001 skill'
    );
    assert.ok(
      frontmatter.includes('QS-002'),
      'Frontmatter should include QS-002 skill'
    );
    assert.ok(
      frontmatter.includes('QS-003'),
      'Frontmatter should include QS-003 skill'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-U-030: impact-analyzer.md
// ---------------------------------------------------------------------------

describe('Impact Analysis agent migration (FR-004)', () => {
  // TC-U-030: impact-analyzer.md contains Enhanced Search section
  it('TC-U-030: impact-analyzer.md should contain Enhanced Search section', () => {
    const content = readAgent('impact-analyzer');
    assert.ok(
      hasEnhancedSearchSection(content),
      'impact-analyzer.md should contain an Enhanced Search section'
    );
  });

  // TC-U-031: entry-point-finder.md contains Enhanced Search section
  it('TC-U-031: entry-point-finder.md should contain Enhanced Search section', () => {
    const content = readAgent('entry-point-finder');
    assert.ok(
      hasEnhancedSearchSection(content),
      'entry-point-finder.md should contain an Enhanced Search section'
    );
  });

  // TC-U-031 content: structural search guidance for endpoints
  it('TC-U-031: entry-point-finder.md Enhanced Search should reference structural search for endpoints', () => {
    const content = readAgent('entry-point-finder');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Entry point finder Enhanced Search should mention structural search'
    );
  });

  // TC-U-032: risk-assessor.md contains Enhanced Search section
  it('TC-U-032: risk-assessor.md should contain Enhanced Search section', () => {
    const content = readAgent('risk-assessor');
    assert.ok(
      hasEnhancedSearchSection(content),
      'risk-assessor.md should contain an Enhanced Search section'
    );
  });

  // TC-U-032 content: enhanced lexical search guidance
  it('TC-U-032: risk-assessor.md Enhanced Search should reference lexical search', () => {
    const content = readAgent('risk-assessor');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /lexical/i.test(section),
      'Risk assessor Enhanced Search should mention lexical search'
    );
  });

  // TC-U-033: impact analysis agent frontmatter unchanged
  it('TC-U-033: impact-analyzer.md frontmatter should be unchanged', () => {
    const content = readAgent('impact-analyzer');
    const frontmatter = extractFrontmatter(content);

    assert.ok(frontmatter.includes('name: impact-analyzer'), 'Should have correct name');
    assert.ok(frontmatter.includes('IA-101'), 'Should include IA-101 skill');
    assert.ok(frontmatter.includes('IA-102'), 'Should include IA-102 skill');
  });

  it('TC-U-033: entry-point-finder.md frontmatter should be unchanged', () => {
    const content = readAgent('entry-point-finder');
    const frontmatter = extractFrontmatter(content);

    assert.ok(frontmatter.includes('name: entry-point-finder'), 'Should have correct name');
    assert.ok(frontmatter.includes('IA-201'), 'Should include IA-201 skill');
  });

  it('TC-U-033: risk-assessor.md frontmatter should be unchanged', () => {
    const content = readAgent('risk-assessor');
    const frontmatter = extractFrontmatter(content);

    assert.ok(frontmatter.includes('name: risk-assessor'), 'Should have correct name');
    assert.ok(frontmatter.includes('IA-301'), 'Should include IA-301 skill');
  });
});

// ---------------------------------------------------------------------------
// TC-U-034, TC-U-035, TC-U-036: Discovery agent migration (Could Have)
// ---------------------------------------------------------------------------

describe('Discovery agent migration (FR-005)', () => {
  // TC-U-034: architecture-analyzer.md contains Enhanced Search section
  it('TC-U-034: architecture-analyzer.md should contain Enhanced Search section', () => {
    const content = readAgent('architecture-analyzer');
    assert.ok(
      hasEnhancedSearchSection(content),
      'architecture-analyzer.md should contain an Enhanced Search section'
    );
  });

  it('TC-U-034: architecture-analyzer.md should preserve existing find patterns as fallback', () => {
    const content = readAgent('architecture-analyzer');
    assert.ok(
      /find\s|Grep|Glob/i.test(content),
      'architecture-analyzer.md should still contain existing search patterns'
    );
  });

  // TC-U-035: feature-mapper.md contains Enhanced Search section
  it('TC-U-035: feature-mapper.md should contain Enhanced Search section', () => {
    const content = readAgent('feature-mapper');
    assert.ok(
      hasEnhancedSearchSection(content),
      'feature-mapper.md should contain an Enhanced Search section'
    );
  });

  it('TC-U-035: feature-mapper.md should preserve existing Grep patterns', () => {
    const content = readAgent('feature-mapper');
    assert.ok(
      /Grep|grep/i.test(content),
      'feature-mapper.md should still contain Grep references'
    );
  });

  // TC-U-036: Discovery agent frontmatter unchanged
  it('TC-U-036: architecture-analyzer.md frontmatter should be unchanged', () => {
    const content = readAgent('architecture-analyzer');
    const frontmatter = extractFrontmatter(content);

    assert.ok(frontmatter.includes('name: architecture-analyzer'), 'Should have correct name');
    assert.ok(frontmatter.includes('DISC-101'), 'Should include DISC-101 skill');
  });

  it('TC-U-036: feature-mapper.md frontmatter should be unchanged', () => {
    const content = readAgent('feature-mapper');
    const frontmatter = extractFrontmatter(content);

    assert.ok(frontmatter.includes('name: feature-mapper'), 'Should have correct name');
    assert.ok(frontmatter.includes('DISC-601'), 'Should include DISC-601 skill');
  });
});

// ---------------------------------------------------------------------------
// REQ-0043: Migrate remaining 4 agents to Enhanced Search sections
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TC-U-038 through TC-U-042: Upgrade Engineer migration (FR-006)
// ---------------------------------------------------------------------------

describe('Upgrade Engineer migration (FR-006)', () => {
  // TC-U-038: upgrade-engineer.md contains Enhanced Search section
  it('TC-U-038: should contain Enhanced Search section', () => {
    const content = readAgent('upgrade-engineer');
    assert.ok(
      hasEnhancedSearchSection(content),
      'upgrade-engineer.md should contain an Enhanced Search section heading'
    );
  });

  // TC-U-039: Describes structural and lexical modalities
  it('TC-U-039: Enhanced Search section should describe structural and lexical modalities', () => {
    const content = readAgent('upgrade-engineer');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Enhanced Search section should mention structural modality'
    );
    assert.ok(
      /lexical/i.test(section),
      'Enhanced Search section should mention lexical modality'
    );
  });

  // TC-U-040: Describes availability check
  it('TC-U-040: Enhanced Search section should describe availability check', () => {
    const content = readAgent('upgrade-engineer');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i.test(section),
      'Enhanced Search section should describe how to check if enhanced search is available'
    );
  });

  // TC-U-041: Preserves existing Grep references
  it('TC-U-041: should preserve existing Grep references', () => {
    const content = readAgent('upgrade-engineer');

    const enhancedIdx = content.search(/^#{1,2}\s+ENHANCED\s+SEARCH/im);
    const beforeEnhanced = content.substring(0, enhancedIdx > 0 ? enhancedIdx : content.length);

    assert.ok(
      /[Gg]rep/i.test(beforeEnhanced),
      'Grep references should exist before Enhanced Search section'
    );
  });

  // TC-U-042: Frontmatter unchanged
  it('TC-U-042: frontmatter should contain expected agent name and skills', () => {
    const content = readAgent('upgrade-engineer');
    const frontmatter = extractFrontmatter(content);

    assert.ok(
      frontmatter.includes('name: upgrade-engineer'),
      'Frontmatter should have name: upgrade-engineer'
    );
    assert.ok(
      frontmatter.includes('UPG-001'),
      'Frontmatter should include UPG-001 skill'
    );
    assert.ok(
      frontmatter.includes('UPG-002'),
      'Frontmatter should include UPG-002 skill'
    );
    assert.ok(
      frontmatter.includes('UPG-003'),
      'Frontmatter should include UPG-003 skill'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-U-043 through TC-U-047: Execution Path Tracer migration (FR-007)
// ---------------------------------------------------------------------------

describe('Execution Path Tracer migration (FR-007)', () => {
  // TC-U-043: execution-path-tracer.md contains Enhanced Search section
  it('TC-U-043: should contain Enhanced Search section', () => {
    const content = readAgent('execution-path-tracer');
    assert.ok(
      hasEnhancedSearchSection(content),
      'execution-path-tracer.md should contain an Enhanced Search section heading'
    );
  });

  // TC-U-044: Describes structural and lexical modalities
  it('TC-U-044: Enhanced Search section should describe structural and lexical modalities', () => {
    const content = readAgent('execution-path-tracer');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Enhanced Search section should mention structural modality'
    );
    assert.ok(
      /lexical/i.test(section),
      'Enhanced Search section should mention lexical modality'
    );
  });

  // TC-U-045: Describes availability check
  it('TC-U-045: Enhanced Search section should describe availability check', () => {
    const content = readAgent('execution-path-tracer');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i.test(section),
      'Enhanced Search section should describe how to check if enhanced search is available'
    );
  });

  // TC-U-046: Preserves existing search instructions
  it('TC-U-046: should preserve existing search instructions', () => {
    const content = readAgent('execution-path-tracer');

    assert.ok(
      /find.*entry|find.*execution|find.*where/i.test(content),
      'File should still contain references to finding execution entry points'
    );
  });

  // TC-U-047: Frontmatter unchanged
  it('TC-U-047: frontmatter should contain expected agent name and skills', () => {
    const content = readAgent('execution-path-tracer');
    const frontmatter = extractFrontmatter(content);

    assert.ok(
      frontmatter.includes('name: execution-path-tracer'),
      'Frontmatter should have name: execution-path-tracer'
    );
    assert.ok(
      frontmatter.includes('TRACE-201'),
      'Frontmatter should include TRACE-201 skill'
    );
    assert.ok(
      frontmatter.includes('TRACE-202'),
      'Frontmatter should include TRACE-202 skill'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-U-048 through TC-U-052: Cross-Validation Verifier migration (FR-008)
// ---------------------------------------------------------------------------

describe('Cross-Validation Verifier migration (FR-008)', () => {
  // TC-U-048: cross-validation-verifier.md contains Enhanced Search section
  it('TC-U-048: should contain Enhanced Search section', () => {
    const content = readAgent('cross-validation-verifier');
    assert.ok(
      hasEnhancedSearchSection(content),
      'cross-validation-verifier.md should contain an Enhanced Search section heading'
    );
  });

  // TC-U-049: Describes structural and lexical modalities
  it('TC-U-049: Enhanced Search section should describe structural and lexical modalities', () => {
    const content = readAgent('cross-validation-verifier');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Enhanced Search section should mention structural modality'
    );
    assert.ok(
      /lexical/i.test(section),
      'Enhanced Search section should mention lexical modality'
    );
  });

  // TC-U-050: Describes availability check
  it('TC-U-050: Enhanced Search section should describe availability check', () => {
    const content = readAgent('cross-validation-verifier');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i.test(section),
      'Enhanced Search section should describe how to check if enhanced search is available'
    );
  });

  // TC-U-051: Preserves existing Glob/Grep references
  it('TC-U-051: should preserve existing Glob/Grep references', () => {
    const content = readAgent('cross-validation-verifier');

    assert.ok(
      /Glob.*Grep|Grep.*Glob|Glob\/Grep/i.test(content),
      'File should still contain Glob/Grep search references'
    );
  });

  // TC-U-052: Frontmatter unchanged
  it('TC-U-052: frontmatter should contain expected agent name and skills', () => {
    const content = readAgent('cross-validation-verifier');
    const frontmatter = extractFrontmatter(content);

    assert.ok(
      frontmatter.includes('name: cross-validation-verifier'),
      'Frontmatter should have name: cross-validation-verifier'
    );
    assert.ok(
      frontmatter.includes('IA-401'),
      'Frontmatter should include IA-401 skill'
    );
    assert.ok(
      frontmatter.includes('IA-402'),
      'Frontmatter should include IA-402 skill'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-U-053 through TC-U-057: Roundtable Analyst migration (FR-009)
// ---------------------------------------------------------------------------

describe('Roundtable Analyst migration (FR-009)', () => {
  // TC-U-053: roundtable-analyst.md contains Enhanced Search section
  it('TC-U-053: should contain Enhanced Search section', () => {
    const content = readAgent('roundtable-analyst');
    assert.ok(
      hasEnhancedSearchSection(content),
      'roundtable-analyst.md should contain an Enhanced Search section heading'
    );
  });

  // TC-U-054: Describes structural and lexical modalities
  it('TC-U-054: Enhanced Search section should describe structural and lexical modalities', () => {
    const content = readAgent('roundtable-analyst');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /structural/i.test(section),
      'Enhanced Search section should mention structural modality'
    );
    assert.ok(
      /lexical/i.test(section),
      'Enhanced Search section should mention lexical modality'
    );
  });

  // TC-U-055: Describes availability check
  it('TC-U-055: Enhanced Search section should describe availability check', () => {
    const content = readAgent('roundtable-analyst');
    const section = extractEnhancedSearchSection(content);

    assert.ok(
      /search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i.test(section),
      'Enhanced Search section should describe how to check if enhanced search is available'
    );
  });

  // TC-U-056: Preserves existing Grep and Glob references
  it('TC-U-056: should preserve existing Grep and Glob references', () => {
    const content = readAgent('roundtable-analyst');

    assert.ok(
      /Grep/i.test(content),
      'File should still contain Grep references'
    );
    assert.ok(
      /Glob/i.test(content),
      'File should still contain Glob references'
    );
  });

  // TC-U-057: Frontmatter unchanged
  it('TC-U-057: frontmatter should contain expected agent name and empty skills', () => {
    const content = readAgent('roundtable-analyst');
    const frontmatter = extractFrontmatter(content);

    assert.ok(
      frontmatter.includes('name: roundtable-analyst'),
      'Frontmatter should have name: roundtable-analyst'
    );
    assert.ok(
      frontmatter.includes('owned_skills: []'),
      'Frontmatter should have owned_skills: []'
    );
  });
});
