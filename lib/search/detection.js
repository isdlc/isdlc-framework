/**
 * Search Capability Detection
 *
 * Detect available search tools on the user's system and assess project
 * characteristics for recommendations.
 *
 * REQ-0041 / FR-003: Search Capability Detection
 * @module lib/search/detection
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {Object} ToolAvailability
 * @property {string} name - Tool name
 * @property {boolean} installed - Whether tool is installed
 * @property {string} [version] - Detected version if installed
 * @property {InstallMethod[]} installMethods - Available installation methods
 */

/**
 * @typedef {Object} InstallMethod
 * @property {string} method - 'npm' | 'cargo' | 'brew' | 'binary'
 * @property {string} command - Installation command
 * @property {boolean} available - Whether the package manager is available
 */

/**
 * @typedef {Object} ToolRecommendation
 * @property {ToolAvailability} tool - Tool availability info
 * @property {string} reason - User-facing explanation
 * @property {'recommended'|'optional'} priority - Recommendation priority
 * @property {InstallMethod} installMethod - Best available install method
 */

/**
 * @typedef {Object} DetectionResult
 * @property {'small'|'medium'|'large'} scaleTier - Project size classification
 * @property {number} fileCount - Total file count
 * @property {ToolAvailability[]} tools - Detected tools with versions
 * @property {ToolRecommendation[]} recommendations - Recommended installations
 * @property {string[]} existingMcpServers - Already-configured MCP server names
 */

/** Tool definitions for detection */
const KNOWN_TOOLS = [
  {
    name: 'ast-grep',
    binaries: ['ast-grep', 'sg'],
    versionFlag: '--version',
    installMethods: [
      { method: 'npm', command: 'npm install -g @ast-grep/cli' },
      { method: 'cargo', command: 'cargo install ast-grep' },
      { method: 'brew', command: 'brew install ast-grep' },
    ],
    modality: 'structural',
    recommendReason: 'Provides structural (AST-aware) search, finding code patterns regardless of formatting or naming.',
  },
  {
    name: 'probe',
    binaries: ['probe'],
    versionFlag: '--version',
    installMethods: [
      { method: 'cargo', command: 'cargo install probe-search' },
    ],
    modality: 'lexical',
    recommendReason: 'Enhances search with tree-sitter context and BM25 ranking for more relevant results.',
  },
];

/** Package manager detection */
const PACKAGE_MANAGERS = ['npm', 'cargo', 'brew'];

/**
 * Detect available search tools and project characteristics.
 *
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options]
 * @param {Function} [options.execFn] - Custom exec function for testing
 * @returns {Promise<DetectionResult>}
 */
export async function detectSearchCapabilities(projectRoot, options = {}) {
  const { execFn = safeExec } = options;

  // Validate project root
  if (!projectRoot || !existsSync(projectRoot)) {
    return {
      scaleTier: 'small',
      fileCount: 0,
      tools: [],
      recommendations: [],
      existingMcpServers: [],
    };
  }

  // Detect available package managers
  const availablePMs = detectPackageManagers(execFn);

  // Detect tools
  const tools = KNOWN_TOOLS.map(toolDef => detectTool(toolDef, availablePMs, execFn));

  // Assess project scale
  const { scaleTier, fileCount } = await assessProjectScale(projectRoot);

  // Read existing MCP configurations
  const existingMcpServers = readExistingMcpServers(projectRoot);

  // Generate recommendations
  const recommendations = generateRecommendations(tools, scaleTier, existingMcpServers);

  return {
    scaleTier,
    fileCount,
    tools,
    recommendations,
    existingMcpServers,
  };
}

/**
 * Determine project scale tier from file count.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<{scaleTier: 'small'|'medium'|'large', fileCount: number}>}
 */
export async function assessProjectScale(projectRoot) {
  if (!projectRoot || !existsSync(projectRoot)) {
    return { scaleTier: 'small', fileCount: 0 };
  }

  let fileCount = 0;
  const MAX_COUNT = 500001; // Stop counting after this

  try {
    fileCount = countFiles(projectRoot, MAX_COUNT);
  } catch {
    fileCount = 0;
  }

  let scaleTier;
  if (fileCount < 10000) {
    scaleTier = 'small';
  } else if (fileCount < 100000) {
    scaleTier = 'medium';
  } else {
    scaleTier = 'large';
  }

  return { scaleTier, fileCount };
}

/**
 * Count files in a directory (non-recursive into node_modules, .git, etc.).
 *
 * @param {string} dir - Directory to count
 * @param {number} max - Maximum count before stopping
 * @returns {number}
 */
function countFiles(dir, max) {
  const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'vendor', '__pycache__', '.isdlc']);
  let count = 0;

  function walk(currentDir) {
    if (count >= max) return;

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // Permission denied or similar
    }

    for (const entry of entries) {
      if (count >= max) return;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        count++;
      }
    }
  }

  walk(dir);
  return count;
}

/**
 * Detect a single tool's availability.
 *
 * @param {Object} toolDef - Tool definition
 * @param {Set<string>} availablePMs - Available package managers
 * @param {Function} execFn - Exec function
 * @returns {ToolAvailability}
 */
function detectTool(toolDef, availablePMs, execFn) {
  let installed = false;
  let version = undefined;

  // Try each binary name
  for (const binary of toolDef.binaries) {
    const result = execFn(`${binary} ${toolDef.versionFlag}`);
    if (result.success) {
      installed = true;
      version = extractVersion(result.output);
      break;
    }
  }

  // Mark install methods as available/unavailable
  const installMethods = toolDef.installMethods.map(im => ({
    ...im,
    available: availablePMs.has(im.method),
  }));

  return {
    name: toolDef.name,
    installed,
    version,
    installMethods,
  };
}

/**
 * Detect available package managers.
 *
 * @param {Function} execFn - Exec function
 * @returns {Set<string>}
 */
function detectPackageManagers(execFn) {
  const available = new Set();

  for (const pm of PACKAGE_MANAGERS) {
    const result = execFn(`${pm} --version`);
    if (result.success) {
      available.add(pm);
    }
  }

  return available;
}

/**
 * Read existing MCP server names from .claude/settings.json.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function readExistingMcpServers(projectRoot) {
  const settingsPath = join(projectRoot, '.claude', 'settings.json');

  if (!existsSync(settingsPath)) return [];

  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    return Object.keys(settings.mcpServers || {});
  } catch {
    return [];
  }
}

/**
 * Generate recommendations based on detection results.
 *
 * @param {ToolAvailability[]} tools
 * @param {string} scaleTier
 * @param {string[]} existingMcpServers
 * @returns {ToolRecommendation[]}
 */
function generateRecommendations(tools, scaleTier, existingMcpServers) {
  const recommendations = [];
  const toolDefs = new Map(KNOWN_TOOLS.map(t => [t.name, t]));

  for (const tool of tools) {
    if (tool.installed) continue; // Already installed

    // Skip if MCP already configured for this tool
    if (existingMcpServers.includes(tool.name)) continue;

    const def = toolDefs.get(tool.name);
    if (!def) continue;

    // Find best available install method
    const bestMethod = tool.installMethods.find(im => im.available);
    if (!bestMethod) continue; // No viable install method

    // Determine priority based on scale
    let priority = 'optional';
    if (scaleTier === 'medium' || scaleTier === 'large') {
      priority = 'recommended';
    }

    recommendations.push({
      tool,
      reason: def.recommendReason,
      priority,
      installMethod: bestMethod,
    });
  }

  return recommendations;
}

/**
 * Extract version number from command output.
 *
 * @param {string} output
 * @returns {string|undefined}
 */
function extractVersion(output) {
  if (!output) return undefined;
  const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : undefined;
}

/**
 * Safe exec wrapper that returns {success, output} instead of throwing.
 *
 * @param {string} command
 * @returns {{success: boolean, output: string}}
 */
function safeExec(command) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return { success: true, output };
  } catch {
    return { success: false, output: '' };
  }
}
