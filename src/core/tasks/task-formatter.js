/**
 * Provider-Neutral Task Formatter Module
 *
 * Formats a parsed task plan into a human-readable phase summary with
 * category grouping, status icons, progress counts, and box-drawing borders.
 * Pure function — no file I/O, no side effects.
 *
 * Requirements: REQ-GH-217 FR-003 (AC-003-01)
 * @module src/core/tasks/task-formatter
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Status icons for task display */
const ICONS = {
  complete: '\u2705',    // check mark
  in_progress: '\uD83D\uDD27', // wrench
  pending: '\u25FB\uFE0F'      // white square
};

/** Box-drawing characters */
const BOX = {
  topLeft: '\u250C',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  teeLeft: '\u251C',
  teeRight: '\u2524'
};

/** Inner content width (between vertical borders, excluding the border chars) */
const INNER_WIDTH = 68;

// ---------------------------------------------------------------------------
// Phase name mapping
// ---------------------------------------------------------------------------

/** Map phase key prefixes to human-readable names */
const PHASE_NAMES = {
  '01': 'Requirements',
  '02': 'Architecture',
  '03': 'Design',
  '04': 'Test Strategy',
  '05': 'Test Strategy',
  '06': 'Implementation',
  '07': 'Integration & Testing',
  '08': 'Code Review',
  '09': 'Documentation',
  '10': 'Deployment',
  '16': 'Quality Loop'
};

/**
 * Resolve human-readable phase name from a phase key.
 *
 * Checks the plan's own phase metadata first (which stores the name from
 * the "## Phase NN: Name" header), then falls back to a static lookup table.
 *
 * @param {string} phaseKey - e.g. "06" or "06-implementation"
 * @param {object|null} plan - Parsed task plan
 * @returns {string} Human name, e.g. "Implementation"
 */
function resolvePhaseDisplayName(phaseKey, plan) {
  // Try the plan's own phase name first
  if (plan && plan.phases && plan.phases[phaseKey]) {
    return plan.phases[phaseKey].name || PHASE_NAMES[phaseKey] || phaseKey;
  }
  // Static lookup by bare number
  const bare = phaseKey.split('-')[0];
  return PHASE_NAMES[bare] || phaseKey;
}

// ---------------------------------------------------------------------------
// FR-003: formatPhaseSummary (AC-003-01)
// ---------------------------------------------------------------------------

/**
 * Format a phase summary from a parsed task plan.
 *
 * @param {object|null} plan - Parsed task plan from readTaskPlan().
 *   Expected shape: { phases: { [key]: { name, status, tasks[] } }, ... }
 *   Each task: { id, description, complete, parallel, files, blockedBy, blocks, traces, metadata }
 * @param {string} phaseKey - Phase key, e.g. "06"
 * @returns {string} Formatted summary string with box-drawing borders
 */
export function formatPhaseSummary(plan, phaseKey) {
  // Defensive: handle null/undefined/error plan
  if (!plan || plan.error) {
    return formatEmptyBox(phaseKey, plan);
  }

  // Resolve phase data — try exact key, then bare number, then full key match
  const phaseData = resolvePhaseData(plan, phaseKey);
  if (!phaseData) {
    return formatEmptyBox(phaseKey, plan);
  }

  const allTasks = phaseData.tasks || [];

  // Filter to top-level tasks only (IDs matching /^T\d{3}$/ — no letter suffix)
  const tasks = allTasks.filter(t => /^T\d{3}$/.test(t.id));

  if (tasks.length === 0) {
    return formatEmptyBox(phaseKey, plan);
  }

  // Compute status for each task
  const enriched = tasks.map(t => ({
    ...t,
    status: deriveStatus(t)
  }));

  // Group by category — preserve insertion order
  const groups = groupByCategory(enriched);

  // Compute progress counts
  const doneCount = enriched.filter(t => t.status === 'complete').length;
  const inProgressCount = enriched.filter(t => t.status === 'in_progress').length;
  const pendingCount = enriched.filter(t => t.status === 'pending').length;
  const total = enriched.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Build the formatted output
  const lines = [];
  const phaseName = resolvePhaseDisplayName(phaseKey, plan);
  const bare = phaseKey.split('-')[0];

  // Header line
  const headerLeft = `  Phase ${bare}: ${phaseName} Summary`;
  const headerRight = `${doneCount}/${total} (${pct}%)`;
  const headerPad = INNER_WIDTH - headerLeft.length - headerRight.length;
  const headerContent = headerLeft + ' '.repeat(Math.max(1, headerPad)) + headerRight;

  lines.push(BOX.topLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.topRight);
  lines.push(BOX.vertical + headerContent + BOX.vertical);
  lines.push(BOX.teeLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.teeRight);

  // Task groups
  for (const [category, groupTasks] of groups) {
    // Category header (if present)
    if (category) {
      const catLine = `  ${category}`;
      lines.push(BOX.vertical + padRight(catLine, INNER_WIDTH) + BOX.vertical);
    }

    // Task lines
    for (const task of groupTasks) {
      const icon = ICONS[task.status];
      const taskLine = `  ${icon} ${task.id}  ${task.description}`;
      // Truncate if too long
      const truncated = taskLine.length > INNER_WIDTH
        ? taskLine.substring(0, INNER_WIDTH - 1) + '\u2026'
        : taskLine;
      lines.push(BOX.vertical + padRight(truncated, INNER_WIDTH) + BOX.vertical);
    }

    // Blank line between groups
    lines.push(BOX.vertical + ' '.repeat(INNER_WIDTH) + BOX.vertical);
  }

  // Remove the trailing blank line before the footer separator
  if (lines.length > 0 && lines[lines.length - 1] === BOX.vertical + ' '.repeat(INNER_WIDTH) + BOX.vertical) {
    lines.pop();
  }

  // Footer separator
  lines.push(BOX.teeLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.teeRight);

  // Summary footer
  const summaryParts = [];
  summaryParts.push(`${ICONS.complete} ${doneCount} done`);
  summaryParts.push(`${ICONS.in_progress} ${inProgressCount} in progress`);
  summaryParts.push(`${ICONS.pending} ${pendingCount} pending`);
  const summaryText = '  ' + summaryParts.join('   ');
  lines.push(BOX.vertical + padRight(summaryText, INNER_WIDTH) + BOX.vertical);

  // Bottom border
  lines.push(BOX.bottomLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.bottomRight);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve phase data from a plan, trying multiple key formats.
 *
 * @param {object} plan
 * @param {string} phaseKey
 * @returns {object|null} Phase data object or null
 */
function resolvePhaseData(plan, phaseKey) {
  if (!plan.phases) return null;

  // Direct match
  if (plan.phases[phaseKey]) return plan.phases[phaseKey];

  // Try bare number (e.g. "06" from "06-implementation")
  const bare = phaseKey.split('-')[0];
  if (bare !== phaseKey && plan.phases[bare]) return plan.phases[bare];

  // Try finding a key that starts with the bare number
  for (const key of Object.keys(plan.phases)) {
    if (key.startsWith(bare + '-') || key === bare) {
      return plan.phases[key];
    }
  }

  return null;
}

/**
 * Derive a three-state status from a task's fields.
 *
 * The task-reader parser stores `complete` (boolean). We derive:
 * - "complete" when task.complete === true
 * - "in_progress" when task.metadata.status === 'in_progress'
 * - "pending" otherwise
 *
 * @param {object} task
 * @returns {"complete"|"in_progress"|"pending"}
 */
function deriveStatus(task) {
  if (task.complete) return 'complete';
  if (task.metadata && task.metadata.status === 'in_progress') return 'in_progress';
  return 'pending';
}

/**
 * Group tasks by category, preserving insertion order.
 *
 * Category is derived from the task's `category` field (set by task-reader
 * from ### sub-headers), or from position in the tasks array. Tasks without
 * a category are grouped under an empty string key.
 *
 * @param {object[]} tasks
 * @returns {Map<string, object[]>} Ordered map of category -> tasks
 */
function groupByCategory(tasks) {
  const groups = new Map();

  for (const task of tasks) {
    const cat = task.category || '';
    if (!groups.has(cat)) {
      groups.set(cat, []);
    }
    groups.get(cat).push(task);
  }

  return groups;
}

/**
 * Pad a string with spaces on the right to reach the target width.
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padRight(str, width) {
  // Account for multi-byte emoji characters in visual width calculation
  const visualLen = visualWidth(str);
  if (visualLen >= width) return str;
  return str + ' '.repeat(width - visualLen);
}

/**
 * Estimate visual width of a string, accounting for emoji taking 2 columns.
 *
 * This is a simplified heuristic: characters outside the Basic Latin and
 * Latin-1 Supplement ranges are counted as 2 columns, except for variation
 * selectors (U+FE0E, U+FE0F) and other zero-width characters which are
 * counted as 0.
 *
 * @param {string} str
 * @returns {number}
 */
function visualWidth(str) {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    // Variation selectors and zero-width joiners have no visual width
    if (code === 0xFE0E || code === 0xFE0F || code === 0x200D) {
      continue;
    }
    if (code > 0xFF) {
      // Emoji and wide characters take ~2 columns
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Format an empty summary box for phases with no tasks.
 *
 * @param {string} phaseKey
 * @param {object|null} plan
 * @returns {string}
 */
function formatEmptyBox(phaseKey, plan) {
  const phaseName = resolvePhaseDisplayName(phaseKey, plan);
  const bare = phaseKey.split('-')[0];

  const lines = [];
  const headerLeft = `  Phase ${bare}: ${phaseName} Summary`;
  const headerRight = '0/0 (0%)';
  const headerPad = INNER_WIDTH - headerLeft.length - headerRight.length;
  const headerContent = headerLeft + ' '.repeat(Math.max(1, headerPad)) + headerRight;

  lines.push(BOX.topLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.topRight);
  lines.push(BOX.vertical + headerContent + BOX.vertical);
  lines.push(BOX.teeLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.teeRight);

  const emptyMsg = '  No tasks in this phase';
  lines.push(BOX.vertical + padRight(emptyMsg, INNER_WIDTH) + BOX.vertical);

  lines.push(BOX.teeLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.teeRight);

  const summaryText = `  ${ICONS.complete} 0 done   ${ICONS.in_progress} 0 in progress   ${ICONS.pending} 0 pending`;
  lines.push(BOX.vertical + padRight(summaryText, INNER_WIDTH) + BOX.vertical);

  lines.push(BOX.bottomLeft + BOX.horizontal.repeat(INNER_WIDTH) + BOX.bottomRight);

  return lines.join('\n');
}
