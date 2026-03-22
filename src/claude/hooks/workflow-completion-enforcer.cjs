#!/usr/bin/env node
/**
 * iSDLC Workflow Completion Enforcer - PostToolUse[Write,Edit] Hook
 * =================================================================
 * Ensures workflow_history entries have phase_snapshots and metrics
 * after workflow completion. Auto-remediates if missing.
 *
 * Trigger: state.json write where active_workflow is null and a recent
 * workflow_history entry lacks phase_snapshots or metrics.
 *
 * SELF-HEALING: reconstructs temporary active_workflow from the entry's
 * phases array (or state.phases keys as fallback), calls collectPhaseSnapshots(),
 * then applies all 4 pruning functions.
 *
 * SPECIAL CASE for dispatcher mode: This hook reads FRESH state from disk
 * because the tool just wrote it. In dispatcher mode, ctx.state may be stale.
 * This hook MUST do its own readState() and writeState() internally.
 * Returns { decision: 'allow', stateModified: false } always.
 *
 * NEVER produces stdout output (hook protocol).
 * Fail-open: any error results in silent exit (exit 0, no output).
 *
 * Performance budget: < 200ms
 *
 * Traces to: REQ-0005
 * Version: 1.1.0
 */

const {
    readState,
    writeState,
    debugLog,
    logHookEvent,
    outputSelfHealNotification,
    collectPhaseSnapshots,
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    clearTransientFields,
    appendToArchive
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0091: Bridge-first delegation to core workflow
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'workflow.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Regex to match state.json paths (single-project and monorepo, cross-platform).
 */
const STATE_JSON_PATTERN = /\.isdlc[/\\](?:projects[/\\][^/\\]+[/\\])?state\.json$/;

/**
 * Maximum age (ms) of a workflow_history entry to consider for remediation.
 * Entries older than this are considered stale and skipped.
 */
const STALENESS_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Dispatcher-compatible check function.
 *
 * SPECIAL CASE: This hook reads fresh state from disk and writes back itself.
 * It does NOT use ctx.state because the Write/Edit tool just modified state.json
 * and ctx.state may be stale. Returns stateModified: false so the dispatcher
 * does NOT overwrite state.json with its own (possibly stale) copy.
 *
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stateModified: false }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow', stateModified: false };
        }

        // Guard: only process Write and Edit tool results
        if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
            return { decision: 'allow', stateModified: false };
        }

        const toolInput = input.tool_input || {};
        const filePath = toolInput.file_path || toolInput.filePath || '';

        // Guard: only process state.json writes
        if (!STATE_JSON_PATTERN.test(filePath)) {
            return { decision: 'allow', stateModified: false };
        }

        debugLog('workflow-completion-enforcer: state.json write detected:', filePath);

        // Read FRESH state from disk (not ctx.state which may be stale)
        let state;
        try {
            state = readState();
        } catch (e) {
            debugLog('workflow-completion-enforcer: could not read state:', e.message);
            return { decision: 'allow', stateModified: false };
        }

        if (!state) {
            return { decision: 'allow', stateModified: false };
        }

        // Guard: if active_workflow is still present, no transition happened
        if (state.active_workflow) {
            return { decision: 'allow', stateModified: false };
        }

        // Guard: need workflow_history with at least one entry
        if (!state.workflow_history || !Array.isArray(state.workflow_history) || state.workflow_history.length === 0) {
            return { decision: 'allow', stateModified: false };
        }

        // Get last workflow_history entry
        const lastEntry = state.workflow_history[state.workflow_history.length - 1];
        if (!lastEntry) {
            return { decision: 'allow', stateModified: false };
        }

        // Guard: check staleness — only remediate recent entries
        const entryTimestamp = lastEntry.completed_at || lastEntry.cancelled_at;
        if (entryTimestamp) {
            const entryTime = new Date(entryTimestamp).getTime();
            const now = Date.now();
            if (isNaN(entryTime) || (now - entryTime) > STALENESS_THRESHOLD_MS) {
                debugLog('workflow-completion-enforcer: entry is stale, skipping');
                return { decision: 'allow', stateModified: false };
            }
        }

        // Guard: if already has both phase_snapshots AND metrics, nothing to do
        if (
            Array.isArray(lastEntry.phase_snapshots) &&
            lastEntry.metrics && typeof lastEntry.metrics === 'object' &&
            Object.keys(lastEntry.metrics).length > 0
        ) {
            return { decision: 'allow', stateModified: false };
        }

        debugLog('workflow-completion-enforcer: auto-remediating missing snapshots/metrics');

        // Reconstruct temporary active_workflow for collectPhaseSnapshots()
        // Priority: entry.phases > Object.keys(state.phases) > empty
        // Note (REQ-0011): After adaptive sizing, entry.phases may be shorter
        // than the original workflow definition. This is correct -- we iterate
        // whatever phases the workflow actually used, not the full definition.
        let phasesArray = [];
        if (Array.isArray(lastEntry.phases) && lastEntry.phases.length > 0) {
            phasesArray = lastEntry.phases;
        } else if (state.phases && typeof state.phases === 'object') {
            phasesArray = Object.keys(state.phases);
        }

        // REQ-0011: Preserve sizing record in workflow_history entry if present
        const sizingRecord = lastEntry.sizing || null;

        // Temporarily set active_workflow so collectPhaseSnapshots can read it
        // REQ-0011: Include sizing if present (variable-length phase support)
        state.active_workflow = {
            phases: phasesArray,
            started_at: lastEntry.started_at || null,
            completed_at: lastEntry.completed_at || lastEntry.cancelled_at || null,
            sizing: sizingRecord
        };

        // Collect snapshots
        const { phase_snapshots, metrics } = collectPhaseSnapshots(state);

        // Restore active_workflow to null
        state.active_workflow = null;

        // Patch last entry
        lastEntry.phase_snapshots = phase_snapshots;
        lastEntry.metrics = metrics;

        // REQ-0022 FR-006: Regression tracking
        try {
            const { computeRollingAverage, detectRegression } = require('./lib/performance-budget.cjs');

            if (metrics && typeof metrics.total_duration_minutes === 'number' && metrics.total_duration_minutes > 0) {
                // Determine intensity for this workflow
                const intensity = lastEntry.sizing?.effective_intensity || 'standard';

                // Compute rolling average from PRIOR entries (exclude current)
                const priorHistory = (state.workflow_history || []).slice(0, -1);
                const rollingAvg = computeRollingAverage(priorHistory, intensity, 5);

                // Detect regression
                const regression = detectRegression(metrics.total_duration_minutes, rollingAvg, 0.20);

                if (regression) {
                    // Find slowest phase from snapshots
                    let slowestPhase = 'unknown';
                    let slowestDuration = 0;
                    for (const snap of phase_snapshots) {
                        const wcm = snap.timing?.wall_clock_minutes;
                        if (typeof wcm === 'number' && wcm > slowestDuration) {
                            slowestDuration = wcm;
                            slowestPhase = snap.key;
                        }
                    }

                    lastEntry.regression_check = {
                        ...regression,
                        slowest_phase: slowestPhase
                    };

                    // Emit regression warning to stderr (NFR-005)
                    if (regression.regressed) {
                        console.error(
                            `PERFORMANCE_REGRESSION: Current workflow took ${regression.current_minutes}m ` +
                            `(${intensity} average: ${regression.baseline_avg_minutes}m, ` +
                            `${regression.percent_over}% over). Slowest phase: ${slowestPhase} (${slowestDuration}m)`
                        );
                    }
                }
            }
        } catch (regressionErr) {
            // Fail-open: regression errors must never block workflow completion (NFR-001)
            debugLog('workflow-completion-enforcer: regression check error:', regressionErr.message);
        }

        // Build archive record BEFORE prune (prune compacts git_branch, losing status)
        // Archive-first ordering: capture pre-prune data, write to archive, then prune state
        let archiveRecord = null;
        try {
            const lastEntryForArchive = state.workflow_history[state.workflow_history.length - 1];
            if (lastEntryForArchive) {
                archiveRecord = {
                    source_id: lastEntryForArchive.id || null,
                    slug: lastEntryForArchive.artifact_folder || null,
                    workflow_type: lastEntryForArchive.type || null,
                    completed_at: lastEntryForArchive.completed_at || lastEntryForArchive.cancelled_at || new Date().toISOString(),
                    branch: lastEntryForArchive.git_branch?.name || null,
                    outcome: lastEntryForArchive.status === 'cancelled' ? 'cancelled'
                           : lastEntryForArchive.git_branch?.status === 'merged' ? 'merged'
                           : 'completed',
                    reason: lastEntryForArchive.cancellation_reason || null,
                    phase_summary: (lastEntryForArchive.phase_snapshots || []).map(s => ({
                        phase: s.key || s.phase,
                        status: s.status,
                        summary: s.summary || null
                    })),
                    metrics: lastEntryForArchive.metrics || {}
                };
            }
        } catch (recordErr) {
            debugLog('workflow-completion-enforcer: archive record build error:', recordErr.message);
        }

        // Write archive record to disk FIRST (FR-010, GH-39)
        try {
            if (archiveRecord) {
                appendToArchive(archiveRecord);
            }
        } catch (archiveErr) {
            debugLog('workflow-completion-enforcer: archive error:', archiveErr.message);
        }

        // Apply pruning (BUG-0004, GH-39)
        pruneSkillUsageLog(state, 50);
        pruneCompletedPhases(state, []);
        pruneHistory(state, 100, 200);
        pruneWorkflowHistory(state, 50, 200);
        clearTransientFields(state);

        // Write back to disk (this hook manages its own I/O)
        writeState(state);

        // Log and notify
        logHookEvent('workflow-completion-enforcer', 'self-heal', {
            action: 'remediated_missing_snapshots',
            phases_count: phase_snapshots.length,
            metrics_summary: `${metrics.phases_completed}/${metrics.total_phases} phases completed`
        });

        outputSelfHealNotification(
            'workflow-completion-enforcer',
            `Added ${phase_snapshots.length} phase snapshots and metrics to workflow_history entry`
        );

        // NEVER produce stdout output; stateModified: false because we wrote ourselves
        return { decision: 'allow', stateModified: false };

    } catch (error) {
        debugLog('workflow-completion-enforcer: error:', error.message);
        return { decision: 'allow', stateModified: false };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            // This hook manages its own state I/O, so we just call check
            const ctx = { input, state: null, manifest: null, requirements: null, workflows: null };
            check(ctx);

            // NEVER produce stdout output
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
