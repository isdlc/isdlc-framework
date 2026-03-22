/**
 * CJS Bridge for src/core/memory/ modules
 *
 * REQ-0084: Extract search/memory service boundaries
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _memoryModule;

async function loadMemory() {
  if (!_memoryModule) _memoryModule = await import('../memory/index.js');
  return _memoryModule;
}

let _syncMemory = null;

// =========================================================================
// Memory Service functions (all async — bridge exposes them as async)
// =========================================================================

async function readUserProfile(userMemoryDir) {
  const m = _syncMemory || await loadMemory();
  return m.MemoryService.readUserProfile(userMemoryDir);
}

async function readProjectMemory(projectRoot) {
  const m = _syncMemory || await loadMemory();
  return m.MemoryService.readProjectMemory(projectRoot);
}

function mergeMemory(userProfile, projectMemory) {
  if (_syncMemory) return _syncMemory.MemoryService.mergeMemory(userProfile, projectMemory);
  // Inline fallback: basic merge
  return { topicPreferences: [], communicationStyle: null, domainWeights: {}, conflictZones: [], effectiveDepth: 'standard' };
}

function formatMemoryContext(memoryContext) {
  if (_syncMemory) return _syncMemory.MemoryService.formatMemoryContext(memoryContext);
  return '';
}

async function writeSessionRecord(record, projectRoot, userMemoryDir) {
  const m = _syncMemory || await loadMemory();
  return m.MemoryService.writeSessionRecord(record, projectRoot, userMemoryDir);
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  _syncMemory = await loadMemory();
}

module.exports = {
  readUserProfile,
  readProjectMemory,
  mergeMemory,
  formatMemoryContext,
  writeSessionRecord,
  preload
};
