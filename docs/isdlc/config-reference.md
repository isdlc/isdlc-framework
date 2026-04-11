# Configuration Reference

All user-configurable settings live in a single file: `.isdlc/config.json`

This file is created automatically on install with default values. Edit it to customize framework behavior.

---

## Sections

### `cache`

Controls the session cache that injects project context into every conversation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `budget_tokens` | number | `100000` | Maximum tokens allocated to session cache content |
| `section_priorities` | object | *(see below)* | Priority weights for cache sections (higher = included first) |

**Default `section_priorities`**:

| Section | Default Priority |
|---------|-----------------|
| `CONSTITUTION` | 100 |
| `WORKFLOW_CONFIG` | 90 |
| `ITERATION_REQUIREMENTS` | 85 |
| `ARTIFACT_PATHS` | 80 |
| `SKILLS_MANIFEST` | 75 |
| `SKILL_INDEX` | 70 |
| `EXTERNAL_SKILLS` | 65 |
| `ROUNDTABLE_CONTEXT` | 60 |
| `DISCOVERY_CONTEXT` | 50 |
| `INSTRUCTIONS` | 40 |

### `ui`

Controls user interface behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `show_subtasks_in_ui` | boolean | `true` | Show sub-task progress entries in the Claude task list |

### `provider`

Controls the LLM provider selection.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default` | string | `"claude"` | Default provider: `"claude"` or `"codex"` |

### `roundtable`

Controls roundtable analysis behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verbosity` | string | `"bulleted"` | Output format: `"bulleted"` or `"prose"` |
| `default_personas` | string[] | `["persona-business-analyst", "persona-solutions-architect", "persona-system-designer"]` | Active personas for roundtable analysis |
| `disabled_personas` | string[] | `[]` | Personas to exclude from all analyses |

### `search`

Controls the search backend configuration. Empty by default — backends are auto-detected.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| *(extensible)* | object | `{}` | Search backend settings (populated by `isdlc setup-knowledge`) |

### `embeddings`

Controls the code embedding pipeline (semantic search). The embedding server loads `.emb` packages and serves `POST /search` queries over HTTP on `localhost:7777` by default.

#### Provider

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | `"jina-code"` | Embedding backend: `"jina-code"` (local, 768-dim, Jina v2 Base Code via Transformers.js), `"voyage-code-3"` (cloud, 1024-dim), `"openai"` (cloud, 1536-dim) |
| `model` | string | `"jinaai/jina-embeddings-v2-base-code"` | HuggingFace model ID (jina-code only) |
| `api_key_env` | string\|null | `null` | Environment variable holding the API key (cloud providers only) |

#### Server

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `server.port` | number | `7777` | Port for the HTTP embedding server |
| `server.host` | string | `"localhost"` | Bind address (use `"0.0.0.0"` to expose to LAN) |
| `server.auto_start` | boolean | `true` | Auto-start the server after embedding generation |
| `server.startup_timeout_ms` | number | `30000` | Max time to wait for the server to become reachable after spawn |

#### Hardware acceleration (jina-code only, REQ-GH-238)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `parallelism` | number\|`"auto"` | `"auto"` | Worker thread count. `"auto"` resolves to `min(cpus-1, memory-cap, 4)`. Explicit integer forces that count. **Note**: with the current engine integration, `parallelism > 1` does not speed up CLI generation — the engine's sequential batch loop calls the pool one batch at a time, so additional workers sit idle. Use `1` for in-process mode until the engine loop is fixed (tracked separately). |
| `device` | string | `"auto"` | ONNX Runtime execution provider: `"auto"`, `"cpu"`, `"coreml"` (macOS ARM), `"cuda"` (Linux NVIDIA), `"rocm"` (Linux AMD), `"directml"` (Windows). Auto resolves to the best supported provider for your platform. |
| `dtype` | string | `"auto"` | Model precision: `"auto"`, `"fp32"`, `"fp16"`, `"q8"`. Auto picks `fp16` for hardware-accelerated devices, `q8` for CPU. **Known issue**: Jina v2's fp16 ONNX variant triggers a broken ONNX Runtime graph optimizer (`SimplifiedLayerNormFusion` missing-node bug). Add `session_options.graphOptimizationLevel: "disabled"` to use fp16. |
| `batch_size` | number | `32` | Texts processed per inference call. Larger batches trade memory for throughput. |
| `session_options` | object | `{}` | Passthrough to ONNX Runtime session options. Common keys: `graphOptimizationLevel` (`"disabled"`, `"basic"`, `"extended"`, `"all"`), `intraOpNumThreads`, `interOpNumThreads`. |
| `max_memory_gb` | number\|null | `null` | Total system memory budget in GB. When set, caps the auto-parallelism calculation so the embedding pipeline doesn't exceed this budget. Leaves headroom for OS and other apps. Example: `18` on a 24GB machine reserves 6GB for everything else. `null` uses all available RAM. |

#### Sources (what to embed)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sources` | object[] | *(see below)* | List of source paths and their embedding tier |

Default:
```json
"sources": [
  { "type": "code", "path": "src/", "tier": "full" },
  { "type": "docs", "path": "docs/" }
]
```

The CLI automatically excludes test/build artifacts: `coverage/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `node_modules/`, `*.min.js`, `*.min.css`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`.

#### Benchmark reference (24GB MacBook Apple Silicon, 19811 chunks at ~1860 chars avg)

| Config | Rate | Full run |
|---|---|---|
| `fp16` + `coreml` (with `graphOptimizationLevel: disabled`) | ~2-5/s (warms up) | ~1h40min |
| `fp32` + `coreml` | ~0.9/s | ~6 hours |
| `q8` + `cpu` | ~3.6/s | ~1h30min |

Transformer attention is O(n²) on token count, so throughput depends heavily on chunk size. Short synthetic strings benchmark much faster than real ~2000-char code chunks; always benchmark on real data when comparing configurations.

#### Example — fp16 on Apple Silicon with memory cap

```json
"embeddings": {
  "provider": "jina-code",
  "model": "jinaai/jina-embeddings-v2-base-code",
  "parallelism": 1,
  "device": "auto",
  "dtype": "fp16",
  "batch_size": 32,
  "session_options": {
    "graphOptimizationLevel": "disabled"
  },
  "max_memory_gb": 20,
  "server": {
    "port": 7777,
    "host": "localhost",
    "auto_start": true
  }
}
```

#### Starting the server manually

```bash
# Managed (detached daemon — writes PID + logs, survives terminal close)
node bin/isdlc-embedding.js server start
node bin/isdlc-embedding.js server status
node bin/isdlc-embedding.js server stop
node bin/isdlc-embedding.js server restart

# Foreground (attached to terminal, Ctrl+C to stop)
node bin/isdlc-embedding-server.js
node bin/isdlc-embedding-server.js --port=8888 --host=0.0.0.0

# After npm install (global bins)
isdlc-embedding server start
isdlc-embedding-server --port=7777
```

**Important**: The server reads `.isdlc/config.json` and loads `.emb` packages from `docs/.embeddings/` **relative to `cwd`**. Always `cd` to the project root before starting.

#### Generating / refreshing embeddings

```bash
# Full generation (first time, or after major changes)
node bin/isdlc-embedding.js generate .

# Incremental (re-embeds only files whose content hash changed since last run)
node bin/isdlc-embedding.js generate . --incremental
```

After generation, the CLI POSTs `/reload` to the running server to load the new package, or auto-starts the server if it isn't running (when `auto_start: true`).

#### HTTP endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Server status, loaded modules, uptime |
| `/modules` | GET | List of all loaded `.emb` packages |
| `/modules/:id` | GET | Metadata for a specific module |
| `/search` | POST | Semantic search: `{query, maxResults?, modules?, tokenBudget?}` |
| `/reload` | POST | Load/replace `.emb` packages: `{paths: [string]}` |
| `/refresh` | POST | Incremental refresh of specific files (requires chunkerFn + embedFn wiring) |

#### Runtime files

| File | Location | Purpose |
|------|----------|---------|
| `.emb` packages | `docs/.embeddings/` | Tar archives with manifest + HNSW index + metadata DB |
| Server log | `.isdlc/logs/embedding-server.log` | Server stdout/stderr |
| Server PID | `.isdlc/logs/embedding-server.pid` | PID for lifecycle management |

### `workflows`

Controls workflow sizing and performance budgets.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sizing_thresholds.light_max_files` | number | `5` | Max affected files for light workflow sizing |
| `sizing_thresholds.epic_min_files` | number | `20` | Min affected files for epic workflow sizing |
| `performance_budgets` | object | `{}` | Per-tier time budgets (populated from `workflows.json` defaults) |

---

## Example

```json
{
  "cache": {
    "budget_tokens": 150000
  },
  "ui": {
    "show_subtasks_in_ui": false
  },
  "roundtable": {
    "verbosity": "bulleted",
    "disabled_personas": ["persona-ux-reviewer"]
  }
}
```

Only include the fields you want to override. Missing fields use defaults.

---

## Files NOT in config.json

| File | Location | Purpose | Editable? |
|------|----------|---------|-----------|
| `state.json` | `.isdlc/` | Runtime workflow state | No (machine-managed) |
| `roundtable-memory.json` | `.isdlc/` | Session memory | No (machine-managed) |
| `finalize-steps.md` | `.isdlc/config/` | Post-workflow checklist | Yes (process definition) |
| `workflows/*.yaml` | `.isdlc/workflows/` | Custom workflow definitions | Yes (optional) |
| `settings.json` | `.claude/` | Claude Code harness config | Yes (Claude-specific) |
| `constitution.md` | `docs/isdlc/` | Project governance | Yes (document) |
