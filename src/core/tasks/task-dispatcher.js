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
// FR-008: markTaskComplete — Update tasks.md (AC-008-02, AC-008-03)
// ---------------------------------------------------------------------------

/**
 * Mark a task as complete in tasks.md and recalculate progress summary.
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} taskId - e.g. "T0004"
 * @param {{ retries?: number, summary?: string }} [metadata]
 */
export function markTaskComplete(tasksPath, taskId, metadata = {}) {
  let content = readFileSync(tasksPath, 'utf8');

  // Replace [ ] with [X] for this task
  const pattern = new RegExp(`^(- \\[ \\] ${taskId} )`, 'm');
  const replacement = `- [X] ${taskId} `;
  content = content.replace(pattern, replacement);

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
