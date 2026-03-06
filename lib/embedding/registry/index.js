/**
 * Module Registry — track module metadata, domains, dependencies, versions.
 *
 * REQ-0045 / FR-013 / AC-013-01 through AC-013-04 / M6 Registry
 * @module lib/embedding/registry
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getCompatibleVersions, isCompatible } from './compatibility.js';

/**
 * @typedef {Object} ModuleEntry
 * @property {string} id - Unique module identifier
 * @property {string} name - Human-readable name
 * @property {string} domain - Hierarchical domain (e.g., 'commerce.order-management')
 * @property {string} description - What this module does
 * @property {string[]} dependencies - IDs of dependent modules
 * @property {string} version - Current version (semver)
 * @property {Object} compatibility - Version compatibility rules
 * @property {string} [compatibility.minVersion] - Minimum compatible version
 * @property {string} [compatibility.maxVersion] - Maximum compatible version
 * @property {string[]} keywords - Search routing hints
 */

const REQUIRED_MODULE_FIELDS = ['id', 'name', 'domain', 'version'];

/**
 * Load a module registry from a JSON file.
 * Creates an empty registry if the file does not exist.
 *
 * @param {string} registryPath - Path to registry.json
 * @returns {Object} ModuleRegistry instance
 */
export function loadRegistry(registryPath) {
  let modules = [];

  if (registryPath && existsSync(registryPath)) {
    const raw = readFileSync(registryPath, 'utf-8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Registry file contains malformed JSON: ${err.message}`);
    }
    modules = Array.isArray(parsed.modules) ? parsed.modules : [];
  }

  /**
   * Get a module by ID.
   * @param {string} id
   * @returns {ModuleEntry|null}
   */
  function getModule(id) {
    return modules.find(m => m.id === id) || null;
  }

  /**
   * List all registered modules.
   * @returns {ModuleEntry[]}
   */
  function listModules() {
    return [...modules];
  }

  /**
   * Register a new module or update an existing one by ID.
   * @param {ModuleEntry} entry
   */
  function registerModule(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Module entry must be a non-null object');
    }

    for (const field of REQUIRED_MODULE_FIELDS) {
      if (!entry[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const existing = modules.findIndex(m => m.id === entry.id);
    const normalized = {
      id: entry.id,
      name: entry.name,
      domain: entry.domain,
      description: entry.description || '',
      dependencies: entry.dependencies || [],
      version: entry.version,
      compatibility: entry.compatibility || {},
      keywords: entry.keywords || [],
    };

    if (existing >= 0) {
      modules[existing] = normalized;
    } else {
      modules.push(normalized);
    }
  }

  /**
   * Get routing hints: module IDs matching a query by domain prefix or keywords.
   * @param {string} query
   * @returns {string[]} Matching module IDs
   */
  function getRoutingHints(query) {
    if (!query || typeof query !== 'string') return [];

    const q = query.toLowerCase();
    const matches = [];

    for (const mod of modules) {
      // Match by domain prefix
      if (mod.domain && mod.domain.toLowerCase().startsWith(q)) {
        matches.push(mod.id);
        continue;
      }

      // Match by keywords
      if (mod.keywords && mod.keywords.some(kw => kw.toLowerCase().includes(q))) {
        matches.push(mod.id);
        continue;
      }

      // Match by domain containing query
      if (mod.domain && mod.domain.toLowerCase().includes(q)) {
        matches.push(mod.id);
      }
    }

    return matches;
  }

  /**
   * Save the registry to disk.
   */
  function save() {
    if (!registryPath) {
      throw new Error('Cannot save: no registry path specified');
    }
    const dir = dirname(registryPath);
    mkdirSync(dir, { recursive: true });
    const data = JSON.stringify({ modules, version: '1.0.0' }, null, 2);
    writeFileSync(registryPath, data, 'utf-8');
  }

  return {
    getModule,
    listModules,
    registerModule,
    getRoutingHints,
    getCompatibleVersions: (moduleId, version) =>
      getCompatibleVersions(modules, moduleId, version),
    save,
  };
}
