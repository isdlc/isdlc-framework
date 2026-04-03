/**
 * Codex Task Dispatch Adapter
 *
 * Thin wrapper around the provider-neutral task-dispatcher core.
 * Dispatches individual tasks via `codex exec` with per-task
 * projection bundles instead of Claude's Task tool.
 *
 * Requirements: REQ-GH-220 FR-001, FR-004
 * @module src/providers/codex/task-dispatch
 */

import {
  computeDispatchPlan,
  getNextBatch,
  markTaskComplete,
  handleTaskFailure,
  skipTaskWithDependents,
  shouldUseTaskDispatch
} from '../../core/tasks/task-dispatcher.js';

/**
 * Execute task-level dispatch for a phase using Codex runtime.
 *
 * Iterates through tiers sequentially. Within each tier, tasks are
 * dispatched via `codex exec` (potentially in parallel if the Codex
 * runtime supports concurrent exec calls).
 *
 * @param {string} tasksPath - Path to tasks.md
 * @param {string} phaseKey - e.g. "06-implementation"
 * @param {string} artifactFolder - Requirement artifact folder path
 * @param {Object} options
 * @param {string} options.agentType - Phase agent type (e.g. "software-developer")
 * @param {number} [options.maxRetries=3] - Max retries per task
 * @param {string[]} [options.priorCompletedFiles=[]] - Files from prior tiers
 * @returns {Promise<{ completed: string[], failed: string[], skipped: string[] }>}
 */
export async function dispatchPhaseTasks(tasksPath, phaseKey, artifactFolder, options = {}) {
  const { agentType, maxRetries = 3 } = options;
  const completed = [];
  const failed = [];
  const skipped = [];
  const priorFiles = options.priorCompletedFiles || [];

  let batch = getNextBatch(tasksPath, phaseKey);

  while (batch !== null) {
    const results = await Promise.allSettled(
      batch.tasks.map(task => executeTaskViaCodex(task, {
        phaseKey,
        artifactFolder,
        agentType,
        priorCompletedFiles: [...priorFiles, ...completed.flatMap(id => getTaskFiles(tasksPath, id))]
      }))
    );

    for (let i = 0; i < batch.tasks.length; i++) {
      const task = batch.tasks[i];
      const result = results[i];

      if (result.status === 'fulfilled' && result.value.success) {
        markTaskComplete(tasksPath, task.id, { summary: result.value.summary });
        completed.push(task.id);
        for (const f of task.files) priorFiles.push(f.path);
      } else {
        const error = result.status === 'rejected' ? result.reason.message : result.value.error;
        const outcome = handleTaskFailure(tasksPath, task.id, error, maxRetries);

        if (outcome.action === 'escalate') {
          // In Codex, escalation writes to stdout for the governance layer to pick up
          console.error(`TASK_ESCALATION: ${task.id} failed after ${outcome.retryCount} retries: ${error}`);
          skipTaskWithDependents(tasksPath, task.id, `failed after ${outcome.retryCount} retries`);
          failed.push(task.id);
        }
        // Retry is handled by the caller re-invoking dispatchPhaseTasks
      }
    }

    batch = getNextBatch(tasksPath, phaseKey);
  }

  return { completed, failed, skipped };
}

/**
 * Execute a single task via codex exec.
 * @param {Object} task - Task object from task-reader
 * @param {Object} context - Dispatch context
 * @returns {Promise<{ success: boolean, summary?: string, error?: string }>}
 */
async function executeTaskViaCodex(task, context) {
  // Build per-task projection content
  const projection = buildTaskProjection(task, context);

  // In Codex runtime, this would be:
  // const result = await codexExec(projection);
  // For now, this is the adapter interface — actual Codex exec integration
  // depends on the Codex runtime being available.
  throw new Error(`Codex task dispatch not yet wired to codex exec runtime. Task: ${task.id}`);
}

/**
 * Build a per-task projection bundle for codex exec.
 * @param {Object} task
 * @param {Object} context
 * @returns {string} Projection content
 */
function buildTaskProjection(task, context) {
  const filesSection = task.files
    .map(f => `- ${f.path} (${f.operation})`)
    .join('\n');

  return [
    `# Task: ${task.id} — ${task.description}`,
    `Phase: ${context.phaseKey}`,
    `Agent: ${context.agentType}`,
    `Artifact folder: ${context.artifactFolder}`,
    '',
    '## Files',
    filesSection,
    '',
    '## Traces',
    task.traces.join(', '),
    '',
    '## Prior Completed Files',
    context.priorCompletedFiles.join('\n') || '(none)',
    '',
    '## Constraints',
    '- Implement ONLY the files listed above',
    '- Run tests for your changes before completing',
  ].join('\n');
}

/**
 * Get file paths for a completed task (helper for prior-files accumulator).
 * @param {string} tasksPath
 * @param {string} taskId
 * @returns {string[]}
 */
function getTaskFiles(tasksPath, taskId) {
  const { readTaskPlan } = await import('../../core/tasks/task-reader.js');
  const plan = readTaskPlan(tasksPath);
  if (!plan || plan.error) return [];
  for (const phase of Object.values(plan.phases)) {
    const task = phase.tasks.find(t => t.id === taskId);
    if (task) return task.files.map(f => f.path);
  }
  return [];
}

// Re-export core functions for convenience
export { shouldUseTaskDispatch, computeDispatchPlan } from '../../core/tasks/task-dispatcher.js';
