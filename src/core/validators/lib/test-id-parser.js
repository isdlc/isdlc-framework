/**
 * Shared Test ID and AC ID Parser
 * =================================
 * Common parsing functions used by validators 1, 2, and 3.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-011)
 * AC-011-01, AC-011-02, AC-011-03
 *
 * @module src/core/validators/lib/test-id-parser
 */

/**
 * Extract AC IDs from requirements-spec content.
 * Matches the AC-NNN-NN pattern (exactly 3 digits, dash, exactly 2 digits).
 *
 * @param {string} content - Requirements-spec markdown content
 * @returns {string[]} Deduplicated, ordered AC IDs
 */
export function extractAcIds(content) {
  if (!content || typeof content !== 'string') return [];
  // Match AC-NNN-NN but not AC-NNNN-NN or AC-N-N
  const matches = content.match(/\bAC-\d{3}-\d{2}\b/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

/**
 * Extract test case IDs from test-strategy content.
 * Matches patterns like VR-01, TIV-03, CC-07, TC-BUILD-01 at the start
 * of table cells or lines.
 *
 * @param {string} content - Test-strategy markdown content
 * @returns {string[]} Deduplicated test case IDs
 */
export function extractTestCaseIds(content) {
  if (!content || typeof content !== 'string') return [];
  // Match test IDs: one or more uppercase letter segments separated by dashes,
  // ending with a dash followed by digits. Must be at a word boundary or
  // after a pipe character. Exclude AC-NNN (part of AC-NNN-NN acceptance criteria).
  const matches = content.match(/(?:^|\|\s*)([A-Z]+-(?:[A-Z]+-)*\d+)/gm);
  if (!matches) return [];
  const ids = matches.map(m => {
    const cleaned = m.replace(/^\|\s*/, '').trim();
    return cleaned;
  }).filter(id => {
    // Exclude AC-NNN patterns (these are acceptance criteria prefixes, not test IDs)
    return !/^AC-\d{3}$/.test(id);
  });
  return [...new Set(ids)];
}

/**
 * Extract test-to-AC mappings from test-strategy content.
 * Parses table rows with format:
 *   | TEST-ID | description | type | AC-NNN-NN[, AC-NNN-NN] | production/file.js |
 *
 * @param {string} content - Test-strategy markdown content
 * @returns {{ test_id: string, ac_ids: string[], production_file: string|null }[]}
 */
export function extractTestToAcMappings(content) {
  if (!content || typeof content !== 'string') return [];

  const mappings = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Must be a table row with pipes
    if (!line.includes('|')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 2) continue;

    // First cell should be a test ID
    const testIdMatch = cells[0].match(/^([A-Z]+-(?:[A-Z]+-)*\d+)/);
    if (!testIdMatch) continue;

    const testId = testIdMatch[1];

    // Find AC IDs in any cell
    const acIds = [];
    for (const cell of cells) {
      const acMatches = cell.match(/AC-\d{3}-\d{2}/g);
      if (acMatches) {
        acIds.push(...acMatches);
      }
    }

    // Find production file — typically last cell containing a file path
    let productionFile = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].match(/\.(js|ts|py|go|rs|java|cjs|mjs)$/)) {
        productionFile = cells[i];
        break;
      }
    }

    mappings.push({
      test_id: testId,
      ac_ids: [...new Set(acIds)],
      production_file: productionFile
    });
  }

  return mappings;
}
