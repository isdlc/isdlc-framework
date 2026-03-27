#!/usr/bin/env node
/**
 * iSDLC Plan Surfacer - PreToolUse[Task] Hook
 * =============================================
 * Blocks delegation to implementation+ phases when the task plan
 * (docs/isdlc/tasks.md) has not been generated.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-02, AC-02, AC-02a, AC-02b, AC-02c, FR-08, AC-08a, AC-08b, AC-08c
 * Version: 2.0.0
 */

const {
    debugLog,
    logHookEvent,
    resolveTasksPath,
    PHASE_PREFIXES
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
 * Phases that do NOT require a task plan.
 * Any phase not in this set requires the plan to exist.
 */
const EARLY_PHASES = new Set([
    '00-quick-scan',
    '01-requirements',
    '02-impact-analysis',
    '02-tracing',
    '03-architecture',
    '04-design'
]);

/**
 * Optional format validation for tasks.md v2.0.
 * Returns an array of warning strings (empty = no issues).
 * NEVER throws -- all errors are caught and logged.
 *
 * @param {string} tasksPath - Absolute path to tasks.md
 * @param {object} state - Parsed state.json
 * @returns {string[]} Array of warning messages
 * Traces: AC-08b, AC-08c
 */
function validateTasksFormat(tasksPath, state) {
    const warnings = [];

    try {
        const content = fs.readFileSync(tasksPath, 'utf8');

        // Check 1: Is this a v2.0 format file?
        const hasV2Header = /^Format:\s*v2\.0/m.test(content);
        if (!hasV2Header) {
            // Not a v2.0 file -- skip all format validation
            // This ensures backward compatibility: v1.0 files are never warned about (AC-08a, NFR-02)
            return [];
        }

        // Check 2: Does Phase 06 section exist?
        const phase06Match = content.match(
            /^## Phase \d+:.*Implementation/m
        );
        if (!phase06Match) {
            warnings.push(
                'Phase 06 (Implementation) section not found in tasks.md'
            );
            return warnings;
        }

        // Check 3: Do Phase 06 tasks have file-level annotations?
        // Extract Phase 06 section content
        const phase06Start = content.indexOf(phase06Match[0]);
        const nextPhaseMatch = content.substring(phase06Start + 1).match(/^## /m);
        const phase06End = nextPhaseMatch
            ? phase06Start + 1 + nextPhaseMatch.index
            : content.length;
        const phase06Content = content.substring(phase06Start, phase06End);

        // Check for files: sub-lines
        const hasFileAnnotations = /^\s{2}files:/m.test(phase06Content);
        if (!hasFileAnnotations) {
            warnings.push(
                'Phase 06 tasks lack file-level annotations (files: sub-lines). ' +
                'The task refinement step may not have run. ' +
                'The software-developer agent will self-decompose work.'
            );
        }

        // Check 4: Do Phase 06 tasks have traceability annotations?
        const taskLines = phase06Content.match(/^- \[[ XBLOCKED]*\] T\d{4}/gm) || [];
        const tracedTasks = phase06Content.match(/\| traces:/gm) || [];
        if (taskLines.length > 0 && tracedTasks.length === 0) {
            warnings.push(
                'Phase 06 tasks have no traceability annotations (| traces:). ' +
                'Traceability will be limited.'
            );
        }

        // Check 5: Optional -- dependency cycle detection
        // Only if Dependency Graph section exists
        if (content.includes('## Dependency Graph')) {
            const cycleWarning = detectCyclesInDependencyGraph(content);
            if (cycleWarning) {
                warnings.push(cycleWarning);
            }
        }

    } catch (error) {
        // Fail-open: log error but return no warnings (Article X)
        debugLog('Format validation error:', error.message);
    }

    return warnings;
}

/**
 * Optional cycle detection on the dependency graph.
 * Parses blocked_by sub-lines and runs Kahn's algorithm.
 * Returns a warning string if cycle detected, null otherwise.
 *
 * Performance: O(V+E) where V = tasks, E = dependency edges.
 * For typical projects (< 50 tasks, < 100 edges): < 5ms.
 *
 * @param {string} content - Full tasks.md content
 * @returns {string|null} Warning message or null
 * Traces: FR-03, AC-03c
 */
function detectCyclesInDependencyGraph(content) {
    try {
        // Parse all tasks and their IDs
        const taskPattern = /^- \[[ XBLOCKED]*\] (T\d{4})/gm;
        const tasks = new Set();
        let match;
        while ((match = taskPattern.exec(content)) !== null) {
            tasks.add(match[1]);
        }

        if (tasks.size === 0) {
            return null;  // No tasks to validate
        }

        // Build adjacency list and in-degree map
        const inDegree = {};
        const graph = {};
        for (const tid of tasks) {
            inDegree[tid] = 0;
            graph[tid] = [];
        }

        // Parse task blocks with their sub-lines (greedy match for 2-space-indented lines)
        const taskBlocks = content.match(
            /^- \[[ XBLOCKED]*\] (T\d{4}).*(?:\n {2}.+)*/gm
        ) || [];

        for (const block of taskBlocks) {
            const tidMatch = block.match(/^- \[[ XBLOCKED]*\] (T\d{4})/);
            if (!tidMatch) continue;
            const tid = tidMatch[1];

            const bbMatch = block.match(/^\s{2}blocked_by:\s*\[([^\]]+)\]/m);
            if (!bbMatch) continue;

            const blockers = bbMatch[1].split(',').map(s => s.trim());
            for (const blocker of blockers) {
                if (tasks.has(blocker)) {
                    graph[blocker].push(tid);
                    inDegree[tid] = (inDegree[tid] || 0) + 1;
                }
            }
        }

        // Kahn's algorithm for topological sort / cycle detection
        const queue = [];
        for (const tid of tasks) {
            if (inDegree[tid] === 0) queue.push(tid);
        }

        let processed = 0;
        while (queue.length > 0) {
            const current = queue.shift();
            processed++;
            for (const dep of (graph[current] || [])) {
                inDegree[dep]--;
                if (inDegree[dep] === 0) queue.push(dep);
            }
        }

        if (processed < tasks.size) {
            const cycleNodes = [...tasks].filter(t => inDegree[t] > 0);
            return `Dependency cycle detected involving tasks: ${cycleNodes.join(', ')}. ` +
                'The dependency graph may have been generated incorrectly.';
        }

        return null;  // No cycle

    } catch (error) {
        debugLog('Cycle detection error:', error.message);
        return null;  // Fail-open
    }
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow'|'block', stopReason?: string, stderr?: string, stdout?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        if (input.tool_name !== 'Task') {
            return { decision: 'allow' };
        }

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        if (!state.active_workflow) {
            debugLog('No active workflow, allowing');
            return { decision: 'allow' };
        }

        const currentPhase = state.active_workflow.current_phase;
        if (!currentPhase) {
            debugLog('No current phase, allowing');
            return { decision: 'allow' };
        }

        // Early phases do not require a plan
        if (EARLY_PHASES.has(currentPhase)) {
            debugLog('Early phase', currentPhase, '- plan not required');
            return { decision: 'allow' };
        }

        // Check if tasks.md exists
        const tasksPath = resolveTasksPath();
        if (!fs.existsSync(tasksPath)) {
            // Block: implementation+ phase without task plan
            logHookEvent('plan-surfacer', 'block', {
                phase: currentPhase,
                reason: `No tasks.md found at ${tasksPath}`
            });

            const stopReason =
                `TASK PLAN NOT GENERATED: The current phase '${currentPhase}' requires ` +
                `a task plan (docs/isdlc/tasks.md) to exist before proceeding. ` +
                `No plan was found.\n\n` +
                `The task plan provides user visibility into the project roadmap and ` +
                `phase breakdown. Without it, the user cannot see what work is planned.\n\n` +
                `To fix this:\n` +
                `1. Run the generate-plan skill (ORCH-012) to create the task plan\n` +
                `2. Or manually create docs/isdlc/tasks.md with the phase breakdown\n\n` +
                `Expected path: ${tasksPath}`;

            return { decision: 'block', stopReason };
        }

        // === NEW: Optional format validation (warning only, AC-08b, AC-08c) ===
        if (currentPhase === PHASE_PREFIXES.IMPLEMENTATION) {
            const warnings = validateTasksFormat(tasksPath, state);
            if (warnings.length > 0) {
                const warningText = warnings.join('\n');
                debugLog('Format validation warnings:', warningText);
                logHookEvent('plan-surfacer', 'format-validation-warning', {
                    phase: currentPhase,
                    warnings: warnings
                });
                // Return allow WITH stderr warning (never block, AC-08c)
                return {
                    decision: 'allow',
                    stderr: `[plan-surfacer] Format warnings:\n${warningText}`
                };
            }
        }
        // === END NEW ===

        debugLog('Task plan exists at', tasksPath);
        return { decision: 'allow' };

    } catch (error) {
        debugLog('Error in plan-surfacer:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) {
                process.exit(0);
            }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) {
                console.error(result.stderr);
            }
            if (result.stdout) {
                console.log(result.stdout);
            }
            if (result.decision === 'block' && result.stopReason) {
                const { outputBlockResponse } = require('./lib/common.cjs');
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}
