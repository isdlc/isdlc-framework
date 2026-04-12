## Test Generate Command (Codex)
Start the test generation workflow from discover scaffolds.

### Usage
```
/isdlc test generate
```

### Description
Codex projection for the `/isdlc test generate` command. Mirrors the Claude Code path with sequential (non-parallel) task dispatch within tiers.

### Precondition Gate
Before workflow initialization, check for characterization scaffolds:
1. Glob `tests/characterization/**/*.characterization.*`
2. If zero matches: display "No characterization scaffolds found in tests/characterization/. Run /discover first to generate test scaffolds from your codebase." and exit
3. If matches found: continue

### Artifact Folder
Create `docs/requirements/TEST-GEN-{YYYY-MM-DD}-{testType}/` with meta.json (v2 schema, source: "test-generate") before workflow init.

### Workflow
Phases: 05-test-strategy -> 06-implementation -> 16-quality-loop -> 08-code-review

### Phase 05: Test Strategy
Delegate to test-design-engineer with `WORKFLOW_TYPE: test-generate` in workflow modifiers. The agent enters TEST-GENERATE MODE:
1. Scans characterization scaffolds
2. Classifies each as unit or system
3. Emits docs/isdlc/tasks.md with tier-ordered tasks
4. Writes test-strategy.md, test-cases/, traceability-matrix.csv to artifact folder

### Phase 06: Implementation (Sequential Dispatch)
Codex does not support parallel Task tool dispatch. Execute tier-ordered tasks sequentially via `codex exec`:
1. Read tasks.md, compute tiers using dependency ordering
2. For each tier (sequential):
   - For each task in the tier (sequential within Codex):
     - Execute via `codex exec` with task prompt
     - On success: mark task [X] in tasks.md
     - On failure: retry up to max_retries_per_task (default 3)
3. Same retry budget and escalation as Claude path

### Implementation
Invoke the isdlc command with action `test generate` and forward all arguments.
