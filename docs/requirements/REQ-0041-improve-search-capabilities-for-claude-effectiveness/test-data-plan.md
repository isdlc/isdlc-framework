# Test Data Plan: Improve Search Capabilities for Claude Effectiveness

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0041 (GH-34)
**Last Updated**: 2026-03-02

---

## 1. Overview

This document defines the test data requirements for the search abstraction layer feature. Test data is organized by module and test type, with explicit coverage of boundary values, invalid inputs, and maximum-size inputs as required by the test strategy.

## 2. Test Fixture Location

```
lib/search/__fixtures__/
  search-requests.js        # SearchRequest objects (valid, invalid, boundary)
  backend-results.js        # RawSearchHit and SearchHit data
  search-configs.js         # SearchConfig objects (valid, defaults, corrupt)
  detection-results.js      # DetectionResult and ToolAvailability data
```

Fixtures are co-located with the search module for import convenience. Each fixture file exports named constants for clarity and reusability.

## 3. SearchRequest Test Data

### Valid Inputs

| Fixture Name | modality | query | scope | fileGlob | tokenBudget | maxResults |
|-------------|----------|-------|-------|----------|-------------|------------|
| `LEXICAL_BASIC` | 'lexical' | 'handleAuth' | '/project' | null | 5000 | 50 |
| `STRUCTURAL_ASYNC` | 'structural' | 'async function $NAME($$$)' | '/project/src' | '*.js' | 3000 | 20 |
| `ANY_MODALITY` | 'any' | 'authentication' | null | null | 5000 | 50 |
| `WITH_AST_CONTEXT` | 'structural' | 'console.log($$$)' | '/project' | null | 5000 | 50 |
| `WITH_FILE_GLOB` | 'lexical' | 'import' | '/project' | '*.ts' | 5000 | 100 |
| `MINIMAL_REQUEST` | 'lexical' | 'test' | null | null | null | null |

### Invalid Inputs

| Fixture Name | Issue | Expected Error |
|-------------|-------|----------------|
| `EMPTY_QUERY` | query='' | INVALID_REQUEST |
| `NULL_QUERY` | query=null | INVALID_REQUEST |
| `UNDEFINED_QUERY` | query=undefined | INVALID_REQUEST |
| `INVALID_MODALITY` | modality='nonexistent' | INVALID_REQUEST |
| `NULL_MODALITY` | modality=null | INVALID_REQUEST |
| `NEGATIVE_TOKEN_BUDGET` | tokenBudget=-1 | INVALID_REQUEST |
| `NEGATIVE_MAX_RESULTS` | maxResults=-5 | INVALID_REQUEST |
| `NON_STRING_QUERY` | query=12345 | INVALID_REQUEST |
| `ARRAY_QUERY` | query=['a','b'] | INVALID_REQUEST |

## 4. Boundary Values

### Token Budget Boundaries

| Fixture Name | tokenBudget | Expected Behavior |
|-------------|-------------|-------------------|
| `BUDGET_ZERO` | 0 | Empty result set or all results (implementation-defined) |
| `BUDGET_ONE` | 1 | At most 1 token worth of results |
| `BUDGET_DEFAULT` | 5000 | Standard result set |
| `BUDGET_LARGE` | 100000 | No truncation expected |
| `BUDGET_MAX_SAFE` | Number.MAX_SAFE_INTEGER | No truncation |

### Max Results Boundaries

| Fixture Name | maxResults | Expected Behavior |
|-------------|-----------|-------------------|
| `RESULTS_ZERO` | 0 | Empty result set or all results (implementation-defined) |
| `RESULTS_ONE` | 1 | Exactly 1 result |
| `RESULTS_DEFAULT` | 50 | Standard pagination |
| `RESULTS_LARGE` | 10000 | All results returned |

### Relevance Score Boundaries

| Fixture Name | relevanceScore | Expected Behavior |
|-------------|---------------|-------------------|
| `SCORE_ZERO` | 0.0 | Lowest relevance, truncated first |
| `SCORE_EPSILON` | 0.001 | Near-zero relevance |
| `SCORE_HALF` | 0.5 | Middle relevance |
| `SCORE_NEAR_ONE` | 0.999 | Near-perfect relevance |
| `SCORE_ONE` | 1.0 | Perfect relevance, never truncated |

### Scale Tier Boundaries

| Fixture Name | fileCount | Expected Tier |
|-------------|-----------|--------------|
| `SCALE_0` | 0 | 'small' |
| `SCALE_1` | 1 | 'small' |
| `SCALE_9999` | 9999 | 'small' |
| `SCALE_10000` | 10000 | boundary (small/medium) |
| `SCALE_10001` | 10001 | 'medium' |
| `SCALE_99999` | 99999 | 'medium' |
| `SCALE_100000` | 100000 | boundary (medium/large) |
| `SCALE_100001` | 100001 | 'large' |
| `SCALE_500000` | 500000 | 'large' |

### Health Check Timeout Boundaries

| Fixture Name | timeout | Expected Behavior |
|-------------|---------|-------------------|
| `HEALTH_INSTANT` | 0ms | Returns immediately |
| `HEALTH_FAST` | 500ms | Completes within limit |
| `HEALTH_SLOW` | 1999ms | Just within 2000ms limit |
| `HEALTH_AT_LIMIT` | 2000ms | At timeout boundary |
| `HEALTH_OVER_LIMIT` | 2001ms | Should return 'unavailable' |
| `HEALTH_HANG` | 60000ms | Must not block caller |

## 5. Invalid Inputs

### Malformed SearchRequest Objects

```javascript
export const MALFORMED_REQUESTS = {
  nullObject: null,
  undefinedObject: undefined,
  emptyObject: {},
  missingQuery: { modality: 'lexical' },
  missingModality: { query: 'test' },
  extraFields: { query: 'test', modality: 'lexical', unknownField: 'value' },
  nestedNull: { query: null, modality: null, scope: null },
  prototypePoison: JSON.parse('{"query":"test","modality":"lexical","__proto__":{"admin":true}}'),
};
```

### Malformed Backend Results (RawSearchHit)

```javascript
export const MALFORMED_HITS = {
  missingFilePath: { line: 1, matchContent: 'test' },
  nullFilePath: { filePath: null, line: 1, matchContent: 'test' },
  missingLine: { filePath: '/a.js', matchContent: 'test' },
  negativeLine: { filePath: '/a.js', line: -1, matchContent: 'test' },
  missingMatchContent: { filePath: '/a.js', line: 1 },
  extraFields: { filePath: '/a.js', line: 1, matchContent: 'test', bonus: true },
  emptyFilePath: { filePath: '', line: 1, matchContent: 'test' },
  scoreOutOfRange: { filePath: '/a.js', line: 1, matchContent: 'test', relevanceScore: 1.5 },
  negativeScore: { filePath: '/a.js', line: 1, matchContent: 'test', relevanceScore: -0.5 },
};
```

### Malformed Configuration Files

```javascript
export const MALFORMED_CONFIGS = {
  emptyJson: '{}',
  invalidJson: '{not valid json',
  arrayInsteadOfObject: '[]',
  nullValue: 'null',
  emptyString: '',
  binaryGarbage: Buffer.from([0x00, 0xFF, 0xFE, 0x80]),
  missingEnabled: '{"activeBackends": ["grep-glob"]}',
  wrongTypes: '{"enabled": "yes", "activeBackends": "grep-glob"}',
  deeplyNested: '{"enabled": true, "backendConfigs": {"a": {"b": {"c": {"d": "deep"}}}}}',
};
```

## 6. Maximum-Size Inputs

### Large Result Sets

| Fixture Name | Count | Purpose |
|-------------|-------|---------|
| `HITS_1000` | 1,000 hits | Standard large result set |
| `HITS_10000` | 10,000 hits | Stress test for ranker performance |
| `HITS_100000` | 100,000 hits | Maximum expected from unfiltered search |

Generated programmatically:
```javascript
export function generateHits(count) {
  return Array.from({ length: count }, (_, i) => ({
    filePath: `/project/src/file-${i}.js`,
    line: (i % 500) + 1,
    matchContent: `const handler${i} = () => {};`,
    relevanceScore: Math.random(),
  }));
}
```

### Long Strings

| Fixture Name | Length | Purpose |
|-------------|-------|---------|
| `QUERY_LONG` | 10,000 chars | Maximum query length test |
| `QUERY_UNICODE` | 1,000 chars (multibyte) | Unicode handling |
| `QUERY_SPECIAL` | 500 chars | Special regex characters |
| `PATH_LONG` | 4,096 chars | Maximum file path length |
| `SNIPPET_LONG` | 50,000 chars | Large context snippet |

### Large Configuration

```javascript
export const LARGE_CONFIG = {
  enabled: true,
  activeBackends: Array.from({ length: 50 }, (_, i) => `backend-${i}`),
  backendConfigs: Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      `backend-${i}`,
      { enabled: true, mcpServerName: `mcp-${i}`, options: { key: `value-${i}` } },
    ])
  ),
};
```

## 7. Backend-Specific Test Data

### Lexical Backend (Grep/Glob)

Test data requires real files on the filesystem. Created in temp directories during tests.

```javascript
export const LEXICAL_TEST_FILES = {
  'src/auth.js': 'function handleAuth(user) { return user.isValid; }',
  'src/utils.js': 'function formatDate(d) { return d.toISOString(); }',
  'src/config.js': 'const config = { port: 3000, host: "localhost" };',
  'tests/auth.test.js': 'describe("auth", () => { it("validates", () => {}); });',
  'README.md': '# Project\nThis is a test project.',
};
```

### Structural Backend (ast-grep)

MCP response stubs for unit testing:

```javascript
export const AST_GREP_RESPONSES = {
  asyncFunctions: {
    matches: [
      { file: '/src/auth.js', line: 5, column: 0, node_type: 'function_declaration', text: 'async function handleAuth()' },
      { file: '/src/api.js', line: 12, column: 2, node_type: 'function_declaration', text: 'async function fetchData()' },
    ],
  },
  noMatches: { matches: [] },
  malformedResponse: { unexpected: 'format' },
  timeoutResponse: null, // simulate timeout
};
```

### Enhanced Lexical Backend (Probe)

MCP response stubs for unit testing:

```javascript
export const PROBE_RESPONSES = {
  rankedResults: {
    results: [
      { file: '/src/auth.js', line: 5, score: 0.95, context: 'function handleAuth', tree_sitter: { node_type: 'function_item' } },
      { file: '/src/utils.js', line: 10, score: 0.42, context: 'const auth = require', tree_sitter: { node_type: 'variable_declaration' } },
    ],
  },
  emptyResults: { results: [] },
  malformedResponse: 'not json',
};
```

## 8. Settings.json Test Data

```javascript
export const SETTINGS_FIXTURES = {
  empty: {},
  withExistingMcp: {
    mcpServers: {
      'existing-server': { command: 'some-cmd', args: [] },
    },
  },
  withAstGrep: {
    mcpServers: {
      'ast-grep': { command: 'ast-grep', args: ['lsp'], env: {} },
    },
  },
  withMultipleMcp: {
    mcpServers: {
      'ast-grep': { command: 'ast-grep', args: ['lsp'], env: {} },
      'probe': { command: 'probe-mcp', args: ['--workspace', '/project'], env: {} },
    },
  },
  corruptJson: '{mcpServers: invalid}',
  readOnlyPermissions: null, // tested by changing file permissions
};
```

## 9. Test Data Generation Strategy

| Data Type | Generation Method | Lifecycle |
|-----------|------------------|-----------|
| Static fixtures | Exported constants from fixture files | Created at module load time |
| Filesystem fixtures | `createTempDir()` + `writeFileSync()` | Created in `before()`, cleaned in `after()` |
| Large datasets | `generateHits(n)` factory function | Created on demand in specific tests |
| Config files | `writeSearchConfig()` to temp dir | Created per test, cleaned in `after()` |
| MCP response stubs | Static fixture objects | Used as return values from stubbed MCP calls |

## 10. Test Data Isolation

All test data follows the existing project convention:

1. Each `describe()` block creates its own temp directory via `createTempDir()`
2. All file operations target the temp directory (never the real project)
3. `after()` hooks call `cleanupTempDir()` to remove all test artifacts
4. No test shares state with another test (no global mutable fixtures)
5. Environment variables set during tests are restored in `after()` hooks

This ensures tests are hermetic and can run in parallel without interference.
