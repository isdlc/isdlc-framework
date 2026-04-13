# Interface Specification: REQ-GH-252

## query-classifier Interface

```javascript
// src/core/embedding/query-classifier.cjs
'use strict';

/**
 * @typedef {Object} ClassificationResult
 * @property {"semantic"|"lexical"} type - Classification result
 * @property {string} reason - Human-readable reason for the classification
 */

/**
 * Classify a search pattern as semantic or lexical.
 *
 * Lexical indicators (any match → lexical, first match wins):
 *   regex metacharacters, file extensions, wildcards, camelCase,
 *   PascalCase, dotted paths, snake_case, quoted strings.
 *
 * Everything else → semantic (natural language).
 *
 * @param {string} pattern - The Grep search pattern
 * @returns {ClassificationResult}
 */
function classifyQuery(pattern) { /* ... */ }

module.exports = { classifyQuery };
```

## health-probe Interface

```javascript
// lib/embedding/server/health-probe.cjs
'use strict';

/**
 * @typedef {Object} HealthResult
 * @property {"active"|"inactive"|"failed"} status
 * @property {number} [pid] - Server PID (only when active)
 * @property {string} [error] - Error description (only when inactive/failed)
 */

/**
 * Probe embedding server liveness via PID file check.
 * Never throws. Returns structured result.
 *
 * PID file location: {projectRoot}/.isdlc/logs/embedding-server.pid
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {HealthResult}
 */
function probeEmbeddingHealth(projectRoot) { /* ... */ }

module.exports = { probeEmbeddingHealth };
```

## tool-router Extensions

### New Rule Structure (added by inferEnvironmentRules)

```javascript
{
    id: 'inferred-semantic-search',
    operation: 'semantic_search',
    intercept_tool: 'Grep',
    preferred_tool: 'mcp__isdlc-embedding__isdlc_embedding_semantic_search',
    enforcement: 'warn',
    source: 'inferred',
    exemptions: [
        { type: 'context', condition: 'literal_pattern', signal: 'query_classifier' },
        { type: 'context', condition: 'server_unavailable', signal: 'health_probe' }
    ]
}
```

### New matchContextCondition Cases

```javascript
case 'literal_pattern': {
    // Grep pattern classified as lexical by query-classifier
    const pattern = toolInput.pattern;
    if (!pattern || typeof pattern !== 'string') return true; // no pattern = exempt
    const { classifyQuery } = require('../../core/embedding/query-classifier.cjs');
    const result = classifyQuery(pattern);
    return result.type === 'lexical';
}

case 'server_unavailable': {
    // Embedding server not alive (PID check)
    const { probeEmbeddingHealth } = require('../../../lib/embedding/server/health-probe.cjs');
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const health = probeEmbeddingHealth(projectRoot);
    return health.status !== 'active';
}
```

### Routing Message Format

```
// Semantic route
"TOOL ROUTING: [Semantic search] — Routing to isdlc_embedding_semantic_search for conceptual query"

// Lexical fallback — pattern-based
"TOOL ROUTING: [Lexical fallback: camelCase] — Pattern looks like a symbol name, staying on lexical search"

// Lexical fallback — server unavailable
"TOOL ROUTING: [Lexical fallback: server unavailable] — Embedding server not running, using lexical search"
```

## CLI Exit Code Contract

```
isdlc-embedding generate <path>

Exit codes:
  0 — Success: embeddings generated and verified
  1 — Generation error: process ran but output invalid or empty
  2 — Missing dependency: @huggingface/transformers not found, or model unavailable
  3 — Insufficient resources: disk space < 100MB

Stderr output on non-zero exit:
  Human-readable reason string (consumed by discover Step 7.9 for banner)

Example:
  $ npx isdlc-embedding generate .
  # Exit 2, stderr: "@huggingface/transformers is not installed. Run: npm install @huggingface/transformers"
```
