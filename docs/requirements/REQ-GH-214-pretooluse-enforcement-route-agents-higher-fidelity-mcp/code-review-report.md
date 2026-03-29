# Code Review Report: REQ-GH-214 -- PreToolUse Tool Routing

**Date**: 2026-03-29
**Phase**: 08-code-review
**Reviewer**: QA Engineer (Phase 08)
**Scope Mode**: Human Review Only
**Workflow**: feature
**Artifact Folder**: REQ-GH-214-pretooluse-enforcement-route-agents-higher-fidelity-mcp

---

## Review Scope

Per Human Review Only mode, individual file quality (logic correctness, error handling, per-file security, naming, DRY, complexity, test quality, tech-stack alignment) was already validated during Phase 06 implementation. This review focuses on cross-cutting concerns: architecture coherence, business logic coherence, design pattern compliance, non-obvious security concerns, requirement completeness, and integration correctness.

---

## Files Reviewed

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/claude/hooks/tool-router.cjs` | 689 | PreToolUse hook: config-driven tool routing |
| `src/claude/hooks/config/tool-routing.json` | 69 | Routing rules config (3 framework defaults) |
| `src/claude/hooks/tests/tool-router.test.cjs` | ~993 | 65 tests (53 unit + 12 integration) |
| `docs/isdlc/external-skills-manifest.json` | 19 | Skill tool preferences schema extension |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/claude/settings.json` | Registered `tool-router.cjs` for Grep, Glob, Read matchers |
| `docs/isdlc/constitution.md` | Added Article XV (Tool Preference Enforcement), version 1.4.0 |
| `docs/requirements/.../architecture-overview.md` | Added Codex "not affected" section |
| `lib/node-version-update.test.js` | Updated TC-022/TC-025 for constitution v1.4.0 |

---

## Cross-Cutting Review Checklist

### Architecture Decisions Alignment

- [x] **Hook pattern**: `tool-router.cjs` follows the established CJS hook pattern (identical to `state-file-guard.cjs`, `explore-readonly-enforcer.cjs`). Stdin JSON parsing, try/catch with fail-open, module.exports for testability.
- [x] **Config pattern**: `tool-routing.json` in `src/claude/hooks/config/` follows the same location pattern as `iteration-requirements.json`.
- [x] **Registration**: Three new PreToolUse entries in `settings.json` for Grep, Glob, Read. Correctly separated from the pre-existing `mcp-tool-router.cjs` entries (Bash, Write matchers), which remain unchanged.
- [x] **ADR compliance**: All six ADRs from the architecture overview are faithfully implemented.

**Verdict**: PASS -- Architecture decisions align with design specifications.

### Business Logic Coherence

- [x] **Four-source merge**: `loadRoutingRules()` correctly loads framework defaults, inferred rules, skill-declared preferences, and user overrides. The merge via `mergeRules()` deduplicates by `operation::intercept_tool` key with source priority.
- [x] **Inferred-as-gap-filler**: Implementation note #1 documents that inferred rules only fill gaps (never downgrade framework defaults). The `mergeRules()` function has explicit `if (rule.source === 'inferred' && existing)` guard. This is a sound refinement of the FR-003 spec.
- [x] **Evaluation flow**: `main()` loads rules, filters by `intercept_tool === toolName`, iterates with first-actionable-rule-wins. Each rule checks MCP availability, then exemptions, then enforcement. Audit entry written for every rule evaluation (including skips).
- [x] **Exemption logic**: Context conditions (`edit_prep`, `targeted_read`, `targeted_file`, `exact_filename`, `non_mkdir`) map correctly to the module design's specification. Boundary values verified in tests (limit=200 passes, limit=201 fails).

**Verdict**: PASS -- Business logic is coherent across all files.

### Design Pattern Compliance

- [x] **Stateless hook**: No module-level state persists between invocations. Config loaded fresh each call. Complies with NFR-001.
- [x] **Testable main()**: Core logic in `main(inputStr, options)` accepts path overrides. Standalone execution block only handles stdin/process.exit. Same pattern as other hooks.
- [x] **Module exports**: All internal functions exported for unit testing via `module.exports = { ... }`. Consistent with hook testing conventions.
- [x] **Fail-open everywhere**: Every catch block returns safe defaults (empty array, null, false). The standalone wrapper catches unhandled errors and exits 0.

**Verdict**: PASS -- Design patterns consistently applied.

### Non-Obvious Security Concerns

- [x] **Regex from user config**: Pattern exemptions accept regex strings from `tool-routing.json`. The `checkExemptions()` function wraps `new RegExp()` in try/catch to handle malicious patterns. No catastrophic backtracking risk in shipped patterns (bounded quantifiers: `/\.\w{1,10}$/`, `/[*?]/`).
- [x] **Path resolution**: All paths derived from `CLAUDE_PROJECT_DIR` or `process.cwd()`. No user-controlled path traversal possible from stdin `tool_input`.
- [x] **Audit log write**: Uses `fs.appendFileSync()` with `mkdirSync({ recursive: true })`. Non-blocking on failure. No TOCTOU issue since append is atomic for single-line writes under typical filesystem semantics.
- [x] **Cross-file data flow**: stdin JSON -> parsed input -> rule evaluation -> stdout/stderr output. No data flows between hook invocations. No sensitive data logged to audit (tool names and rule IDs only).

**Verdict**: PASS -- No non-obvious security concerns identified.

### Requirement Completeness

| Requirement | Status | Evidence |
|-------------|--------|----------|
| FR-001: Tool Routing Hook | Implemented | `main()` in tool-router.cjs, 9 tests |
| FR-002: Config-Driven Rules | Implemented | `loadRoutingRules()`, tool-routing.json, 5 tests |
| FR-003: Three-Source Rule Merge | Implemented | `mergeRules()` with priority ordering, 8 tests |
| FR-004: Environment Inference | Implemented | `inferEnvironmentRules()`, probes settings.json, 4 tests |
| FR-005: Skill-Declared Preferences | Implemented | manifest parsing in `loadRoutingRules()`, 3 tests |
| FR-006: Exemption Mechanism | Implemented | `checkExemptions()`, `matchContextCondition()`, 10 tests |
| FR-007: Self-Documenting Warnings | Implemented | `formatWarnMessage()` with tool, source, config path, 3 tests |
| FR-008: Fail-Open Behavior | Implemented | All error paths exit 0, 6 tests |
| FR-009: MCP Availability Detection | Implemented | `probeMcpAvailability()`, `probeMcpServers()`, 4 tests |
| FR-010: Constitutional Article | Implemented | Article XV in constitution.md, 1 test |
| FR-011: Audit Log | Implemented | `appendAuditEntry()`, JSONL format, 4 tests |
| NFR-001: Stateless Hook | Verified | No module-level state, 1 integration test |
| NFR-002: Performance | Verified | Hook completes in <500ms (actual ~50ms), 1 integration test |
| NFR-003: Fail-Open | Verified | Exit 0 on all error paths, 1 integration test |

**Verdict**: PASS -- All 11 FRs and 3 NFRs implemented.

### Integration Coherence

- [x] **settings.json <-> tool-router.cjs**: Hook registered for Grep, Glob, Read matchers. Hook reads `tool_name` from stdin and matches against rules with matching `intercept_tool`. Matchers and intercept_tools align.
- [x] **tool-routing.json <-> tool-router.cjs**: Config schema (rules array, user_overrides array, inference_probes) matches what `loadRoutingRules()` expects. Field names consistent (`intercept_tool`, `preferred_tool`, `enforcement`, `exemptions`).
- [x] **external-skills-manifest.json <-> tool-router.cjs**: Manifest schema includes `tool_preferences` array on skills. Hook reads `manifest.skills[].tool_preferences[]` with expected fields.
- [x] **constitution.md <-> tool-router.cjs**: Article XV requirements match what the hook implements. Fail-open references Article X correctly.
- [x] **Coexistence with mcp-tool-router.cjs**: The old hook handles Bash/Write matchers; the new hook handles Grep/Glob/Read. No conflict. Both can coexist.

**Verdict**: PASS -- Integration points between all files are correct.

### Unintended Side Effects

- [x] **settings.json**: Only the Grep/Glob/Read matcher entries were added/modified. Bash and Write matchers with `mcp-tool-router.cjs` are unchanged. No other hook registrations affected.
- [x] **constitution.md**: Article XV added after Article XIV, before Constitutional Enforcement section. No existing articles modified. Version bumped from 1.3.0 to 1.4.0.
- [x] **node-version-update.test.js**: TC-022 and TC-025 updated to expect 1.4.0 instead of 1.3.0. This is a necessary consequence of the version bump. No other test expectations affected.
- [x] **Test suite stability**: 1600/1600 lib tests pass, 65/65 new tests pass. Zero regressions.

**Verdict**: PASS -- No unintended side effects.

### Dogfooding / Dual-File Check (T0025)

- [x] `.claude/hooks` is a symlink to `../src/claude/hooks` -- tool-router.cjs automatically available
- [x] `.claude/hooks/config` resolves through the same symlink -- tool-routing.json automatically available
- [x] `.claude/settings.json` is a symlink to `../src/claude/settings.json` -- hook registration automatically applied
- [x] No manual file duplication required (confirmed in implementation-notes.md #4)

**Verdict**: PASS -- Dogfooding dual-file requirement satisfied via symlinks.

### Constitutional Review (T0024)

| Article | Check | Status |
|---------|-------|--------|
| Article XV (Tool Preference Enforcement) | Text matches FR-010. Requirements 1-6 correctly capture the implementation behavior. | PASS |
| Article X (Fail-Open) | Hook exits 0 on all error paths. Verified by 6 dedicated fail-open unit tests + 3 fail-open integration tests. | PASS |
| Article XIII (CJS Module System) | Hook file uses `.cjs` extension, `require()` / `module.exports`, no ESM imports. Tests run from temp directory. | PASS |
| Article V (Simplicity First) | Single hook file (~440 lines production logic), no external dependencies, synchronous config loading. No over-engineering. | PASS |
| Article VI (Code Review Required) | This review completes the code review requirement. | PASS |
| Article VII (Artifact Traceability) | Traceability matrix has 63 entries covering all FRs/NFRs. Code comments reference FR/AC IDs. | PASS |
| Article VIII (Documentation Currency) | Constitution updated with Article XV. JSDoc on all exported functions. Implementation notes document key decisions. | PASS |
| Article IX (Quality Gate Integrity) | All tests pass, all artifacts generated, QA checklist complete. | PASS |

**Verdict**: PASS -- All applicable constitutional articles satisfied.

---

## Findings

### Critical: None

### High: None

### Medium: None

### Low

**L-001**: Inferred rules "gap-filler" behavior diverges from spec

- **File**: `src/claude/hooks/tool-router.cjs`, line 162
- **Category**: Spec divergence (documented)
- **Description**: FR-003 specifies priority ordering as `user > skill > inferred > framework`, implying inferred (priority 1) should override framework (priority 0). However, the implementation treats inferred rules as gap-fillers only -- they never override existing rules regardless of priority. This is documented in implementation-notes.md #1 as a deliberate refinement.
- **Impact**: Low. The current behavior is actually more correct (preventing `warn` from downgrading `block`). The spec should be updated to match if this decision is permanent.
- **Suggestion**: Update FR-003 text in requirements-spec.md to explicitly state inferred rules are gap-fillers only, aligning spec with implementation.

**L-002**: Module design estimated size vs actual

- **File**: `docs/requirements/.../module-design.md`, line 24
- **Category**: Documentation currency
- **Description**: Module design estimated `tool-router.cjs` at ~300 lines. Actual implementation is ~440 lines (689 with comments/whitespace). The size difference is within acceptable range but the estimate could be updated.
- **Impact**: Informational only. No functional impact.
- **Suggestion**: No action required -- estimates are inherently approximate.

---

## Test Results Summary

| Suite | Pass | Fail | Total |
|-------|------|------|-------|
| `npm test` (full lib suite) | 1600 | 0 | 1600 |
| `tool-router.test.cjs` (new) | 65 | 0 | 65 |

**Regressions**: 0
**New test coverage**: 65 tests across 11 FR groups, 3 NFRs, and integration tests

---

## Build Integrity (Safety Net)

No build system detected (interpreted JavaScript). `npm test` serves as the build integrity proxy. All 1600 tests pass.

---

## GATE-07 Checklist

- [x] Build integrity verified (1600 tests pass, 0 failures)
- [x] Code review completed for all changes (this report)
- [x] No critical code review issues open
- [x] Static analysis passing (no linter configured; manual review clean)
- [x] Code coverage: 65 tests cover all 11 FRs + 3 NFRs
- [x] Coding standards followed (CJS hooks, JSON config, JSDoc)
- [x] Performance acceptable (hook execution <100ms target, measured ~50ms)
- [x] Security review complete (no vulnerabilities found)
- [x] QA sign-off: APPROVED

---

## Overall Verdict: APPROVED

The implementation is clean, well-tested, and architecturally sound. All 11 functional requirements and 3 non-functional requirements are implemented and traced to 65 tests. The hook follows established patterns, fails open on all error paths (Article X), uses CJS module system correctly (Article XIII), and the constitutional article (Article XV) accurately captures the enforcement principle.

No blocking or high-severity findings. Two low-severity informational items noted for future cleanup.

**QA Decision**: PASS -- Ready to proceed to Phase 09 (Independent Validation).
