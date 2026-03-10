/**
 * iSDLC Skill Enforcement - Common Utilities
 * ===========================================
 * Shared functions for skill validation hooks
 * Cross-platform Node.js implementation
 *
 * Version: 3.0.0
 * Monorepo support: state routing, project isolation
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect if the framework is running within an Antigravity environment.
 * @returns {boolean} True if Antigravity is detected
 */
function isAntigravity() {
    return process.env.ANTIGRAVITY_AGENT === '1';
}

/**
 * Get the platform-specific configuration directory name.
 * @returns {string} '.antigravity' or '.claude'
 */
function getFrameworkDir() {
    return isAntigravity() ? '.antigravity' : '.claude';
}

/**
 * Get the skills directory path for the current environment.
 * @param {string} projectRoot - The project root path
 * @returns {string} Path to skills directory
 */
function getSkillsDir(projectRoot) {
    return path.join(projectRoot, getFrameworkDir(), 'skills');
}

/**
 * Get the hooks configuration directory path.
 * @param {string} projectRoot - The project root path
 * @returns {string} Path to hooks config directory
 */
function getHooksConfigDir(projectRoot) {
    return path.join(projectRoot, getFrameworkDir(), 'hooks', 'config');
}

/**
 * Get the hooks schema directory path.
 * @param {string} projectRoot - The project root path
 * @returns {string} Path to hooks schema directory
 */
function getHooksSchemaDir(projectRoot) {
    return path.join(getHooksConfigDir(projectRoot), 'schemas');
}

// =========================================================================
// Per-Process Caching (REQ-0020: T6 Hook I/O Optimization)
// =========================================================================

/**
 * Cached project root path. Set on first getProjectRoot() call.
 * Per-process lifetime -- garbage-collected when process exits.
 * @type {string|null}
 */
let _cachedProjectRoot = null;

/**
 * The CLAUDE_PROJECT_DIR value at the time of caching.
 * Used to detect env var changes (important for test environments).
 * @type {string|undefined}
 */
let _cachedProjectDirEnv = undefined;

/**
 * Config file cache. Key: "{projectRoot}:{configFileName}".
 * Value: { mtimeMs: number, data: object }.
 * Per-process lifetime -- garbage-collected when process exits.
 * @type {Map<string, { mtimeMs: number, data: object }>}
 */
const _configCache = new Map();

/**
 * Cached skill path index. Key: skillID (e.g., "DEV-001").
 * Value: relative path to SKILL.md (e.g., "src/claude/skills/development/code-implementation/SKILL.md").
 * Built by _buildSkillPathIndex(). Per-process lifetime.
 * @type {Map<string, string>|null}
 * Traces to: REQ-0001, FR-008 prerequisite, ADR-0028
 */
let _skillPathIndex = null;

/**
 * Timestamp (ms since epoch) when _skillPathIndex was last built.
 * Used for mtime-based invalidation against the skills directory.
 * @type {number}
 */
let _skillPathIndexBuiltAt = 0;

// =========================================================================
// Phase Prefixes (BUG-0009 item 0.13)
// =========================================================================

/**
 * Centralized phase prefix constants used across hook files.
 * Replaces scattered inline string literals to reduce copy-paste errors
 * when phase naming changes.
 * @type {Readonly<{UPGRADE: string, IMPLEMENTATION: string, REQUIREMENTS: string}>}
 */
const PHASE_PREFIXES = Object.freeze({
    UPGRADE: '15-upgrade',
    IMPLEMENTATION: '06-implementation',
    REQUIREMENTS: '01-requirements'
});

// =========================================================================
// Protected State Fields & Patterns (REQ-HARDENING)
// =========================================================================

/**
 * Regex to match state.json paths (single-project and monorepo, cross-platform).
 * Consolidated from state-write-validator and explore-readonly-enforcer.
 */
const STATE_JSON_PATTERN = /\.isdlc[/\\](?:projects[/\\][^/\\]+[/\\])?state\.json$/;

/**
 * State fields that must NEVER be modified by agents directly.
 * These are governance-critical fields whose values are set by hooks only.
 * @type {ReadonlyArray<string>}
 */
const PROTECTED_STATE_FIELDS = Object.freeze([
    'iteration_enforcement.enabled',
    'iteration_enforcement',
    'chat_explore_active',
    'iteration_config.testing_max',
    'iteration_config.circuit_breaker_threshold',
    'gate_validation.status'
]);

/**
 * Check if a state.json file physically exists on disk (regardless of parse-ability).
 * Differentiates "missing file" (legitimate no-state) from "corrupt file" (exists but unparseable).
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {boolean} True if the file exists on disk
 */
function stateFileExistsOnDisk(projectId) {
    const stateFile = resolveStatePath(projectId);
    return fs.existsSync(stateFile);
}

/**
 * Get project root directory (where .isdlc/ folder exists)
 * @returns {string} Project root path
 */
function getProjectRoot() {
    // FR-002: Return cached value if available (AC-002a, AC-002c)
    // Invalidate cache if CLAUDE_PROJECT_DIR changed since last caching
    if (_cachedProjectRoot !== null) {
        const currentEnv = process.env.CLAUDE_PROJECT_DIR;
        if (currentEnv === _cachedProjectDirEnv) {
            return _cachedProjectRoot;
        }
        // Env changed -- invalidate and re-resolve
        _cachedProjectRoot = null;
        _cachedProjectDirEnv = undefined;
    }

    // AC-002b: CLAUDE_PROJECT_DIR shortcut (existing behavior preserved)
    if (process.env.CLAUDE_PROJECT_DIR) {
        _cachedProjectRoot = process.env.CLAUDE_PROJECT_DIR;
        _cachedProjectDirEnv = process.env.CLAUDE_PROJECT_DIR;
        return _cachedProjectRoot;
    }

    // Fallback: traverse up to find .isdlc folder
    let dir = process.cwd();
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, '.isdlc'))) {
            _cachedProjectRoot = dir;
            _cachedProjectDirEnv = process.env.CLAUDE_PROJECT_DIR;
            return _cachedProjectRoot;
        }
        dir = path.dirname(dir);
    }

    // Default to current directory
    _cachedProjectRoot = process.cwd();
    _cachedProjectDirEnv = process.env.CLAUDE_PROJECT_DIR;
    return _cachedProjectRoot;
}

/**
 * Load a JSON config file with mtime-based caching (FR-001).
 * Cache key: "{projectRoot}:{configName}" for monorepo isolation (AC-001e).
 *
 * @param {string} configPath - Absolute path to the config file
 * @param {string} configName - Short name for cache key (e.g., 'skills-manifest')
 * @returns {object|null} Parsed JSON data or null if file missing/invalid
 */
function _loadConfigWithCache(configPath, configName) {
    const cacheKey = `${getProjectRoot()}:${configName}`;

    try {
        const stat = fs.statSync(configPath);
        const currentMtime = stat.mtimeMs;

        const cached = _configCache.get(cacheKey);
        if (cached && cached.mtimeMs === currentMtime) {
            // AC-001c: mtime unchanged, return cached copy
            debugLog(`Config cache HIT: ${configName}`);
            return cached.data;
        }

        // AC-001a (first load) or AC-001b (mtime changed): read from disk
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        _configCache.set(cacheKey, { mtimeMs: currentMtime, data });
        debugLog(`Config cache MISS: ${configName} (${cached ? 'mtime changed' : 'first load'})`);
        return data;
    } catch (e) {
        // AC-001d: file does not exist or read error -- return null, do NOT cache
        debugLog(`Config cache ERROR: ${configName} -- ${e.code || e.message}`);
        return null;
    }
}

/**
 * Reset all caches. For testing only.
 * @private
 */
function _resetCaches() {
    _cachedProjectRoot = null;
    _cachedProjectDirEnv = undefined;
    _configCache.clear();
    _skillPathIndex = null;
    _skillPathIndexBuiltAt = 0;
}

/**
 * Get cache statistics. For testing only.
 * @private
 * @returns {{ projectRootCached: boolean, configCacheSize: number }}
 */
function _getCacheStats() {
    return {
        projectRootCached: _cachedProjectRoot !== null,
        configCacheSize: _configCache.size
    };
}

// =========================================================================
// Monorepo Support
// =========================================================================

/**
 * Check if this installation is in monorepo mode.
 * Monorepo mode is active when .isdlc/monorepo.json exists.
 * @returns {boolean} True if monorepo mode is active
 */
function isMonorepoMode() {
    const projectRoot = getProjectRoot();
    return fs.existsSync(path.join(projectRoot, '.isdlc', 'monorepo.json'));
}

/**
 * Read and parse monorepo.json
 * @returns {object|null} Parsed monorepo config or null
 */
function readMonorepoConfig() {
    const projectRoot = getProjectRoot();
    const configFile = path.join(projectRoot, '.isdlc', 'monorepo.json');

    if (!fs.existsSync(configFile)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
        return null;
    }
}

/**
 * Write monorepo.json
 * @param {object} config - Monorepo config to write
 * @returns {boolean} Success
 */
function writeMonorepoConfig(config) {
    const projectRoot = getProjectRoot();
    const configFile = path.join(projectRoot, '.isdlc', 'monorepo.json');

    try {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Resolve project ID from current working directory.
 * Matches CWD against registered project paths (longest prefix match).
 * @returns {string|null} Project ID or null if no match
 */
function resolveProjectFromCwd() {
    if (!isMonorepoMode()) {
        return null;
    }

    const config = readMonorepoConfig();
    if (!config || !config.projects) {
        return null;
    }

    const projectRoot = getProjectRoot();
    const cwd = process.cwd();

    // Compute relative path from project root to CWD
    const relativeCwd = path.relative(projectRoot, cwd);
    if (relativeCwd.startsWith('..')) {
        // CWD is outside the project root
        return null;
    }

    // Find longest prefix match among registered project paths
    let bestMatch = null;
    let bestMatchLength = -1;

    for (const [projectId, projectConfig] of Object.entries(config.projects)) {
        const projectPath = projectConfig.path;
        if (!projectPath) continue;

        // Normalize: remove trailing slashes
        const normalizedProjectPath = projectPath.replace(/\/+$/, '');

        // Check if CWD is at or under this project path
        if (relativeCwd === normalizedProjectPath ||
            relativeCwd.startsWith(normalizedProjectPath + '/')) {
            if (normalizedProjectPath.length > bestMatchLength) {
                bestMatch = projectId;
                bestMatchLength = normalizedProjectPath.length;
            }
        }
    }

    return bestMatch;
}

/**
 * Get the active project ID in monorepo mode.
 * Resolution order:
 *   1. ISDLC_PROJECT env var
 *   2. CWD-based project detection
 *   3. monorepo.json default_project
 * @returns {string|null} Project ID or null if not in monorepo mode
 */
function getActiveProject() {
    if (!isMonorepoMode()) {
        return null;
    }

    // 1. Environment variable override
    if (process.env.ISDLC_PROJECT) {
        return process.env.ISDLC_PROJECT;
    }

    // 2. CWD-based project detection
    const cwdProject = resolveProjectFromCwd();
    if (cwdProject) {
        return cwdProject;
    }

    // 3. default_project from monorepo.json
    const config = readMonorepoConfig();
    if (config && config.default_project) {
        return config.default_project;
    }

    return null;
}

/**
 * Resolve the path to state.json, accounting for monorepo mode.
 * - Single project: .isdlc/state.json
 * - Monorepo: .isdlc/projects/{project-id}/state.json
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to state.json
 */
function resolveStatePath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            return path.join(projectRoot, '.isdlc', 'projects', id, 'state.json');
        }
    }

    // Default: single-project mode
    return path.join(projectRoot, '.isdlc', 'state.json');
}

/**
 * Resolve the path to the constitution file, accounting for monorepo mode.
 * In monorepo mode, returns the project-specific override if it exists,
 * otherwise falls back to the shared constitution.
 *
 * New location: docs/isdlc/constitution.md (v3.1.0+)
 * Legacy location: .isdlc/constitution.md (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to the effective constitution.md
 */
function resolveConstitutionPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            // New location (preferred)
            const newProjectConstitution = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'constitution.md');
            if (fs.existsSync(newProjectConstitution)) {
                return newProjectConstitution;
            }
            // Legacy location (fallback)
            const legacyProjectConstitution = path.join(projectRoot, '.isdlc', 'projects', id, 'constitution.md');
            if (fs.existsSync(legacyProjectConstitution)) {
                return legacyProjectConstitution;
            }
            // Default to new location for creation
            return newProjectConstitution;
        }
    }

    // New location (preferred)
    const newPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    // Legacy location (fallback)
    const legacyPath = path.join(projectRoot, '.isdlc', 'constitution.md');
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    // Default to new location for creation
    return newPath;
}

/**
 * Resolve the docs base path for artifacts, accounting for monorepo mode.
 * - Single project: docs/
 * - Monorepo (docs_location="root" or absent): docs/{project-id}/
 * - Monorepo (docs_location="project"): {project-path}/docs/
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to docs base directory
 */
function resolveDocsPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            const config = readMonorepoConfig();
            if (config && config.docs_location === 'project') {
                const project = config.projects && config.projects[id];
                if (project && project.path) {
                    return path.join(projectRoot, project.path, 'docs');
                }
            }
            return path.join(projectRoot, 'docs', id);
        }
    }

    return path.join(projectRoot, 'docs');
}

/**
 * Resolve the path to the external skills directory, accounting for monorepo mode.
 * - Single project: .claude/skills/external/
 * - Monorepo: .isdlc/projects/{project-id}/skills/external/
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to external skills directory
 */
function resolveExternalSkillsPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            return path.join(projectRoot, '.isdlc', 'projects', id, 'skills', 'external');
        }
    }

    return path.join(getSkillsDir(projectRoot), 'external');
}

/**
 * Resolve the path to the external skills manifest, accounting for monorepo mode.
 *
 * New location: docs/isdlc/external-skills-manifest.json (v3.1.0+)
 * Legacy location: .isdlc/external-skills-manifest.json (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to external skills manifest
 */
function resolveExternalManifestPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            // New location (preferred)
            const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'external-skills-manifest.json');
            if (fs.existsSync(newPath)) {
                return newPath;
            }
            // Legacy location (fallback)
            const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'external-skills-manifest.json');
            if (fs.existsSync(legacyPath)) {
                return legacyPath;
            }
            return newPath;
        }
    }

    // New location (preferred)
    const newPath = path.join(projectRoot, 'docs', 'isdlc', 'external-skills-manifest.json');
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    // Legacy location (fallback)
    const legacyPath = path.join(projectRoot, '.isdlc', 'external-skills-manifest.json');
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    return newPath;
}

/**
 * Resolve the path to the skill customization report, accounting for monorepo mode.
 *
 * New location: docs/isdlc/skill-customization-report.md (v3.1.0+)
 * Legacy location: .isdlc/skill-customization-report.md (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to skill customization report
 */
function resolveSkillReportPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            // New location (preferred)
            const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'skill-customization-report.md');
            if (fs.existsSync(newPath)) {
                return newPath;
            }
            // Legacy location (fallback)
            const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'skill-customization-report.md');
            if (fs.existsSync(legacyPath)) {
                return legacyPath;
            }
            return newPath;
        }
    }

    // New location (preferred)
    const newPath = path.join(projectRoot, 'docs', 'isdlc', 'skill-customization-report.md');
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    // Legacy location (fallback)
    const legacyPath = path.join(projectRoot, '.isdlc', 'skill-customization-report.md');
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    return newPath;
}

/**
 * Resolve the path to the tasks plan file, accounting for monorepo mode.
 *
 * New location: docs/isdlc/tasks.md (v3.1.0+)
 * Legacy location: .isdlc/tasks.md (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to tasks.md
 */
function resolveTasksPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'tasks.md');
            if (fs.existsSync(newPath)) {
                return newPath;
            }
            const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'tasks.md');
            if (fs.existsSync(legacyPath)) {
                return legacyPath;
            }
            return newPath;
        }
    }

    const newPath = path.join(projectRoot, 'docs', 'isdlc', 'tasks.md');
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    const legacyPath = path.join(projectRoot, '.isdlc', 'tasks.md');
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    return newPath;
}

/**
 * Resolve the path to the test evaluation report, accounting for monorepo mode.
 *
 * New location: docs/isdlc/test-evaluation-report.md (v3.1.0+)
 * Legacy location: .isdlc/test-evaluation-report.md (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to test-evaluation-report.md
 */
function resolveTestEvaluationPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'test-evaluation-report.md');
            if (fs.existsSync(newPath)) {
                return newPath;
            }
            const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'test-evaluation-report.md');
            if (fs.existsSync(legacyPath)) {
                return legacyPath;
            }
            return newPath;
        }
    }

    const newPath = path.join(projectRoot, 'docs', 'isdlc', 'test-evaluation-report.md');
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    const legacyPath = path.join(projectRoot, '.isdlc', 'test-evaluation-report.md');
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    return newPath;
}

/**
 * Resolve the path to the ATDD checklist, accounting for monorepo mode.
 *
 * New location: docs/isdlc/atdd-checklist.json (v3.1.0+)
 * Legacy location: .isdlc/atdd-checklist.json (fallback for migration)
 *
 * @param {string} [projectId] - Optional project ID override
 * @param {string} [domain] - Optional domain suffix (e.g., "inventory" for atdd-checklist-inventory.json)
 * @returns {string} Absolute path to atdd-checklist.json
 */
function resolveAtddChecklistPath(projectId, domain) {
    const projectRoot = getProjectRoot();
    const filename = domain ? `atdd-checklist-${domain}.json` : 'atdd-checklist.json';

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, filename);
            if (fs.existsSync(newPath)) {
                return newPath;
            }
            const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, filename);
            if (fs.existsSync(legacyPath)) {
                return legacyPath;
            }
            return newPath;
        }
    }

    const newPath = path.join(projectRoot, 'docs', 'isdlc', filename);
    if (fs.existsSync(newPath)) {
        return newPath;
    }

    const legacyPath = path.join(projectRoot, '.isdlc', filename);
    if (fs.existsSync(legacyPath)) {
        return legacyPath;
    }

    return newPath;
}

/**
 * Resolve the path to the iSDLC docs folder, accounting for monorepo mode.
 * This is the base folder for all iSDLC-generated documents.
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to docs/isdlc/ or docs/isdlc/projects/{id}/
 */
function resolveIsdlcDocsPath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            return path.join(projectRoot, 'docs', 'isdlc', 'projects', id);
        }
    }

    return path.join(projectRoot, 'docs', 'isdlc');
}

/**
 * Check if migration from .isdlc/ to docs/isdlc/ is needed.
 * Returns true if legacy files exist but new location doesn't.
 * @returns {boolean} True if migration is needed
 */
function isMigrationNeeded() {
    const projectRoot = getProjectRoot();
    const legacyConstitution = path.join(projectRoot, '.isdlc', 'constitution.md');
    const newConstitution = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');

    return fs.existsSync(legacyConstitution) && !fs.existsSync(newConstitution);
}

/**
 * Load and parse the external skills manifest.
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {object|null} Parsed external manifest or null if not found
 */
function loadExternalManifest(projectId) {
    const manifestPath = resolveExternalManifestPath(projectId);

    if (!fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        // Apply source defaults at read time (FR-001 AC-001-04, REQ-0038)
        if (manifest && Array.isArray(manifest.skills)) {
            for (const skill of manifest.skills) {
                if (!skill.source) {
                    skill.source = 'user';
                }
            }
        }
        return manifest;
    } catch (e) {
        return null;
    }
}

// =========================================================================
// External Skill Management (REQ-0022)
// =========================================================================

/**
 * Keyword-to-phase mapping for smart binding suggestions.
 * Maps skill content keywords to relevant workflow phases.
 * Exported for testability (follows SKILL_KEY_ALIASES, SETUP_COMMAND_KEYWORDS pattern).
 * @type {Object<string, {keywords: string[], phases: string[]}>}
 */
const SKILL_KEYWORD_MAP = {
    testing: {
        keywords: ['test', 'testing', 'coverage', 'assertion', 'mock', 'stub', 'jest', 'mocha'],
        phases: ['05-test-strategy', '06-implementation']
    },
    architecture: {
        keywords: ['architecture', 'design pattern', 'module', 'component', 'system design', 'microservice'],
        phases: ['03-architecture', '04-design']
    },
    devops: {
        keywords: ['deploy', 'ci/cd', 'pipeline', 'docker', 'kubernetes', 'infrastructure'],
        phases: ['10-cicd', '11-local-testing']
    },
    security: {
        keywords: ['security', 'auth', 'authentication', 'encryption', 'owasp', 'vulnerability'],
        phases: ['09-validation']
    },
    implementation: {
        keywords: ['implement', 'code', 'function', 'class', 'api', 'endpoint', 'controller', 'service'],
        phases: ['06-implementation']
    },
    requirements: {
        keywords: ['requirements', 'user story', 'acceptance criteria', 'specification'],
        phases: ['01-requirements']
    },
    review: {
        keywords: ['review', 'quality', 'lint', 'code review', 'static analysis'],
        phases: ['08-code-review']
    }
};

/**
 * Phase-to-agent mapping for resolving agent names from phase keys.
 * Used by suggestBindings() to recommend agents based on phase matches.
 * @type {Object<string, string>}
 */
const PHASE_TO_AGENT_MAP = {
    '01-requirements': 'requirements-analyst',
    '03-architecture': 'solution-architect',
    '04-design': 'system-designer',
    '05-test-strategy': 'test-design-engineer',
    '06-implementation': 'software-developer',
    '07-testing': 'integration-tester',
    '08-code-review': 'qa-engineer',
    '09-validation': 'security-compliance-auditor',
    '10-cicd': 'cicd-engineer',
    '11-local-testing': 'environment-builder',
    '16-quality-loop': 'quality-loop-engineer'
};

/**
 * Validate an external skill file's frontmatter.
 * Checks file existence, extension, YAML frontmatter presence, and required fields.
 * Collects ALL errors before returning (not fail-fast) for better UX (NFR-006).
 *
 * Traces: FR-001, Security 6.1, V-001 through V-006
 *
 * @param {string} filePath - Absolute path to the skill .md file
 * @returns {{valid: boolean, errors: string[], parsed: object|null, body: string|null}}
 */
function validateSkillFrontmatter(filePath) {
    const errors = [];

    // V-001: File exists
    if (!fs.existsSync(filePath)) {
        return { valid: false, errors: [`File not found: ${filePath}`], parsed: null, body: null };
    }

    // V-002: File extension
    if (!filePath.endsWith('.md')) {
        const ext = path.extname(filePath) || '(none)';
        return { valid: false, errors: [`Only .md files are supported. Got: ${ext}`], parsed: null, body: null };
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // V-003: Frontmatter present
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
        return {
            valid: false,
            errors: ["No YAML frontmatter found. Expected file to start with '---'"],
            parsed: null,
            body: null
        };
    }

    // Parse frontmatter (simple key: value parser per ADR-0009)
    const parsed = {};
    const fmLines = fmMatch[1].split('\n');
    for (const line of fmLines) {
        const sepIdx = line.indexOf(': ');
        if (sepIdx > 0) {
            const key = line.substring(0, sepIdx).trim();
            const value = line.substring(sepIdx + 2).trim();
            parsed[key] = value;
        }
    }

    // V-004: name field required
    if (!parsed.name || !parsed.name.trim()) {
        errors.push('Missing required frontmatter field: name');
    }

    // V-005: description field required
    if (!parsed.description || !parsed.description.trim()) {
        errors.push('Missing required frontmatter field: description');
    }

    // V-006: name format (if name exists and is non-empty)
    if (parsed.name && parsed.name.trim()) {
        const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
        if (!namePattern.test(parsed.name.trim())) {
            errors.push(
                "Skill name must be lowercase alphanumeric with hyphens, "
                + "2+ chars (e.g., 'nestjs-conventions')"
            );
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, parsed: null, body: null };
    }

    // Extract body (everything after frontmatter)
    const fmEnd = content.indexOf('---', 4);
    const body = content.substring(fmEnd + 3).trim();

    return { valid: true, errors: [], parsed, body };
}

/**
 * Analyze skill content for phase-indicative keywords.
 * Returns matched keywords, suggested phases, and a confidence level.
 *
 * Traces: FR-002
 *
 * @param {string} content - The skill body content to analyze
 * @returns {{keywords: string[], suggestedPhases: string[], confidence: string}}
 */
function analyzeSkillContent(content) {
    if (!content || typeof content !== 'string') {
        return { keywords: [], suggestedPhases: ['06-implementation'], confidence: 'low' };
    }

    const lowerContent = content.toLowerCase();
    const matchedKeywords = [];
    const phaseSet = new Set();

    for (const [_category, config] of Object.entries(SKILL_KEYWORD_MAP)) {
        for (const kw of config.keywords) {
            if (lowerContent.includes(kw.toLowerCase())) {
                matchedKeywords.push(kw);
                config.phases.forEach(p => phaseSet.add(p));
            }
        }
    }

    const suggestedPhases = phaseSet.size > 0
        ? Array.from(phaseSet)
        : ['06-implementation'];

    let confidence;
    if (matchedKeywords.length >= 3) {
        confidence = 'high';
    } else if (matchedKeywords.length >= 1) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    return { keywords: matchedKeywords, suggestedPhases, confidence };
}

/**
 * Suggest bindings (agents, phases, delivery type) based on content analysis
 * and optional frontmatter hints.
 *
 * Traces: FR-002
 *
 * @param {object|null} analysis - Result from analyzeSkillContent()
 * @param {object|null} frontmatterHints - Parsed frontmatter with optional owner, when_to_use fields
 * @returns {{agents: string[], phases: string[], delivery_type: string, confidence: string}}
 */
function suggestBindings(analysis, frontmatterHints) {
    const phases = (analysis && analysis.suggestedPhases) || ['06-implementation'];
    let confidence = (analysis && analysis.confidence) || 'low';

    // Map phases to agents
    const agentSet = new Set();
    for (const phase of phases) {
        const agent = PHASE_TO_AGENT_MAP[phase];
        if (agent) agentSet.add(agent);
    }

    // Enhance with frontmatter hints
    if (frontmatterHints && frontmatterHints.owner) {
        agentSet.add(frontmatterHints.owner);
        if (confidence === 'low') confidence = 'medium';
    }

    // Determine delivery type
    let delivery_type = 'context';
    if (frontmatterHints && frontmatterHints.when_to_use) {
        const hint = frontmatterHints.when_to_use.toLowerCase();
        if (hint.includes('must') || hint.includes('standard') || hint.includes('convention')) {
            delivery_type = 'instruction';
        }
    }
    // Large content hint (caller can pass content length as analysis.contentLength)
    if (analysis && analysis.contentLength && analysis.contentLength > 5000) {
        delivery_type = 'reference';
    }

    return {
        agents: Array.from(agentSet),
        phases,
        delivery_type,
        confidence
    };
}

/**
 * Write the external skills manifest to disk.
 * Creates parent directories if they don't exist.
 * Re-reads and validates JSON after write (integrity check).
 * Returns structured result (never throws).
 *
 * Traces: FR-004
 *
 * @param {object} manifest - The manifest object to write
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {{success: boolean, error: string|null, path: string}}
 */
function writeExternalManifest(manifest, projectId) {
    try {
        const manifestPath = resolveExternalManifestPath(projectId);
        const dir = path.dirname(manifestPath);

        // Create parent directories
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write with 2-space indentation + trailing newline
        const jsonStr = JSON.stringify(manifest, null, 2) + '\n';
        fs.writeFileSync(manifestPath, jsonStr, 'utf8');

        // Validate by re-reading
        const verify = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!verify || !Array.isArray(verify.skills)) {
            return { success: false, error: 'Manifest validation failed after write', path: manifestPath };
        }

        return { success: true, error: null, path: manifestPath };
    } catch (e) {
        const manifestPath = resolveExternalManifestPath(projectId);
        return { success: false, error: e.message, path: manifestPath };
    }
}

/**
 * Format an external skill's content into an injection block for agent Task prompts.
 * Pure function, no I/O.
 *
 * Traces: FR-005
 *
 * @param {string} name - The skill name
 * @param {string} content - The skill body content (or file path for reference type)
 * @param {string} deliveryType - 'context', 'instruction', or 'reference'
 * @returns {string} Formatted injection block, or empty string for unknown types
 */
function formatSkillInjectionBlock(name, content, deliveryType) {
    switch (deliveryType) {
        case 'context':
            return `EXTERNAL SKILL CONTEXT: ${name}\n---\n${content}\n---`;
        case 'instruction':
            return `EXTERNAL SKILL INSTRUCTION (${name}): You MUST follow these guidelines:\n${content}`;
        case 'reference':
            // For reference, content is the file path
            return `EXTERNAL SKILL AVAILABLE: ${name} -- Read from ${content} if relevant to your current task`;
        default:
            return '';
    }
}

/**
 * Remove a skill from the manifest by name.
 * Pure function on the manifest object (does not write to disk).
 * Returns the updated manifest for the caller to write.
 * Safe on null/undefined manifest.
 *
 * Traces: FR-007
 *
 * @param {string} skillName - The skill name to remove
 * @param {object|null} manifest - The manifest object
 * @returns {{removed: boolean, manifest: object}}
 */
function removeSkillFromManifest(skillName, manifest) {
    if (!manifest || !Array.isArray(manifest.skills)) {
        return { removed: false, manifest: manifest || { version: '1.0.0', skills: [] } };
    }

    const initialLength = manifest.skills.length;
    const filtered = manifest.skills.filter(s => s.name !== skillName);

    return {
        removed: filtered.length < initialLength,
        manifest: { ...manifest, skills: filtered }
    };
}

/**
 * Reconcile incoming skills into the manifest for a given source.
 * Pure function -- operates on manifest in memory, does not write to disk.
 *
 * Traces: FR-002, FR-003, FR-004 (REQ-0038)
 *
 * @param {object|null} manifest - Current manifest from loadExternalManifest()
 * @param {string} source - Source identifier: "discover" or "skills.sh"
 * @param {Array<{name: string, file: string, description: string, sourcePhase: string, bindings?: object}>} incomingSkills
 * @param {Array<string>|null} phasesExecuted - Source phases that ran (e.g., ["D1", "D2"])
 * @returns {{manifest: object, changed: boolean, added: string[], removed: string[], updated: string[]}}
 */
function reconcileSkillsBySource(manifest, source, incomingSkills, phasesExecuted) {
    const noChange = (m) => ({ manifest: m, changed: false, added: [], removed: [], updated: [] });

    // Validate source -- only "discover" and "skills.sh" allowed (ERR-REC-001)
    if (source !== 'discover' && source !== 'skills.sh') {
        return noChange(manifest || { version: '1.0.0', skills: [] });
    }

    // Validate incomingSkills (ERR-REC-002)
    if (!Array.isArray(incomingSkills)) {
        return noChange(manifest || { version: '1.0.0', skills: [] });
    }

    // Normalize manifest (null -> empty)
    if (!manifest || !manifest.skills) {
        manifest = { version: '1.0.0', skills: [] };
    }

    // Normalize source on all existing entries (missing source -> "user")
    const skills = manifest.skills.map(s => {
        if (!s.source) {
            return { ...s, source: 'user' };
        }
        return s;
    });

    // Partition existing skills: sameSource vs otherSource
    const sameSource = [];
    const otherSource = [];
    for (const skill of skills) {
        if (skill.source === source) {
            sameSource.push(skill);
        } else {
            otherSource.push(skill);
        }
    }

    // Build a map of incoming skills by name (skip entries without name -- ERR-REC-003)
    const incomingMap = new Map();
    for (const incoming of incomingSkills) {
        if (incoming && incoming.name) {
            incomingMap.set(incoming.name, incoming);
        }
    }

    // Normalize phasesExecuted
    const hasPhases = Array.isArray(phasesExecuted) && phasesExecuted.length > 0;
    const phasesSet = hasPhases ? new Set(phasesExecuted) : null;

    const added = [];
    const removed = [];
    const updated = [];
    const surviving = [];
    const now = new Date().toISOString();

    // Process existing same-source entries
    for (const existing of sameSource) {
        const incoming = incomingMap.get(existing.name);
        if (incoming) {
            // Match found -- update source-owned fields, preserve user-owned fields
            const updatedSkill = {
                ...existing,
                file: incoming.file !== undefined ? incoming.file : existing.file,
                description: incoming.description !== undefined ? incoming.description : existing.description,
                sourcePhase: incoming.sourcePhase !== undefined ? incoming.sourcePhase : existing.sourcePhase,
                updated_at: now
                // bindings preserved from existing (user-owned)
                // added_at preserved from existing (set once)
                // source preserved from existing (immutable)
            };
            surviving.push(updatedSkill);
            updated.push(existing.name);
            // Remove from incomingMap so we know what's new later
            incomingMap.delete(existing.name);
        } else if (phasesSet && phasesSet.has(existing.sourcePhase)) {
            // Phase ran but produced nothing for this skill -- remove
            removed.push(existing.name);
        } else {
            // Phase didn't run or no phases specified -- preserve untouched
            surviving.push(existing);
        }
    }

    // Add new entries (remaining in incomingMap after matching)
    for (const [name, incoming] of incomingMap) {
        const newEntry = {
            name: incoming.name,
            file: incoming.file,
            source: source,
            description: incoming.description,
            sourcePhase: incoming.sourcePhase,
            added_at: now,
            updated_at: now,
            bindings: incoming.bindings
        };
        surviving.push(newEntry);
        added.push(name);
    }

    // Merge: otherSource + surviving sameSource (includes updates and new)
    const mergedSkills = [...otherSource, ...surviving];
    const changed = added.length > 0 || removed.length > 0 || updated.length > 0;

    return {
        manifest: { ...manifest, skills: mergedSkills },
        changed,
        added,
        removed,
        updated
    };
}

// =========================================================================
// State Management (monorepo-aware)
// =========================================================================

/**
 * Read JSON value from state.json
 * @param {string} jsonPath - Dot-notation path (e.g., "skill_enforcement.mode")
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {any} Value at path or undefined
 */
function readStateValue(jsonPath, projectId) {
    const stateFile = resolveStatePath(projectId);

    if (!fs.existsSync(stateFile)) {
        return undefined;
    }

    try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        return getNestedValue(state, jsonPath);
    } catch (e) {
        return undefined;
    }
}

/**
 * Get nested value from object using dot notation
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-notation path
 * @returns {any} Value at path or undefined
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

/**
 * Read and parse state.json
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {object|null} Parsed state or null
 */
function readState(projectId) {
    const stateFile = resolveStatePath(projectId);

    if (!fs.existsSync(stateFile)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) {
        return null;
    }
}

/**
 * Write state.json with automatic state_version increment (BUG-0009).
 *
 * Before writing, reads the current state_version from the existing file on disk.
 * Sets state_version = current_version + 1 on a COPY of the state object
 * (does NOT mutate the caller's object).
 * If no existing file or no state_version on disk, initializes to 1.
 *
 * @param {object} state - State object to write
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {boolean} Success
 */
function writeState(state, projectId) {
    const stateFile = resolveStatePath(projectId);

    // Ensure directory exists (for monorepo project directories)
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        // BUG-0009: Read current version from disk and auto-increment
        let currentVersion = 0;
        try {
            if (fs.existsSync(stateFile)) {
                const diskContent = fs.readFileSync(stateFile, 'utf8');
                const diskState = JSON.parse(diskContent);
                if (typeof diskState.state_version === 'number' && diskState.state_version > 0) {
                    currentVersion = diskState.state_version;
                }
            }
        } catch (e) {
            // Fail-open: if we can't read the disk file, start from 0
            currentVersion = 0;
        }

        // Create a shallow copy to avoid mutating the caller's object
        const stateCopy = Object.assign({}, state);
        stateCopy.state_version = currentVersion + 1;

        fs.writeFileSync(stateFile, JSON.stringify(stateCopy, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Append entry to skill_usage_log array
 * @param {object} logEntry - Log entry to append
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {boolean} Success
 */
function appendSkillLog(logEntry, projectId) {
    const state = readState(projectId);
    if (!state) {
        return false;
    }

    if (!Array.isArray(state.skill_usage_log)) {
        state.skill_usage_log = [];
    }

    state.skill_usage_log.push(logEntry);
    return writeState(state, projectId);
}

/**
 * Get timestamp in ISO 8601 format
 * @returns {string} ISO timestamp
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Get path to skills manifest JSON
 * @returns {string|null} Path to manifest or null if not found
 */
function getManifestPath() {
    const projectRoot = getProjectRoot();

    // Primary location: .claude/hooks/config/ (hooks config lives with hooks)
    const hooksConfigPath = path.join(getHooksConfigDir(projectRoot), 'skills-manifest.json');
    if (fs.existsSync(hooksConfigPath)) {
        return hooksConfigPath;
    }

    // Fallback to .isdlc location (framework config)
    const isdlcPath = path.join(projectRoot, '.isdlc', 'config', 'skills-manifest.json');
    if (fs.existsSync(isdlcPath)) {
        return isdlcPath;
    }

    return null;
}

/**
 * Load and parse skills manifest
 * @returns {object|null} Manifest object or null
 */
function loadManifest() {
    const manifestPath = getManifestPath();
    if (!manifestPath) {
        return null;
    }
    return _loadConfigWithCache(manifestPath, 'skills-manifest');
}

/**
 * Get the owning agent for a skill ID from manifest
 * @param {string} skillId - Skill ID (e.g., "DEV-001")
 * @returns {string|null} Agent name or null
 */
function getSkillOwner(skillId) {
    const manifest = loadManifest();
    if (!manifest || !manifest.skill_lookup) {
        return null;
    }
    return manifest.skill_lookup[skillId] || null;
}

/**
 * Extract description from a SKILL.md file content.
 * Supports two formats:
 *   1. YAML frontmatter: description: "..." or description: ...
 *   2. Markdown header: ## Description followed by text
 * Falls back to null if description cannot be extracted.
 *
 * @param {string} content - SKILL.md file content
 * @returns {string|null} Extracted description or null
 * @private
 * Traces to: FR-05 (dual-format description extraction)
 */
function _extractSkillDescription(content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return null;
    }

    // Try YAML frontmatter first (70% of files)
    const yamlMatch = content.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (yamlMatch && yamlMatch[1].trim().length > 0) {
        return yamlMatch[1].trim();
    }

    // Try Markdown ## Description header (30% of files)
    const descHeaderIdx = content.indexOf('## Description');
    if (descHeaderIdx !== -1) {
        const afterHeader = content.substring(descHeaderIdx + '## Description'.length);
        const lines = afterHeader.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0 && !trimmed.startsWith('#')) {
                return trimmed;
            }
        }
    }

    return null;
}

/**
 * Build a skill path index: skillID -> relative path to SKILL.md.
 * Scans src/claude/skills/ (dev mode) and .claude/skills/ (installed mode)
 * for all SKILL.md files, extracting skill_id from YAML frontmatter.
 *
 * Per-process cached with invalidation based on skills directory mtime.
 * Falls back to empty Map on any error (fail-open).
 *
 * @returns {Map<string, string>} Map of skillID -> relativePath
 * @private
 * Traces to: REQ-0001, FR-008 prerequisite, ADR-0028
 */
function _buildSkillPathIndex() {
    const projectRoot = getProjectRoot();

    // Check if cached index is still valid (mtime-based invalidation)
    if (_skillPathIndex !== null) {
        try {
            const devDir = path.join(projectRoot, 'src', 'claude', 'skills');
            const installedDir = getSkillsDir(projectRoot);
            let latestMtime = 0;
            if (fs.existsSync(devDir)) {
                latestMtime = Math.max(latestMtime, fs.statSync(devDir).mtimeMs);
            }
            if (fs.existsSync(installedDir)) {
                latestMtime = Math.max(latestMtime, fs.statSync(installedDir).mtimeMs);
            }
            if (latestMtime <= _skillPathIndexBuiltAt) {
                return _skillPathIndex;
            }
        } catch (_) {
            // Invalidation check failed -- rebuild
        }
    }

    const index = new Map();

    // Scan function: recursively find SKILL.md files in a base directory
    function scanDir(baseDir, relativeBase) {
        if (!fs.existsSync(baseDir)) return;
        try {
            const entries = fs.readdirSync(baseDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(baseDir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                    scanDir(fullPath, path.join(relativeBase, entry.name));
                } else if (entry.name === 'SKILL.md') {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const skillIdMatch = content.match(/^skill_id:\s*(.+)$/m);
                        if (skillIdMatch) {
                            const skillId = skillIdMatch[1].trim();
                            const relativePath = path.join(relativeBase, 'SKILL.md');
                            // First found wins (dev mode takes precedence if both exist)
                            if (!index.has(skillId)) {
                                index.set(skillId, relativePath);
                            }
                        }
                    } catch (_) {
                        // Skip unreadable files
                    }
                }
            }
        } catch (_) {
            // Skip unreadable directories
        }
    }

    // Scan dev directory first (takes precedence in dogfooding mode)
    scanDir(path.join(projectRoot, 'src', 'claude', 'skills'), path.join('src', 'claude', 'skills'));
    // Then scan installed directory
    scanDir(getSkillsDir(projectRoot), path.join(getFrameworkDir(), 'skills'));

    _skillPathIndex = index;
    _skillPathIndexBuiltAt = Date.now();
    return index;
}

/**
 * Get skill index for a given agent name.
 * Returns array of {id, name, description, path} entries from the manifest,
 * with descriptions extracted from SKILL.md files.
 *
 * Supports two manifest schemas:
 *   - Production (v5+): ownership.skills is a flat string array ["DEV-001", ...]
 *     Resolution uses _buildSkillPathIndex() for direct ID-to-path lookup (REQ-0001).
 *   - Legacy (v3): ownership.skills is an object array [{id, name, path}, ...]
 *     Uses object properties directly.
 *
 * Dual-path resolution (GH-82 fix):
 *   Tries .claude/skills/{path}/SKILL.md first (installed projects),
 *   then src/claude/skills/{path}/SKILL.md (dev mode).
 *
 * Fail-open: returns empty array on any failure (null input, missing manifest,
 * unknown agent, missing SKILL.md files).
 *
 * @param {string} agentName - Agent name (e.g., 'software-developer')
 * @returns {Array<{id: string, name: string, description: string, path: string}>}
 * Traces to: FR-01 (getAgentSkillIndex), AC-01, AC-06, NFR-02
 */
function getAgentSkillIndex(agentName) {
    // Fail-open: guard against null/undefined/empty input
    if (!agentName || typeof agentName !== 'string' || agentName.trim().length === 0) {
        return [];
    }

    try {
        const manifest = loadManifest();
        if (!manifest || !manifest.ownership) {
            return [];
        }

        const agentEntry = manifest.ownership[agentName];
        if (!agentEntry || !agentEntry.skills || !Array.isArray(agentEntry.skills)) {
            return [];
        }

        if (agentEntry.skills.length === 0) {
            return [];
        }

        const projectRoot = getProjectRoot();
        const result = [];

        // Detect schema: string array (production v5+) vs object array (legacy v3)
        const isStringSchema = typeof agentEntry.skills[0] === 'string';

        if (isStringSchema) {
            // Production schema: skills are flat string IDs like "DEV-001"
            // Use skill path index for direct ID-to-path resolution (REQ-0001, ADR-0028)
            const skillPathIdx = _buildSkillPathIndex();

            for (const skillId of agentEntry.skills) {
                try {
                    const relativePath = skillPathIdx.get(skillId);
                    if (!relativePath) {
                        // Skill ID not in index -- skip (fail-open)
                        continue;
                    }

                    const absPath = path.join(projectRoot, relativePath);
                    if (!fs.existsSync(absPath)) {
                        continue;
                    }

                    const content = fs.readFileSync(absPath, 'utf8');

                    // Extract name from the path (parent directory name)
                    const pathParts = relativePath.split(path.sep);
                    const skillName = pathParts[pathParts.length - 2] || skillId;

                    // Extract description
                    let description = _extractSkillDescription(content);
                    if (!description) {
                        description = skillName;
                    }

                    result.push({
                        id: skillId,
                        name: skillName,
                        description: description,
                        path: relativePath
                    });
                } catch (_skillErr) {
                    // Fail-open: skip individual skill on any error
                    continue;
                }
            }
        } else {
            // Legacy schema: skills are objects with {id, name, path}
            for (const skill of agentEntry.skills) {
                try {
                    // Dual-path resolution (GH-82 fix)
                    const installedMdPath = path.join(projectRoot, '.claude', 'skills', skill.path, 'SKILL.md');
                    const devMdPath = path.join(projectRoot, 'src', 'claude', 'skills', skill.path, 'SKILL.md');

                    let resolvedAbsPath = null;
                    let relativePath = null;

                    if (fs.existsSync(installedMdPath)) {
                        resolvedAbsPath = installedMdPath;
                        relativePath = path.join('.claude', 'skills', skill.path, 'SKILL.md');
                    } else if (fs.existsSync(devMdPath)) {
                        resolvedAbsPath = devMdPath;
                        relativePath = path.join('src', 'claude', 'skills', skill.path, 'SKILL.md');
                    } else {
                        // Fail-open: skip missing SKILL.md files (AC-06)
                        continue;
                    }

                    const content = fs.readFileSync(resolvedAbsPath, 'utf8');
                    let description = _extractSkillDescription(content);

                    // Fallback to manifest name if description can't be extracted
                    if (!description) {
                        description = skill.name;
                    }

                    result.push({
                        id: skill.id,
                        name: skill.name,
                        description: description,
                        path: relativePath
                    });
                } catch (_skillErr) {
                    // Fail-open: skip individual skill on any error
                    continue;
                }
            }
        }

        return result;
    } catch (_err) {
        // Fail-open: return empty array on any unexpected error
        return [];
    }
}

/**
 * Format a skill index array into a text block for injection into Task prompts.
 * Returns empty string for empty array.
 * Output stays within 30 lines for 14 entries (NFR-01).
 *
 * Format:
 *   AVAILABLE SKILLS (consult when relevant using Read tool):
 *     DEV-001: code-implementation -- Description text
 *       -> src/claude/skills/development/code-implementation/SKILL.md
 *     ...
 *
 * @param {Array<{id: string, name: string, description: string, path: string}>} skillIndex
 * @returns {string} Formatted block or empty string
 * Traces to: FR-02 (formatSkillIndexBlock), AC-02, NFR-01
 */
function formatSkillIndexBlock(skillIndex) {
    if (!Array.isArray(skillIndex) || skillIndex.length === 0) {
        return '';
    }

    const lines = [];
    lines.push('AVAILABLE SKILLS (consult when relevant using Read tool):');

    for (const entry of skillIndex) {
        lines.push(`  ${entry.id}: ${entry.name} — ${entry.description}`);
        lines.push(`    → ${entry.path}`);
    }

    return lines.join('\n');
}

/**
 * Get the phase for an agent from manifest
 * @param {string} agentName - Agent name
 * @returns {string|null} Phase or null
 */
function getAgentPhase(agentName) {
    const manifest = loadManifest();
    if (!manifest || !manifest.ownership || !manifest.ownership[agentName]) {
        return null;
    }
    return manifest.ownership[agentName].phase || null;
}

/**
 * Normalize agent name (handle variations)
 * @param {string} input - Raw agent name
 * @returns {string} Normalized agent name
 */
function normalizeAgentName(input) {
    if (!input) return '';

    // Convert to lowercase and replace underscores with hyphens
    let normalized = input.toLowerCase().replace(/_/g, '-');

    // Map common variations
    const mappings = {
        'orchestrator': 'sdlc-orchestrator',
        '00-sdlc-orchestrator': 'sdlc-orchestrator',
        'requirements': 'requirements-analyst',
        '01-requirements-analyst': 'requirements-analyst',
        'architect': 'solution-architect',
        '02-solution-architect': 'solution-architect',
        'designer': 'system-designer',
        '03-system-designer': 'system-designer',
        'test-design': 'test-design-engineer',
        '04-test-design-engineer': 'test-design-engineer',
        'developer': 'software-developer',
        '05-software-developer': 'software-developer',
        'tester': 'integration-tester',
        '06-integration-tester': 'integration-tester',
        'qa': 'qa-engineer',
        '07-qa-engineer': 'qa-engineer',
        'security': 'security-compliance-auditor',
        '08-security-compliance-auditor': 'security-compliance-auditor',
        'cicd': 'cicd-engineer',
        '09-cicd-engineer': 'cicd-engineer',
        'dev-env': 'environment-builder',
        '10-dev-environment-engineer': 'environment-builder',
        'environment-builder': 'environment-builder',
        'staging': 'deployment-engineer-staging',
        '11-deployment-engineer-staging': 'deployment-engineer-staging',
        'release': 'release-manager',
        '12-release-manager': 'release-manager',
        'sre': 'site-reliability-engineer',
        '13-site-reliability-engineer': 'site-reliability-engineer',

        // Discover agents (D0-D8)
        'd0': 'discover-orchestrator',
        'd0-discover-orchestrator': 'discover-orchestrator',
        'discovery': 'discover-orchestrator',
        'd1': 'architecture-analyzer',
        'd1-architecture-analyzer': 'architecture-analyzer',
        'arch-analyzer': 'architecture-analyzer',
        'd2': 'test-evaluator',
        'd2-test-evaluator': 'test-evaluator',
        'd3': 'constitution-generator',
        'd3-constitution-generator': 'constitution-generator',
        'd4': 'skills-researcher',
        'd4-skills-researcher': 'skills-researcher',
        'd5': 'data-model-analyzer',
        'd5-data-model-analyzer': 'data-model-analyzer',
        'd6': 'feature-mapper',
        'd6-feature-mapper': 'feature-mapper',
        'd7': 'product-analyst',
        'd7-product-analyst': 'product-analyst',
        'd8': 'architecture-designer',
        'd8-architecture-designer': 'architecture-designer',
        'arch-designer': 'architecture-designer',
        // Quality Loop
        'quality-loop': 'quality-loop-engineer',
        '16-quality-loop-engineer': 'quality-loop-engineer',
        'ql': 'quality-loop-engineer'
    };

    return mappings[normalized] || normalized;
}

/**
 * Check if agent is authorized for a given phase
 * @param {string} agentName - Agent name
 * @param {string} currentPhase - Current project phase
 * @returns {boolean} True if authorized
 */
function isAgentAuthorizedForPhase(agentName, currentPhase) {
    const agentPhase = getAgentPhase(agentName);

    // No manifest or agent not found - allow by default (fail open)
    if (!agentPhase) {
        return true;
    }

    // Orchestrator (phase "all") is always authorized
    if (agentPhase === 'all') {
        return true;
    }

    // Setup agents (discover agents) are always authorized
    if (agentPhase === 'setup') {
        return true;
    }

    // Check if agent's designated phase matches current phase
    return agentPhase === currentPhase;
}

/**
 * Read all input from stdin
 * @returns {Promise<string>} stdin content
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';

        process.stdin.setEncoding('utf8');

        process.stdin.on('data', (chunk) => {
            data += chunk;
        });

        process.stdin.on('end', () => {
            resolve(data);
        });

        process.stdin.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Output JSON response for hook (to block)
 * @param {string} stopReason - Reason for blocking
 */
function outputBlockResponse(stopReason) {
    console.log(JSON.stringify({
        continue: false,
        stopReason: stopReason
    }));
}

// =========================================================================
// Pending Escalation Tracking
// =========================================================================

/**
 * Write a pending escalation entry to state.json.
 * Appends to state.pending_escalations[] array with dedup and FIFO cap.
 *
 * Dedup: Skips if same hook+phase+type was written within ESCALATION_DEDUP_WINDOW_MS.
 * Cap: FIFO eviction at MAX_ESCALATIONS entries.
 *
 * @param {object} entry - { type, hook, phase, detail, timestamp }
 */
function writePendingEscalation(entry) {
    const state = readState();
    if (!state) return;
    if (!Array.isArray(state.pending_escalations)) {
        state.pending_escalations = [];
    }

    // Dedup: skip if same hook+phase+type within window
    const now = entry.timestamp ? Date.parse(entry.timestamp) : Date.now();
    const isDuplicate = state.pending_escalations.some(existing => {
        if (existing.hook !== entry.hook || existing.phase !== entry.phase || existing.type !== entry.type) {
            return false;
        }
        const existingTime = existing.timestamp ? Date.parse(existing.timestamp) : 0;
        return (now - existingTime) < ESCALATION_DEDUP_WINDOW_MS;
    });

    if (isDuplicate) {
        return; // Skip duplicate within window
    }

    state.pending_escalations.push(entry);

    // FIFO cap: keep only the newest MAX_ESCALATIONS entries
    if (state.pending_escalations.length > MAX_ESCALATIONS) {
        state.pending_escalations = state.pending_escalations.slice(-MAX_ESCALATIONS);
    }

    writeState(state);
}

/**
 * Read pending_escalations from state.json.
 * @returns {Array|null} The pending_escalations array, or null if none/empty
 */
function readPendingEscalations() {
    const state = readState();
    if (!state) return null;
    const escalations = state.pending_escalations;
    if (!Array.isArray(escalations) || escalations.length === 0) return null;
    return escalations;
}

/**
 * Clear pending_escalations from state.json (set to empty array).
 */
function clearPendingEscalations() {
    const state = readState();
    if (!state) return;
    state.pending_escalations = [];
    writeState(state);
}

// =========================================================================
// Pending Delegation Tracking
// =========================================================================

/**
 * Read pending_delegation from state.json.
 * @returns {object|null} The pending_delegation entry, or null if none
 */
function readPendingDelegation() {
    const state = readState();
    if (!state) return null;
    return state.pending_delegation || null;
}

/**
 * Write a pending_delegation entry to state.json.
 * @param {object} entry - The delegation entry { skill, invoked_at, args }
 */
function writePendingDelegation(entry) {
    const state = readState();
    if (!state) return;
    state.pending_delegation = entry;
    writeState(state);
}

/**
 * Clear pending_delegation from state.json (set to null).
 */
function clearPendingDelegation() {
    const state = readState();
    if (!state) return;
    state.pending_delegation = null;
    writeState(state);
}

/**
 * Read code_review configuration from state.json.
 * Returns safe defaults if section is missing, state is unreadable, or fields are invalid.
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {{ enabled: boolean, team_size: number }}
 */
function readCodeReviewConfig(projectId) {
    try {
        const state = readState(projectId);
        if (state && state.code_review) {
            return {
                enabled: state.code_review.enabled === true,
                team_size: typeof state.code_review.team_size === 'number'
                    ? state.code_review.team_size
                    : 1
            };
        }
    } catch (e) {
        // Fail-open: return disabled defaults
    }
    return { enabled: false, team_size: 1 };
}

// =========================================================================
// Phase Delegation Detection (REQ-0004)
// =========================================================================

/**
 * Setup commands that should NEVER be blocked by enforcement hooks.
 * These run BEFORE workflows start or are configuration/status commands.
 *
 * Used by: gate-blocker, iteration-corridor, phase-loop-controller,
 *          phase-sequence-guard, detectPhaseDelegation
 *
 * @type {ReadonlyArray<string>}
 */
const SETUP_COMMAND_KEYWORDS = Object.freeze([
    'discover',
    'constitution',
    'init',
    'setup',
    'configure',
    'configure-cloud',
    'new project',
    'project setup',
    'install',
    'status'
]);

/**
 * Check if text contains any setup command keyword.
 * Setup commands should never be blocked by enforcement hooks.
 *
 * @param {string} text - Text to search (case-insensitive)
 * @returns {boolean} True if text contains a setup command keyword
 *
 * @example
 *   isSetupCommand('discover the project')     // true
 *   isSetupCommand('delegate to developer')     // false
 *   isSetupCommand('')                          // false
 *   isSetupCommand(null)                        // false
 */
function isSetupCommand(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return SETUP_COMMAND_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Detect if a Task tool call is a phase delegation.
 *
 * Detection algorithm (ordered by reliability):
 *   1. If tool_name !== 'Task', return not-a-delegation.
 *   2. If combined prompt/description text contains setup keywords, return not-a-delegation.
 *   3. If subagent_type matches a known agent name (via normalizeAgentName + getAgentPhase),
 *      return the detected phase. Skip agents with phase 'all' or 'setup'.
 *   4. If subagent_type did not match, scan combined text for exact agent names from the
 *      skills-manifest ownership map.
 *   5. If still no match, scan for phase name patterns like "01-requirements" or "phase 01".
 *   6. If no match, return not-a-delegation.
 *
 * Edge cases:
 *   - Non-Task tool calls (Read, Write, Bash, etc.) always return NOT_DELEGATION immediately.
 *   - Setup commands (containing keywords like "initialize", "configure") are excluded
 *     even when the tool_name is 'Task', to avoid false positives on setup sub-agents.
 *   - Agents whose phase is 'all' or 'setup' are excluded from delegation detection
 *     because they are not phase-specific (e.g., sdlc-orchestrator).
 *   - If the skills-manifest file is missing or unreadable, the manifest-based agent
 *     scanning step (Step 4) is silently skipped (fail-safe).
 *   - The phase pattern regex fallback (Step 5) matches patterns like "01-requirements"
 *     or "phase 06-implementation" in the combined prompt/description text.
 *   - Null or undefined parsedInput returns NOT_DELEGATION (no throw).
 *
 * @param {object} parsedInput - Parsed stdin JSON from Claude Code hook protocol
 * @param {string} parsedInput.tool_name - The tool being invoked (must be 'Task')
 * @param {object} [parsedInput.tool_input] - Tool input parameters
 * @param {string} [parsedInput.tool_input.subagent_type] - The sub-agent type
 * @param {string} [parsedInput.tool_input.prompt] - The task prompt
 * @param {string} [parsedInput.tool_input.description] - The task description
 *
 * @returns {{
 *   isDelegation: boolean,
 *   targetPhase: string|null,
 *   agentName: string|null
 * }}
 *
 * @throws {never} Never throws -- returns NOT_DELEGATION on all error paths
 *   (null input, missing fields, manifest read failures, etc.)
 *
 * @example
 * // Typical usage in a PreToolUse hook:
 * const delegation = detectPhaseDelegation(parsedInput);
 * if (delegation.isDelegation) {
 *     console.log(`Delegation to phase: ${delegation.targetPhase}`);
 *     console.log(`Agent: ${delegation.agentName}`);
 * }
 *
 * @example
 * // Non-Task tool call returns NOT_DELEGATION:
 * detectPhaseDelegation({ tool_name: 'Read', tool_input: {} });
 * // => { isDelegation: false, targetPhase: null, agentName: null }
 *
 * @see gate-blocker.cjs - Uses detectPhaseDelegation to identify gate advancement attempts
 * @see constitution-validator.cjs - Uses detectPhaseDelegation to scope constitutional checks
 * @see phase-loop-controller.cjs - Uses detectPhaseDelegation to track phase progress
 * @see test-adequacy-blocker.cjs - Uses detectPhaseDelegation to identify upgrade delegations
 * @see phase-sequence-guard.cjs - Uses detectPhaseDelegation to enforce phase ordering
 * @see iteration-corridor.cjs - Uses detectPhaseDelegation to scope iteration enforcement
 */
function detectPhaseDelegation(parsedInput) {
    const NOT_DELEGATION = { isDelegation: false, targetPhase: null, agentName: null };

    // Guard: must be a Task tool call
    if (!parsedInput || parsedInput.tool_name !== 'Task') {
        return NOT_DELEGATION;
    }

    const toolInput = parsedInput.tool_input || {};
    const subagentType = (toolInput.subagent_type || '').trim();
    const prompt = toolInput.prompt || '';
    const description = toolInput.description || '';
    const combined = (prompt + ' ' + description).toLowerCase();

    // Step 1: Check setup command whitelist
    if (isSetupCommand(combined)) {
        return NOT_DELEGATION;
    }

    // Also check subagent_type for setup agent names
    if (subagentType) {
        const normalizedSubagent = normalizeAgentName(subagentType);
        const subagentPhase = getAgentPhase(normalizedSubagent);
        if (subagentPhase === 'all' || subagentPhase === 'setup') {
            return NOT_DELEGATION;
        }
    }

    // Step 2: Match subagent_type against known agent names
    if (subagentType) {
        const normalized = normalizeAgentName(subagentType);
        const phase = getAgentPhase(normalized);
        if (phase) {
            return { isDelegation: true, targetPhase: phase, agentName: normalized };
        }
    }

    // Step 3: Scan prompt/description for exact agent names from manifest
    const manifest = loadManifest();
    if (manifest && manifest.ownership) {
        for (const [agentName, info] of Object.entries(manifest.ownership)) {
            if (info.phase === 'all' || info.phase === 'setup') continue;
            if (combined.includes(agentName.toLowerCase())) {
                return { isDelegation: true, targetPhase: info.phase, agentName };
            }
        }
    }

    // Step 4: Match phase name patterns (e.g., "01-requirements", "phase 06")
    const phasePattern = /(?:phase\s+)?(\d{2})-([a-z][a-z-]*)/i;
    const phaseMatch = combined.match(phasePattern);
    if (phaseMatch) {
        const phaseName = `${phaseMatch[1]}-${phaseMatch[2]}`;
        return { isDelegation: true, targetPhase: phaseName, agentName: null };
    }

    return NOT_DELEGATION;
}

// =========================================================================
// Schema Validation
// =========================================================================

/**
 * Schema cache to avoid re-reading schema files on every call.
 * @type {Map<string, object|null>}
 */
const _schemaCache = new Map();

/**
 * Load a JSON schema file by ID from the config/schemas/ directory.
 * Returns the parsed schema object or null if the file is missing/invalid.
 * Results are cached after first load.
 *
 * @param {string} schemaId - Schema ID (filename without .schema.json)
 * @returns {object|null} Parsed schema or null
 */
function loadSchema(schemaId) {
    if (_schemaCache.has(schemaId)) {
        return _schemaCache.get(schemaId);
    }

    const projectRoot = getProjectRoot();
    const schemaPaths = [
        path.join(getHooksSchemaDir(projectRoot), `${schemaId}.schema.json`),
        path.join(projectRoot, '.isdlc', 'config', 'schemas', `${schemaId}.schema.json`)
    ];

    for (const schemaPath of schemaPaths) {
        if (fs.existsSync(schemaPath)) {
            try {
                const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                _schemaCache.set(schemaId, schema);
                return schema;
            } catch (e) {
                debugLog(`Schema parse error for ${schemaId}:`, e.message);
                _schemaCache.set(schemaId, null);
                return null;
            }
        }
    }

    _schemaCache.set(schemaId, null);
    return null;
}

/**
 * Validate data against a JSON schema (lightweight inline validator).
 * Supports: type checking, required fields, enum values, minimum for integers.
 * Does NOT support: $ref, allOf, oneOf, anyOf, patternProperties, format.
 *
 * Fail-open: returns { valid: true } if schema is missing or validation errors occur.
 *
 * @param {*} data - The data to validate
 * @param {string} schemaId - Schema ID to validate against
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateSchema(data, schemaId) {
    try {
        const schema = loadSchema(schemaId);
        if (!schema) {
            // Fail-open: missing schema means validation passes
            return { valid: true };
        }

        const errors = [];
        _validateObject(data, schema, '', errors);

        if (errors.length === 0) {
            return { valid: true };
        }
        return { valid: false, errors };
    } catch (e) {
        // Fail-open: validation errors mean pass
        debugLog(`Schema validation error for ${schemaId}:`, e.message);
        return { valid: true };
    }
}

/**
 * Internal recursive validator for a single object against a schema.
 * @param {*} data
 * @param {object} schema
 * @param {string} path - JSON path for error messages
 * @param {string[]} errors - accumulator
 */
function _validateObject(data, schema, jsonPath, errors) {
    // Type check
    if (schema.type) {
        const actualType = _getJsonType(data);
        if (schema.type === 'integer') {
            if (typeof data !== 'number' || !Number.isInteger(data)) {
                errors.push(`${jsonPath || '(root)'}: expected integer, got ${actualType}`);
                return; // stop checking further if type is wrong
            }
        } else if (actualType !== schema.type) {
            errors.push(`${jsonPath || '(root)'}: expected ${schema.type}, got ${actualType}`);
            return;
        }
    }

    // Required fields
    if (schema.required && Array.isArray(schema.required) && typeof data === 'object' && data !== null) {
        for (const field of schema.required) {
            if (!(field in data)) {
                errors.push(`${jsonPath || '(root)'}: missing required field '${field}'`);
            }
        }
    }

    // Enum check
    if (schema.enum && Array.isArray(schema.enum)) {
        if (!schema.enum.includes(data)) {
            errors.push(`${jsonPath || '(root)'}: value '${data}' not in enum [${schema.enum.join(', ')}]`);
        }
    }

    // Minimum check for numbers
    if (schema.minimum !== undefined && typeof data === 'number') {
        if (data < schema.minimum) {
            errors.push(`${jsonPath || '(root)'}: value ${data} is below minimum ${schema.minimum}`);
        }
    }

    // Properties check (recurse into object properties)
    if (schema.properties && typeof data === 'object' && data !== null) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in data) {
                _validateObject(data[key], propSchema, `${jsonPath}.${key}`, errors);
            }
        }
    }

    // Array items check
    if (schema.items && Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            _validateObject(data[i], schema.items, `${jsonPath}[${i}]`, errors);
        }
    }
}

/**
 * Get JSON type name for a value.
 * @param {*} value
 * @returns {string}
 */
function _getJsonType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * Debug log (only when SKILL_VALIDATOR_DEBUG=true)
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (process.env.SKILL_VALIDATOR_DEBUG === 'true') {
        console.error('[skill-validator]', ...args);
    }
}

// =========================================================================
// Hook Activity Logging (REQ-0005)
// =========================================================================

const HOOK_LOG_MAX_BYTES = 1024 * 1024; // 1MB
const HOOK_LOG_KEEP_LINES = 500;

/**
 * Get the path to the hook activity log file.
 * @returns {string} Absolute path to hook-activity.log
 */
function getHookLogPath() {
    const projectRoot = getProjectRoot();
    return path.join(projectRoot, '.isdlc', 'hook-activity.log');
}

/**
 * Log a structured hook event to the centralized activity log.
 * Appends one JSONL line per event. Rotates when file exceeds 1MB.
 * NEVER throws or crashes -- all errors are silently swallowed.
 *
 * @param {string} hookName - Name of the hook (e.g., 'branch-guard')
 * @param {string} eventType - Event type: 'block', 'allow', 'warn', 'error', 'skip'
 * @param {object} [details={}] - Additional details (phase, agent, reason)
 */
function logHookEvent(hookName, eventType, details = {}) {
    try {
        const logPath = getHookLogPath();
        const entry = {
            ts: new Date().toISOString(),
            hook: hookName,
            event: eventType,
            phase: details.phase || null,
            agent: details.agent || null,
            reason: details.reason || null
        };
        const line = JSON.stringify(entry) + '\n';

        // Ensure .isdlc directory exists
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Append the log entry
        fs.appendFileSync(logPath, line, 'utf8');

        // Check file size for rotation
        try {
            const stat = fs.statSync(logPath);
            if (stat.size > HOOK_LOG_MAX_BYTES) {
                rotateHookLog(logPath);
            }
        } catch (e) {
            // Stat failed, skip rotation
        }
    } catch (e) {
        // Logging must never fail -- silently swallow all errors
    }
}

/**
 * Rotate the hook activity log by keeping only the newest N lines.
 * @param {string} logPath - Path to the log file
 */
function rotateHookLog(logPath) {
    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const kept = lines.slice(-HOOK_LOG_KEEP_LINES);
        fs.writeFileSync(logPath, kept.join('\n') + '\n', 'utf8');
    } catch (e) {
        // Rotation failed, not critical
    }
}

// ---------------------------------------------------------------------------
// Workflow progress snapshots (REQ-0005)
// ---------------------------------------------------------------------------

/**
 * Phase-key-to-agent-name map for history[] fallback summary extraction.
 * @type {Object<string, string>}
 */
const PHASE_AGENT_MAP = {
    '01-requirements': 'requirements-analyst',
    '02-impact-analysis': 'impact-analysis-orchestrator',
    '02-tracing': 'tracing-orchestrator',
    '03-architecture': 'solution-architect',
    '04-design': 'system-designer',
    '05-test-strategy': 'test-design-engineer',
    '06-implementation': 'software-developer',
    '07-testing': 'integration-tester',
    '08-code-review': 'qa-engineer',
    '09-validation': 'security-compliance-auditor',
    '10-cicd': 'cicd-engineer',
    '11-local-testing': 'environment-builder',
    '12-remote-build': 'environment-builder',
    '12-test-deploy': 'deployment-engineer-staging',
    '13-production': 'release-manager',
    '14-operations': 'site-reliability-engineer',
    '15-upgrade-plan': 'upgrade-engineer',
    '15-upgrade-execute': 'upgrade-engineer',
    '16-quality-loop': 'quality-loop-engineer'
};

// ---------------------------------------------------------------------------
// Phase key normalization (self-healing)
// ---------------------------------------------------------------------------

/**
 * Known phase key aliases that map to canonical keys.
 * Catches drift between workflows.json and iteration-requirements.json.
 * @type {Object<string, string>}
 */
const PHASE_KEY_ALIASES = Object.freeze({
    // Legacy workflows.json keys → canonical iteration-requirements.json keys
    '13-test-deploy': '12-test-deploy',
    '14-production': '13-production',
    '15-operations': '14-operations',
    '16-upgrade-plan': '15-upgrade-plan',
    '16-upgrade-execute': '15-upgrade-execute'
});

/**
 * Normalize a phase key using the alias map.
 * Returns the canonical key if an alias exists, otherwise returns the input unchanged.
 * @param {string} key - Phase key (e.g., '13-test-deploy' or '12-test-deploy')
 * @returns {string} Canonical phase key
 */
function normalizePhaseKey(key) {
    if (!key || typeof key !== 'string') return key;
    return PHASE_KEY_ALIASES[key] || key;
}

// ---------------------------------------------------------------------------
// Self-healing diagnosis
// ---------------------------------------------------------------------------

/** Maximum pending_escalations entries (FIFO ring buffer) */
const MAX_ESCALATIONS = 20;
/** Dedup window for pending_escalations in milliseconds (60 seconds) */
const ESCALATION_DEDUP_WINDOW_MS = 60000;

/**
 * Diagnose why a hook is about to block.
 * Distinguishes genuine requirement failures from infrastructure issues.
 *
 * @param {string} hookName - Name of the blocking hook
 * @param {string} phase - Current phase key
 * @param {string} requirement - Which requirement failed (e.g., 'test_iteration')
 * @param {object} state - Current state.json
 * @returns {{ cause: string, detail: string, remediation: string|null }}
 *   cause: 'genuine' | 'infrastructure' | 'stale'
 */
function diagnoseBlockCause(hookName, phase, requirement, state) {
    // Check 1: Was the phase key an alias? (already normalized by caller, but check if original differed)
    const canonical = normalizePhaseKey(phase);
    if (canonical !== phase) {
        return {
            cause: 'infrastructure',
            detail: `Phase key '${phase}' is an alias for '${canonical}'`,
            remediation: `normalized_phase_key`
        };
    }

    // Check 2: Is there a stale workflow? (workflow completed/cancelled but active_workflow still present)
    const aw = state && state.active_workflow;
    if (aw && (aw.status === 'completed' || aw.status === 'cancelled')) {
        return {
            cause: 'stale',
            detail: `active_workflow has status '${aw.status}' but is still present in state`,
            remediation: `stale_workflow_detected`
        };
    }

    // Check 3: Phase not initialized in state.phases — only infrastructure if active workflow expects it
    if (state && state.phases && !state.phases[phase]) {
        // Only treat as infrastructure if an active workflow references this phase
        // (meaning the phase SHOULD have been initialized but wasn't).
        // Without an active workflow, missing phase state is a genuine "not started" condition.
        const aw2 = state.active_workflow;
        if (aw2 && aw2.current_phase === phase) {
            return {
                cause: 'infrastructure',
                detail: `Phase '${phase}' has no entry in state.phases — may not be initialized`,
                remediation: `missing_phase_state`
            };
        }
    }

    // Default: genuine failure — the requirement is truly not met
    return {
        cause: 'genuine',
        detail: `Requirement '${requirement}' not satisfied for phase '${phase}'`,
        remediation: null
    };
}

/**
 * Output a self-heal notification to stderr (not stdout, which is reserved for hook protocol JSON).
 * Format: [SELF-HEAL] {hook}: {message}
 * Also logs to hook-activity.log via logHookEvent.
 *
 * @param {string} hookName - Name of the hook performing the self-heal
 * @param {string} message - Human-readable description of what happened
 */
function outputSelfHealNotification(hookName, message) {
    const formatted = `[SELF-HEAL] ${hookName}: ${message}`;
    console.error(formatted);
    logHookEvent(hookName, 'self-heal', { reason: message });
}

/**
 * Compute duration in minutes between two ISO-8601 timestamps.
 * Returns null if either timestamp is missing, invalid, or duration is negative.
 * @param {string|null} started
 * @param {string|null} completed
 * @returns {number|null} Minutes rounded to nearest integer, or null
 */
function _computeDuration(started, completed) {
    if (!started || !completed) return null;
    const diff = Date.parse(completed) - Date.parse(started);
    if (isNaN(diff) || diff < 0) return null;
    return Math.round(diff / 60000);
}

/**
 * Extract summary string for a phase snapshot.
 * Primary: phases[key].summary. Fallback: last matching history[] entry.
 * @param {object} phaseData - The phase object from state.phases
 * @param {Array|undefined} history - state.history array
 * @param {string} phaseKey - Phase key for agent lookup
 * @returns {string|null} Summary truncated to 150 chars, or null
 */
function _extractSummary(phaseData, history, phaseKey) {
    // Primary: phases[key].summary
    if (phaseData.summary && typeof phaseData.summary === 'string') {
        return phaseData.summary.substring(0, 150);
    }

    // Fallback: last history[] entry matching agent + timestamp range
    if (!history || !Array.isArray(history)) return null;

    const expectedAgent = PHASE_AGENT_MAP[phaseKey];
    if (!expectedAgent) return null;

    const phaseStart = Date.parse(phaseData.started);
    const phaseEnd = Date.parse(phaseData.completed || phaseData.gate_passed);

    for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        if (entry.agent !== expectedAgent) continue;
        const entryTime = Date.parse(entry.timestamp);
        if (!isNaN(phaseStart) && !isNaN(phaseEnd)) {
            if (entryTime >= phaseStart && entryTime <= phaseEnd + 60000) {
                const action = (entry.action || '').substring(0, 150);
                return action || null;
            }
        } else {
            // No timestamp range — accept last matching agent entry
            const action = (entry.action || '').substring(0, 150);
            return action || null;
        }
    }

    return null;
}

/**
 * Extract test iteration data from a phase's iteration_requirements.
 * Returns null if no meaningful iteration data exists.
 * @param {object} phaseData - The phase object from state.phases
 * @returns {{ count: number, result: string, escalated: boolean }|null}
 */
function _extractTestIterations(phaseData) {
    const testIter = phaseData?.iteration_requirements?.test_iteration;
    if (!testIter) return null;

    const count = testIter.current_iteration ?? testIter.current ?? 0;
    if (count === 0 && !testIter.completed && !testIter.escalated) {
        return null; // No iteration data — omit field
    }

    return {
        count: count,
        result: testIter.completed === true ? 'passed' :
            testIter.escalated === true ? 'escalated' : 'unknown',
        escalated: testIter.escalated === true
    };
}

/**
 * Compute workflow-level metrics from snapshots and active_workflow.
 * @param {Array} snapshots - Array of phase snapshot objects
 * @param {object} activeWorkflow - state.active_workflow
 * @returns {object} Metrics object
 */
function _computeMetrics(snapshots, activeWorkflow) {
    const phasesCompleted = snapshots.filter(s => s.status === 'completed').length;

    // Duration from workflow timestamps
    let totalDuration = null;
    const startedAt = activeWorkflow.started_at;
    const completedAt = activeWorkflow.completed_at || activeWorkflow.cancelled_at;
    if (startedAt && completedAt) {
        const diff = Date.parse(completedAt) - Date.parse(startedAt);
        if (!isNaN(diff) && diff >= 0) {
            totalDuration = Math.round(diff / 60000);
        }
    }

    // Iteration counts
    let testIterTotal = 0;
    let gatesFirstTry = 0;
    let gatesIteration = 0;
    for (const snapshot of snapshots) {
        if (snapshot.test_iterations) {
            testIterTotal += snapshot.test_iterations.count;
        }
        if (snapshot.gate_passed) {
            if (snapshot.test_iterations && snapshot.test_iterations.count > 1) {
                gatesIteration++;
            } else {
                gatesFirstTry++;
            }
        }
    }

    return {
        total_phases: (activeWorkflow.phases && activeWorkflow.phases.length) || 0,
        phases_completed: phasesCompleted,
        total_duration_minutes: totalDuration,
        test_iterations_total: testIterTotal,
        gates_passed_first_try: gatesFirstTry,
        gates_required_iteration: gatesIteration
    };
}

/**
 * Collect phase snapshots and workflow metrics from pre-prune state.
 * Pure function — does not mutate state.
 *
 * @param {Object} state - Full state.json object (pre-prune)
 * @returns {{ phase_snapshots: Array, metrics: Object }}
 */
function collectPhaseSnapshots(state) {
    const DEFAULT_METRICS = {
        total_phases: 0,
        phases_completed: 0,
        total_duration_minutes: null,
        test_iterations_total: 0,
        gates_passed_first_try: 0,
        gates_required_iteration: 0
    };

    // Guard: require both active_workflow and phases
    if (!state || !state.active_workflow || !state.phases) {
        return { phase_snapshots: [], metrics: DEFAULT_METRICS };
    }

    const activeWorkflow = state.active_workflow;
    const workflowPhases = activeWorkflow.phases;
    if (!Array.isArray(workflowPhases) || workflowPhases.length === 0) {
        return { phase_snapshots: [], metrics: _computeMetrics([], activeWorkflow) };
    }

    const allPhases = state.phases;
    const history = state.history;
    const snapshots = [];

    for (const phaseKey of workflowPhases) {
        const phaseData = allPhases[phaseKey];
        if (!phaseData) continue; // Phase not initialized — skip

        const snapshot = {
            key: phaseKey,
            status: phaseData.status || 'pending',
            started: phaseData.started || null,
            completed: phaseData.completed || null,
            gate_passed: phaseData.gate_passed || null,
            duration_minutes: _computeDuration(phaseData.started, phaseData.completed),
            summary: _extractSummary(phaseData, history, phaseKey)
        };

        // Conditional: artifacts (omit if empty — ADR-007)
        if (phaseData.artifacts && Array.isArray(phaseData.artifacts) && phaseData.artifacts.length > 0) {
            snapshot.artifacts = phaseData.artifacts;
        }

        // Conditional: test_iterations (omit if no data — ADR-004)
        const testIter = _extractTestIterations(phaseData);
        if (testIter) {
            snapshot.test_iterations = testIter;
        }

        // Conditional: timing (omit if no data -- REQ-0022)
        if (phaseData.timing && typeof phaseData.timing === 'object') {
            snapshot.timing = phaseData.timing;
        }

        snapshots.push(snapshot);
    }

    const metrics = _computeMetrics(snapshots, activeWorkflow);

    return { phase_snapshots: snapshots, metrics };
}

// ---------------------------------------------------------------------------
// State pruning functions (BUG-0004)
// ---------------------------------------------------------------------------

/**
 * Prune skill_usage_log to keep only the last N entries.
 * @param {Object} state - The state object
 * @param {number} maxEntries - Maximum entries to keep (default 20)
 * @returns {Object} The mutated state object
 */
function pruneSkillUsageLog(state, maxEntries = 50) {
    if (!state.skill_usage_log || !Array.isArray(state.skill_usage_log)) return state;
    if (state.skill_usage_log.length > maxEntries) {
        state.skill_usage_log = state.skill_usage_log.slice(-maxEntries);
    }
    return state;
}

/**
 * Strip verbose sub-objects from completed/gate-passed phases.
 * Preserves: status, started, completed, gate_passed, artifacts, and any unknown fields.
 * Strips: iteration_requirements, constitutional_validation, gate_validation,
 *         testing_environment, verification_summary, atdd_validation.
 * Only strips from phases that have status=completed OR gate_passed is truthy.
 * Skips phases listed in protectedPhases (e.g., remaining workflow phases).
 * Adds _pruned_at timestamp to stripped phases for diagnosis.
 *
 * @param {Object} state - The state object
 * @param {string[]} [protectedPhases=[]] - Phase keys to skip (never prune)
 * @returns {Object} The mutated state object
 */
function pruneCompletedPhases(state, protectedPhases = []) {
    if (!state.phases || typeof state.phases !== 'object') return state;

    const protectedSet = new Set(protectedPhases);

    const STRIP_FIELDS = [
        'iteration_requirements',
        'constitutional_validation',
        'gate_validation',
        'testing_environment',
        'verification_summary',
        'atdd_validation'
    ];

    for (const [phaseKey, phase] of Object.entries(state.phases)) {
        if (protectedSet.has(phaseKey)) continue;
        if (phase.status === 'completed' || phase.gate_passed) {
            for (const field of STRIP_FIELDS) {
                delete phase[field];
            }
            phase._pruned_at = new Date().toISOString();
        }
    }
    return state;
}

/**
 * Prune history[] with FIFO cap and action string truncation.
 * @param {Object} state - The state object
 * @param {number} maxEntries - Maximum entries to keep (default 50)
 * @param {number} maxCharLen - Maximum action string length before truncation (default 200)
 * @returns {Object} The mutated state object
 */
function pruneHistory(state, maxEntries = 100, maxCharLen = 200) {
    if (!state.history || !Array.isArray(state.history)) return state;

    // FIFO: keep last N
    if (state.history.length > maxEntries) {
        state.history = state.history.slice(-maxEntries);
    }

    // Truncate long action strings
    for (const entry of state.history) {
        if (entry.action && typeof entry.action === 'string' && entry.action.length > maxCharLen) {
            entry.action = entry.action.substring(0, maxCharLen) + '...';
        }
    }
    return state;
}

/**
 * Prune workflow_history[] with FIFO cap, description truncation, and git_branch compaction.
 * @param {Object} state - The state object
 * @param {number} maxEntries - Maximum entries to keep (default 50)
 * @param {number} maxCharLen - Maximum description string length before truncation (default 200)
 * @returns {Object} The mutated state object
 */
function pruneWorkflowHistory(state, maxEntries = 50, maxCharLen = 200) {
    if (!state.workflow_history || !Array.isArray(state.workflow_history)) return state;

    // FIFO: keep last N
    if (state.workflow_history.length > maxEntries) {
        state.workflow_history = state.workflow_history.slice(-maxEntries);
    }

    for (const entry of state.workflow_history) {
        // Truncate long descriptions
        if (entry.description && typeof entry.description === 'string' && entry.description.length > maxCharLen) {
            entry.description = entry.description.substring(0, maxCharLen) + '...';
        }
        // Compact git_branch to name only
        if (entry.git_branch && typeof entry.git_branch === 'object') {
            const name = entry.git_branch.name;
            entry.git_branch = { name };
        }
    }
    return state;
}

/**
 * Reset all transient runtime fields to their null/empty defaults.
 * Called at workflow finalize to prevent stale data bleeding into
 * subsequent workflows.
 *
 * Pure function: takes state, mutates it, returns it.
 * Does NOT perform any disk I/O. Caller manages readState/writeState.
 *
 * Transient field list (explicit allowlist -- ADR-002):
 *   current_phase, active_agent, phases, blockers,
 *   pending_escalations, pending_delegation
 *
 * Traces to: FR-003 (AC-003-01 through AC-003-08), GH-39
 *
 * @param {Object} state - The state object to mutate
 * @returns {Object} The mutated state object (or input unchanged if null/undefined)
 */
function clearTransientFields(state) {
    if (!state) return state;

    state.current_phase = null;
    state.active_agent = null;
    state.phases = {};
    state.blockers = [];
    state.pending_escalations = [];
    state.pending_delegation = null;

    return state;
}

/**
 * Resolve the path to state-archive.json, accounting for monorepo mode.
 * Mirrors resolveStatePath() exactly -- same directory, different filename.
 *
 * - Single project: .isdlc/state-archive.json
 * - Monorepo: .isdlc/projects/{project-id}/state-archive.json
 *
 * Traces to: FR-015 (AC-015-01 through AC-015-06), GH-39
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to state-archive.json
 */
function resolveArchivePath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            return path.join(projectRoot, '.isdlc', 'projects', id, 'state-archive.json');
        }
    }

    // Default: single-project mode
    return path.join(projectRoot, '.isdlc', 'state-archive.json');
}

/**
 * Append a workflow record to state-archive.json and update the multi-key index.
 *
 * Best-effort: never throws. On any error, logs a warning to stderr and returns.
 * On corrupt or missing archive file, creates a fresh archive.
 *
 * Dedup (ADR-009): If the last record in the archive has the same `slug` AND
 * `completed_at` as the incoming record, the append is skipped. O(1) check.
 *
 * Index maintenance (ADR-010): source_id and slug are added as index keys
 * pointing to the new record's array position. Existing keys are appended
 * (supports re-work: same issue, multiple workflows).
 *
 * Traces to: FR-011 (AC-011-01 through AC-011-05), GH-39
 *
 * @param {Object} record - Archive record conforming to the schema
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {void}
 */
function appendToArchive(record, projectId) {
    try {
        const archivePath = resolveArchivePath(projectId);

        // Ensure directory exists (monorepo first-use)
        const dir = path.dirname(archivePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Read existing archive or create fresh
        let archive;
        if (fs.existsSync(archivePath)) {
            try {
                const content = fs.readFileSync(archivePath, 'utf8');
                archive = JSON.parse(content);
            } catch (parseErr) {
                // Corrupt file: log warning, start fresh
                debugLog('appendToArchive: corrupt archive file, creating fresh:', parseErr.message);
                archive = null;
            }
        }

        if (!archive || !Array.isArray(archive.records)) {
            archive = { version: 1, records: [], index: {} };
        }

        // Dedup check (ADR-009): skip if last record matches slug + completed_at
        if (archive.records.length > 0) {
            const lastRecord = archive.records[archive.records.length - 1];
            if (lastRecord.slug === record.slug && lastRecord.completed_at === record.completed_at) {
                debugLog('appendToArchive: duplicate detected, skipping');
                return;
            }
        }

        // Append record
        const position = archive.records.length;
        archive.records.push(record);

        // Update index (ADR-010): add source_id and slug keys
        if (!archive.index || typeof archive.index !== 'object') {
            archive.index = {};
        }

        if (record.source_id) {
            if (!Array.isArray(archive.index[record.source_id])) {
                archive.index[record.source_id] = [];
            }
            archive.index[record.source_id].push(position);
        }

        if (record.slug) {
            if (!Array.isArray(archive.index[record.slug])) {
                archive.index[record.slug] = [];
            }
            archive.index[record.slug].push(position);
        }

        // Write archive
        fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));

    } catch (err) {
        // Fail-open: log warning, never throw (NFR-007)
        debugLog('appendToArchive: error:', err.message);
    }
}

/**
 * Derive archive outcome from a legacy workflow_history entry.
 * @param {Object} entry - Legacy workflow_history entry
 * @returns {string} One of: "merged", "completed", "cancelled", "abandoned"
 */
function _deriveOutcome(entry) {
    if (entry.status === 'cancelled') return 'cancelled';
    if (entry.git_branch?.status === 'merged') return 'merged';
    if (entry.status === 'completed') return 'completed';
    return 'completed'; // Default fallback for legacy entries without explicit status
}

/**
 * Compact full phase_snapshots to phase_summary format.
 * @param {Array} snapshots - Full phase_snapshots array (or undefined)
 * @returns {Array} Compact array of { phase, status, summary }
 */
function _compactPhaseSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map(s => ({
        phase: s.key || s.phase || null,
        status: s.status || null,
        summary: s.summary || null
    }));
}

/**
 * Transform legacy workflow_history entries to archive record format
 * and append each to the archive via appendToArchive().
 *
 * Used by FR-009 (one-time migration) during orchestrator init.
 * Skip-on-error per entry: if one entry fails to transform, continue with the next.
 * Never throws.
 *
 * Traces to: FR-014 (AC-014-01 through AC-014-05), GH-39
 *
 * @param {Array} workflowHistory - Array of legacy workflow_history entries
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {void}
 */
function seedArchiveFromHistory(workflowHistory, projectId) {
    if (!Array.isArray(workflowHistory) || workflowHistory.length === 0) {
        return;
    }

    let seeded = 0;
    let skipped = 0;

    for (const entry of workflowHistory) {
        try {
            const record = {
                source_id: entry.id || null,
                slug: entry.artifact_folder || null,
                workflow_type: entry.type || null,
                completed_at: entry.completed_at || entry.cancelled_at || null,
                branch: entry.git_branch?.name || null,
                outcome: _deriveOutcome(entry),
                reason: entry.cancellation_reason || null,
                phase_summary: _compactPhaseSnapshots(entry.phase_snapshots),
                metrics: entry.metrics || {}
            };

            // Skip entries with no timestamp (cannot be meaningfully archived)
            if (!record.completed_at) {
                skipped++;
                continue;
            }

            appendToArchive(record, projectId);
            seeded++;
        } catch (entryErr) {
            // Skip-on-error per entry (AC-014-05)
            debugLog('seedArchiveFromHistory: skipping entry:', entryErr.message);
            skipped++;
        }
    }

    if (skipped > 0) {
        debugLog(`seedArchiveFromHistory: seeded ${seeded}, skipped ${skipped}`);
    }
}

/**
 * Reset phases for a new workflow. Clears all existing phase data and creates
 * fresh skeleton entries for the specified workflow phases.
 * @param {Object} state - The state object
 * @param {string[]} workflowPhases - Array of phase keys for the new workflow
 * @returns {Object} The mutated state object
 */
function resetPhasesForWorkflow(state, workflowPhases) {
    state.phases = {};
    for (const phaseKey of workflowPhases) {
        state.phases[phaseKey] = {
            status: 'pending',
            started: null,
            completed: null,
            gate_passed: null,
            artifacts: []
        };
    }
    return state;
}

// =========================================================================
// Dispatcher helpers (REQ-0010 Tier 1)
// =========================================================================

/**
 * Add a pending escalation entry to an in-memory state object.
 * Same dedup + FIFO cap logic as writePendingEscalation() but operates
 * on the passed state object without any disk I/O.
 *
 * @param {object} state - The state object to mutate
 * @param {object} entry - { type, hook, phase, detail, timestamp }
 * @returns {boolean} True if the entry was added (not a dedup)
 */
function addPendingEscalation(state, entry) {
    if (!state) return false;
    if (!Array.isArray(state.pending_escalations)) {
        state.pending_escalations = [];
    }

    // Dedup: skip if same hook+phase+type within window
    const now = entry.timestamp ? Date.parse(entry.timestamp) : Date.now();
    const isDuplicate = state.pending_escalations.some(existing => {
        if (existing.hook !== entry.hook || existing.phase !== entry.phase || existing.type !== entry.type) {
            return false;
        }
        const existingTime = existing.timestamp ? Date.parse(existing.timestamp) : 0;
        return (now - existingTime) < ESCALATION_DEDUP_WINDOW_MS;
    });

    if (isDuplicate) {
        return false;
    }

    state.pending_escalations.push(entry);

    // FIFO cap: keep only the newest MAX_ESCALATIONS entries
    if (state.pending_escalations.length > MAX_ESCALATIONS) {
        state.pending_escalations = state.pending_escalations.slice(-MAX_ESCALATIONS);
    }

    return true;
}

/**
 * Append a skill usage log entry to an in-memory state object.
 * Operates on the passed state object without any disk I/O.
 *
 * @param {object} state - The state object to mutate
 * @param {object} entry - The log entry to append
 * @returns {boolean} True if the entry was added
 */
function addSkillLogEntry(state, entry) {
    if (!state) return false;
    if (!Array.isArray(state.skill_usage_log)) {
        state.skill_usage_log = [];
    }
    state.skill_usage_log.push(entry);
    return true;
}

/**
 * Load iteration requirements config from the project's config directory.
 * Checks .claude/hooks/config/ first, then .isdlc/config/ as fallback.
 *
 * Consolidated from 4 hooks (gate-blocker, iteration-corridor,
 * constitution-validator, test-watcher) into common.cjs.
 *
 * @returns {object|null} Parsed iteration requirements or null
 */
function loadIterationRequirements() {
    const projectRoot = getProjectRoot();
    const configPaths = [
        path.join(getHooksConfigDir(projectRoot), 'iteration-requirements.json'),
        path.join(projectRoot, '.isdlc', 'config', 'iteration-requirements.json')
    ];

    for (const configPath of configPaths) {
        // FR-001: Use statSync inside _loadConfigWithCache to check existence + cache
        const result = _loadConfigWithCache(configPath, 'iteration-requirements');
        if (result !== null) {
            return result;
        }
    }
    return null;
}

/**
 * Load workflow definitions config from the project's config directory.
 * Checks .isdlc/config/ first, then .claude/hooks/config/ as fallback.
 *
 * Consolidated from gate-blocker into common.cjs.
 *
 * @returns {object|null} Parsed workflow definitions or null
 */
function loadWorkflowDefinitions() {
    const projectRoot = getProjectRoot();
    const configPaths = [
        path.join(projectRoot, '.isdlc', 'config', 'workflows.json'),
        path.join(getHooksConfigDir(projectRoot), 'workflows.json')
    ];

    for (const configPath of configPaths) {
        // FR-001: Use _loadConfigWithCache for mtime-based caching
        const result = _loadConfigWithCache(configPath, 'workflows');
        if (result !== null) {
            return result;
        }
    }
    return null;
}

/**
 * Check if the current phase has exceeded its timeout.
 * Reads started_at from phase state and timeout_minutes from requirements.
 * @param {object} state - Parsed state.json
 * @param {object} requirements - Parsed iteration-requirements.json
 * @returns {{ exceeded: boolean, elapsed?: number, limit?: number, phase?: string }}
 */
function checkPhaseTimeout(state, requirements) {
    if (!state || !requirements) {
        return { exceeded: false };
    }

    const activeWorkflow = state.active_workflow;
    const currentPhase = activeWorkflow?.current_phase || state.current_phase;
    if (!currentPhase) {
        return { exceeded: false };
    }

    const phaseReq = requirements.phase_requirements?.[currentPhase];
    if (!phaseReq) {
        return { exceeded: false };
    }

    // Look for timeout_minutes in various config locations
    const timeoutMinutes = phaseReq.interactive_elicitation?.timeout_minutes
        || phaseReq.timeout_minutes
        || null;

    if (!timeoutMinutes) {
        return { exceeded: false };
    }

    // Find phase start time from state
    const phaseState = state.phases?.[currentPhase];
    const startedAt = phaseState?.started_at
        || phaseState?.iteration_requirements?.test_iteration?.started_at
        || phaseState?.iteration_requirements?.interactive_elicitation?.started_at
        || null;

    if (!startedAt) {
        return { exceeded: false };
    }

    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) {
        return { exceeded: false };
    }

    const elapsedMs = Date.now() - startTime;
    const elapsedMinutes = Math.round(elapsedMs / 60000);

    if (elapsedMinutes > timeoutMinutes) {
        return {
            exceeded: true,
            elapsed: elapsedMinutes,
            limit: timeoutMinutes,
            phase: currentPhase
        };
    }

    return { exceeded: false };
}

// =========================================================================
// Sizing Utilities (REQ-0011: Adaptive Workflow Sizing)
// =========================================================================

/**
 * Safely parse a non-negative integer. Returns defaultVal on failure.
 * @param {*} val - Value to parse
 * @param {number} defaultVal - Default value
 * @returns {number}
 * @private
 */
function _safeNonNegInt(val, defaultVal) {
    if (typeof val === 'number' && Number.isInteger(val) && val >= 0) return val;
    const parsed = parseInt(val, 10);
    return (!isNaN(parsed) && parsed >= 0) ? parsed : defaultVal;
}

/**
 * Validate and normalize a parsed JSON object into SizingMetrics.
 * Invalid fields are replaced with safe defaults.
 *
 * @param {object} parsed - Raw parsed JSON from metadata block
 * @returns {{ file_count: number, module_count: number, risk_score: string,
 *             coupling: string, coverage_gaps: number }}
 * @private
 */
function _validateAndNormalizeSizingMetrics(parsed) {
    const VALID_LEVELS = ['low', 'medium', 'high'];

    const file_count = _safeNonNegInt(parsed.files_directly_affected, 0);
    const module_count = _safeNonNegInt(parsed.modules_affected, 0);
    const risk_score = VALID_LEVELS.includes(String(parsed.risk_level).toLowerCase())
        ? String(parsed.risk_level).toLowerCase()
        : 'medium';
    const coupling = VALID_LEVELS.includes(String(parsed.blast_radius).toLowerCase())
        ? String(parsed.blast_radius).toLowerCase()
        : 'medium';
    const coverage_gaps = _safeNonNegInt(parsed.coverage_gaps, 0);

    return { file_count, module_count, risk_score, coupling, coverage_gaps };
}

/**
 * Parse sizing metrics from impact-analysis.md content.
 *
 * Strategy (ADR-0003):
 *   1. Primary: Parse last JSON metadata block (```json ... ```)
 *   2. Fallback: Regex on Executive Summary prose
 *   3. Default: Return null (caller defaults to standard)
 *
 * @param {string} content - Raw markdown content of impact-analysis.md
 * @returns {{ file_count: number, module_count: number, risk_score: string,
 *             coupling: string, coverage_gaps: number } | null}
 */
function parseSizingFromImpactAnalysis(content) {
    // Guard: empty or non-string content
    if (!content || typeof content !== 'string') {
        return null;
    }

    // --- Primary: JSON metadata block ---
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let lastMatch = null;
    let match;
    while ((match = jsonBlockRegex.exec(content)) !== null) {
        lastMatch = match[1];
    }

    if (lastMatch) {
        try {
            const parsed = JSON.parse(lastMatch);
            return _validateAndNormalizeSizingMetrics(parsed);
        } catch (e) {
            // JSON parse failed -- fall through to fallback
        }
    }

    // --- Fallback: Executive Summary prose ---
    const fileMatch = content.match(/\*\*Affected Files\*\*:\s*(\d+)/i);
    const moduleMatch = content.match(/\*\*Modules? Affected\*\*:\s*(\d+)/i);
    const riskMatch = content.match(/\*\*Risk(?:\s*Level)?\*\*:\s*(low|medium|high)/i);
    const couplingMatch = content.match(/\*\*Blast\s*Radius\*\*:\s*(low|medium|high)/i);
    const coverageMatch = content.match(/\*\*Coverage\s*Gaps?\*\*:\s*(\d+)/i);

    // Require at least file_count and risk_score for fallback to succeed
    if (fileMatch && riskMatch) {
        return {
            file_count: parseInt(fileMatch[1], 10),
            module_count: moduleMatch ? parseInt(moduleMatch[1], 10) : 0,
            risk_score: riskMatch[1].toLowerCase(),
            coupling: couplingMatch ? couplingMatch[1].toLowerCase() : 'medium',
            coverage_gaps: coverageMatch ? parseInt(coverageMatch[1], 10) : 0
        };
    }

    // --- Default: parsing failed ---
    return null;
}

/**
 * Compute a sizing recommendation from impact analysis metrics.
 *
 * Pure function: no I/O, no side effects. Deterministic given same inputs.
 *
 * Algorithm:
 *   1. If metrics is null -> standard (parsing failure)
 *   2. If file_count <= light_max_files AND risk != high -> light
 *   3. If file_count >= epic_min_files OR risk == high -> epic
 *   4. Otherwise -> standard
 *
 * @param {{ file_count: number, module_count: number, risk_score: string,
 *           coupling: string, coverage_gaps: number } | null} metrics
 * @param {{ light_max_files: number, epic_min_files: number }} thresholds
 * @returns {{ intensity: string, rationale: string, metrics: object | null }}
 */
function computeSizingRecommendation(metrics, thresholds) {
    // Step 1: Validate and sanitize thresholds
    const t = { ...thresholds };
    if (typeof t.light_max_files !== 'number' || t.light_max_files < 1) {
        t.light_max_files = 5;
    }
    if (typeof t.epic_min_files !== 'number' || t.epic_min_files < 2) {
        t.epic_min_files = 20;
    }
    if (t.light_max_files >= t.epic_min_files) {
        t.light_max_files = 5;
        t.epic_min_files = 20;
    }

    // Step 2: Null metrics guard
    if (metrics === null || metrics === undefined) {
        return {
            intensity: 'standard',
            rationale: 'Unable to parse impact analysis metrics. Defaulting to standard workflow.',
            metrics: null
        };
    }

    // Step 3: Apply sizing algorithm
    const highRisk = metrics.risk_score === 'high';

    let intensity;
    let rationale;

    if (metrics.file_count <= t.light_max_files && !highRisk) {
        intensity = 'light';
        rationale = `Low scope (${metrics.file_count} files, ${metrics.risk_score} risk). ` +
            `Architecture and Design phases can be skipped.`;
    } else if (metrics.file_count >= t.epic_min_files || highRisk) {
        intensity = 'epic';
        rationale = `Large scope (${metrics.file_count} files, ${metrics.risk_score} risk). ` +
            `Epic decomposition recommended.`;
    } else {
        intensity = 'standard';
        rationale = `Medium scope (${metrics.file_count} files, ${metrics.risk_score} risk). ` +
            `Full workflow recommended.`;
    }

    return { intensity, rationale, metrics };
}

/**
 * Normalize a risk level string to one of: 'low', 'medium', 'high'.
 * Compound levels like 'low-to-medium' are resolved to the higher value.
 *
 * @param {string|null|undefined} raw - Raw risk level string
 * @returns {string} Normalized risk level ('low', 'medium', or 'high')
 * @private
 */
function normalizeRiskLevel(raw) {
    if (!raw || typeof raw !== 'string') return 'medium';
    const normalized = raw.toLowerCase().trim();
    const VALID = ['low', 'medium', 'high'];
    if (VALID.includes(normalized)) return normalized;
    // Compound levels like 'low-to-medium' -> take the higher
    if (normalized.includes('high')) return 'high';
    if (normalized.includes('medium')) return 'medium';
    return 'medium'; // unknown -> conservative default
}

/**
 * Attempt to extract sizing metrics from fallback artifacts when
 * parseSizingFromImpactAnalysis() returns null.
 *
 * Fallback chain:
 *   1. quick-scan.md -- extract JSON metadata block with affected_file_count
 *   2. requirements-spec.md (then requirements.md) -- extract scope keyword
 *   3. If both fail, return { metrics: null, source: null }
 *
 * BUG-0051-GH-51: FR-003, AC-004, AC-005, AC-006
 *
 * @param {string} artifactFolder - e.g. 'bug-0051-sizing-consent'
 * @param {string} projectRoot    - absolute path to project root
 * @returns {{ metrics: object | null, source: string | null }}
 */
function extractFallbackSizingMetrics(artifactFolder, projectRoot) {
    // Input validation (FR-003 defensive)
    if (!artifactFolder || !projectRoot) {
        return { metrics: null, source: null };
    }

    const basePath = path.join(projectRoot, 'docs', 'requirements', artifactFolder);

    // --- Fallback 1: quick-scan.md ---
    try {
        const content = fs.readFileSync(path.join(basePath, 'quick-scan.md'), 'utf8');
        const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
        let lastMatch = null;
        let match;
        while ((match = jsonBlockRegex.exec(content)) !== null) {
            lastMatch = match[1];
        }

        if (lastMatch) {
            const parsed = JSON.parse(lastMatch);
            if (typeof parsed.affected_file_count === 'number') {
                const risk = normalizeRiskLevel(parsed.risk_level);
                return {
                    metrics: {
                        file_count: parsed.affected_file_count,
                        module_count: 0,
                        risk_score: risk,
                        coupling: 'unknown',
                        coverage_gaps: 0
                    },
                    source: 'quick-scan'
                };
            }
        }
    } catch (_e) {
        // File not found or parse error -- fall through
    }

    // --- Fallback 2: requirements-spec.md then requirements.md ---
    const reqFiles = ['requirements-spec.md', 'requirements.md'];
    for (const reqFile of reqFiles) {
        try {
            const content = fs.readFileSync(path.join(basePath, reqFile), 'utf8');
            const scopeMatch = content.match(/(^|\n)\*?\*?Scope\*?\*?\s*[:=]\s*(SMALL|MEDIUM|LARGE)/im);
            if (scopeMatch) {
                const keyword = scopeMatch[2].toUpperCase();
                const SCOPE_MAP = { SMALL: 3, MEDIUM: 10, LARGE: 25 };
                return {
                    metrics: {
                        file_count: SCOPE_MAP[keyword],
                        module_count: 0,
                        risk_score: 'medium',
                        coupling: 'unknown',
                        coverage_gaps: 0
                    },
                    source: 'requirements-spec'
                };
            }
        } catch (_e) {
            // File not found -- try next
        }
    }

    // --- No fallback available ---
    return { metrics: null, source: null };
}

/**
 * Validate post-mutation state invariants for sizing.
 *
 * @param {object} state - The state object after mutation
 * @returns {string|null} Error description if invariant failed, null if all pass
 * @private
 */
function _checkSizingInvariants(state) {
    const aw = state.active_workflow;

    // INV-01: Minimum 3 phases
    if (!Array.isArray(aw.phases) || aw.phases.length < 3) {
        return `INV-01: phases.length=${aw.phases?.length || 0} < 3`;
    }

    // INV-02: Index within bounds
    if (aw.current_phase_index >= aw.phases.length) {
        return `INV-02: current_phase_index=${aw.current_phase_index} >= phases.length=${aw.phases.length}`;
    }

    // INV-03: Every phase_status key exists in phases array
    const phasesSet = new Set(aw.phases);
    for (const key of Object.keys(aw.phase_status)) {
        if (!phasesSet.has(key)) {
            return `INV-03: phase_status key "${key}" not in phases array`;
        }
    }

    // INV-04: Next phase is pending
    const nextPhase = aw.phases[aw.current_phase_index];
    if (aw.phase_status[nextPhase] !== 'pending') {
        return `INV-04: next phase "${nextPhase}" has status "${aw.phase_status[nextPhase]}", expected "pending"`;
    }

    return null; // All invariants pass
}

/**
 * Apply a sizing decision to the in-memory state object.
 *
 * For 'light' intensity:
 *   - Removes phases listed in light_skip_phases from active_workflow.phases
 *   - Removes corresponding entries from phase_status and top-level phases
 *   - Recalculates current_phase_index
 *   - Writes sizing record to active_workflow.sizing
 *   - On invariant failure: rolls back all changes, falls back to standard
 *
 * For 'standard' and 'epic':
 *   - No phase modifications
 *   - Writes sizing record only
 *   - For epic: sets effective_intensity to 'standard', epic_deferred to true
 *
 * Follows the same mutation-in-place pattern as resetPhasesForWorkflow().
 *
 * @param {object} state - The state.json object (mutated in place)
 * @param {string} intensity - 'light' | 'standard' | 'epic'
 * @param {object} sizingData - { metrics, forced_by_flag, overridden,
 *                               overridden_to, recommended_intensity, config }
 * @returns {object} The mutated state object (same reference)
 */
function applySizingDecision(state, intensity, sizingData = {}) {
    // Step 0: Validate intensity
    const VALID_INTENSITIES = ['light', 'standard', 'epic'];
    if (!VALID_INTENSITIES.includes(intensity)) {
        process.stderr.write(`[sizing] Invalid intensity "${intensity}", defaulting to standard\n`);
        intensity = 'standard';
    }

    // Step 1: Guard - require active_workflow
    if (!state || !state.active_workflow) {
        process.stderr.write('[sizing] No active_workflow in state, skipping sizing\n');
        return state;
    }

    const aw = state.active_workflow;
    const metrics = sizingData.metrics || null;
    const now = new Date().toISOString();

    // Step 2: Compute effective intensity
    let effective_intensity = intensity;
    let epic_deferred = false;
    if (intensity === 'epic') {
        effective_intensity = 'standard';
        epic_deferred = true;
    }

    // Step 3: Build sizing record
    const sizingRecord = {
        intensity,
        effective_intensity,
        file_count: metrics ? (metrics.file_count || 0) : 0,
        module_count: metrics ? (metrics.module_count || 0) : 0,
        risk_score: metrics ? (metrics.risk_score || 'unknown') : 'unknown',
        coupling: metrics ? (metrics.coupling || 'unknown') : 'unknown',
        coverage_gaps: metrics ? (metrics.coverage_gaps || 0) : 0,
        recommended_by: sizingData.forced_by_flag ? 'user' : 'framework',
        overridden: !!sizingData.overridden,
        overridden_to: sizingData.overridden_to || null,
        decided_at: now,
        forced_by_flag: !!sizingData.forced_by_flag,
        epic_deferred,

        // Audit fields (BUG-0051-GH-51: FR-005, FR-006)
        reason: sizingData.reason || null,
        user_prompted: sizingData.user_prompted !== undefined
            ? !!sizingData.user_prompted : null,
        fallback_source: sizingData.fallback_source || null,
        fallback_attempted: sizingData.fallback_attempted !== undefined
            ? !!sizingData.fallback_attempted : null
    };

    // Step 4: For standard/epic, just write record and return
    if (effective_intensity !== 'light') {
        aw.sizing = sizingRecord;
        return state;
    }

    // Step 5: Light intensity -- modify phase arrays
    // 5a. Determine which phases to skip
    const config = sizingData.config || {};
    const skipPhases = Array.isArray(config.light_skip_phases)
        ? config.light_skip_phases
        : ['03-architecture', '04-design'];

    // 5b. Snapshot for rollback
    const snapshot = {
        phases: [...aw.phases],
        phase_status: { ...aw.phase_status },
        current_phase_index: aw.current_phase_index,
        top_phases: state.phases ? { ...state.phases } : {}
    };

    // 5c. Filter phases array
    aw.phases = aw.phases.filter(p => !skipPhases.includes(p));

    // 5d. Remove from phase_status
    for (const p of skipPhases) {
        delete aw.phase_status[p];
    }

    // 5e. Remove from top-level phases
    if (state.phases) {
        for (const p of skipPhases) {
            delete state.phases[p];
        }
    }

    // 5f. Recalculate current_phase_index
    // Find the last completed phase (02-impact-analysis) and set index to next
    const lastCompleted = '02-impact-analysis';
    const lastCompletedIdx = aw.phases.indexOf(lastCompleted);
    if (lastCompletedIdx >= 0) {
        aw.current_phase_index = lastCompletedIdx + 1;
    }
    // If 02-impact-analysis not found, try to find the highest-indexed completed phase
    else {
        let highestCompleted = -1;
        for (let i = 0; i < aw.phases.length; i++) {
            if (aw.phase_status[aw.phases[i]] === 'completed') {
                highestCompleted = i;
            }
        }
        aw.current_phase_index = highestCompleted + 1;
    }

    // Step 6: Invariant checks
    const invariantsFailed = _checkSizingInvariants(state);

    if (invariantsFailed) {
        // Rollback
        process.stderr.write(`[sizing] Invariant check failed: ${invariantsFailed}. Rolling back to standard.\n`);
        aw.phases = snapshot.phases;
        aw.phase_status = snapshot.phase_status;
        aw.current_phase_index = snapshot.current_phase_index;
        state.phases = snapshot.top_phases;

        sizingRecord.intensity = intensity; // preserve original for audit
        sizingRecord.effective_intensity = 'standard';
        sizingRecord.fallback_reason = 'invariant_check_failed';
    }

    // Step 7: Write sizing record
    aw.sizing = sizingRecord;

    return state;
}

// =========================================================================
// Supervised Mode Utilities (REQ-0013: Supervised Mode)
// =========================================================================

/**
 * Map a phase key to a human-readable display name.
 * @param {string} phaseKey - e.g., '03-architecture'
 * @returns {string} Display name, e.g., 'Architecture'
 * @private
 */
function _resolvePhaseDisplayName(phaseKey) {
    const PHASE_NAMES = {
        '00-quick-scan': 'Quick Scan',
        '01-requirements': 'Requirements',
        '02-impact-analysis': 'Impact Analysis',
        '02-tracing': 'Root Cause Tracing',
        '03-architecture': 'Architecture',
        '04-design': 'Design & Specifications',
        '05-test-strategy': 'Test Strategy',
        '06-implementation': 'Implementation',
        '07-testing': 'Testing',
        '08-code-review': 'Code Review & QA',
        '09-validation': 'Security & Compliance',
        '10-cicd': 'CI/CD Pipeline',
        '11-local-testing': 'Local Testing',
        '12-test-deploy': 'Staging Deployment',
        '13-production': 'Production Deployment',
        '14-operations': 'Operations & Monitoring',
        '15-upgrade-plan': 'Upgrade Planning',
        '15-upgrade-execute': 'Upgrade Execution',
        '16-quality-loop': 'Quality Loop'
    };

    if (PHASE_NAMES[phaseKey]) {
        return PHASE_NAMES[phaseKey];
    }

    // Fallback: derive from phase key (remove number prefix, title case)
    const parts = phaseKey.split('-').slice(1);
    return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || phaseKey;
}

/**
 * Extract key decision bullet points from a phase summary string.
 * Splits on commas and semicolons. Returns up to 5 entries.
 * @param {string} summaryText - Phase summary text
 * @returns {string[]} Array of decision strings (max 5)
 * @private
 */
function _extractDecisions(summaryText) {
    if (!summaryText || typeof summaryText !== 'string') {
        return [];
    }

    // Split on comma or semicolon boundaries
    const parts = summaryText.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0);
    return parts.slice(0, 5);
}

/**
 * Get git diff --name-status output for the current working tree.
 * Returns null if git is unavailable or fails (ASM-013-03).
 * @param {string} projectRoot - Absolute path to project root
 * @returns {string|null} Diff output or null
 * @private
 */
function _getGitDiffNameStatus(projectRoot) {
    try {
        const { execSync } = require('child_process');
        const output = execSync('git diff --name-status HEAD', {
            cwd: projectRoot,
            encoding: 'utf8',
            timeout: 5000,      // 5s timeout for safety
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output;
    } catch (e) {
        // Git unavailable or command failed -- degrade gracefully
        return null;
    }
}

/**
 * Read and normalize supervised_mode configuration from state.json.
 *
 * Follows the readCodeReviewConfig() fail-open pattern:
 * - Missing supervised_mode block: returns { enabled: false }
 * - Invalid or corrupt block: returns { enabled: false }
 * - Invalid field values: replaced with safe defaults
 *
 * Traces to: FR-01 (AC-01a, AC-01b, AC-01c, AC-01f), NFR-013-02
 *
 * @param {object} state - Parsed state.json content (already loaded by caller)
 * @returns {{ enabled: boolean, review_phases: 'all'|string[], parallel_summary: boolean, auto_advance_timeout: number|null }}
 */
function readSupervisedModeConfig(state) {
    const defaults = { enabled: false, review_phases: 'all', parallel_summary: true, auto_advance_timeout: null };

    // Guard: no state or no supervised_mode block
    if (!state || typeof state !== 'object') {
        return defaults;
    }

    const sm = state.supervised_mode;

    // Guard: supervised_mode missing or not an object
    if (!sm || typeof sm !== 'object' || Array.isArray(sm)) {
        return defaults;
    }

    // Normalize enabled (must be boolean true to enable)
    const enabled = sm.enabled === true;

    // Normalize review_phases
    let review_phases = 'all';
    if (sm.review_phases === 'all') {
        review_phases = 'all';
    } else if (Array.isArray(sm.review_phases)) {
        // Filter to valid phase number strings (2-digit prefixes like "01", "03", "06")
        review_phases = sm.review_phases.filter(
            p => typeof p === 'string' && /^\d{2}$/.test(p)
        );
        // If all entries were invalid, fall back to 'all'
        if (review_phases.length === 0) {
            review_phases = 'all';
        }
    }
    // Any other type: default to 'all'

    // Normalize parallel_summary (default true)
    const parallel_summary = typeof sm.parallel_summary === 'boolean'
        ? sm.parallel_summary
        : true;

    // auto_advance_timeout: reserved, not implemented (always null)
    const auto_advance_timeout = null;

    return { enabled, review_phases, parallel_summary, auto_advance_timeout };
}

/**
 * Determine if a review gate should fire for the given phase.
 *
 * Traces to: FR-01 (AC-01d, AC-01e, AC-01f), FR-03 (AC-03e, AC-03f)
 *
 * @param {{ enabled: boolean, review_phases: 'all'|string[] }} config - Normalized config from readSupervisedModeConfig()
 * @param {string} phaseKey - Phase key (e.g., '03-architecture', '04-design')
 * @returns {boolean} True if review gate should fire
 */
function shouldReviewPhase(config, phaseKey) {
    // Guard: config not valid or not enabled
    if (!config || config.enabled !== true) {
        return false;
    }

    // Guard: invalid phase key
    if (!phaseKey || typeof phaseKey !== 'string') {
        return false;
    }

    // review_phases = 'all' means every phase triggers review
    if (config.review_phases === 'all') {
        return true;
    }

    // review_phases is an array of 2-digit phase prefixes
    if (Array.isArray(config.review_phases)) {
        // Extract the 2-digit prefix from phaseKey (e.g., '03' from '03-architecture')
        const phaseNumber = phaseKey.split('-')[0];
        return config.review_phases.includes(phaseNumber);
    }

    // Unexpected review_phases type: fail-open (no review)
    return false;
}

/**
 * Generate a phase summary markdown file after phase completion.
 *
 * Output: .isdlc/reviews/phase-{NN}-summary.md
 * Overwrites any existing summary for the same phase (redo support).
 *
 * Traces to: FR-02 (AC-02a through AC-02e), NFR-013-03, NFR-013-06
 *
 * @param {object} state - Parsed state.json content
 * @param {string} phaseKey - Phase key (e.g., '03-architecture')
 * @param {string} projectRoot - Absolute path to project root
 * @param {{ minimal?: boolean }} [options={}] - Options
 *   - minimal: If true, generate minimal summary (no diffs, no decisions)
 * @returns {string|null} Absolute path to generated summary file, or null on failure
 */
function generatePhaseSummary(state, phaseKey, projectRoot, options = {}) {
    try {
        // --- Extract phase metadata from state ---
        const phaseData = state?.phases?.[phaseKey] || {};
        const phaseNumber = phaseKey.split('-')[0];               // '03'
        const phaseName = _resolvePhaseDisplayName(phaseKey);     // 'Architecture'

        // Duration calculation
        const started = phaseData.started || null;
        const completed = phaseData.completed || null;
        let durationStr = 'N/A';
        if (started && completed) {
            const ms = new Date(completed) - new Date(started);
            if (!isNaN(ms) && ms >= 0) {
                const minutes = Math.round(ms / 60000);
                durationStr = `${minutes}m`;
            }
        }

        // Artifact list from phase state
        const artifacts = Array.isArray(phaseData.artifacts)
            ? phaseData.artifacts
            : [];

        // Summary text from phase state
        const summaryText = phaseData.summary || 'No summary available';

        // --- Build markdown ---
        let md = '';
        md += `# Phase ${phaseNumber} Summary: ${phaseName}\n\n`;
        md += `**Status**: Completed\n`;
        md += `**Duration**: ${durationStr}`;
        if (started && completed && durationStr !== 'N/A') {
            md += ` (${started} to ${completed})`;
        }
        md += `\n`;
        md += `**Artifacts**: ${artifacts.length} files\n\n`;

        // Key decisions (full summary only)
        if (!options.minimal) {
            md += `## Key Decisions\n`;
            const decisions = _extractDecisions(summaryText);
            if (decisions.length === 0) {
                md += `- ${summaryText}\n`;
            } else {
                for (const d of decisions) {
                    md += `- ${d}\n`;
                }
            }
            md += `\n`;
        }

        // Artifacts table
        md += `## Artifacts Created/Modified\n`;
        if (artifacts.length === 0) {
            md += `No file changes recorded in phase state.\n`;
        } else {
            md += `| File | Status |\n`;
            md += `|------|--------|\n`;
            for (const a of artifacts) {
                md += `| ${a} | Created/Modified |\n`;
            }
        }
        md += `\n`;

        // Git diff section (full summary only)
        if (!options.minimal) {
            md += `## File Changes (git diff)\n`;
            const diffOutput = _getGitDiffNameStatus(projectRoot);
            if (diffOutput !== null) {
                if (diffOutput.trim() === '') {
                    md += `No uncommitted file changes detected.\n`;
                } else {
                    md += '```\n' + diffOutput + '\n```\n';
                }
            } else {
                md += `Git diff unavailable.\n`;
            }
            md += `\n`;
        }

        // Links section
        if (artifacts.length > 0) {
            md += `## Links\n`;
            for (const a of artifacts) {
                md += `- [${a}](${a})\n`;
            }
            md += `\n`;
        }

        // --- Write to file ---
        const reviewsDir = path.join(projectRoot, '.isdlc', 'reviews');
        fs.mkdirSync(reviewsDir, { recursive: true });     // AC-02c

        const summaryPath = path.join(reviewsDir, `phase-${phaseNumber}-summary.md`);
        fs.writeFileSync(summaryPath, md, 'utf8');          // AC-02d: overwrites

        return summaryPath;

    } catch (e) {
        // Fail-safe: never throw, log to stderr and return null
        try {
            process.stderr.write(`[supervised-mode] Summary generation failed: ${e.message}\n`);
        } catch (_) { /* swallow */ }
        return null;
    }
}

/**
 * Record a review gate action in the workflow's review history.
 *
 * Appends to active_workflow.review_history[] (initializes if missing).
 * Does NOT write state to disk -- caller must call writeState() after.
 *
 * Traces to: FR-08 (AC-08a, AC-08b)
 *
 * @param {object} state - Parsed state.json content (mutated in place)
 * @param {string} phaseKey - Phase key (e.g., '03-architecture')
 * @param {'continue'|'review'|'redo'} action - The user's choice
 * @param {object} [details={}] - Additional fields to include in the entry
 *   - For 'continue': { timestamp }
 *   - For 'review': { paused_at, resumed_at }
 *   - For 'redo': { redo_count, guidance, timestamp }
 * @returns {boolean} True if recorded successfully, false if state is invalid
 */
function recordReviewAction(state, phaseKey, action, details = {}) {
    // Guard: state and active_workflow must exist
    if (!state || !state.active_workflow) {
        return false;
    }

    const aw = state.active_workflow;

    // Initialize review_history if missing or not an array
    if (!Array.isArray(aw.review_history)) {
        aw.review_history = [];
    }

    // Build entry (spread details to avoid mutating the original)
    const entry = {
        phase: phaseKey,
        action: action,
        timestamp: details.timestamp || getTimestamp(),
        ...details
    };

    // Ensure timestamp is present (not duplicated if already in details)
    if (!entry.timestamp) {
        entry.timestamp = getTimestamp();
    }

    aw.review_history.push(entry);

    return true;
}

// =========================================================================
// Session Cache (REQ-0001: Unified SessionStart Cache)
// =========================================================================

/**
 * Collect mtimes of all source files for cache staleness detection.
 * Returns sorted array and a hash computed from mtime concatenation.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {{ sources: Array<{path: string, mtimeMs: number}>, hash: string, count: number }}
 * @private
 * Traces to: REQ-0001, FR-001, NFR-006 (staleness detection)
 */
function _collectSourceMtimes(projectRoot) {
    const sources = [];

    function addSource(filePath) {
        try {
            const stat = fs.statSync(filePath);
            sources.push({ path: filePath, mtimeMs: stat.mtimeMs });
        } catch (_) {
            // File missing -- skip
        }
    }

    // Config files
    const configFiles = [
        path.join(projectRoot, 'docs', 'isdlc', 'constitution.md'),
        path.join(projectRoot, 'src', 'isdlc', 'config', 'workflows.json'),
        path.join(projectRoot, 'src', 'claude', 'hooks', 'config', 'skills-manifest.json'),
        path.join(projectRoot, 'docs', 'isdlc', 'external-skills-manifest.json')
    ];

    const hookConfigPaths = [
        path.join(getHooksConfigDir(projectRoot), 'iteration-requirements.json'),
        path.join(projectRoot, '.claude', 'hooks', 'config', 'artifact-paths.json')
    ];

    for (const f of [...configFiles, ...hookConfigPaths]) {
        addSource(f);
    }

    // Skill files: use the skill path index to enumerate
    const skillIndex = _buildSkillPathIndex();
    for (const [, relPath] of skillIndex) {
        addSource(path.join(projectRoot, relPath));
    }

    // Persona files
    const personaDir = path.join(projectRoot, 'src', 'claude', 'agents');
    if (fs.existsSync(personaDir)) {
        try {
            const files = fs.readdirSync(personaDir);
            for (const f of files) {
                if (f.startsWith('persona-') && f.endsWith('.md')) {
                    addSource(path.join(personaDir, f));
                }
            }
        } catch (_) { /* skip */ }
    }

    // Topic files
    const topicDir = path.join(projectRoot, 'src', 'claude', 'skills', 'analysis-topics');
    if (fs.existsSync(topicDir)) {
        try {
            const categories = fs.readdirSync(topicDir, { withFileTypes: true });
            for (const cat of categories) {
                if (cat.isDirectory()) {
                    const catPath = path.join(topicDir, cat.name);
                    try {
                        const topicFiles = fs.readdirSync(catPath);
                        for (const f of topicFiles) {
                            if (f.endsWith('.md')) {
                                addSource(path.join(catPath, f));
                            }
                        }
                    } catch (_) { /* skip */ }
                }
            }
        } catch (_) { /* skip */ }
    }

    // Sort by path for deterministic hash
    sources.sort((a, b) => a.path.localeCompare(b.path));

    // Compute hash: simple rolling hash from concatenated mtimes
    let hashNum = 0;
    for (const s of sources) {
        hashNum = ((hashNum << 5) - hashNum + Math.round(s.mtimeMs)) | 0;
    }
    const hash = Math.abs(hashNum).toString(16).padStart(8, '0');

    return { sources, hash, count: sources.length };
}

/**
 * Rebuild the session cache file (.isdlc/session-cache.md).
 * Reads all static framework content and assembles it into a single
 * delimited Markdown file for SessionStart hook injection.
 *
 * Each section is wrapped in HTML comment delimiters:
 *   <!-- SECTION: NAME -->
 *   {content}
 *   <!-- /SECTION: NAME -->
 *
 * Fail-open per section: if a source file is missing, the section is
 * skipped with a <!-- SECTION: NAME SKIPPED: reason --> marker.
 *
 * @param {object} [options] - Optional configuration
 * @param {string} [options.projectRoot] - Override project root (for testing)
 * @param {boolean} [options.verbose] - Log progress to stderr
 * @returns {{ path: string, size: number, hash: string, sections: string[], skipped: string[] }}
 * @throws {Error} Only if .isdlc/ directory does not exist (no project)
 *
 * Traces to: FR-001 (AC-001-01 through AC-001-05), NFR-004, NFR-006, NFR-007, NFR-009
 */
function rebuildSessionCache(options = {}) {
    const root = options.projectRoot || getProjectRoot();
    const verbose = options.verbose || false;

    // Validate .isdlc/ exists
    const isdlcDir = path.join(root, '.isdlc');
    if (!fs.existsSync(isdlcDir)) {
        throw new Error(`No .isdlc/ directory at ${root}`);
    }

    // Collect source mtimes for hash
    const { hash, count } = _collectSourceMtimes(root);

    const sections = [];
    const skipped = [];

    // Helper: build a section with delimiters
    function buildSection(name, contentFn) {
        try {
            const content = contentFn();
            if (!content || content.trim().length === 0) {
                skipped.push(name);
                return `<!-- SECTION: ${name} SKIPPED: empty content -->`;
            }
            sections.push(name);
            return `<!-- SECTION: ${name} -->\n${content}\n<!-- /SECTION: ${name} -->`;
        } catch (err) {
            skipped.push(name);
            return `<!-- SECTION: ${name} SKIPPED: ${err.message} -->`;
        }
    }

    const parts = [];

    // Section 1: CONSTITUTION
    parts.push(buildSection('CONSTITUTION', () => {
        return fs.readFileSync(path.join(root, 'docs', 'isdlc', 'constitution.md'), 'utf8');
    }));

    // Section 2: WORKFLOW_CONFIG
    parts.push(buildSection('WORKFLOW_CONFIG', () => {
        return fs.readFileSync(path.join(root, 'src', 'isdlc', 'config', 'workflows.json'), 'utf8');
    }));

    // Section 3: ITERATION_REQUIREMENTS
    parts.push(buildSection('ITERATION_REQUIREMENTS', () => {
        return fs.readFileSync(path.join(root, '.claude', 'hooks', 'config', 'iteration-requirements.json'), 'utf8');
    }));

    // Section 4: ARTIFACT_PATHS
    parts.push(buildSection('ARTIFACT_PATHS', () => {
        return fs.readFileSync(path.join(root, '.claude', 'hooks', 'config', 'artifact-paths.json'), 'utf8');
    }));

    // Section 5: SKILLS_MANIFEST (REQ-0040: TOON encoding with fail-open fallback)
    parts.push(buildSection('SKILLS_MANIFEST', () => {
        const manifestPath = path.join(root, 'src', 'claude', 'hooks', 'config', 'skills-manifest.json');
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const jsonContent = JSON.stringify(raw, null, 2);

        // Attempt TOON encoding if data is a uniform array (ADR-0040-02, ADR-0040-03)
        try {
            const toonEncoder = require('./toon-encoder.cjs');
            if (toonEncoder.isUniformArray(raw)) {
                const toonContent = toonEncoder.encode(raw);
                // Log encoding stats to stderr (REQ-0040 FR-001)
                const jsonTokens = jsonContent.length;
                const toonTokens = toonContent.length;
                const reduction = ((1 - toonTokens / jsonTokens) * 100).toFixed(1);
                if (verbose) {
                    process.stderr.write(`TOON encoding: ${jsonTokens} -> ${toonTokens} chars (${reduction}% reduction)\n`);
                }
                return '[TOON]\n' + toonContent;
            }
        } catch (_) {
            // Fail-open: any error falls through to JSON (ADR-0040-03, Article X)
        }

        return jsonContent;
    }));

    // Section 6: SKILL_INDEX (per-agent blocks)
    parts.push(buildSection('SKILL_INDEX', () => {
        const manifest = loadManifest();
        if (!manifest || !manifest.ownership) return '';

        const blocks = [];
        for (const [agentName, agentEntry] of Object.entries(manifest.ownership)) {
            if (!agentEntry.skills || agentEntry.skills.length === 0) continue;
            const skillIndex = getAgentSkillIndex(agentName);
            if (skillIndex.length === 0) continue;
            const block = formatSkillIndexBlock(skillIndex);
            if (block) {
                blocks.push(`## Agent: ${agentName}\n${block}`);
            }
        }
        return blocks.join('\n\n');
    }));

    // Section 7: EXTERNAL_SKILLS
    parts.push(buildSection('EXTERNAL_SKILLS', () => {
        const extManifest = loadExternalManifest();
        if (!extManifest || !extManifest.skills || extManifest.skills.length === 0) {
            return '';
        }
        const blocks = [];
        for (const skill of extManifest.skills) {
            const meta = `### External Skill: ${skill.name || skill.file}`;
            const bindingInfo = skill.bindings
                ? `Phases: ${(skill.bindings.phases || []).join(', ') || 'all'}\nAgents: ${(skill.bindings.agents || []).join(', ') || 'all'}\nInjection: ${skill.bindings.injection_mode || 'manual'}\nDelivery: ${skill.bindings.delivery_type || 'reference'}`
                : 'Bindings: none';
            const source = skill.source || 'unknown';

            let content = '';
            const skillDir = path.join(root, '.claude', 'skills', 'external');
            if (skill.file) {
                try {
                    content = fs.readFileSync(path.join(skillDir, skill.file), 'utf8');
                    if (content.length > 5000) {
                        content = content.substring(0, 5000) + '\n[... truncated for context budget ...]';
                    }
                } catch (_) {
                    content = '(file not readable)';
                }
            }

            blocks.push(`${meta}\nSource: ${source}\n${bindingInfo}\n\n${content}`);
        }
        return blocks.join('\n\n---\n\n');
    }));

    // Section 8: ROUNDTABLE_CONTEXT (persona + topic files) -- REQ-0047
    parts.push(buildSection('ROUNDTABLE_CONTEXT', () => {
        const rtParts = [];

        // Persona files -- dynamic discovery via persona-loader (FR-001, FR-009)
        let personaLoaderMod;
        try { personaLoaderMod = require('./persona-loader.cjs'); } catch (_) { personaLoaderMod = null; }

        if (personaLoaderMod) {
            const personaResult = personaLoaderMod.getPersonaPaths(root);
            for (const pPath of personaResult.paths) {
                try {
                    const content = fs.readFileSync(pPath, 'utf8');
                    const basename = path.basename(pPath);
                    const name = basename.replace('persona-', '').replace('.md', '')
                        .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    rtParts.push(`### Persona: ${name}\n${content}`);
                } catch (_) { /* skip unreadable */ }
            }

            // Drift warnings sub-section (FR-010)
            if (personaResult.driftWarnings.length > 0) {
                const driftLines = personaResult.driftWarnings.map(w =>
                    `- ${w.filename}: user v${w.userVersion}, shipped v${w.shippedVersion}`);
                rtParts.push(`### Drift Warnings\n${driftLines.join('\n')}`);
            }

            // Skipped files sub-section (FR-001 AC-001-02)
            if (personaResult.skippedFiles.length > 0) {
                const skipLines = personaResult.skippedFiles.map(s =>
                    `- ${s.filename}: ${s.reason}`);
                rtParts.push(`### Skipped Persona Files\n${skipLines.join('\n')}`);
            }
        } else {
            // REQ-0050 FR-005 AC-005-06: Fallback discovers all persona-*.md files (not just 3 primaries)
            const personaDir = path.join(root, 'src', 'claude', 'agents');
            try {
                if (fs.existsSync(personaDir)) {
                    const allPersonaFiles = fs.readdirSync(personaDir).filter(f => f.startsWith('persona-') && f.endsWith('.md')).sort();
                    for (const pf of allPersonaFiles) {
                        try {
                            const content = fs.readFileSync(path.join(personaDir, pf), 'utf8');
                            const name = pf.replace('persona-', '').replace('.md', '')
                                .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                            rtParts.push(`### Persona: ${name}\n${content}`);
                        } catch (_) { /* skip */ }
                    }
                }
            } catch (_) { /* fail-open */ }
        }

        // Roundtable config sub-section (FR-005)
        let rtConfigMod;
        try { rtConfigMod = require('./roundtable-config.cjs'); } catch (_) { rtConfigMod = null; }

        if (rtConfigMod) {
            const config = rtConfigMod.readRoundtableConfig(root);
            rtParts.push(`### Roundtable Config\n${rtConfigMod.formatConfigSection(config)}`);
        }

        // Topic files
        const topicDir = path.join(root, 'src', 'claude', 'skills', 'analysis-topics');
        if (fs.existsSync(topicDir)) {
            try {
                const categories = fs.readdirSync(topicDir, { withFileTypes: true });
                for (const cat of categories) {
                    if (!cat.isDirectory()) continue;
                    const catPath = path.join(topicDir, cat.name);
                    try {
                        const topicFiles = fs.readdirSync(catPath).filter(f => f.endsWith('.md')).sort();
                        for (const tf of topicFiles) {
                            try {
                                const content = fs.readFileSync(path.join(catPath, tf), 'utf8');
                                const topicId = tf.replace('.md', '');
                                rtParts.push(`### Topic: ${topicId}\n${content}`);
                            } catch (_) { /* skip */ }
                        }
                    } catch (_) { /* skip */ }
                }
            } catch (_) { /* skip */ }
        }

        return rtParts.join('\n\n');
    }));

    // Section 8: ROUNDTABLE_TOPICS (REMOVED logic above but kept key for cache)
    // Section 9: REMOVED (REQ-0037)

    // Section 10: INSTRUCTIONS (Antigravity-native)
    parts.push(buildSection('INSTRUCTIONS', () => {
        const agPath = path.join(root, 'ANTIGRAVITY.md');
        const clPath = path.join(root, 'CLAUDE.md');
        if (fs.existsSync(agPath)) {
            return fs.readFileSync(agPath, 'utf8');
        } else if (fs.existsSync(clPath)) {
            return fs.readFileSync(clPath, 'utf8');
        }
        return '';
    }));

    // Assemble header + all sections
    const header = `<!-- SESSION CACHE: Generated ${new Date().toISOString()} | Sources: ${count} | Hash: ${hash} -->`;
    const output = header + '\n\n' + parts.join('\n\n') + '\n';

    // Validate size
    if (output.length > 128000) {
        if (verbose) {
            process.stderr.write(`WARNING: Session cache exceeds 128K character budget (${output.length} chars)\n`);
        }
    }

    // Write cache file
    const cachePath = path.join(isdlcDir, 'session-cache.md');
    fs.writeFileSync(cachePath, output, 'utf8');

    if (verbose) {
        process.stderr.write(`Session cache written: ${cachePath} (${output.length} chars, ${sections.length} sections)\n`);
    }

    return { path: cachePath, size: output.length, hash, sections, skipped };
}

/**
 * Read .isdlc/process.json configuration file (REQ-0056).
 * Returns the parsed config object, or null if the file doesn't exist or is invalid.
 * Malformed JSON produces a stderr warning and returns null (fail-safe, Article X).
 *
 * @param {string} [projectRoot] - Project root directory (defaults to getProjectRoot())
 * @returns {object|null} Parsed process.json contents, or null
 */
function readProcessConfig(projectRoot) {
    try {
        const root = projectRoot || getProjectRoot();
        const configPath = path.join(root, '.isdlc', 'process.json');
        if (!fs.existsSync(configPath)) return null;
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            process.stderr.write('[process-config] .isdlc/process.json must be a JSON object, ignoring\n');
            return null;
        }
        return parsed;
    } catch (err) {
        if (err instanceof SyntaxError) {
            process.stderr.write(`[process-config] .isdlc/process.json has invalid JSON: ${err.message}, using defaults\n`);
        } else {
            debugLog('readProcessConfig error:', err.message);
        }
        return null;
    }
}

module.exports = {
    isAntigravity,
    getFrameworkDir,
    getSkillsDir,
    getHooksConfigDir,
    getHooksSchemaDir,
    getProjectRoot,
    // Phase prefixes (BUG-0009 item 0.13)
    PHASE_PREFIXES,
    // Protected state fields & patterns (REQ-HARDENING)
    STATE_JSON_PATTERN,
    PROTECTED_STATE_FIELDS,
    stateFileExistsOnDisk,
    // Monorepo support
    isMonorepoMode,
    readMonorepoConfig,
    writeMonorepoConfig,
    resolveProjectFromCwd,
    getActiveProject,
    resolveStatePath,
    resolveArchivePath,
    resolveConstitutionPath,
    resolveDocsPath,
    resolveExternalSkillsPath,
    resolveExternalManifestPath,
    resolveSkillReportPath,
    resolveTasksPath,
    resolveTestEvaluationPath,
    resolveAtddChecklistPath,
    resolveIsdlcDocsPath,
    isMigrationNeeded,
    loadExternalManifest,
    // External skill management (REQ-0022)
    SKILL_KEYWORD_MAP,
    PHASE_TO_AGENT_MAP,
    validateSkillFrontmatter,
    analyzeSkillContent,
    suggestBindings,
    writeExternalManifest,
    formatSkillInjectionBlock,
    removeSkillFromManifest,
    reconcileSkillsBySource,
    // State management (monorepo-aware)
    readStateValue,
    readState,
    writeState,
    appendSkillLog,
    getTimestamp,
    getManifestPath,
    loadManifest,
    getSkillOwner,
    getAgentSkillIndex,
    formatSkillIndexBlock,
    getAgentPhase,
    normalizeAgentName,
    isAgentAuthorizedForPhase,
    readStdin,
    outputBlockResponse,
    // Pending escalation tracking
    writePendingEscalation,
    readPendingEscalations,
    clearPendingEscalations,
    // Pending delegation tracking
    readPendingDelegation,
    writePendingDelegation,
    clearPendingDelegation,
    // Code review configuration
    readCodeReviewConfig,
    // Schema validation
    loadSchema,
    validateSchema,
    debugLog,
    // Phase delegation detection (REQ-0004)
    SETUP_COMMAND_KEYWORDS,
    isSetupCommand,
    detectPhaseDelegation,
    // Hook activity logging (REQ-0005)
    logHookEvent,
    getHookLogPath,
    HOOK_LOG_MAX_BYTES,
    HOOK_LOG_KEEP_LINES,
    // Workflow progress snapshots (REQ-0005)
    collectPhaseSnapshots,
    // Phase key normalization (self-healing)
    PHASE_KEY_ALIASES,
    normalizePhaseKey,
    MAX_ESCALATIONS,
    ESCALATION_DEDUP_WINDOW_MS,
    diagnoseBlockCause,
    outputSelfHealNotification,
    // State pruning (BUG-0004)
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    clearTransientFields,
    resetPhasesForWorkflow,
    // Archive operations (GH-39)
    appendToArchive,
    seedArchiveFromHistory,
    // Dispatcher helpers (REQ-0010)
    addPendingEscalation,
    addSkillLogEntry,
    loadIterationRequirements,
    loadWorkflowDefinitions,
    // Phase timeout detection
    checkPhaseTimeout,
    // Sizing utilities (REQ-0011, BUG-0051)
    parseSizingFromImpactAnalysis,
    computeSizingRecommendation,
    extractFallbackSizingMetrics,
    applySizingDecision,
    // Supervised mode (REQ-0013)
    readSupervisedModeConfig,
    shouldReviewPhase,
    generatePhaseSummary,
    recordReviewAction,
    // Session cache (REQ-0001)
    rebuildSessionCache,
    // Process config (REQ-0056)
    readProcessConfig
};

// Test-only exports (not part of public API) -- REQ-0020 FR-001/FR-002
if (process.env.NODE_ENV === 'test' || process.env.ISDLC_TEST_MODE === '1') {
    module.exports._resetCaches = _resetCaches;
    module.exports._getCacheStats = _getCacheStats;
    module.exports._loadConfigWithCache = _loadConfigWithCache;
    module.exports._buildSkillPathIndex = _buildSkillPathIndex;
    module.exports._collectSourceMtimes = _collectSourceMtimes;
}
