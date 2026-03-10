# Module Design: Custom Workflow Definitions

**REQ ID**: REQ-0058
**Source**: GH-102
**Status**: Analyzed

---

## Module: Workflow Loader (`src/isdlc/workflow-loader.cjs`)

### Responsibility
Discover, parse, validate, and merge shipped + user-defined workflows into a single registry.

### Public Interface

```javascript
/**
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ shipped: Object, custom: Object, merged: Object, warnings: string[], errors: string[] }}
 */
function loadWorkflows(projectRoot)
```

### Internal Functions

```javascript
/**
 * Resolve diff-based extension against a base workflow
 * @param {string[]} basePhases - Base workflow phase array
 * @param {Object} diffSpec - { remove_phases, add_phases, reorder }
 * @returns {string[]} Resolved phase array
 * @throws {Error} If any operation references a non-existent phase or result is empty
 */
function resolveExtension(basePhases, diffSpec)

/**
 * Validate resolved phase ordering against canonical ordering
 * @param {string[]} phases - Resolved phase array
 * @param {Object} canonicalOrder - Phase-to-rank mapping
 * @returns {string[]} Array of warning messages (empty if ordering is valid)
 */
function validatePhaseOrdering(phases, canonicalOrder)

/**
 * Validate a single user workflow YAML object
 * @param {Object} workflow - Parsed YAML object
 * @param {string} filePath - Source file path (for error messages)
 * @param {Object} shippedWorkflows - Shipped workflow registry (for name collision + extension checks)
 * @param {string} projectRoot - For resolving agent file paths
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateWorkflow(workflow, filePath, shippedWorkflows, projectRoot)
```

### Data Structures

**Workflow Registry Entry**:
```javascript
{
  name: string,           // Display name (e.g., "Spike")
  description: string,    // Short description
  intent: string,         // Natural language intent for LLM matching
  examples: string[],     // Optional sample phrases
  phases: string[],       // Resolved phase list
  gate_mode: string,      // "strict" | "permissive"
  requires_branch: boolean,
  source: string,         // "shipped" | "custom"
  extends: string|null,   // Base workflow name if extended
  phase_agents: Object,   // { "my-phase": ".isdlc/agents/my-agent.md" } — custom phase agent mappings
  agent_modifiers: Object, // Per-phase modifier config
  options: Object,        // Workflow-level settings (e.g., supervised: true)
  file_path: string|null  // Source YAML path for custom workflows
}
```

### Dependencies
- `js-yaml` — YAML parsing
- `fs`, `path` — File system operations
- `src/isdlc/config/workflows.json` — Shipped workflow definitions
- `src/isdlc/config/phase-ordering.json` — Canonical phase ordering

### Estimated Size
~200-250 lines

---

## Module: Phase Ordering Config (`src/isdlc/config/phase-ordering.json`)

### Responsibility
Define canonical ordering ranks for shipped phases. Used by the ordering validator to emit warnings.

### Data Structure
```json
{
  "00-quick-scan": 0,
  "01-requirements": 10,
  "02-impact-analysis": 20,
  "02-tracing": 20,
  "03-architecture": 30,
  "04-design": 40,
  "05-test-strategy": 50,
  "06-implementation": 60,
  "07-testing": 70,
  "08-code-review": 80,
  "09-validation": 90,
  "11-local-testing": 65,
  "15-upgrade-plan": 50,
  "15-upgrade-execute": 60,
  "16-quality-loop": 75
}
```

### Rules
- Only shipped phases have ranks
- Custom phases are skipped in ordering checks
- Warning emitted when phase A has rank > phase B but appears before B in the sequence

---

## Integration Changes

### `src/antigravity/workflow-init.cjs`

**Changes**:
- Remove hardcoded `WORKFLOW_PHASES` constant (lines 29-35)
- Remove hardcoded `REQUIRES_BRANCH` constant (lines 37-40)
- Remove `--light` flag handling (lines 119-121)
- Import and call `loadWorkflows(projectRoot)` to get merged registry
- Look up workflow type in merged registry instead of constants
- Read `phases`, `requires_branch`, `gate_mode` from registry entry
- Custom phase agent mapping stored in `active_workflow.phase_agents`

### `src/antigravity/prime-session.cjs`

**Changes**:
- Import and call `loadWorkflows(projectRoot)`
- Serialize merged registry into session cache under `<!-- SECTION: WORKFLOW_REGISTRY -->` 
- Include: workflow name, intent, examples, resolved phases, gate_mode for each
- Log warnings to stderr (user sees them but they don't break the cache)

### `lib/installer.js`

**Changes**:
- Add `.isdlc/workflows/` directory creation in install flow
- Use `fs.mkdirSync(path.join(targetRoot, '.isdlc', 'workflows'), { recursive: true })`

### `lib/updater.js`

**Changes**:
- Add `.isdlc/workflows/` to preserved paths list (same pattern as constitution.md, state.json)

### `lib/uninstaller.js`

**Changes**:
- Leave `.isdlc/workflows/` in place during uninstall (user-authored content)

### `CLAUDE.md`

**Changes**:
- Replace hardcoded intent detection table with instructions to read `WORKFLOW_REGISTRY` from session cache
- Document that LLM should confirm workflow match before executing
- Document ambiguous match handling (present candidates)

### `src/isdlc/config/workflows.json`

**Changes**:
- Add `intent` and `examples` fields to each shipped workflow
- Add `feature-light` workflow extending `feature`
- Convert `--supervised` to a workflow-level `options.supervised` boolean

---

## Error Taxonomy

| Code | Description | Trigger | Severity | Recovery |
|------|-------------|---------|----------|----------|
| `YAML_PARSE_ERROR` | Invalid YAML syntax | Malformed .yaml file | Error | Fix YAML syntax, re-run |
| `MISSING_REQUIRED_FIELD` | Workflow missing `name` or (`phases`/`extends`) | Incomplete YAML | Error | Add missing field |
| `SHIPPED_NAME_COLLISION` | Custom workflow uses a reserved shipped name | Name matches shipped workflow | Error | Choose a unique name |
| `UNKNOWN_PHASE` | Phase not in shipped list and no `agent` field | Typo or missing agent ref | Error | Fix phase name or add agent field |
| `MISSING_AGENT_FILE` | Custom phase `agent` path doesn't exist | File not created yet | Error | Create the agent file or fix path |
| `INVALID_INSERTION_POINT` | `before`/`after` target not in current phase list | Typo or removed phase | Error | Fix reference or adjust operation order |
| `EMPTY_PHASE_LIST` | Diff operations produce zero phases | Over-removal | Error | Adjust remove_phases |
| `UNKNOWN_BASE_WORKFLOW` | `extends` references non-existent workflow | Typo | Error | Fix extends field |
| `ORDERING_WARNING` | Phase ordering deviates from canonical | User choice | Warning | Informational — no action required |

---

## Design Assumptions

- **D1**: `workflow-loader.cjs` is CommonJS — called from CJS scripts (Article XIII)
- **D2**: YAML parsing uses `js-yaml` — already a project dependency
- **D3**: `agent` field uses paths relative to project root — portable across machines
- **D4**: Phase ordering validator only checks pairs of shipped phases — custom phases skipped
- **D5**: Merged registry is a flat object keyed by workflow name — no namespacing
- **D6**: `loadWorkflows()` called fresh each time — no in-memory caching
- **D7**: `intent` field is free-form natural language — validated as non-empty string only
- **D8**: `examples` field is optional array of strings
- **D9**: Diff operations producing empty phase list are rejected
- **D10**: Session cache includes resolved phase lists, not diff specs

## Pending Sections

None — all sections complete.
