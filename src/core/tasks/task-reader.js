/**
 * Provider-Neutral Task Reader Module
 *
 * Parses v2.0 tasks.md files into structured data for consumption
 * by both Claude and Codex providers. Implements the consumption
 * pattern contract (FR-007).
 *
 * Requirements: REQ-GH-212 FR-011 (AC-011-01..06), FR-007 (AC-007-04..06)
 * @module src/core/tasks/task-reader
 */

import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// FR-011: readTaskPlan() — Parse v2.0 tasks.md (AC-011-01..04)
// ---------------------------------------------------------------------------

/**
 * Read and parse a v2.0 tasks.md file.
 *
 * @param {string} tasksPath - Absolute path to tasks.md
 * @returns {import('./types').TaskPlan|null|{error: string, reason: string}}
 *   - TaskPlan on success
 *   - null if file not found (AC-011-03)
 *   - {error, reason} if file exists but is malformed (AC-011-04)
 */
export function readTaskPlan(tasksPath) {
  // AC-011-03: file not found returns null
  if (!existsSync(tasksPath)) {
    return null;
  }

  try {
    const content = readFileSync(tasksPath, 'utf8');

    // AC-011-04: empty file returns error
    if (!content || !content.trim()) {
      return { error: 'parse_failed', reason: 'empty file' };
    }

    // Parse header block
    const header = parseHeader(content);

    // Split into phase sections
    const phaseSections = splitPhaseSections(content);

    if (phaseSections.length === 0) {
      return { error: 'parse_failed', reason: 'no phase sections' };
    }

    const phases = {};
    const allTaskIds = new Set();
    const warnings = [];
    const allTasks = [];

    for (const section of phaseSections) {
      const parsed = parsePhaseSection(section);
      phases[parsed.phaseKey] = {
        name: parsed.name,
        status: parsed.status,
        tasks: parsed.tasks
      };

      // Collect task IDs for validation
      for (const task of parsed.tasks) {
        if (allTaskIds.has(task.id)) {
          warnings.push(`Duplicate task ID: ${task.id}`);
        }
        allTaskIds.add(task.id);
        allTasks.push(task);
      }
    }

    // Validation: check references
    for (const task of allTasks) {
      // Self-reference check
      if (task.blockedBy.includes(task.id)) {
        warnings.push(`Self-reference in blocked_by: ${task.id} references itself`);
      }
      // Nonexistent reference check
      for (const ref of task.blockedBy) {
        if (!allTaskIds.has(ref)) {
          warnings.push(`blocked_by reference to unknown task: ${ref} (in ${task.id})`);
        }
      }
      for (const ref of task.blocks) {
        if (!allTaskIds.has(ref)) {
          warnings.push(`blocks reference to unknown task: ${ref} (in ${task.id})`);
        }
      }
    }

    // Build summary
    const summary = buildSummary(phases);

    const plan = {
      slug: header.slug,
      format: header.format || 'v2.0',
      phases,
      summary
    };

    if (warnings.length > 0) {
      plan.warnings = warnings;
    }

    return plan;

  } catch (err) {
    // AC-011-04: never throw, return error object
    return { error: 'parse_failed', reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// FR-011, FR-007: getTasksForPhase() — Extract tasks for a phase
// ---------------------------------------------------------------------------

/**
 * Extract tasks for a specific phase.
 *
 * @param {import('./types').TaskPlan|null} plan
 * @param {string} phaseKey - e.g. "06"
 * @returns {import('./types').Task[]}
 */
export function getTasksForPhase(plan, phaseKey) {
  if (!plan || !plan.phases || !(phaseKey in plan.phases)) {
    return [];
  }
  return plan.phases[phaseKey].tasks;
}

// ---------------------------------------------------------------------------
// FR-007: formatTaskContext() — Format for prompt injection (AC-007-04..06)
// ---------------------------------------------------------------------------

/**
 * Format tasks as a TASK_CONTEXT block for prompt injection.
 *
 * @param {import('./types').TaskPlan} plan
 * @param {string} phaseKey - Current phase (e.g. "06")
 * @param {Object} [options]
 * @param {boolean} [options.includeTestMapping] - Include task-to-test table
 * @param {string} [options.testStrategyPath] - Path to test-strategy.md
 * @returns {string} Formatted TASK_CONTEXT block
 */
export function formatTaskContext(plan, phaseKey, options = {}) {
  const tasks = getTasksForPhase(plan, phaseKey);
  const lines = [];

  lines.push('TASK_CONTEXT:');
  lines.push(`  phase: "${phaseKey}"`);
  lines.push(`  total_tasks: ${tasks.length}`);
  lines.push('  tasks:');

  for (const task of tasks) {
    lines.push(`    - id: ${task.id}`);
    lines.push(`      description: "${task.description}"`);

    // Files
    const filesStr = task.files.map(f => `{path: "${f.path}", operation: "${f.operation}"}`).join(', ');
    lines.push(`      files: [${filesStr}]`);

    // Dependencies
    lines.push(`      blocked_by: [${task.blockedBy.join(', ')}]`);
    lines.push(`      blocks: [${task.blocks.join(', ')}]`);

    // Traces
    lines.push(`      traces: [${task.traces.join(', ')}]`);

    // Status
    lines.push(`      status: ${task.complete ? 'complete' : 'pending'}`);
  }

  // Dependency summary
  const depSummary = computeDependencySummary(tasks);
  lines.push('  dependency_summary:');
  lines.push(`    critical_path_length: ${depSummary.criticalPathLength}`);
  lines.push(`    parallel_tiers: ${depSummary.parallelTiers}`);
  const tier0Ids = depSummary.tier0Tasks.map(t => t.id);
  lines.push(`    tier_0_tasks: [${tier0Ids.join(', ')}]`);

  // Test mapping
  let testMapping = null;
  if (options.includeTestMapping && options.testStrategyPath) {
    testMapping = parseTestMapping(options.testStrategyPath);
  }

  if (testMapping) {
    lines.push('  test_mapping:');
    for (const [taskId, mapping] of Object.entries(testMapping)) {
      lines.push(`    ${taskId}: {test_file: "${mapping.test_file}", scenarios: ${mapping.scenarios}}`);
    }
  } else {
    lines.push('  test_mapping: null');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the header block from tasks.md content.
 * @param {string} content
 * @returns {{ slug: string, format: string }}
 */
function parseHeader(content) {
  const slug = extractField(content, /^# Task Plan:\s*\w+\s+(.+)/m) || '';
  const format = extractField(content, /^Format:\s*(.+)/m) || 'v2.0';
  return { slug, format };
}

/**
 * Extract a regex capture group from content.
 * @param {string} content
 * @param {RegExp} pattern
 * @returns {string|null}
 */
function extractField(content, pattern) {
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Split content into phase section strings.
 * @param {string} content
 * @returns {string[]}
 */
function splitPhaseSections(content) {
  const sections = [];
  // Match ## Phase NN: headers
  const phasePattern = /^## Phase \d+:/gm;
  const matches = [];
  let match;

  while ((match = phasePattern.exec(content)) !== null) {
    matches.push(match.index);
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    // Find the end: either next ## Phase, or the next --- separator, or end of file
    let end;
    if (i + 1 < matches.length) {
      end = matches[i + 1];
    } else {
      // Look for --- separator or ## (non-Phase) section
      const remaining = content.substring(start + 1);
      const nextSep = remaining.search(/^---$/m);
      const nextSection = remaining.search(/^## (?!Phase)/m);
      if (nextSep >= 0 && (nextSection < 0 || nextSep < nextSection)) {
        end = start + 1 + nextSep;
      } else if (nextSection >= 0) {
        end = start + 1 + nextSection;
      } else {
        end = content.length;
      }
    }
    sections.push(content.substring(start, end));
  }

  return sections;
}

/**
 * Parse a single phase section.
 * @param {string} section
 * @returns {{ phaseKey: string, name: string, status: string, tasks: import('./types').Task[] }}
 */
function parsePhaseSection(section) {
  // Parse header: ## Phase NN: Name -- STATUS
  const headerMatch = section.match(/^## Phase (\d+):\s*(.+?)\s*--\s*(PENDING|IN PROGRESS|COMPLETE)/m);
  const phaseKey = headerMatch ? headerMatch[1] : '00';
  const name = headerMatch ? headerMatch[2].trim() : 'Unknown';
  const status = headerMatch ? headerMatch[3] : 'PENDING';

  const tasks = [];
  const lines = section.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match task lines: - [ ] TNNNN or - [X] TNNNN or - [BLOCKED] TNNNN
    const taskMatch = line.match(/^- \[([ X])\]\s+(T\d{4})\s+(.+)/);
    if (!taskMatch) continue;

    const complete = taskMatch[1] === 'X';
    const id = taskMatch[2];
    let remainder = taskMatch[3];

    // Check for [P] marker
    let parallel = false;
    if (remainder.startsWith('[P] ')) {
      parallel = true;
      remainder = remainder.substring(4);
    }

    // Extract traces from pipe annotation
    let traces = [];
    const tracesMatch = remainder.match(/\|\s*traces:\s*(.+?)$/);
    if (tracesMatch) {
      traces = tracesMatch[1].split(',').map(s => s.trim());
      remainder = remainder.substring(0, remainder.indexOf('|')).trim();
    }

    const description = remainder.trim();

    // Parse sub-lines (indented by 2 spaces)
    const files = [];
    const blockedBy = [];
    const blocks = [];

    for (let j = i + 1; j < lines.length; j++) {
      const subLine = lines[j];
      if (!subLine.match(/^\s{2}\S/)) break;
      const trimmed = subLine.trim();

      if (trimmed.startsWith('files:')) {
        const filesStr = trimmed.substring(6).trim();
        // Parse comma-separated file specs: path (OPERATION)
        const fileSpecs = filesStr.split(',').map(s => s.trim());
        for (const spec of fileSpecs) {
          const fileMatch = spec.match(/^(.+?)\s*\((\w+)\)$/);
          if (fileMatch) {
            files.push({ path: fileMatch[1].trim(), operation: fileMatch[2] });
          }
        }
      } else if (trimmed.startsWith('blocked_by:')) {
        const bbStr = trimmed.substring(11).trim();
        const bbMatch = bbStr.match(/\[([^\]]*)\]/);
        if (bbMatch && bbMatch[1].trim()) {
          const refs = bbMatch[1].split(',').map(s => s.trim());
          blockedBy.push(...refs);
        }
      } else if (trimmed.startsWith('blocks:')) {
        const bStr = trimmed.substring(7).trim();
        const bMatch = bStr.match(/\[([^\]]*)\]/);
        if (bMatch && bMatch[1].trim()) {
          const refs = bMatch[1].split(',').map(s => s.trim());
          blocks.push(...refs);
        }
      }
    }

    tasks.push({ id, description, complete, parallel, files, blockedBy, blocks, traces });
  }

  return { phaseKey, name, status, tasks };
}

/**
 * Build summary from parsed phases.
 * @param {Object<string, import('./types').PhaseSection>} phases
 * @returns {import('./types').Summary}
 */
function buildSummary(phases) {
  let total = 0;
  const byPhase = {};

  for (const [key, phase] of Object.entries(phases)) {
    const phaseTotal = phase.tasks.length;
    const phaseDone = phase.tasks.filter(t => t.complete).length;
    total += phaseTotal;
    byPhase[key] = { total: phaseTotal, done: phaseDone };
  }

  return { total, byPhase };
}

/**
 * Compute dependency summary for a set of tasks.
 * @param {import('./types').Task[]} tasks
 * @returns {{ criticalPathLength: number, parallelTiers: number, tier0Tasks: import('./types').Task[] }}
 */
function computeDependencySummary(tasks) {
  if (tasks.length === 0) {
    return { criticalPathLength: 0, parallelTiers: 0, tier0Tasks: [] };
  }

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const tier0Tasks = tasks.filter(t => t.blockedBy.length === 0 || t.blockedBy.every(b => !taskMap.has(b)));

  // Compute tiers using topological sort
  const assigned = new Map();
  const maxTier = assignTiers(tasks, assigned);

  return {
    criticalPathLength: maxTier + 1,
    parallelTiers: maxTier + 1,
    tier0Tasks
  };
}

/**
 * Assign tier numbers to tasks using topological ordering.
 * @param {import('./types').Task[]} tasks
 * @param {Map<string, number>} assigned
 * @returns {number} Maximum tier number
 */
function assignTiers(tasks, assigned) {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  let maxTier = 0;

  function getTier(taskId) {
    if (assigned.has(taskId)) return assigned.get(taskId);
    const task = taskMap.get(taskId);
    if (!task) return 0;

    const localBlockers = task.blockedBy.filter(b => taskMap.has(b));
    if (localBlockers.length === 0) {
      assigned.set(taskId, 0);
      return 0;
    }

    let tier = 0;
    for (const blocker of localBlockers) {
      tier = Math.max(tier, getTier(blocker) + 1);
    }
    assigned.set(taskId, tier);
    if (tier > maxTier) maxTier = tier;
    return tier;
  }

  for (const task of tasks) {
    getTier(task.id);
  }

  return maxTier;
}

/**
 * Parse test-to-task mapping from test-strategy.md.
 * @param {string} testStrategyPath
 * @returns {Object<string, {test_file: string, scenarios: number}>|null}
 */
function parseTestMapping(testStrategyPath) {
  if (!existsSync(testStrategyPath)) {
    return null;
  }

  try {
    const content = readFileSync(testStrategyPath, 'utf8');

    // Look for task-to-test traceability table
    const tableMatch = content.match(/\| Task \| File Under Test \| Test File \| Traces \| Scenarios \|[\s\S]*?(?=\n\n|\n#|$)/);
    if (!tableMatch) return null;

    const mapping = {};
    const rows = tableMatch[0].split('\n').slice(2); // Skip header and separator

    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 5) {
        const taskId = cells[0];
        const testFile = cells[2];
        const scenarios = parseInt(cells[4], 10);
        if (/^T\d{4}$/.test(taskId)) {
          mapping[taskId] = { test_file: testFile, scenarios: isNaN(scenarios) ? 0 : scenarios };
        }
      }
    }

    return Object.keys(mapping).length > 0 ? mapping : null;

  } catch {
    return null;
  }
}
