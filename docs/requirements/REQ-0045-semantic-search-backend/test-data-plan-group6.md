# Test Data Plan: REQ-0045 Group 6 -- Cloud Adapters, Discovery Integration, KB Pipeline

**Date**: 2026-03-06
**Phase**: 05 - Test Strategy

---

## Overview

This document defines the test data requirements for Group 6 (FR-005, FR-016, FR-002). Test data falls into four categories: mock API servers for cloud providers, fixture documents for the knowledge base pipeline, mock architecture-analyzer output for discovery integration, and boundary/invalid/maximum-size inputs for edge case coverage.

---

## Mock Cloud API Servers

### Voyage API Mock

The Voyage API mock validates incoming requests and returns deterministic embedding vectors.

**Endpoint**: `POST /v1/embeddings`

**Valid Request Shape**:
```json
{
  "input": ["chunk text 1", "chunk text 2"],
  "model": "voyage-code-3"
}
```

**Required Headers**:
- `Authorization: Bearer sk-voyage-test-key-12345`
- `Content-Type: application/json`

**Success Response (200)**:
```json
{
  "data": [
    { "embedding": [0.1, 0.2, ...], "index": 0 },
    { "embedding": [0.3, 0.4, ...], "index": 1 }
  ],
  "model": "voyage-code-3",
  "usage": { "total_tokens": 42 }
}
```

**Dimension**: 1024 floats per vector. Mock generates deterministic vectors using `hashToVector(text, 1024)` from existing test helpers.

**Error Responses**:
- 401: `{ "error": { "message": "Invalid API key", "type": "authentication_error" } }`
- 429: `{ "error": { "message": "Rate limit exceeded", "type": "rate_limit_error" } }` with `Retry-After: 5` header
- 500: `{ "error": { "message": "Internal server error", "type": "server_error" } }`

### OpenAI API Mock

**Endpoint**: `POST /v1/embeddings`

**Valid Request Shape**:
```json
{
  "input": ["chunk text 1", "chunk text 2"],
  "model": "text-embedding-3-small"
}
```

**Required Headers**:
- `Authorization: Bearer sk-openai-test-key-67890`
- `Content-Type: application/json`

**Success Response (200)**:
```json
{
  "data": [
    { "embedding": [0.1, 0.2, ...], "index": 0, "object": "embedding" },
    { "embedding": [0.3, 0.4, ...], "index": 1, "object": "embedding" }
  ],
  "model": "text-embedding-3-small",
  "object": "list",
  "usage": { "prompt_tokens": 42, "total_tokens": 42 }
}
```

**Dimension**: 1536 floats per vector. Same deterministic generation as Voyage.

**Error Responses**: Same structure as Voyage (401, 429, 500).

### Mock Server Implementation Pattern

```javascript
import { createServer } from 'node:http';

function createMockAPIServer({ dimensions, validApiKey, modelName }) {
  const server = createServer((req, res) => {
    // Collect body
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Validate auth
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${validApiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }));
        return;
      }

      const parsed = JSON.parse(body);
      const vectors = parsed.input.map((text, i) => ({
        embedding: generateDeterministicVector(text, dimensions),
        index: i,
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: vectors,
        model: modelName,
        usage: { total_tokens: parsed.input.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0) },
      }));
    });
  });

  return server;
}
```

---

## Document Fixtures for FR-002

### Markdown Fixture (`tests/fixtures/embedding/sample-document.md`)

```markdown
# Installation Guide

This guide covers installing the framework on all platforms.

## Prerequisites

You need Node.js 20+ and npm 10+.

### System Requirements

- macOS 12+, Ubuntu 22.04+, or Windows 11
- 4GB RAM minimum
- 10GB disk space

## Quick Start

Run the following command:

` ` `bash
npm install -g isdlc
isdlc init
` ` `

This installs the CLI globally.

## Configuration

### Basic Configuration

Edit `.isdlc/config.json` to set defaults.

### Advanced Configuration

For CI/CD pipelines, use environment variables:

- `ISDLC_MODEL`: Embedding model (default: codebert)
- `ISDLC_LANGUAGE`: Target language (default: java)

## Troubleshooting

Common issues and solutions.
```

**Expected Chunking** (5 top-level sections):
1. "Installation Guide" (intro paragraph)
2. "Prerequisites" (with nested "System Requirements" subsection)
3. "Quick Start" (with code block)
4. "Configuration" (with nested "Basic" and "Advanced" subsections)
5. "Troubleshooting"

### HTML Fixture (`tests/fixtures/embedding/sample-document.html`)

```html
<!DOCTYPE html>
<html>
<head><title>API Reference</title></head>
<body>
<h1>API Reference</h1>
<p>This document describes the public API.</p>

<h2>Authentication</h2>
<p>All requests require an <strong>API key</strong> in the Authorization header.</p>

<h2>Endpoints</h2>
<h3>POST /v1/embeddings</h3>
<p>Generate embeddings for input text.</p>
<ul>
<li>Input: array of strings</li>
<li>Output: array of float vectors</li>
</ul>

<h3>GET /v1/models</h3>
<p>List available embedding models.</p>

<h2>Error Codes</h2>
<p>Standard HTTP error codes apply. See <a href="#troubleshooting">troubleshooting</a>.</p>
</body>
</html>
```

**Expected Chunking** (4 H2 sections + 2 H3 subsections):
1. "API Reference" (intro paragraph)
2. "Authentication" (paragraph)
3. "Endpoints" (with "POST /v1/embeddings" and "GET /v1/models" subsections)
4. "Error Codes" (paragraph)

### Plain Text Fixture

Used inline in tests (no file needed):
```
This is the first paragraph of a plain text document.
It spans multiple lines but is a single paragraph.

This is the second paragraph. It discusses configuration
options for the embedding pipeline.

This is the third paragraph about troubleshooting.
It covers common error scenarios.
```

**Expected Chunking**: 3 chunks (split on double newlines).

---

## Mock Architecture-Analyzer Output for FR-016

### `tests/fixtures/embedding/sample-modules.json`

```json
{
  "modules": [
    {
      "id": "mod-auth",
      "name": "Authentication",
      "domain": "security.auth",
      "description": "User authentication and session management",
      "paths": ["src/auth/", "src/session/"],
      "keywords": ["login", "authentication", "session", "token", "JWT"]
    },
    {
      "id": "mod-orders",
      "name": "Order Management",
      "domain": "commerce.orders",
      "description": "Order lifecycle from creation to fulfillment",
      "paths": ["src/orders/", "src/fulfillment/"],
      "keywords": ["order", "cart", "checkout", "fulfillment"]
    },
    {
      "id": "mod-payments",
      "name": "Payments",
      "domain": "commerce.payments",
      "description": "Payment processing and refunds",
      "paths": ["src/payments/"],
      "keywords": ["payment", "refund", "transaction", "billing"]
    }
  ]
}
```

### Mock Source Files for Discovery Tests

Tests create a temporary directory structure matching the module paths:

```
temp-dir/
  src/
    auth/
      login.js       (20 lines, function-based)
      session.js     (15 lines, class-based)
    session/
      token.js       (10 lines)
    orders/
      order.js       (25 lines, class with methods)
      cart.js         (15 lines)
    fulfillment/
      fulfillment.js  (10 lines)
    payments/
      payment.js     (20 lines)
    shared/
      utils.js       (10 lines, no module match)
```

These files contain simple JavaScript functions/classes that the chunker can parse. The `shared/utils.js` file deliberately belongs to no module to test the "unclassified" fallback in upgrade logic.

---

## Boundary Values

### API Key Strings

| Value | Expected Behavior |
|-------|------------------|
| `"sk-valid-key-12345"` | Accepted, sent in Authorization header |
| `""` (empty string) | Rejected: "apiKey must be a non-empty string" |
| `null` | Rejected: "apiKey is required for cloud providers" |
| `undefined` | Rejected: "apiKey is required for cloud providers" |
| `"sk-" + "x".repeat(200)` (203 chars) | Accepted (API keys can be long) |
| `" "` (whitespace only) | Rejected: "apiKey must be a non-empty string" |

### Embedding Dimensions

| Value | Context | Expected Behavior |
|-------|---------|------------------|
| 768 | CodeBERT adapter | Standard local model dimensions |
| 1024 | Voyage adapter | Voyage-code-3 output dimensions |
| 1536 | OpenAI adapter | text-embedding-3-small dimensions |
| 0 | Config with unknown provider | Error or dimensions=0 in result |
| Mismatched (query=768, index=1024) | FAISS search | Error: "dimension mismatch" |

### Document Sizes

| Size | Document | Purpose |
|------|----------|---------|
| 0 bytes | `""` | Empty document: returns empty chunks |
| 50 bytes | Single heading, no body | Minimal document: 1 chunk |
| 5 KB | 5 headings, 3 paragraphs each | Typical document |
| 100 KB | 500 headings | Stress test for chunker |
| 1 line (no structure) | "Just a single line" | Falls back to single chunk |

### Module Count (Discovery)

| Count | Context | Expected Behavior |
|-------|---------|------------------|
| 0 | `generateAfterMode({ modules: [] })` | Error: "at least one module required" |
| 1 | Single module covers all files | One .emb package, equivalent to flat |
| 3 | Typical multi-module | 3 .emb packages |
| 20 | Large codebase | 20 .emb packages, stress test |

### File Count (Discovery)

| Count | Context | Expected Behavior |
|-------|---------|------------------|
| 0 | Empty working copy | Warning: "no supported files found" |
| 1 | Single source file | 1+ chunks, valid package |
| 50 | Typical module | Normal operation |
| 500 | Large module | Performance test: should complete within targets |

---

## Invalid Inputs

### Cloud Adapters (FR-005)

| Input | Expected Error |
|-------|---------------|
| `createVoyageAdapter({})` (no apiKey) | `Error: apiKey is required for Voyage adapter` |
| `createVoyageAdapter({ apiKey: '' })` | `Error: apiKey must be a non-empty string` |
| `createOpenAIAdapter({ apiKey: null })` | `Error: apiKey is required for OpenAI adapter` |
| `embed(['text'], { provider: 'voyage-code-3' })` (no apiKey in config) | `Error: apiKey is required for cloud providers` |
| Mock API returns malformed JSON | `Error: invalid response from Voyage API` |
| Mock API returns vectors with wrong dimensions | `Error: API returned vectors with unexpected dimensions` |
| Mock API returns HTTP 503 | `Error: Voyage API service unavailable (503)` |
| `embed(['text'], { provider: 'voyage-code-3', endpoint: 'not-a-url' })` | `Error: invalid endpoint URL` |

### Discovery Integration (FR-016)

| Input | Expected Error |
|-------|---------------|
| `generateBeforeMode({ workingCopyPath: '/nonexistent' })` | `Error: working copy directory not found` |
| `generateBeforeMode({})` (no workingCopyPath) | `Error: workingCopyPath is required` |
| `generateAfterMode({ workingCopyPath: '/tmp/x', modules: null })` | `Error: modules array is required for after-mode` |
| `upgradeToModulePartitioned({ flatPackagePath: null })` | `Error: flatPackagePath is required` |
| `upgradeToModulePartitioned({ flatPackagePath: '/nonexistent.emb' })` | `Error: flat package not found` |
| `loadIntoMCPServer({ packagePaths: null })` | `Error: packagePaths array is required` |
| `offerEmbeddingGeneration()` with invalid timing selection | Returns null or prompts again |

### Knowledge Base Pipeline (FR-002)

| Input | Expected Error |
|-------|---------------|
| `chunkDocument('', 'markdown')` | Returns empty chunks array (not error) |
| `chunkDocument(null, 'markdown')` | `Error: content must be a string` |
| `chunkDocument('text', 'pdf')` | `Error: unsupported document type 'pdf'` |
| `chunkDocument('text', null)` | `Error: documentType is required` |
| `buildKBPackage({ documents: [] })` | `Error: at least one document required` |
| `buildKBPackage({ documents: [{ content: '', type: 'markdown' }] })` | Warning: empty document skipped |
| `detectDocumentType(null)` | Returns null |
| `detectDocumentType('file.exe')` | Returns null |

---

## Maximum-Size Inputs

### Cloud Adapter Batch Processing

| Scenario | Parameters | Expected Behavior |
|----------|-----------|------------------|
| 100 chunks in single embed() call | 100 texts, batchSize=32 | 4 API calls (batches of 32, 32, 32, 4), progress reported |
| Single text of 10,000 tokens | 1 very long text | API accepts (cloud models handle larger contexts) |
| 1000 chunks | 1000 texts, batchSize=50 | 20 API calls, completes within timeout |

### Document Chunker Stress

| Scenario | Input | Expected Behavior |
|----------|-------|------------------|
| 500-heading markdown | `# H1\n\nContent\n\n` repeated 500x | 500 chunks, completes <50ms |
| 1000-tag HTML | Nested `<div>` with `<h2>` sections | Parsed without stack overflow |
| 100KB plain text | 200 paragraphs, 500 chars each | ~200 chunks, completes <100ms |
| Single 50KB paragraph | One paragraph, no breaks | Split at sentence boundaries into ~50 chunks |
| Deeply nested markdown (6 levels) | `#` through `######` | Respects all heading levels |

### Discovery Scale

| Scenario | Parameters | Expected Behavior |
|----------|-----------|------------------|
| 500 files in before-mode | 500 mock source files | Generates flat package, progress reported |
| 20 modules in after-mode | 20 module definitions with 25 files each | 20 .emb packages |
| Upgrade with 1000 chunks | 1000-chunk flat package, 10 modules | Re-partitioned into 10 packages, <100ms |
| Empty modules | 3 modules, one with 0 matching files | Warning for empty module, 2 valid packages |

---

## Test Data Reuse from Prior Groups

The following test data patterns from Groups 1-5 are reused in Group 6:

| Data | Source | Used By |
|------|--------|---------|
| `sampleChunks(n)` helper | MCP server tests | FR-016 discover integration |
| `sampleVectors(n, dims)` helper | MCP server tests | FR-005 dimension tests, FR-016 |
| `buildTestPackage()` helper | MCP server tests | FR-016 auto-load tests |
| `sample-registry.json` fixture | Registry tests | FR-016 module registration |
| `createTempDir()`/`cleanupTempDir()` | Test helpers | All Group 6 tests |
| M5 `buildPackage()` | Package builder | FR-002 KB package tests, FR-016 |
| M5 `readPackage()` | Package reader | FR-005 dimension roundtrip, FR-002 |
| M7 `createStoreManager()` | MCP server | FR-016 auto-load tests |
