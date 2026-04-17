/**
 * trailer-parser.js — Parse LLM-emitted structured trailer from roundtable output.
 *
 * Trailer format:
 *   ---ROUNDTABLE-TRAILER---
 *   state: X
 *   sub_task: Y
 *   status: Z
 *   version: 1
 *   ---END-TRAILER---
 *
 * @module trailer-parser
 * @see trailer.schema.json
 * Traces: FR-003, AC-003-01, AC-003-03, AC-003-04
 */

/** Delimiter markers */
const START_DELIMITER = '---ROUNDTABLE-TRAILER---';
const END_DELIMITER = '---END-TRAILER---';

/** Valid status values per trailer.schema.json */
const VALID_STATUSES = new Set(['running', 'complete', 'waiting']);

/**
 * Parse a structured trailer from the end of LLM output.
 *
 * Scans for delimiter markers and extracts key-value fields.
 * Returns null on any parse failure (fail-safe, AC-003-04).
 *
 * @param {string} llmOutput - Raw LLM output that may contain a trailer block
 * @param {object} [schema] - Optional schema for validation (currently uses built-in rules)
 * @returns {{ state: string, sub_task: string|null, status: string, version: number }|null}
 *   Parsed trailer fields, or null if absent/invalid
 * Traces: FR-003, AC-003-01
 */
export function parseTrailer(llmOutput, schema) {
  try {
    if (typeof llmOutput !== 'string' || llmOutput.length === 0) return null;

    const startIdx = llmOutput.lastIndexOf(START_DELIMITER);
    if (startIdx === -1) return null;

    const endIdx = llmOutput.indexOf(END_DELIMITER, startIdx);
    if (endIdx === -1) return null;

    // Extract the block between delimiters
    const blockStart = startIdx + START_DELIMITER.length;
    const block = llmOutput.slice(blockStart, endIdx).trim();
    if (block.length === 0) return null;

    // Parse key-value lines
    const fields = {};
    const lines = block.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) return null; // Malformed line -- fail-safe

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (key.length === 0) return null;
      fields[key] = value;
    }

    // Validate required fields per trailer.schema.json
    if (!fields.state || fields.state.length === 0) return null;
    if (!('sub_task' in fields)) return null;
    if (!fields.status) return null;

    // Validate status enum
    if (!VALID_STATUSES.has(fields.status)) return null;

    // Parse version (integer, default 1)
    const version = fields.version ? parseInt(fields.version, 10) : 1;
    if (isNaN(version) || version < 1) return null;

    // Handle null sub_task
    const subTask = (fields.sub_task === 'null' || fields.sub_task === '')
      ? null
      : fields.sub_task;

    return {
      state: fields.state,
      sub_task: subTask,
      status: fields.status,
      version
    };
  } catch (_err) {
    // Fail-safe: any unexpected error returns null (AC-003-04)
    return null;
  }
}

/**
 * Strip the trailer block from LLM output, returning clean user-visible text.
 *
 * @param {string} llmOutput - Raw LLM output that may contain a trailer block
 * @returns {string} Output with trailer block removed (trimmed)
 * Traces: FR-003, AC-003-01
 */
export function stripTrailer(llmOutput) {
  if (typeof llmOutput !== 'string') return '';

  const startIdx = llmOutput.lastIndexOf(START_DELIMITER);
  if (startIdx === -1) return llmOutput;

  const endIdx = llmOutput.indexOf(END_DELIMITER, startIdx);
  if (endIdx === -1) {
    // Partial trailer -- strip from start delimiter to end
    return llmOutput.slice(0, startIdx).trimEnd();
  }

  // Remove the full trailer block
  const before = llmOutput.slice(0, startIdx);
  const after = llmOutput.slice(endIdx + END_DELIMITER.length);
  return (before + after).trim();
}
