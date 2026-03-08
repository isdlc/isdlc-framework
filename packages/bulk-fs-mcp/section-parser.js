'use strict';

// REQ-0048 / FR-003 — Markdown Section Parser
// Stateless string operations for section identification and content splicing.

/**
 * Parse heading level from a string like "## Foo" -> { level: 2, text: "Foo" }
 * If no heading prefix, returns null.
 * @param {string} line
 * @returns {{ level: number, text: string } | null}
 */
function parseHeading(line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

/**
 * Find a section in markdown content by heading text or marker comment.
 *
 * @param {string} content - The full markdown content
 * @param {string} sectionId - Section identifier (heading text or marker ID)
 * @param {'heading' | 'marker'} [matchBy='heading'] - Matching strategy
 * @returns {{ start: number, end: number, level: number } | null} Section bounds or null
 */
function findSection(content, sectionId, matchBy) {
  if (!sectionId || !content) return null;

  const lines = content.split('\n');

  if (matchBy === 'marker') {
    return findByMarker(lines, sectionId);
  }

  return findByHeading(lines, sectionId);
}

/**
 * Find section by heading text match.
 * @param {string[]} lines
 * @param {string} sectionId
 * @returns {{ start: number, end: number, level: number } | null}
 */
function findByHeading(lines, sectionId) {
  // Determine the target heading line and level
  let targetLine;
  let targetLevel;

  const parsed = parseHeading(sectionId);
  if (parsed) {
    targetLine = sectionId;
    targetLevel = parsed.level;
  } else {
    // No heading prefix — assume ## (level 2)
    targetLine = '## ' + sectionId;
    targetLevel = 2;
  }

  // Search for the heading line (strict match)
  let headingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === targetLine) {
      headingIndex = i;
      break;
    }
  }

  if (headingIndex === -1) return null;

  // Section content starts on the line after the heading
  const start = headingIndex + 1;

  // Section ends at next heading of equal or higher level (lower number), or EOF
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const heading = parseHeading(lines[i]);
    if (heading && heading.level <= targetLevel) {
      end = i;
      break;
    }
  }

  return { start, end, level: targetLevel };
}

/**
 * Find section by marker comment match.
 * @param {string[]} lines
 * @param {string} sectionId
 * @returns {{ start: number, end: number, level: number } | null}
 */
function findByMarker(lines, sectionId) {
  const markerPattern = `<!-- section: ${sectionId} -->`;

  let markerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === markerPattern) {
      markerIndex = i;
      break;
    }
  }

  if (markerIndex === -1) return null;

  // Determine heading level from the next heading after marker (if any)
  let level = 2; // default
  const start = markerIndex + 1;

  // Check if next non-empty line is a heading to determine level
  for (let i = start; i < lines.length; i++) {
    const heading = parseHeading(lines[i]);
    if (heading) {
      level = heading.level;
      break;
    }
    if (lines[i].trim() !== '') break;
  }

  // Section ends at next marker, or next heading of equal/higher level, or EOF
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    // Check for another marker
    if (lines[i].trim().match(/^<!-- section: .+ -->$/) && i > markerIndex) {
      end = i;
      break;
    }
    // Check for heading of equal or higher level
    const heading = parseHeading(lines[i]);
    if (heading && heading.level <= level && i > start) {
      end = i;
      break;
    }
  }

  return { start, end, level };
}

/**
 * Replace content between section bounds with new content.
 *
 * @param {string} content - The full markdown content
 * @param {{ start: number, end: number }} bounds - Section bounds from findSection
 * @param {string} newContent - New content to insert
 * @returns {string} Updated content
 */
function spliceSection(content, bounds, newContent) {
  const lines = content.split('\n');
  const newLines = newContent.split('\n');

  const before = lines.slice(0, bounds.start);
  const after = lines.slice(bounds.end);

  return [...before, ...newLines, ...after].join('\n');
}

module.exports = { findSection, spliceSection };
