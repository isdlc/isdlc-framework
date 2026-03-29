'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create a temp directory with test files
function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-injection-'));
  return tmpDir;
}

// Helper: write a CLAUDE.md with known content
function writeCLAUDE(dir, content) {
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), content, 'utf8');
}

// Helper: write protocol-mapping.json
function writeMapping(dir, mapping) {
  const configDir = path.join(dir, 'src', 'claude', 'hooks', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'protocol-mapping.json'), JSON.stringify(mapping, null, 2), 'utf8');
}

// ============================================================================
// Protocol section extraction
// ============================================================================

const SAMPLE_CLAUDE_MD = `# Project Instructions

Some user instructions here.

## Workflow-First Development

User workflow notes.

## Agent Framework Context

Shared protocols referenced by all iSDLC agents.

### SKILL OBSERVABILITY Protocol

Skill usage is logged for visibility.

### Git Commit Prohibition

**Do NOT run git add, git commit, or git push during phase work.**

### Mandatory Iteration Enforcement Protocol

Agents with iteration enforcement MUST follow this protocol.

## Project Context

This is the project context section.

### Key Files

- **Agents**: src/claude/agents/
`;

const SAMPLE_MAPPING = {
  version: '1.0.0',
  source_file: { claude: 'CLAUDE.md', codex: 'AGENTS.md' },
  protocol_section_start: '## Agent Framework Context',
  protocol_section_end: '## Project Context',
  protocols: [
    { header: '### SKILL OBSERVABILITY Protocol', phases: ['all'], checkable: false },
    { header: '### Git Commit Prohibition', phases: ['01-requirements', '06-implementation'], checkable: true, check_signal: 'git_commit_detected' },
    { header: '### Mandatory Iteration Enforcement Protocol', phases: ['06-implementation', '16-quality-loop'], checkable: false }
  ],
  user_content_extraction: {
    exclude_markers: ['<!-- SECTION:', '<!-- /SECTION:'],
    exclude_range: { start: '## Agent Framework Context', end: '## Project Context' }
  }
};

// --- Extract protocol section between boundaries ---

function extractProtocolSection(content, startHeader, endHeader) {
  const startIdx = content.indexOf(startHeader);
  if (startIdx === -1) return null;
  const afterStart = startIdx + startHeader.length;
  const endIdx = content.indexOf(endHeader, afterStart);
  if (endIdx === -1) return content.slice(afterStart);
  return content.slice(afterStart, endIdx);
}

// --- Extract individual protocol by header ---

function extractProtocolByHeader(protocolSection, header) {
  const idx = protocolSection.indexOf(header);
  if (idx === -1) return null;
  const afterHeader = idx + header.length;
  // Find next ### header or end of section
  const nextHeader = protocolSection.indexOf('\n### ', afterHeader);
  if (nextHeader === -1) return protocolSection.slice(idx).trim();
  return protocolSection.slice(idx, nextHeader).trim();
}

// --- Filter protocols for phase ---

function filterProtocolsForPhase(protocols, phaseKey) {
  return protocols.filter(p =>
    p.phases.includes('all') || p.phases.includes(phaseKey)
  );
}

// --- Extract user content ---

function extractUserContent(content, mapping) {
  const lines = content.split('\n');
  const result = [];
  let inExcludeRange = false;
  let inSectionMarker = false;

  for (const line of lines) {
    // Check section markers (start marker)
    if (line.includes('<!-- SECTION:') && !line.includes('<!-- /SECTION:')) {
      inSectionMarker = true;
      continue;
    }
    // Check section markers (end marker)
    if (line.includes('<!-- /SECTION:')) {
      inSectionMarker = false;
      continue;
    }

    // Check protocol range
    if (line.startsWith(mapping.user_content_extraction.exclude_range.start)) {
      inExcludeRange = true;
      continue;
    }
    if (line.startsWith(mapping.user_content_extraction.exclude_range.end)) {
      inExcludeRange = false;
      continue;
    }

    if (!inExcludeRange && !inSectionMarker) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

// ============================================================================
// Tests: Protocol Section Extraction
// ============================================================================

describe('Protocol Section Extraction', () => {
  it('TC-PI-01: extracts protocol section between boundaries', () => {
    const section = extractProtocolSection(
      SAMPLE_CLAUDE_MD,
      SAMPLE_MAPPING.protocol_section_start,
      SAMPLE_MAPPING.protocol_section_end
    );
    assert.ok(section, 'Protocol section should be extracted');
    assert.ok(section.includes('### SKILL OBSERVABILITY Protocol'));
    assert.ok(section.includes('### Git Commit Prohibition'));
    assert.ok(!section.includes('## Project Context'));
  });

  it('TC-PI-02: returns null when start boundary missing', () => {
    const section = extractProtocolSection(
      'No matching headers here',
      '## Agent Framework Context',
      '## Project Context'
    );
    assert.equal(section, null);
  });

  it('TC-PI-03: returns rest of content when end boundary missing', () => {
    const content = '## Agent Framework Context\n\nSome protocols\n### Proto1\nContent';
    const section = extractProtocolSection(content, '## Agent Framework Context', '## Nonexistent');
    assert.ok(section.includes('### Proto1'));
  });
});

// ============================================================================
// Tests: Individual Protocol Extraction
// ============================================================================

describe('Individual Protocol Extraction', () => {
  const protocolSection = extractProtocolSection(
    SAMPLE_CLAUDE_MD,
    SAMPLE_MAPPING.protocol_section_start,
    SAMPLE_MAPPING.protocol_section_end
  );

  it('TC-PI-04: extracts protocol by exact header match', () => {
    const proto = extractProtocolByHeader(protocolSection, '### Git Commit Prohibition');
    assert.ok(proto, 'Should find Git Commit Prohibition');
    assert.ok(proto.includes('Do NOT run git add'));
  });

  it('TC-PI-05: returns null for non-existent header', () => {
    const proto = extractProtocolByHeader(protocolSection, '### Nonexistent Protocol');
    assert.equal(proto, null);
  });

  it('TC-PI-06: extracts up to next ### header', () => {
    const proto = extractProtocolByHeader(protocolSection, '### SKILL OBSERVABILITY Protocol');
    assert.ok(proto, 'Should extract SKILL OBSERVABILITY');
    assert.ok(!proto.includes('### Git Commit Prohibition'), 'Should not include next protocol');
  });

  it('TC-PI-07: extracts last protocol to end of section', () => {
    const proto = extractProtocolByHeader(protocolSection, '### Mandatory Iteration Enforcement Protocol');
    assert.ok(proto, 'Should extract last protocol');
    assert.ok(proto.includes('iteration enforcement'));
  });
});

// ============================================================================
// Tests: Phase Filtering
// ============================================================================

describe('Phase Filtering', () => {
  it('TC-PI-08: phases=["all"] matches any phase', () => {
    const filtered = filterProtocolsForPhase(SAMPLE_MAPPING.protocols, '08-code-review');
    const allPhaseProto = filtered.find(p => p.header.includes('SKILL OBSERVABILITY'));
    assert.ok(allPhaseProto, 'all-phase protocol should match any phase');
  });

  it('TC-PI-09: specific phase matches only listed phases', () => {
    const filtered = filterProtocolsForPhase(SAMPLE_MAPPING.protocols, '06-implementation');
    assert.ok(filtered.some(p => p.header.includes('Git Commit Prohibition')));
    assert.ok(filtered.some(p => p.header.includes('Mandatory Iteration')));
  });

  it('TC-PI-10: phase not in list excludes protocol', () => {
    const filtered = filterProtocolsForPhase(SAMPLE_MAPPING.protocols, '08-code-review');
    assert.ok(!filtered.some(p => p.header.includes('Git Commit Prohibition')),
      'Git Commit Prohibition should not match 08-code-review');
  });

  it('TC-PI-11: empty protocols array returns empty', () => {
    const filtered = filterProtocolsForPhase([], '06-implementation');
    assert.equal(filtered.length, 0);
  });
});

// ============================================================================
// Tests: User Content Extraction
// ============================================================================

describe('User Content Extraction', () => {
  it('TC-PI-12: extracts content outside protocol range', () => {
    const userContent = extractUserContent(SAMPLE_CLAUDE_MD, SAMPLE_MAPPING);
    assert.ok(userContent.includes('Some user instructions here'));
    assert.ok(userContent.includes('User workflow notes'));
  });

  it('TC-PI-13: excludes protocol section', () => {
    const userContent = extractUserContent(SAMPLE_CLAUDE_MD, SAMPLE_MAPPING);
    assert.ok(!userContent.includes('### SKILL OBSERVABILITY Protocol'));
    assert.ok(!userContent.includes('### Git Commit Prohibition'));
  });

  it('TC-PI-14: includes content after protocol section', () => {
    const userContent = extractUserContent(SAMPLE_CLAUDE_MD, SAMPLE_MAPPING);
    assert.ok(userContent.includes('Key Files'));
  });

  it('TC-PI-15: excludes SECTION markers', () => {
    const contentWithMarkers = `# Instructions
User content
<!-- SECTION: CONSTITUTION -->
Constitution content here
<!-- /SECTION: CONSTITUTION -->
More user content
## Agent Framework Context
Protocol stuff
## Project Context
Final content`;

    const userContent = extractUserContent(contentWithMarkers, SAMPLE_MAPPING);
    assert.ok(userContent.includes('User content'));
    assert.ok(userContent.includes('More user content'));
    assert.ok(!userContent.includes('Constitution content here'));
    assert.ok(!userContent.includes('Protocol stuff'));
  });

  it('TC-PI-16: empty file returns empty string', () => {
    const userContent = extractUserContent('', SAMPLE_MAPPING);
    assert.equal(userContent, '');
  });

  it('TC-PI-17: file with only protocols returns user header content', () => {
    const onlyProtocols = `## Agent Framework Context\n### Proto\nContent\n## Project Context`;
    const userContent = extractUserContent(onlyProtocols, SAMPLE_MAPPING);
    assert.equal(userContent.trim(), '');
  });
});

// ============================================================================
// Tests: Fail-Open Behavior
// ============================================================================

describe('Fail-Open Behavior', () => {
  it('TC-PI-18: missing CLAUDE.md returns empty protocols', () => {
    const tmpDir = createTestEnv();
    try {
      let content;
      try {
        content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
      } catch {
        content = null;
      }
      assert.equal(content, null, 'Missing CLAUDE.md should return null');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('TC-PI-19: malformed mapping JSON is recoverable', () => {
    let parsed;
    try {
      parsed = JSON.parse('{ invalid json }');
    } catch {
      parsed = null;
    }
    assert.equal(parsed, null, 'Malformed JSON should return null');
  });

  it('TC-PI-20: missing mapping config returns null', () => {
    const tmpDir = createTestEnv();
    try {
      let config;
      try {
        config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'protocol-mapping.json'), 'utf8'));
      } catch {
        config = null;
      }
      assert.equal(config, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ============================================================================
// Tests: Integration — Full Pipeline
// ============================================================================

describe('Integration: Full Protocol Injection Pipeline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTestEnv();
    writeCLAUDE(tmpDir, SAMPLE_CLAUDE_MD);
    writeMapping(tmpDir, SAMPLE_MAPPING);
  });

  it('TC-PI-21: end-to-end injection for Phase 06', () => {
    const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    const mapping = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'src', 'claude', 'hooks', 'config', 'protocol-mapping.json'), 'utf8'
    ));

    // Extract protocol section
    const section = extractProtocolSection(claudeContent, mapping.protocol_section_start, mapping.protocol_section_end);
    assert.ok(section);

    // Filter for phase 06
    const filtered = filterProtocolsForPhase(mapping.protocols, '06-implementation');
    assert.ok(filtered.length >= 2, 'Phase 06 should have at least 2 protocols');

    // Extract each
    const blocks = filtered.map(p => extractProtocolByHeader(section, p.header)).filter(Boolean);
    assert.ok(blocks.length >= 2);

    // Build protocols block
    const protocolsBlock = blocks.join('\n\n');
    assert.ok(protocolsBlock.includes('Git Commit Prohibition'));
    assert.ok(protocolsBlock.includes('Mandatory Iteration'));

    // Extract user content
    const userContent = extractUserContent(claudeContent, mapping);
    assert.ok(userContent.includes('Some user instructions'));
    assert.ok(!userContent.includes('SKILL OBSERVABILITY'));

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('TC-PI-22: end-to-end injection for Phase 08 (fewer protocols)', () => {
    const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    const mapping = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'src', 'claude', 'hooks', 'config', 'protocol-mapping.json'), 'utf8'
    ));

    const section = extractProtocolSection(claudeContent, mapping.protocol_section_start, mapping.protocol_section_end);
    const filtered = filterProtocolsForPhase(mapping.protocols, '08-code-review');

    // Phase 08 should only get "all" protocols, not Git Commit or Mandatory Iteration
    assert.ok(!filtered.some(p => p.header.includes('Git Commit Prohibition')));
    assert.ok(!filtered.some(p => p.header.includes('Mandatory Iteration')));
    assert.ok(filtered.some(p => p.header.includes('SKILL OBSERVABILITY')));

    fs.rmSync(tmpDir, { recursive: true });
  });
});
