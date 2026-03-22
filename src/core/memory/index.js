/**
 * Memory Service Boundary — Re-exports
 *
 * REQ-0084: Extract search/memory service boundaries from lib/ into src/core/
 *
 * This module defines the memory service interface. The actual implementation
 * stays in lib/memory.js and lib/memory-search.js. These thin wrappers
 * define the boundary contract that providers will consume.
 *
 * @module src/core/memory
 */

import {
  readUserProfile,
  readProjectMemory,
  mergeMemory,
  formatMemoryContext,
  writeSessionRecord,
  compact
} from '../../../lib/memory.js';

export const MODULE_ID = 'core/memory';

/**
 * MemoryService — interface for roundtable memory layer.
 * Delegates to lib/memory.js for the actual implementation.
 */
export const MemoryService = {
  readUserProfile,
  readProjectMemory,
  mergeMemory,
  formatMemoryContext,
  writeSessionRecord,
  compact
};
