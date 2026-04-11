---
name: project-test-landscape
description: Distilled test landscape -- framework, coverage, gaps, patterns, fragile areas
skill_id: PROJ-004
owner: discover-orchestrator
collaborators: []
project: isdlc-framework
version: 2.0.0
when_to_use: When writing tests, evaluating coverage, or assessing test strategy
dependencies: []
---

# Project Test Landscape

## Test Framework and Config
- Runner: `node --test` (Node.js built-in, no external framework)
- Assertion: `node:assert` (strict mode)
- Config: package.json scripts (test, test:hooks, test:core, test:providers, test:e2e, test:char, test:all)
- Coverage tool: None configured (no nyc/c8/istanbul)
- CI: GitHub Actions, 3 OS (ubuntu, macos, windows) x 3 Node (20, 22, 24) matrix

## Coverage Summary
| Type | Count | Pass | Fail | Files | Notes |
|------|-------|------|------|-------|-------|
| Unit (lib/) | ~1,195 | 1,132 | 63 | 66 | CLI, embedding, search modules |
| Unit (hooks) | 4,664 | 4,256 | 379 | 180 | Hooks + lib modules (CJS) |
| Unit (core) | 1,578 | 1,539 | 39 | 165 | Provider-neutral core modules |
| Unit (providers) | 249 | 249 | 0 | ~20 | Claude + Codex adapters |
| E2E | 20 | 19 | 1 | 2 | CLI lifecycle, status command |
| Characterization | 0 | 0 | 0 | 0 | Empty -- needs population |
| **Total** | **~7,700+** | **~7,200** | **~480** | **~597** | ~93% pass rate |

## Known Gaps
- No formal code coverage tool -- cannot measure thresholds quantitatively (P1)
- ~480 failing tests across suites, primarily stale expectations (P0):
  - Hook suite: 379 failures (workflow-finalizer, contract-generator expectations)
  - Lib suite: 63 failures (prompt-format, embedding tests)
  - Core suite: 39 failures (profile-loader, contract-generator, validator tests)
  - E2E: 1 failure
- No E2E workflow lifecycle tests (build/analyze/upgrade flow untested) (P2)
- No embedding pipeline integration tests (41 modules, unit-only) (P2)
- Characterization test suite empty (test:char runs 0 tests) (P2)
- No mutation testing configured (P3)

## Fragile Areas
- Hook tests: Largest test suite (4,664 tests in 180 files); expectations tightly coupled to exact hook output
- Contract-generator tests: Reference config paths and metadata that drift when configs change
- Profile-loader tests: Expect specific profile files at specific paths
- Prompt-format tests: Assert exact string content in CLAUDE.md / README; breaks when content changes
- State.json schema tests: Tightly coupled to exact schema shape; schema evolution requires test updates

## Test Patterns
- Co-located tests: lib/*.test.js alongside lib/*.js (same directory)
- Mirror structure: tests/core/ mirrors src/core/ directory hierarchy
- Fixture files: tests/core/fixtures/, tests/core/validators/fixtures/
- Parity tests: tests/providers/ ensures Claude and Codex produce equivalent output
- Performance benchmarks: tests/verification/performance/
- CJS hook tests use `describe`/`it` pattern via `node:test` API
- ESM tests use `test()`/`describe()` from `node:test`
- Hook tests copy hooks to temp directory to avoid ESM/CJS conflicts (Article XIII)

## Provenance
- **Source**: Test suite execution results, docs/project-discovery-report.md
- **Distilled**: 2026-04-09
- **Discovery run**: full
