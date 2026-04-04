/**
 * Provider-Neutral Task Dispatcher Module
 *
 * Computes dispatch plans, tracks task completion, and handles failures
 * for task-level delegation in the Phase-Loop Controller. Both Claude
 * and Codex providers call these functions — only the dispatch mechanism
 * (Task tool vs codex exec) differs.
 *
 * Requirements: REQ-GH-220 FR-001 through FR-008
 * @module src/core/tasks/task-dispatcher
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readTaskPlan, getTasksForPhase, assignTiers } from './task-reader.js';

// ---------------------------------------------------------------------------
// FR-004: shouldUseTaskDispatch — Phase mode detection (AC-004-01..04)
// ---------------------------------------------------------------------------

/**
 * Check if a phase should use task-level dispatch.
 *
 * @param {Object} workflowConfig - Parsed workflows.json content
 * @param {string} phaseKey - e.g. "06-implementation"
 * @param {string} tasksPath - Path to tasks.md
 * @returns {boolean}
 */
export function shouldUseTaskDispatch(workflowConfig, phaseKey, tasksPath) {
  const td = workflowConfig?.task_dispatch;
  if (!td || !td.enabled) return false;
  // Phase key matching: config uses full keys ("06-implementation"), tasks.md uses bare numbers ("06").
  // Match if phaseKey equals a config entry OR if a config entry starts with the bare phase number.
  const matchesConfig = Array.isArray(td.phases) && td.phases.some(p =>
    p === phaseKey || p.startsWith(phaseKey + '-') || phaseKey.startsWith(p.split('-')[0])
  );
  if (!matchesConfig) return false;
  if (!existsSync(tasksPath)) return false;

  const plan = readTaskPlan(tasksPath);
  if (!plan || plan.error) return false;

  // Try both the exact phaseKey and bare number for task lookup
  const bareKey = phaseKey.split('-')[0];
  let tasks = getTasksForPhase(plan, phaseKey);
  if (tasks.length === 0 && bareKey !== phaseKey) {
    tasks = getTasksForPhase(plan, bareKey);
  }
  const pendingTasks = tasks.filter(t => !t.complete);
  const minTasks = td.min_tasks_for_dispatch || 3;

  return pendingTasks.length >= minTasks;
}

// ---------------------------------------------------------------------------
// FR-001, FR-003: computeDispatchPlan — Tier computation (AC-001-01..02, AC-003-01)
// ---------------------------------------------------------------------------

/**
 * Compute a dispatch plan: tasks grouped into parallel tiers.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} phaseKey - e.g. "06-implementation"
 * @returns {{ tiers: Object[][], totalTasks: number, pendingTasks: number } | null}
 */
export function computeDispatchPlan(tasksPath, phaseKey) {
  if (!existsSync(tasksPath)) return null;

  const plan = readTaskPlan(tasksPath);
  if (!plan || plan.error) return null;

  const tasks = getTasksForPhase(plan, phaseKey);
  if (tasks.length === 0) return null;

  const pendingTasks = tasks.filter(t => !t.complete);
  if (pendingTasks.length === 0) return null;

  // Compute tier assignments
  const assigned = new Map();
  assignTiers(pendingTasks, assigned);

  // Group by tier
  const tierMap = new Map();
  for (const task of pendingTasks) {
    const tier = assigned.get(task.id) || 0;
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier).push(task);
  }

  // Sort tiers by number
  const sortedKeys = [...tierMap.keys()].sort((a, b) => a - b);
  const tiers = sortedKeys.map(k => tierMap.get(k));

  return {
    tiers,
    totalTasks: tasks.length,
    pendingTasks: pendingTasks.length
  };
}

// ---------------------------------------------------------------------------
// FR-001, FR-003: getNextBatch — Next unblocked tier (AC-001-03, AC-003-01..02)
// ---------------------------------------------------------------------------

/**
 * Get the next batch of unblocked tasks for a phase.
 * Re-reads tasks.md to get current completion state.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} phaseKey - e.g. "06-implementation"
 * @returns {{ tier: number, tasks: Object[], isLastTier: boolean } | null}
 */
export function getNextBatch(tasksPath, phaseKey) {
  const plan = computeDispatchPlan(tasksPath, phaseKey);
  if (!plan || plan.tiers.length === 0) return null;

  return {
    tier: 0,
    tasks: plan.tiers[0],
    isLastTier: plan.tiers.length === 1
  };
}

// ---------------------------------------------------------------------------
// REQ-GH-223 FR-003: addSubTask — Create sub-task under parent (AC-003-01)
// ---------------------------------------------------------------------------

/**
 * Add a sub-task under a parent task in tasks.md.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} parentId - Parent task ID (e.g. "T005")
 * @param {string} description - Sub-task description
 * @param {{ files?: Array<{path: string, operation: string}>, traces?: string[], blockedBy?: string[], blocks?: string[] }} metadata
 * @returns {{ taskId: string|null, written: boolean, error?: string }}
 */
export function addSubTask(tasksPath, parentId, description, metadata = {}) {
  if (!existsSync(tasksPath)) {
    return { taskId: null, written: false, error: 'TASK-SUB-001' };
  }

  let content = readFileSync(tasksPath, 'utf8');

  // Check parent exists
  const parentPattern = new RegExp(`^- \\[[ X]\\] ${parentId} `, 'm');
  if (!parentPattern.test(content)) {
    return { taskId: null, written: false, error: 'TASK-SUB-001' };
  }

  // Find existing sub-tasks for this parent (e.g., T005A, T005B)
  const parentNum = parentId.replace(/^T/, '');
  const siblingPattern = new RegExp(`^- \\[[ X]\\] T${parentNum}([A-Z]) `, 'gm');
  let maxLetter = null;
  let sibMatch;
  while ((sibMatch = siblingPattern.exec(content)) !== null) {
    const letter = sibMatch[1];
    if (!maxLetter || letter > maxLetter) maxLetter = letter;
  }

  // Determine next letter
  let nextLetter;
  if (!maxLetter) {
    nextLetter = 'A';
  } else if (maxLetter === 'Z') {
    return { taskId: null, written: false, error: 'TASK-SUB-002' };
  } else {
    nextLetter = String.fromCharCode(maxLetter.charCodeAt(0) + 1);
  }

  const taskId = `T${parentNum}${nextLetter}`;

  // Build task line
  const traces = metadata.traces || [];
  const tracesStr = traces.length > 0 ? ` | traces: ${traces.join(', ')}` : '';
  let taskBlock = `- [ ] ${taskId} ${description}${tracesStr}\n`;

  if (metadata.files && metadata.files.length > 0) {
    const filesStr = metadata.files.map(f => `${f.path} (${f.operation})`).join(', ');
    taskBlock += `  files: ${filesStr}\n`;
  }

  const blockedBy = metadata.blockedBy || [parentId];
  taskBlock += `  blocked_by: [${blockedBy.join(', ')}]\n`;

  const blocks = metadata.blocks || [];
  taskBlock += `  blocks: [${blocks.join(', ')}]\n`;

  // Insert after parent's sub-lines or last sibling
  // Find the parent line and its sub-lines, then insert after
  const lines = content.split('\n');
  let insertIdx = -1;
  let foundParent = false;

  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^- \\[[ X]\\] ${parentId} `).test(lines[i])) {
      foundParent = true;
      insertIdx = i + 1;
      continue;
    }
    if (foundParent) {
      // Check if this is a sub-line (indented) or sibling sub-task
      if (lines[i].startsWith('  ') && !lines[i].startsWith('- ')) {
        insertIdx = i + 1;
      } else if (new RegExp(`^- \\[[ X]\\] T${parentNum}[A-Z] `).test(lines[i])) {
        insertIdx = i + 1;
        // Skip sub-lines of this sibling
        while (insertIdx < lines.length && lines[insertIdx].startsWith('  ') && !lines[insertIdx].startsWith('- ')) {
          insertIdx++;
        }
      } else {
        break;
      }
    }
  }

  if (insertIdx === -1) {
    return { taskId: null, written: false, error: 'TASK-SUB-001' };
  }

  // Insert the new task block
  const newLines = taskBlock.trimEnd().split('\n');
  lines.splice(insertIdx, 0, ...newLines);
  content = lines.join('\n');

  // Recalculate progress summary
  content = recalculateProgressSummary(content);
  writeFileSync(tasksPath, content);

  return { taskId, written: true };
}

// ---------------------------------------------------------------------------
// FR-008: markTaskComplete — Update tasks.md (AC-008-02, AC-008-03)
// REQ-GH-223 FR-003: Parent auto-completion (AC-003-02)
// ---------------------------------------------------------------------------

/**
 * Mark a task as complete in tasks.md and recalculate progress summary.
 * If the task is a sub-task and all siblings are complete, auto-complete the parent.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} taskId - e.g. "T004" or "T005A"
 * @param {{ retries?: number, summary?: string }} [metadata]
 */
export function markTaskComplete(tasksPath, taskId, metadata = {}) {
  let content = readFileSync(tasksPath, 'utf8');

  // Replace [ ] with [X] for this task (support both 3-digit and 4-digit IDs)
  const pattern = new RegExp(`^(- \\[ \\] ${taskId} )`, 'm');
  const replacement = `- [X] ${taskId} `;
  content = content.replace(pattern, replacement);

  // REQ-GH-223 AC-003-02: Auto-complete parent if all siblings are done
  const subTaskMatch = taskId.match(/^T(\d{3})([A-Z])$/);
  if (subTaskMatch) {
    const parentNum = subTaskMatch[1];
    const parentId = `T${parentNum}`;
    // Find all siblings
    const siblingPattern = new RegExp(`^- \\[([X ])\\] T${parentNum}[A-Z] `, 'gm');
    let allDone = true;
    let hasSiblings = false;
    let sib;
    while ((sib = siblingPattern.exec(content)) !== null) {
      hasSiblings = true;
      if (sib[1] !== 'X') {
        allDone = false;
        break;
      }
    }
    if (hasSiblings && allDone) {
      const parentPattern = new RegExp(`^(- \\[ \\] ${parentId} )`, 'm');
      content = content.replace(parentPattern, `- [X] ${parentId} `);
    }
  }

  // Recalculate progress summary
  content = recalculateProgressSummary(content);

  writeFileSync(tasksPath, content);
}

// ---------------------------------------------------------------------------
// FR-007: handleTaskFailure — Retry or escalate (AC-007-01, AC-007-02, AC-007-04)
// ---------------------------------------------------------------------------

// Internal retry counter (per-session, not persisted to tasks.md)
const retryCounters = new Map();

/**
 * Handle a task failure: determine whether to retry or escalate.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} taskId - e.g. "T0004"
 * @param {string} error - Error message from agent
 * @param {number} [maxRetries=3] - Maximum retries before escalation
 * @returns {{ action: 'retry' | 'escalate', retryCount: number }}
 */
export function handleTaskFailure(tasksPath, taskId, error, maxRetries = 3) {
  const count = (retryCounters.get(taskId) || 0) + 1;
  retryCounters.set(taskId, count);

  if (count >= maxRetries) {
    return { action: 'escalate', retryCount: count };
  }

  return { action: 'retry', retryCount: count };
}

// ---------------------------------------------------------------------------
// FR-007: skipTaskWithDependents — Cascade skip (AC-007-03)
// ---------------------------------------------------------------------------

/**
 * Mark a task and all its transitive dependents as skipped.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} taskId - The task to skip
 * @param {string} reason - Why it was skipped
 */
export function skipTaskWithDependents(tasksPath, taskId, reason) {
  let content = readFileSync(tasksPath, 'utf8');
  const plan = readTaskPlan(tasksPath);
  if (!plan || plan.error) return;

  // Collect all tasks across all phases
  const allTasks = [];
  for (const phase of Object.values(plan.phases)) {
    allTasks.push(...phase.tasks);
  }

  // Find transitive dependents
  const toSkip = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of allTasks) {
      if (toSkip.has(task.id)) continue;
      const hasSkippedBlocker = task.blockedBy.some(b => toSkip.has(b));
      if (hasSkippedBlocker) {
        toSkip.add(task.id);
        changed = true;
      }
    }
  }

  // Mark each as skipped in content
  for (const skipId of toSkip) {
    const skipReason = skipId === taskId ? reason : `dependency ${taskId} skipped`;
    const pattern = new RegExp(`^(- \\[ \\] ${skipId} .*)$`, 'm');
    content = content.replace(pattern, `- [SKIP] ${skipId} $1 (skipped: ${skipReason})`);
  }

  // Recalculate summary
  content = recalculateProgressSummary(content);
  writeFileSync(tasksPath, content);
}

// ---------------------------------------------------------------------------
// Internal: Recalculate progress summary table
// ---------------------------------------------------------------------------

/**
 * Recalculate the Progress Summary table in tasks.md content.
 * @param {string} content - Full tasks.md content
 * @returns {string} Updated content
 */
function recalculateProgressSummary(content) {
  // Count tasks per phase
  const phaseRegex = /^## Phase (\d+):/gm;
  const taskDoneRegex = /^- \[X\]/gm;
  const taskPendingRegex = /^- \[ \]/gm;
  const taskSkipRegex = /^- \[SKIP\]/gm;

  // Split by phase sections
  const sections = content.split(/(?=^## Phase \d+:)/m);
  const phaseCounts = {};

  for (const section of sections) {
    const phaseMatch = section.match(/^## Phase (\d+):/m);
    if (!phaseMatch) continue;
    const phaseNum = phaseMatch[1];
    const done = (section.match(/^- \[X\]/gm) || []).length;
    const pending = (section.match(/^- \[ \]/gm) || []).length;
    const skipped = (section.match(/^- \[SKIP\]/gm) || []).length;
    phaseCounts[phaseNum] = { total: done + pending + skipped, done };
  }

  // Rebuild summary table
  let totalAll = 0;
  let doneAll = 0;
  const rows = [];
  for (const [phase, counts] of Object.entries(phaseCounts).sort()) {
    const status = counts.done === counts.total ? 'COMPLETE' :
                   counts.done > 0 ? 'IN PROGRESS' : 'PENDING';
    rows.push(`| ${phase}    | ${counts.total}     | ${counts.done}    | ${status} |`);
    totalAll += counts.total;
    doneAll += counts.done;
  }
  const pct = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;
  rows.push(`| **Total** | **${totalAll}** | **${doneAll}** | **${pct}%** |`);

  // Replace existing summary table
  const summaryPattern = /## Progress Summary\n\n\| Phase.*?\n\|[-| ]+\n([\s\S]*?)(?=\n## Phase)/;
  const newTable = `## Progress Summary\n\n| Phase | Total | Done | Status |\n|-------|-------|------|--------|\n${rows.join('\n')}\n`;
  content = content.replace(summaryPattern, newTable);

  return content;
}

// ---------------------------------------------------------------------------
// Reset retry counters (for testing)
// ---------------------------------------------------------------------------

/**
 * Reset internal retry counters. Used in tests.
 */
export function resetRetryCounters() {
  retryCounters.clear();
}
