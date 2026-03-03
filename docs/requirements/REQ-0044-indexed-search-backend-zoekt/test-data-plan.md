# Test Data Plan: Indexed Search Backend (REQ-0044)

**Status**: Draft
**Last Updated**: 2026-03-03

---

## 1. MCP Response Stubs

### Valid MCP Search Results

```javascript
const validMcpResults = [
  { file_path: 'src/router.js', line_number: 42, content: 'class SearchRouter', score: 0.95, language: 'javascript' },
  { file_path: 'lib/search/config.js', line_number: 10, content: 'export function readConfig', score: 0.72, language: 'javascript' },
];
```

### Minimal MCP Result (missing optional fields)

```javascript
const minimalMcpResult = [
  { file_path: 'test.js' }  // no line_number, content, score, language
];
```

### Empty/Null Responses

```javascript
const emptyResults = [];
const nullResults = null;
const undefinedResults = undefined;
```

## Boundary Values

### Score Normalization

| Input Score | Expected Output | Rationale |
|-------------|-----------------|-----------|
| `0.95` | `0.95` | Already in 0-1 range |
| `0` | `0` | Minimum valid score |
| `1` | `1` | Maximum valid score |
| `undefined` | `undefined` | Missing score preserved |

### Line Number Edge Cases

| Input | Expected Output | Rationale |
|-------|-----------------|-----------|
| `42` | `42` | Normal line number |
| `0` | `0` | Zero-based line |
| `undefined` | `0` | Missing → default 0 |
| `null` | `0` | Null → default 0 |

## Invalid Inputs

### Malformed MCP Responses

```javascript
const malformedResponses = [
  null,                    // null response
  undefined,               // undefined response
  'not an array',          // string instead of array
  { results: [] },         // object instead of array
  [{ no_file_path: true }] // missing required file_path field
];
```

### Invalid Search Requests

```javascript
const invalidRequests = [
  { query: '', modality: 'indexed' },     // empty query
  { query: null, modality: 'indexed' },    // null query
];
```

## Maximum-Size Inputs

### Large Result Set

```javascript
// Generate 100 results to test normalizer handles bulk data
const largeResultSet = Array.from({ length: 100 }, (_, i) => ({
  file_path: `src/file-${i}.js`,
  line_number: i + 1,
  content: `match content ${i}`,
  score: Math.random(),
}));
```

## 2. Python Version Strings

| Input | Python Available | Version Parsed | Rationale |
|-------|-----------------|----------------|-----------|
| `'Python 3.11.4'` | true | `'3.11.4'` | Standard modern Python |
| `'Python 3.8.0'` | true | `'3.8.0'` | Minimum supported |
| `'Python 3.7.9'` | false | — | Below minimum |
| `'Python 2.7.18'` | false | — | Python 2 (ancient) |
| `''` (command fails) | false | — | Python not installed |

## 3. Exec Stub Configurations

### Full Environment (all tools available)

```javascript
const fullEnv = {
  'python3 --version': { success: true, output: 'Python 3.11.4' },
  'pip3 --version': { success: true, output: 'pip 23.2.1' },
  'code-index-mcp --version': { success: true, output: '1.0.0' },
  'npm --version': { success: true, output: '10.0.0' },
};
```

### No Python Environment

```javascript
const noPythonEnv = {
  'npm --version': { success: true, output: '10.0.0' },
  // python3 and python both fail (default stub returns failure)
};
```

### Python Without pip

```javascript
const noPipEnv = {
  'python3 --version': { success: true, output: 'Python 3.11.4' },
  'npm --version': { success: true, output: '10.0.0' },
  // pip3 and pip both fail
};
```

## 4. MCP Call Function Stubs

### Healthy MCP

```javascript
const healthyMcp = async (toolName, args) => {
  if (toolName === 'get_settings_info') return { version: '1.0.0' };
  if (toolName === 'search_code_advanced') return validMcpResults;
  return null;
};
```

### Timeout MCP

```javascript
const timeoutMcp = async () => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  return true;
};
```

### Error MCP

```javascript
const errorMcp = async () => { throw new Error('connection refused'); };
```

## 5. Filesystem Fixtures

### settings.json with existing MCP servers

```javascript
const existingSettings = {
  mcpServers: {
    'ast-grep': { command: 'ast-grep', args: ['mcp'] },
  },
};
```

### search-config.json with code-index backend

```javascript
const configWithCodeIndex = {
  activeBackends: ['grep-glob', 'code-index'],
  version: '1.0.0',
};
```
