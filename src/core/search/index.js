/**
 * Search Service Boundary — Re-exports
 *
 * REQ-0084: Extract search/memory service boundaries from lib/ into src/core/
 *
 * This module defines the service interfaces that providers will consume.
 * The actual implementation stays in lib/ for now; these thin wrappers
 * define the boundary contract.
 *
 * @module src/core/search
 */

import { buildSearchConfig } from '../../../lib/setup-search.js';

export const MODULE_ID = 'core/search';

/**
 * SearchSetupService — interface for search infrastructure setup.
 * Delegates to lib/setup-search.js for the actual implementation.
 */
export const SearchSetupService = {
  /**
   * Build a search configuration from detection results and install outcomes.
   * @param {Object|null} detection - Detection result (scaleTier, fileCount, etc.)
   * @param {Object[]} installResults - Array of install result objects ({ success, tool })
   * @returns {Object} SearchConfig object
   */
  buildSearchConfig(detection, installResults) {
    return buildSearchConfig(detection, installResults);
  }
};

/**
 * KnowledgeSetupService — interface for project knowledge setup.
 * Delegates to lib/setup-project-knowledge.js for actual implementation.
 * The setup function requires interactive prompts so is exposed as async.
 */
export const KnowledgeSetupService = {
  /**
   * Run project knowledge setup (interactive).
   * Lazy-loaded to avoid pulling heavy dependencies at import time.
   * @param {string} projectRoot
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async setup(projectRoot, options = {}) {
    const { setupProjectKnowledge } = await import('../../../lib/setup-project-knowledge.js');
    return setupProjectKnowledge(projectRoot, options);
  }
};
