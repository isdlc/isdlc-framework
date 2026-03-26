#!/usr/bin/env node
/**
 * Contract Generator CLI
 * =======================
 * REQ-0141: Execution Contract System (FR-002, FR-007)
 * AC-002-01 through AC-002-06, AC-007-01 through AC-007-04
 *
 * Reads all config surfaces and generates execution contract files.
 * Deterministic: same inputs -> same output (sorted keys, fixed read order).
 *
 * Usage: node bin/generate-contracts.js [--output <path>]
 *
 * @module bin/generate-contracts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATOR_VERSION = '1.0.0';

const DEFAULT_VIOLATION_RESPONSE = {
  agent_not_engaged: 'block',
  skills_missing: 'report',
  artifacts_missing: 'block',
  state_incomplete: 'report',
  cleanup_skipped: 'warn',
  presentation_violated: 'warn'
};

// ---------------------------------------------------------------------------
// Config loaders
// ---------------------------------------------------------------------------

/**
 * Load PHASE_AGENT_MAP from common.cjs.
 * @param {string} projectRoot
 * @returns {Object}
 */
function loadPhaseAgentMap(projectRoot) {
  try {
    const commonPath = join(projectRoot, '.claude', 'hooks', 'lib', 'common.cjs');
    const common = require(commonPath);
    if (!common.PHASE_AGENT_MAP) {
      throw new Error('PHASE_AGENT_MAP not exported from common.cjs');
    }
    return common.PHASE_AGENT_MAP;
  } catch (err) {
    throw new Error(`Failed to load PHASE_AGENT_MAP: ${err.message}`);
  }
}

/**
 * Safely read and parse a JSON file.
 * @param {string} filePath
 * @returns {Object|null}
 */
function readJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Safely read and parse a YAML file (minimal parser -- key: value only).
 * @param {string} filePath
 * @returns {Object|null}
 */
function readYamlSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf8');
    // Basic YAML parser for simple key-value pairs and arrays
    const result = {};
    const lines = content.split('\n');
    let currentKey = null;
    let inArray = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Array item under current key
      if (trimmed.startsWith('- ') && currentKey && inArray) {
        if (!Array.isArray(result[currentKey])) result[currentKey] = [];
        result[currentKey].push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''));
        continue;
      }

      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        if (value === '' || value === '|' || value === '>') {
          currentKey = key;
          inArray = true;
          result[key] = [];
          continue;
        }
        result[key] = value.replace(/^["']|["']$/g, '');
        currentKey = key;
        inArray = false;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 hash of a file's content.
 * @param {string} filePath
 * @returns {string|null}
 */
function hashFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Deterministic JSON serialization (sorted keys).
 * @param {*} obj
 * @returns {string}
 */
function deterministicStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  }, 2);
}

// ---------------------------------------------------------------------------
// Contract builders
// ---------------------------------------------------------------------------

/**
 * Build workflow contract entries for a given workflow type.
 * @param {string} workflowType
 * @param {Object} phaseAgentMap
 * @param {Object} artifactPaths
 * @param {Object} skillsManifest
 * @param {Object} workflowDef
 * @returns {Object[]}
 */
function buildWorkflowEntries(workflowType, phaseAgentMap, artifactPaths, skillsManifest, workflowDef) {
  const entries = [];

  if (!workflowDef?.phases || !Array.isArray(workflowDef.phases) || workflowDef.phases.length === 0) {
    // No workflow definition found — do not silently emit all phases
    process.stderr.write(`WARNING: No phase sequence found for workflow "${workflowType}". Skipping.\n`);
    return entries;
  }

  const phases = workflowDef.phases;

  for (const phase of phases) {
    const agent = phaseAgentMap[phase];
    if (!agent) continue;

    const artifactsRef = (artifactPaths?.phases?.[phase]?.paths?.length > 0)
      ? { '$ref': 'artifact-paths', phase }
      : null;

    const skillsRef = (skillsManifest?.ownership?.[agent]?.skills?.length > 0)
      ? { '$ref': 'skills-manifest', agent }
      : null;

    entries.push({
      execution_unit: phase,
      context: `${workflowType}:standard`,
      expectations: {
        agent,
        skills_required: skillsRef,
        artifacts_produced: artifactsRef,
        state_assertions: [
          { path: `phases.${phase}.status`, equals: 'completed' }
        ],
        cleanup: [],
        presentation: {
          confirmation_sequence: null,
          persona_format: null,
          progress_format: 'task-list',
          completion_summary: null
        }
      },
      violation_response: { ...DEFAULT_VIOLATION_RESPONSE }
    });
  }

  // Sort by execution_unit
  entries.sort((a, b) => a.execution_unit.localeCompare(b.execution_unit));
  return entries;
}

/**
 * Build analyze contract entry.
 * @param {Object} roundtableConfig
 * @returns {Object[]}
 */
function buildAnalyzeEntries(roundtableConfig) {
  const personas = [];
  if (roundtableConfig) {
    if (Array.isArray(roundtableConfig.personas)) {
      personas.push(...roundtableConfig.personas);
    } else if (roundtableConfig.personas) {
      // Single-line format
      personas.push(String(roundtableConfig.personas));
    }
  }

  const personaFormat = roundtableConfig?.verbosity || roundtableConfig?.format || null;

  return [{
    execution_unit: 'roundtable',
    context: 'analyze',
    expectations: {
      agent: null,
      skills_required: null,
      artifacts_produced: null,
      state_assertions: [],
      cleanup: [],
      presentation: {
        confirmation_sequence: ['requirements', 'architecture', 'design'],
        persona_format: personaFormat,
        progress_format: null,
        completion_summary: true
      }
    },
    violation_response: {
      ...DEFAULT_VIOLATION_RESPONSE,
      agent_not_engaged: 'report',
      presentation_violated: 'warn'
    }
  }];
}

/**
 * Build discover contract entry.
 * @param {Object} externalSkillsManifest
 * @returns {Object[]}
 */
function buildDiscoverEntries(externalSkillsManifest) {
  return [{
    execution_unit: 'discover',
    context: 'discover',
    expectations: {
      agent: null,
      skills_required: null,
      artifacts_produced: null,
      state_assertions: [],
      cleanup: [],
      presentation: {
        confirmation_sequence: null,
        persona_format: null,
        progress_format: null,
        completion_summary: true
      }
    },
    violation_response: {
      ...DEFAULT_VIOLATION_RESPONSE,
      agent_not_engaged: 'report',
      artifacts_missing: 'report'
    }
  }];
}

/**
 * Build add-item contract entry.
 * @returns {Object[]}
 */
function buildAddEntries() {
  return [{
    execution_unit: 'add-item',
    context: 'add',
    expectations: {
      agent: null,
      skills_required: null,
      artifacts_produced: null,
      state_assertions: [],
      cleanup: ['BACKLOG.md updated with new item'],
      presentation: {
        confirmation_sequence: null,
        persona_format: null,
        progress_format: null,
        completion_summary: true
      }
    },
    violation_response: {
      ...DEFAULT_VIOLATION_RESPONSE,
      agent_not_engaged: 'report',
      artifacts_missing: 'warn'
    }
  }];
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate all contract files from config sources.
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root path
 * @param {string} [options.outputDir] - Output directory (default: .claude/hooks/config/contracts/)
 * @returns {{ files: string[], errors: string[] }}
 */
export function generateContracts(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const outputDir = options.outputDir || join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
  const errors = [];
  const files = [];

  // Load config sources
  let phaseAgentMap;
  try {
    phaseAgentMap = loadPhaseAgentMap(projectRoot);
  } catch (err) {
    return { files: [], errors: [err.message] };
  }

  const configPaths = {
    artifactPaths: join(projectRoot, '.claude', 'hooks', 'config', 'artifact-paths.json'),
    skillsManifest: join(projectRoot, '.claude', 'hooks', 'config', 'skills-manifest.json'),
    workflows: existsSync(join(projectRoot, '.isdlc', 'config', 'workflows.json'))
      ? join(projectRoot, '.isdlc', 'config', 'workflows.json')
      : existsSync(join(projectRoot, 'src', 'isdlc', 'config', 'workflows.json'))
        ? join(projectRoot, 'src', 'isdlc', 'config', 'workflows.json')
        : join(projectRoot, '.claude', 'hooks', 'config', 'workflows.json'),
    externalSkills: join(projectRoot, 'docs', 'isdlc', 'external-skills-manifest.json'),
    roundtable: join(projectRoot, '.isdlc', 'roundtable.yaml'),
    iterationReqs: join(projectRoot, '.claude', 'hooks', 'config', 'iteration-requirements.json')
  };

  const artifactPaths = readJsonSafe(configPaths.artifactPaths);
  const skillsManifest = readJsonSafe(configPaths.skillsManifest);
  const workflows = readJsonSafe(configPaths.workflows);
  const externalSkills = readJsonSafe(configPaths.externalSkills);
  const roundtable = readYamlSafe(configPaths.roundtable);

  // Track input files for metadata
  const inputFiles = [];
  for (const [name, filePath] of Object.entries(configPaths)) {
    const hash = hashFile(filePath);
    if (hash) {
      inputFiles.push({
        path: filePath.replace(projectRoot + '/', '').replace(projectRoot + '\\', ''),
        hash
      });
    }
  }
  inputFiles.sort((a, b) => a.path.localeCompare(b.path));

  const generationMetadata = {
    generated_at: new Date().toISOString(),
    generator_version: GENERATOR_VERSION,
    input_files: inputFiles
  };

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Generate workflow contracts
  for (const workflowType of ['feature', 'fix']) {
    const workflowDef = workflows?.workflows?.[workflowType] || workflows?.[workflowType] || null;
    const entries = buildWorkflowEntries(workflowType, phaseAgentMap, artifactPaths, skillsManifest, workflowDef);
    if (entries.length > 0) {
      const contract = {
        version: '1.0.0',
        entries,
        _generation_metadata: generationMetadata
      };
      const filePath = join(outputDir, `workflow-${workflowType}.contract.json`);
      writeFileSync(filePath, deterministicStringify(contract) + '\n');
      files.push(filePath);
    }
  }

  // Generate analyze contract
  const analyzeEntries = buildAnalyzeEntries(roundtable);
  const analyzeContract = {
    version: '1.0.0',
    entries: analyzeEntries,
    _generation_metadata: generationMetadata
  };
  const analyzePath = join(outputDir, 'analyze.contract.json');
  writeFileSync(analyzePath, deterministicStringify(analyzeContract) + '\n');
  files.push(analyzePath);

  // Generate discover contract
  const discoverEntries = buildDiscoverEntries(externalSkills);
  const discoverContract = {
    version: '1.0.0',
    entries: discoverEntries,
    _generation_metadata: generationMetadata
  };
  const discoverPath = join(outputDir, 'discover.contract.json');
  writeFileSync(discoverPath, deterministicStringify(discoverContract) + '\n');
  files.push(discoverPath);

  // Generate add contract
  const addEntries = buildAddEntries();
  const addContract = {
    version: '1.0.0',
    entries: addEntries,
    _generation_metadata: generationMetadata
  };
  const addPath = join(outputDir, 'add.contract.json');
  writeFileSync(addPath, deterministicStringify(addContract) + '\n');
  files.push(addPath);

  return { files, errors };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && (process.argv[1].endsWith('generate-contracts.js') || process.argv[1].endsWith('generate-contracts'))) {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 && args[outputIdx + 1] ? args[outputIdx + 1] : undefined;

  const result = generateContracts({
    projectRoot: process.cwd(),
    outputDir: outputDir ? resolve(outputDir) : undefined
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      process.stderr.write(`ERROR: ${err}\n`);
    }
    process.exit(1);
  }

  for (const file of result.files) {
    process.stdout.write(`Generated: ${file}\n`);
  }
  process.stdout.write(`\nGenerated ${result.files.length} contract file(s).\n`);
}
