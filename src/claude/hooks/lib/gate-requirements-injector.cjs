/**
 * Gate Requirements Injector
 * ==========================
 * Builds a formatted text block summarizing gate requirements for a given phase.
 * Used by pre-task hooks to inject gate context into agent prompts.
 *
 * Traces to: REQ-0024 (Gate Requirements Pre-Injection)
 *
 * Design principles:
 * - Fail-open: every function wraps in try/catch, returns default on error
 * - Top-level buildGateRequirementsBlock catches all and returns ''
 * - Dual-path config loading: src/claude/hooks/config/ first, .claude/hooks/config/ fallback
 *
 * Version: 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import shared coverage threshold resolver (BUG-0054-GH-52)
let resolveCoverageThreshold;
try {
    resolveCoverageThreshold = require('./common.cjs').resolveCoverageThreshold;
} catch (_e) {
    // Fail-open: if common.cjs is not available, use inline fallback
    resolveCoverageThreshold = function(minCov, _state) {
        if (minCov == null) return null;
        if (typeof minCov === 'number') return minCov;
        if (typeof minCov === 'object' && !Array.isArray(minCov)) {
            return minCov['standard'] ?? 80;
        }
        return 80;
    };
}

// =========================================================================
// Phase Name Mapping (hardcoded per design spec)
// =========================================================================

const PHASE_NAME_MAP = {
    '00-quick-scan': 'Quick Scan',
    '01-requirements': 'Requirements',
    '02-impact-analysis': 'Impact Analysis',
    '02-tracing': 'Tracing',
    '03-architecture': 'Architecture',
    '04-design': 'Design',
    '05-test-strategy': 'Test Strategy',
    '06-implementation': 'Implementation',
    '07-testing': 'Testing',
    '08-code-review': 'Code Review',
    '16-quality-loop': 'Quality Loop'
};

// =========================================================================
// Internal Helpers
// =========================================================================

/**
 * Reads a JSON config file from dual paths:
 *   1. {projectRoot}/src/claude/hooks/config/{filename}  (source of truth)
 *   2. {projectRoot}/.claude/hooks/config/{filename}     (runtime fallback)
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} filename - Config file name (e.g. 'iteration-requirements.json')
 * @returns {object|null} Parsed JSON or null on failure
 */
function loadConfigFile(projectRoot, filename) {
    try {
        const srcPath = path.join(projectRoot, 'src', 'claude', 'hooks', 'config', filename);
        if (fs.existsSync(srcPath)) {
            return JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        }
    } catch (_e) {
        // Fall through to fallback path
    }
    try {
        const fallbackPath = path.join(projectRoot, '.claude', 'hooks', 'config', filename);
        if (fs.existsSync(fallbackPath)) {
            return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        }
    } catch (_e) {
        // Return null
    }
    return null;
}

/**
 * Loads iteration-requirements.json from the dual config path.
 * @param {string} projectRoot
 * @returns {object|null}
 */
function loadIterationRequirements(projectRoot) {
    try {
        return loadConfigFile(projectRoot, 'iteration-requirements.json');
    } catch (_e) {
        return null;
    }
}

/**
 * Loads artifact-paths.json from the dual config path.
 * @param {string} projectRoot
 * @returns {object|null}
 */
function loadArtifactPaths(projectRoot) {
    try {
        return loadConfigFile(projectRoot, 'artifact-paths.json');
    } catch (_e) {
        return null;
    }
}

/**
 * Parses constitution.md for article headers.
 * Regex: /^### Article ([IVXLC]+):\s*(.+)$/gm
 * @param {string} projectRoot
 * @returns {object} Map of article ID (e.g. 'I') to title (e.g. 'Specification Primacy')
 */
function parseConstitutionArticles(projectRoot) {
    try {
        const constitutionPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
        if (!fs.existsSync(constitutionPath)) {
            return {};
        }
        const content = fs.readFileSync(constitutionPath, 'utf8');
        const regex = /^### Article ([IVXLC]+):\s*(.+)$/gm;
        const articles = {};
        let match;
        while ((match = regex.exec(content)) !== null) {
            articles[match[1]] = match[2].trim();
        }
        return articles;
    } catch (_e) {
        return {};
    }
}

/**
 * Loads workflow modifiers from .isdlc/config/workflows.json.
 * Path: workflows[workflowType].agent_modifiers[phaseKey]
 * @param {string} projectRoot
 * @param {string} workflowType - e.g. 'feature', 'fix'
 * @param {string} phaseKey - e.g. '06-implementation'
 * @returns {object|null}
 */
function loadWorkflowModifiers(projectRoot, workflowType, phaseKey) {
    try {
        if (!workflowType || !phaseKey) return null;

        const workflowsPath = path.join(projectRoot, '.isdlc', 'config', 'workflows.json');
        if (!fs.existsSync(workflowsPath)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(workflowsPath, 'utf8'));
        const workflow = data && data.workflows && data.workflows[workflowType];
        if (!workflow || !workflow.agent_modifiers) return null;
        return workflow.agent_modifiers[phaseKey] || null;
    } catch (_e) {
        return null;
    }
}

/**
 * Replaces {key} placeholders in a path string with provided variable values.
 * @param {string} pathStr - Path with optional {key} placeholders
 * @param {object|null} vars - Map of key to replacement value
 * @returns {string} Path with placeholders resolved (unchanged if no match)
 */
function resolveTemplateVars(pathStr, vars) {
    try {
        if (!vars || typeof vars !== 'object') return pathStr;
        let result = pathStr;
        for (const [key, value] of Object.entries(vars)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        return result;
    } catch (_e) {
        return pathStr;
    }
}

/**
 * Recursively merges two objects. Overrides win for scalar values, arrays concatenate.
 * Does not mutate inputs.
 * @param {object} base
 * @param {object} overrides
 * @returns {object}
 */
function deepMerge(base, overrides) {
    try {
        const result = Object.assign({}, base);
        for (const key of Object.keys(overrides)) {
            const baseVal = base[key];
            const overVal = overrides[key];

            if (Array.isArray(baseVal) && Array.isArray(overVal)) {
                // Arrays concatenate
                result[key] = [...baseVal, ...overVal];
            } else if (
                baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal) &&
                overVal !== null && typeof overVal === 'object' && !Array.isArray(overVal)
            ) {
                // Recurse for nested objects
                result[key] = deepMerge(baseVal, overVal);
            } else {
                // Scalar override wins
                result[key] = overVal;
            }
        }
        return result;
    } catch (_e) {
        return base || {};
    }
}

/**
 * Derives imperative constraint statements from phase configuration.
 * Returns an array of short prohibition strings for the CRITICAL CONSTRAINTS section.
 *
 * Traces to: BUG-0028 / GH-64 (FR-001, FR-002)
 *
 * @param {string} phaseKey - e.g. '06-implementation'
 * @param {object} phaseReq - Phase requirements from iteration-requirements.json
 * @param {object|null} workflowModifiers - Workflow-specific agent modifiers
 * @param {boolean} isIntermediatePhase - true if not the final phase in the workflow
 * @param {object|null} [state] - Current state.json for intensity resolution (BUG-0054-GH-52)
 * @returns {string[]} Array of constraint strings (empty array if no constraints apply)
 */
function buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediatePhase, state) {
    try {
        const constraints = [];

        // 1. Git commit prohibition for intermediate phases
        if (isIntermediatePhase) {
            constraints.push('Do NOT run git commit -- the orchestrator manages all commits.');
        }

        // 2. Test iteration gate constraint
        // BUG-0054-GH-52: Resolve intensity-aware coverage threshold
        const testIter = phaseReq.test_iteration || {};
        if (testIter.enabled) {
            const rawCoverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent);
            const coverage = resolveCoverageThreshold(rawCoverage, state) || 80;
            constraints.push(`Do NOT advance the gate until all tests pass with >= ${coverage}% coverage.`);
        }

        // 3. Constitutional validation constraint
        const constVal = phaseReq.constitutional_validation || {};
        if (constVal.enabled) {
            constraints.push('Constitutional validation MUST complete before gate advancement.');
        }

        // 4. Artifact validation constraint
        const artVal = phaseReq.artifact_validation || {};
        if (artVal.enabled && artVal.paths && artVal.paths.length > 0) {
            constraints.push('Required artifacts MUST exist before gate advancement.');
        }

        // 5. Workflow modifier constraints
        if (workflowModifiers && typeof workflowModifiers === 'object') {
            if (workflowModifiers.require_failing_test_first) {
                constraints.push('You MUST write a failing test before implementing the fix.');
            }
        }

        return constraints;
    } catch (_e) {
        return [];
    }
}

/**
 * Builds a reminder footer from constraint strings.
 * Returns 'REMINDER: {constraint1} {constraint2} ...' or '' if no constraints.
 *
 * Traces to: BUG-0028 / GH-64 (FR-001)
 *
 * @param {string[]} constraints - Array of constraint strings from buildCriticalConstraints
 * @returns {string} Reminder line or empty string
 */
function buildConstraintReminder(constraints) {
    try {
        if (!Array.isArray(constraints) || constraints.length === 0) {
            return '';
        }
        return 'REMINDER: ' + constraints.join(' ');
    } catch (_e) {
        return '';
    }
}

/**
 * Builds the formatted text block for gate requirements.
 *
 * @param {string} phaseKey - e.g. '06-implementation'
 * @param {object} phaseReq - Phase requirements from iteration-requirements.json
 * @param {string[]} resolvedPaths - Resolved artifact paths
 * @param {object} articleMap - Map of article ID to title
 * @param {object|null} workflowModifiers - Workflow-specific agent modifiers
 * @param {boolean} [isIntermediatePhase] - true if not the final phase (defaults to true, fail-safe)
 * @param {object|null} [state] - Current state.json for intensity resolution (BUG-0054-GH-52)
 * @returns {string} Formatted text block
 */
function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers, isIntermediatePhase, state) {
    try {
        const phaseNum = phaseKey.split('-')[0];
        const phaseName = PHASE_NAME_MAP[phaseKey] || 'Unknown';
        const lines = [];

        // Default isIntermediatePhase to true (fail-safe: assume intermediate)
        const isIntermediate = (isIntermediatePhase !== undefined) ? isIntermediatePhase : true;

        // Build critical constraints (BUG-0054-GH-52: pass state for intensity resolution)
        const constraints = buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediate, state);

        // CRITICAL CONSTRAINTS section (only if constraints exist)
        if (constraints.length > 0) {
            lines.push('========================================');
            lines.push(`CRITICAL CONSTRAINTS FOR PHASE ${phaseNum} (${phaseName}):`);
            for (const c of constraints) {
                lines.push(`- ${c}`);
            }
            lines.push('========================================');
            lines.push('');
        }

        // Header (retained for backward compatibility with includes() checks)
        lines.push(`GATE REQUIREMENTS FOR PHASE ${phaseNum} (${phaseName}):`);
        lines.push('');

        // Iteration Requirements section
        lines.push('Iteration Requirements:');

        // test_iteration
        // BUG-0054-GH-52: Resolve intensity-aware coverage threshold for display
        const testIter = phaseReq.test_iteration || {};
        if (testIter.enabled) {
            const maxIter = testIter.max_iterations || 'N/A';
            const rawCoverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent);
            const coverage = resolveCoverageThreshold(rawCoverage, state) || 'N/A';
            lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverage}%)`);
        } else {
            lines.push('  - test_iteration: disabled');
        }

        // constitutional_validation
        const constVal = phaseReq.constitutional_validation || {};
        if (constVal.enabled) {
            const articles = (constVal.articles || []).join(', ');
            const maxIter = constVal.max_iterations || 'N/A';
            lines.push(`  - constitutional_validation: enabled (Articles: ${articles}, max ${maxIter} iterations)`);
        } else {
            lines.push('  - constitutional_validation: disabled');
        }

        // interactive_elicitation
        const interElicit = phaseReq.interactive_elicitation || {};
        lines.push(`  - interactive_elicitation: ${interElicit.enabled ? 'enabled' : 'disabled'}`);

        // agent_delegation
        const agentDel = phaseReq.agent_delegation_validation || {};
        lines.push(`  - agent_delegation: ${agentDel.enabled ? 'enabled' : 'disabled'}`);

        // artifact_validation
        const artVal = phaseReq.artifact_validation || {};
        lines.push(`  - artifact_validation: ${artVal.enabled ? 'enabled' : 'disabled'}`);

        // Required Artifacts section (only if paths exist)
        if (resolvedPaths && resolvedPaths.length > 0) {
            lines.push('');
            lines.push('Required Artifacts:');
            for (const p of resolvedPaths) {
                lines.push(`  - ${p}`);
            }
        }

        // Constitutional Articles section (only if enabled and articles exist)
        if (constVal.enabled && constVal.articles && constVal.articles.length > 0 && articleMap && Object.keys(articleMap).length > 0) {
            lines.push('');
            lines.push('Constitutional Articles to Validate:');
            for (const artId of constVal.articles) {
                const title = articleMap[artId] || 'Unknown';
                lines.push(`  - Article ${artId}: ${title}`);
            }
        }

        // Workflow Modifiers section (only if modifiers exist)
        if (workflowModifiers && typeof workflowModifiers === 'object' && Object.keys(workflowModifiers).length > 0) {
            lines.push('');
            lines.push('Workflow Modifiers:');
            lines.push(`  ${JSON.stringify(workflowModifiers)}`);
        }

        // Constraint reminder footer (replaces generic footer when constraints exist)
        lines.push('');
        if (constraints.length > 0) {
            lines.push(buildConstraintReminder(constraints));
        }
        // Always include the generic footer (backward compatibility)
        lines.push('DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.');

        return lines.join('\n');
    } catch (_e) {
        return '';
    }
}

// =========================================================================
// Main Export
// =========================================================================

/**
 * Builds a formatted gate requirements block for the given phase.
 *
 * @param {string} phaseKey - e.g. '06-implementation'
 * @param {string} artifactFolder - e.g. 'REQ-0024-gate-requirements-pre-injection'
 * @param {string} [workflowType] - e.g. 'feature', 'fix'
 * @param {string} [projectRoot] - Absolute path (defaults to process.cwd())
 * @param {string[]} [phases] - Workflow phases array from state.json (optional, defaults to null -> fail-safe)
 * @param {object|null} [state] - Current state.json for intensity resolution (BUG-0054-GH-52)
 * @returns {string} Formatted text block or '' on error (fail-open)
 */
function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot, phases, state) {
    try {
        const root = projectRoot || process.cwd();

        // Phase key validation
        if (!phaseKey || typeof phaseKey !== 'string') return '';

        // Load iteration requirements
        const iterReq = loadIterationRequirements(root);
        if (!iterReq || !iterReq.phase_requirements) return '';

        // Look up phase-specific requirements
        const phaseReq = iterReq.phase_requirements[phaseKey];
        if (!phaseReq) return '';

        // Load artifact paths
        const artifactPathsConfig = loadArtifactPaths(root);
        let resolvedPaths = [];
        if (artifactPathsConfig && artifactPathsConfig.phases && artifactPathsConfig.phases[phaseKey]) {
            const rawPaths = artifactPathsConfig.phases[phaseKey].paths || [];
            const vars = { artifact_folder: artifactFolder || '' };
            resolvedPaths = rawPaths.map(p => resolveTemplateVars(p, vars));
        }

        // Also check artifact_validation.paths in iteration requirements
        if (phaseReq.artifact_validation && phaseReq.artifact_validation.enabled && phaseReq.artifact_validation.paths) {
            const vars = { artifact_folder: artifactFolder || '' };
            const iterPaths = phaseReq.artifact_validation.paths.map(p => resolveTemplateVars(p, vars));
            // Merge, avoiding duplicates
            for (const ip of iterPaths) {
                if (!resolvedPaths.includes(ip)) {
                    resolvedPaths.push(ip);
                }
            }
        }

        // Parse constitution articles
        const articleMap = parseConstitutionArticles(root);

        // Load workflow modifiers
        const workflowMods = loadWorkflowModifiers(root, workflowType, phaseKey);

        // Determine if this is an intermediate phase
        let isIntermediatePhase = true; // fail-safe default
        if (Array.isArray(phases) && phases.length > 0) {
            const lastPhase = phases[phases.length - 1];
            isIntermediatePhase = (phaseKey !== lastPhase);
        }

        // Build and return the formatted block (BUG-0054-GH-52: pass state for intensity resolution)
        return formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowMods, isIntermediatePhase, state);
    } catch (_e) {
        return '';
    }
}

// =========================================================================
// Module Exports
// =========================================================================

module.exports = {
    buildGateRequirementsBlock,
    // Export internal helpers for direct unit testing
    loadIterationRequirements,
    loadArtifactPaths,
    parseConstitutionArticles,
    loadWorkflowModifiers,
    resolveTemplateVars,
    deepMerge,
    formatBlock,
    buildCriticalConstraints,
    buildConstraintReminder
};
