# Test Cases: Indexed Search Backend (REQ-0044)

**Status**: Draft
**Last Updated**: 2026-03-03

---

## Module 1: Indexed Backend Adapter (`lib/search/backends/indexed.test.js`) — NEW

### TC-003-01: Static properties match interface contract
- **Requirement**: FR-003, AC-003-01
- **Type**: positive
- **Input**: `createIndexedBackend()` with no options
- **Expected**: `{ id: 'code-index', modality: 'indexed', priority: 10, displayName: 'Code Index (indexed search)', requiresMcp: true }`

### TC-003-02: Search calls MCP with correct parameters
- **Requirement**: FR-003, AC-003-02
- **Type**: positive
- **Input**: `search({ query: 'SearchRouter', modality: 'indexed', fileGlob: '*.js', maxResults: 25 })`
- **Expected**: MCP called with `{ tool: 'search_code_advanced', arguments: { query: 'SearchRouter', file_pattern: '*.js', max_results: 25 } }`

### TC-003-03: Search normalizes MCP results to RawSearchHit format
- **Requirement**: FR-003, AC-003-03
- **Type**: positive
- **Input**: MCP returns `[{ file_path: 'src/router.js', line_number: 42, content: 'class SearchRouter', score: 0.95 }]`, query: `'SearchRouter'`
- **Expected**: `[{ filePath: 'src/router.js', line: 42, matchContent: 'class SearchRouter', matchType: 'exact', relevanceScore: 0.95 }]`

### TC-003-04: Search returns empty array when MCP server unreachable
- **Requirement**: FR-003, AC-003-05
- **Type**: negative
- **Input**: `mcpCallFn` throws `Error('connection refused')`
- **Expected**: Returns `[]`, does not throw

### TC-003-05: Search returns empty array when MCP returns malformed data
- **Requirement**: FR-003, AC-003-05
- **Type**: negative
- **Input**: `mcpCallFn` returns `null`
- **Expected**: Returns `[]`, does not throw

### TC-003-06: Health check returns healthy when MCP responds
- **Requirement**: FR-003, AC-003-04; FR-010, AC-010-01
- **Type**: positive
- **Input**: `mcpCallFn` resolves successfully
- **Expected**: `'healthy'`

### TC-003-07: Health check returns unavailable when no MCP configured
- **Requirement**: FR-003, AC-003-04; FR-010, AC-010-01
- **Type**: negative
- **Input**: `createIndexedBackend()` with no mcpCallFn
- **Expected**: `'unavailable'`

### TC-003-08: Health check returns unavailable on timeout
- **Requirement**: FR-010, AC-010-02
- **Type**: negative
- **Input**: `mcpCallFn` delays 5000ms; `healthCheckTimeout: 50`
- **Expected**: `'unavailable'` (resolved within ~50ms, not 5s)

### TC-003-09: Health check returns unavailable when MCP throws
- **Requirement**: FR-010, AC-010-01
- **Type**: negative
- **Input**: `mcpCallFn` throws
- **Expected**: `'unavailable'`, does not throw

### TC-003-10: normalizeIndexedResults handles empty array
- **Requirement**: FR-003, AC-003-03
- **Type**: boundary
- **Input**: `normalizeIndexedResults([], 'test')`
- **Expected**: `[]`

### TC-003-11: normalizeIndexedResults handles null input
- **Requirement**: FR-003, AC-003-03
- **Type**: boundary
- **Input**: `normalizeIndexedResults(null, 'test')`
- **Expected**: `[]`

### TC-003-12: normalizeIndexedResults assigns matchType correctly
- **Requirement**: FR-003, AC-003-03
- **Type**: positive
- **Input**: Result with `content: 'class SearchRouter'`, query: `'SearchRouter'`
- **Expected**: `matchType: 'exact'` (query is substring of content)

### TC-003-13: normalizeIndexedResults assigns fuzzy when no substring match
- **Requirement**: FR-003, AC-003-03
- **Type**: positive
- **Input**: Result with `content: 'class Router'`, query: `'SearchRouter'`
- **Expected**: `matchType: 'fuzzy'` (query is NOT substring of content)

### TC-003-14: normalizeIndexedResults uses defaults for missing fields
- **Requirement**: FR-003, AC-003-03
- **Type**: boundary
- **Input**: `[{ file_path: 'test.js' }]` (no line_number, no content, no score)
- **Expected**: `[{ filePath: 'test.js', line: 0, matchContent: '', matchType: 'fuzzy', relevanceScore: undefined }]`

---

## Module 2: Detection Extension (`lib/search/detection.test.js`) — EXTEND

### TC-001-01: Detect code-index-mcp when installed
- **Requirement**: FR-001, AC-001-01
- **Type**: positive
- **Input**: `execFn` returns success for `code-index-mcp --version` with output `'1.0.0'`
- **Expected**: Tool entry with `name: 'code-index-mcp'`, `installed: true`, `version: '1.0.0'`

### TC-001-02: Report code-index-mcp not installed
- **Requirement**: FR-001, AC-001-01
- **Type**: negative
- **Input**: `execFn` returns failure for `code-index-mcp --version`
- **Expected**: Tool entry with `name: 'code-index-mcp'`, `installed: false`

### TC-001-03: Detect Python 3.8+ via python3
- **Requirement**: FR-001, AC-001-02
- **Type**: positive
- **Input**: `execFn` returns `'Python 3.11.4'` for `python3 --version`
- **Expected**: pip detected as package manager; code-index-mcp recommendation generated for medium/large projects

### TC-001-04: Skip recommendation when Python < 3.8
- **Requirement**: FR-001, AC-001-05
- **Type**: negative
- **Input**: `execFn` returns `'Python 3.7.9'` for `python3 --version`
- **Expected**: No recommendation for code-index-mcp (silently skipped)

### TC-001-05: Skip recommendation when Python not available
- **Requirement**: FR-001, AC-001-05
- **Type**: negative
- **Input**: `execFn` returns failure for both `python3 --version` and `python --version`
- **Expected**: No recommendation for code-index-mcp, no error

---

## Module 3: Installation Extension (`lib/search/install.test.js`) — EXTEND

### TC-002-01: MCP_CONFIGS includes code-index entry
- **Requirement**: FR-002, AC-002-01
- **Type**: positive
- **Input**: Import MCP_CONFIGS from install.js
- **Expected**: `MCP_CONFIGS['code-index']` exists with `{ command: 'code-index-mcp', args: [], env: {} }`

### TC-002-02: configureMcpServers writes code-index entry
- **Requirement**: FR-002, AC-002-03
- **Type**: positive
- **Input**: Call `configureMcpServers([{ id: 'code-index' }], settingsPath)`
- **Expected**: `.claude/settings.json` contains `mcpServers['code-index']` with correct command

---

## Module 4: Registry Extension (`lib/search/registry.test.js`) — EXTEND

### TC-004-01: inferModality maps code-index to indexed
- **Requirement**: FR-004, AC-004-01
- **Type**: positive
- **Input**: Call registry's internal `inferModality('code-index')`
- **Expected**: Returns `'indexed'`

### TC-004-02: inferPriority maps code-index to 10
- **Requirement**: FR-004, AC-004-02
- **Type**: positive
- **Input**: Call registry's internal `inferPriority('code-index')`
- **Expected**: Returns `10`

### TC-004-03: loadFromConfig registers code-index with indexed modality
- **Requirement**: FR-004, AC-004-03
- **Type**: positive
- **Input**: Config with `activeBackends: ['grep-glob', 'code-index']`
- **Expected**: `getBackendsForModality('indexed')` returns entry with `id: 'code-index'`

---

## Total Test Cases: 21

| Module | New Tests | Type |
|--------|-----------|------|
| M1: indexed.js (backend adapter) | 14 | NEW file |
| M2: detection.js | 5 | EXTEND existing |
| M3: install.js | 2 | EXTEND existing |
| M4: registry.js | 3 | EXTEND existing |
