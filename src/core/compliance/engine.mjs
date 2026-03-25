/**
 * ESM Re-export of Compliance Engine
 * ====================================
 * Thin wrapper that re-exports the CJS compliance engine for use
 * in the Codex runtime adapter (ESM module system).
 *
 * REQ-0140: Conversational enforcement via Stop hook
 *
 * @module src/core/compliance/engine
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadRules, evaluateRules } = require('./engine.cjs');
export { loadRules, evaluateRules };
