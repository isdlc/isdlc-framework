# Test Data Plan: REQ-0045 Group 5 -- Distribution & Enterprise

**Scope**: M8 Distribution Adapters, M6 Compatibility Extension, M9 Aggregation Pipeline
**Date**: 2026-03-06

---

## 1. Package Fixtures

All tests use real `.emb` packages built by the existing `buildPackage()` from M5. This ensures tests validate against the actual package format rather than synthetic mocks.

### Factory Function

```javascript
// Reuse pattern from existing test files
function sampleChunks(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `chunk-${i}`,
    content: `function example${i}() { return ${i}; }`,
    filePath: `src/example${i}.js`,
    startLine: i * 10 + 1,
    endLine: i * 10 + 5,
    type: 'function',
    language: 'javascript',
    tokenCount: 20,
    signatures: [],
  }));
}

function sampleVectors(n = 3, dims = 4) {
  return Array.from({ length: n }, () => {
    const v = new Float32Array(dims);
    for (let j = 0; j < dims; j++) v[j] = Math.random();
    return v;
  });
}

async function buildTestPackage(tempDir, moduleId, version = '1.0.0') {
  return buildPackage({
    vectors: sampleVectors(3),
    chunks: sampleChunks(3),
    meta: { moduleId, version, model: 'codebert', dimensions: 4 },
    outputDir: join(tempDir, `${moduleId}-${version}`),
  });
}
```

### Pre-built Fixture Packages

| Package | Module ID | Version | Chunks | Use Case |
|---------|----------|---------|--------|----------|
| pkg-auth-1.0 | mod-auth | 1.0.0 | 3 | Baseline compatible |
| pkg-auth-2.0 | mod-auth | 2.0.0 | 3 | Major version upgrade |
| pkg-orders-1.5 | mod-orders | 1.5.0 | 3 | Compatible with auth@2.x |
| pkg-orders-3.0 | mod-orders | 3.0.0 | 3 | Incompatible with auth@2.x |
| pkg-payments-1.2 | mod-payments | 1.2.3 | 3 | Third module for bundles |
| pkg-empty | mod-empty | 1.0.0 | 0 | Empty chunks edge case |

---

## 2. Mock Transport Backends

### HTTP Mock (Artifactory / Nexus)

```javascript
import { createServer } from 'node:http';

function createMockArtifactoryServer() {
  const store = new Map();  // path -> { buffer, checksum }

  const server = createServer((req, res) => {
    const path = req.url;

    if (req.method === 'PUT') {
      // Publish
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const checksum = req.headers['x-checksum-sha256'];
        store.set(path, { buffer, checksum });
        res.writeHead(201);
        res.end(JSON.stringify({ status: 'created' }));
      });
    } else if (req.method === 'GET') {
      // Fetch
      const entry = store.get(path);
      if (!entry) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.setHeader('X-Checksum-Sha256', entry.checksum);
      res.writeHead(200);
      res.end(entry.buffer);
    }
  });

  return { server, store };
}
```

### S3 Mock

```javascript
function createMockS3Client() {
  const buckets = new Map();  // bucket -> Map(key -> Buffer)

  return {
    putObject({ Bucket, Key, Body }) {
      if (!buckets.has(Bucket)) buckets.set(Bucket, new Map());
      buckets.get(Bucket).set(Key, Body);
      return Promise.resolve({ ETag: '"mock-etag"' });
    },
    getObject({ Bucket, Key }) {
      const obj = buckets.get(Bucket)?.get(Key);
      if (!obj) return Promise.reject(new Error('NoSuchKey'));
      return Promise.resolve({ Body: obj });
    },
    listObjectsV2({ Bucket, Prefix }) {
      const keys = [...(buckets.get(Bucket)?.keys() || [])]
        .filter(k => k.startsWith(Prefix));
      return Promise.resolve({ Contents: keys.map(k => ({ Key: k })) });
    },
  };
}
```

### SFTP Mock

```javascript
function createMockSftpClient() {
  const files = new Map();  // remotePath -> Buffer

  return {
    put(localPath, remotePath) {
      const data = readFileSync(localPath);
      files.set(remotePath, data);
      return Promise.resolve();
    },
    get(remotePath, localPath) {
      const data = files.get(remotePath);
      if (!data) return Promise.reject(new Error('No such file'));
      writeFileSync(localPath, data);
      return Promise.resolve();
    },
    list(dir) {
      const entries = [...files.keys()]
        .filter(p => p.startsWith(dir))
        .map(p => ({ name: p.split('/').pop(), type: '-' }));
      return Promise.resolve(entries);
    },
  };
}
```

---

## 3. Compatibility Matrix Fixtures

### Standard Matrix (3 modules)

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "module": "mod-auth",
      "compatibleWith": {
        "mod-orders": ">=1.0.0 <2.0.0",
        "mod-payments": ">=1.0.0"
      }
    },
    {
      "module": "mod-orders",
      "compatibleWith": {
        "mod-payments": ">=1.0.0 <2.0.0"
      }
    }
  ]
}
```

Save as: `tests/fixtures/embedding/compatibility-matrix.json`

### Large Matrix (for stress tests)

Generated programmatically with 100 modules, each with 5-10 compatibility rules.

---

## 4. Registry Fixtures

### Extended Sample Registry

Extend existing `sample-registry.json` with additional versions for update checker tests:

```javascript
function createMultiVersionRegistry(tempDir) {
  const registryPath = join(tempDir, 'registry.json');
  const registry = loadRegistry(registryPath);

  // Multiple versions of the same modules
  const modules = [
    { id: 'mod-auth', version: '1.0.0', domain: 'security.authentication', name: 'Auth v1' },
    { id: 'mod-auth', version: '2.0.0', domain: 'security.authentication', name: 'Auth v2' },
    { id: 'mod-auth', version: '2.1.0', domain: 'security.authentication', name: 'Auth v2.1' },
    { id: 'mod-orders', version: '1.0.0', domain: 'commerce.orders', name: 'Orders v1' },
    { id: 'mod-orders', version: '1.5.0', domain: 'commerce.orders', name: 'Orders v1.5' },
    { id: 'mod-orders', version: '3.0.0', domain: 'commerce.orders', name: 'Orders v3' },
  ];

  for (const mod of modules) {
    registry.registerModule(mod);
  }

  registry.save();
  return registryPath;
}
```

---

## 5. Boundary Values

### Version Strings

| Category | Values | Expected Behavior |
|----------|--------|------------------|
| Valid minimum | `"0.0.1"` | Parsed correctly |
| Valid typical | `"1.0.0"`, `"2.1.0"`, `"1.5.0"` | Parsed correctly |
| Valid maximum | `"99.99.99"` | Parsed correctly |
| Empty string | `""` | Rejected: "version is required" |
| Null | `null` | Rejected: "version is required" |
| Non-semver | `"latest"`, `"1.0"`, `"abc"` | Rejected: "invalid version format" |
| Pre-release | `"1.0.0-beta.1"` | Parsed; pre-release handled per semver rules |
| Very long | `"1.0.0" + "x".repeat(250)` | Rejected or truncated |

### Module Counts

| Count | Use Case | Expected |
|-------|----------|----------|
| 0 | Empty aggregate | Error: "at least one module required" |
| 1 | Single module bundle | Valid bundle with 1 package |
| 3 | Typical release | Valid bundle |
| 10 | Large release | Valid; performance within targets |
| 20 | Stress test | Valid; no timeouts |

### Package Sizes

| Scenario | Chunks | Vector Dims | Approx Size |
|----------|--------|-------------|-------------|
| Minimal | 1 | 4 | ~1KB |
| Typical | 5 | 4 | ~5KB |
| Standard | 100 | 768 | ~300KB |
| Empty | 0 | 4 | ~500B |

### Checksum Values

| Category | Value | Expected |
|----------|-------|----------|
| Valid SHA-256 | 64-char hex string | Accepted |
| Truncated | 32-char hex string | Rejected: "invalid checksum" |
| Empty | `""` | Rejected |
| Wrong hash | Valid format but wrong content | Rejected: "checksum mismatch" |
| Non-hex chars | `"gg" + "0".repeat(62)` | Rejected: "invalid checksum format" |

---

## 6. Invalid Inputs

| Input | Function | Expected Error |
|-------|----------|---------------|
| `createTransport({ type: 'unknown' })` | Factory | "Unsupported transport type: unknown. Supported: artifactory, nexus, s3, sftp" |
| `createTransport(null)` | Factory | "Config is required" |
| `createTransport({ type: 's3', url: '' })` | Factory | "URL/bucket is required" |
| `transport.publish('/nonexistent.emb', meta)` | Publish | "File not found: /nonexistent.emb" |
| `transport.publish(emptyFilePath, meta)` | Publish | "Empty file cannot be published" |
| `transport.fetch('no-mod', '1.0.0', dest)` | Fetch | "Module no-mod version 1.0.0 not found" |
| `aggregate({ modules: [] })` | Aggregate | "At least one module is required" |
| `aggregate({ modules: [{ id: 'a', packagePath: '/missing.emb' }] })` | Aggregate | "Package file not found for module a" |
| `aggregate({ modules: [{ id: 'a' }, { id: 'a' }] })` | Aggregate | "Duplicate module ID: a" |
| `CompatibilityMatrix.create({ rules: 'invalid' })` | Matrix | "Rules must be an array" |
| Matrix rule with invalid semver range | Matrix | "Invalid version range in compatibility rule" |

---

## 7. Maximum-Size Inputs

| Scenario | Input Size | Target Metric | Pass Criteria |
|----------|-----------|---------------|---------------|
| 100-module compatibility matrix | 100 modules x ~10 rules each | Validation time | <50ms |
| 20-module release bundle | 20 x ~5KB packages | Aggregation time | <500ms |
| 500-module registry for update check | 500 entries | Query time | <100ms |
| 255-char version string | 255 characters | Parse without crash | Error or truncation, no crash |
| Module ID with special characters | Unicode, spaces, slashes | Rejection | Clear error |
| 50 simultaneous version checks | 50 modules in `checkForUpdates()` | Response time | <200ms |

---

## 8. Fixture File Layout

```
tests/
  fixtures/
    embedding/
      sample-registry.json           <- Existing (3 modules, from Group 2)
      compatibility-matrix.json      <- NEW: 3-module compatibility rules
```

All other test data is generated programmatically within test files using the factory functions above. This avoids fixture file proliferation and keeps tests self-contained.

---

## 9. Test Data Lifecycle

| Phase | Action |
|-------|--------|
| `before()` | Create temp directory; build fixture packages; start mock servers |
| Each `it()` | Uses fixtures from `before()`; creates test-specific subdirs if needed |
| `after()` | Stop mock servers; cleanup temp directory |

No persistent test data is left on disk between test runs. All data is generated fresh in `before()` hooks and cleaned in `after()` hooks.
