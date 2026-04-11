# Project Constitution - iSDLC Framework

**Created**: 2026-02-07
**Version**: 1.6.0
**Project Type**: Developer tooling / CLI framework / Agent orchestration system

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the iSDLC framework itself (dogfooding). These articles are **immutable** once established and guide all SDLC workflows and agent interactions, whether the workflow includes all 13 phases or a subset (e.g., build, test, upgrade workflows).

All agents (01-13) and the SDLC Orchestrator (00) MUST read and enforce these principles throughout the project lifecycle.

**Project Context**: The iSDLC framework is a Claude Code and Codex extension that installs into target projects via symlinks. It consists of a Node.js CLI (ESM), runtime hooks (CommonJS), a provider-neutral core layer (`src/core/`), provider adapters (`src/providers/`), 71 agent definitions, 280 skill definitions, 30 hooks, and shell scripts. It has no database -- all state is managed via JSON files on the filesystem. Dual-provider support enables both Claude Code (agent markdown + Task tool) and Codex (projection bundles + `codex exec`).

---

## Universal Articles (Apply to All Projects)

These 10 articles are mandatory for all projects. They represent industry best practices that ensure quality, security, and maintainability.

---

### Article I: Specification Primacy

**Principle**: Specifications are the source of truth. Code serves specifications.

**Requirements**:
1. Code MUST implement specifications exactly as defined
2. Any deviation from specifications MUST be documented and justified in an ADR
3. Specifications MUST be updated BEFORE code changes
4. Implementation MUST NOT assume requirements beyond what is specified
5. User-confirmed task plans are binding specifications. Phase agents MAY refine tasks into sub-tasks but MUST NOT alter, remove, or expand the scope of parent tasks without user approval.

**Validation**:
- Agent 01 ensures specifications are complete
- Agent 05 implements only specified features
- Agent 07 validates code matches specifications

---

### Article II: Test-First Development

**Principle**: Tests MUST be written before implementation.

**Requirements**:
1. Test cases MUST be designed during Phase 04 (before implementation)
2. Unit tests MUST be written before production code in Phase 05
3. Integration tests MUST be defined before integration in Phase 06
4. Code without tests CANNOT pass quality gates

**Coverage Thresholds**:
- Unit test coverage: >=80% (adjusted from 95% -- CLI/framework tooling has many interactive code paths that require integration-level testing)
- Integration test coverage: >=70%
- Critical paths: 100% coverage required (installer, updater, hook enforcement logic)
- Baseline: 7,400+ tests across 597 test files as of 2026-04-09
- Regression threshold: total test count MUST NOT decrease without documented justification in an ADR

**Current Coverage by Module** (updated during re-discovery 2026-04-09):
- lib/ (69 prod modules including 41 embedding + 12 search): ~900 tests, ~80% estimated coverage
- hooks/ (30 hooks + 14 lib modules): ~4,664 tests, ~90% estimated coverage
- core/ (137 provider-neutral modules): ~1,578 tests, ~85% estimated coverage
- providers/ (13 provider adapter modules): ~249 tests, ~85% estimated coverage
- E2E: ~20 tests across 2 test files
- Critical paths (installer, updater, hook enforcement): ~95% estimated coverage
- Known failures: ~420 tests failing (primarily stale expectations in workflow-finalizer, contract-generator, profile-loader)

**Enforcement Note (BUG-0054-GH-52)**: The coverage thresholds above are aspirational targets. Practical enforcement uses intensity-based tiered thresholds configured in `iteration-requirements.json`. Light workflows enforce lower thresholds (60% unit, 50% integration), standard workflows enforce the baseline thresholds (80% unit, 70% integration), and epic workflows enforce higher thresholds (95% unit, 85% integration). When no intensity is configured (e.g., fix workflows), the standard tier is used as default.

**Validation**:
- GATE-04: Test strategy approved
- GATE-05: Unit test coverage >=80%, total tests >= 7,400 baseline
- Agent 05 follows TDD: Red -> Green -> Refactor

---

### Article III: Security by Design

**Principle**: Security considerations MUST precede implementation decisions.

**Requirements**:
1. No secrets/credentials in code or version control - use environment variables
2. All inputs MUST be validated at system boundaries
3. All outputs MUST be sanitized
4. Dependencies MUST be scanned for vulnerabilities before use
5. Critical/High vulnerabilities MUST be resolved before deployment
6. Least privilege principle for all access control

**Project-Specific Additions**:
7. Hook inputs (stdin JSON) MUST be validated before processing -- all hooks fail-open on malformed input
8. File system operations MUST validate paths to prevent directory traversal
9. The `settings.local.json` file MUST remain gitignored (contains user-specific secrets)
10. Provider API keys MUST never be logged or written to state.json

**Enforcement** (framework-verified):
- Secret scan: The framework scans staged files for common secret patterns (API keys, tokens, passwords, private keys) before phase advancement. Matches block the gate.
- Patterns checked: `AKIA[0-9A-Z]{16}` (AWS), `sk-[a-zA-Z0-9]{20,}` (API keys), `-----BEGIN (RSA |EC )?PRIVATE KEY-----`, `password\s*=\s*['"][^'"]+['"]`, `secret\s*=\s*['"][^'"]+['"]`, hardcoded bearer tokens
- Exemptions: `.env.example`, test fixtures with dummy values, documentation examples
- Override: Add `<!-- secret-scan-exempt: reason -->` to exempt a specific line

**Validation**:
- GATE-02: Security architecture approved
- GATE-05: No secrets in code (framework secret scan), dependency scans clean
- GATE-08: SAST/DAST testing complete

---

### Article IV: Explicit Over Implicit

**Principle**: No assumptions. Uncertainty MUST be marked and resolved.

**Requirements**:
1. Ambiguous requirements MUST be marked with `[NEEDS CLARIFICATION]`
2. Assumptions MUST be documented in ADRs or design documents
3. "We'll figure it out later" is FORBIDDEN
4. All decisions MUST be traceable and justified

**Validation**:
- Agent 01 identifies and resolves ambiguities before GATE-01
- All `[NEEDS CLARIFICATION]` markers MUST be resolved before implementation
- Orchestrator fails gates if unresolved ambiguities exist

---

### Article V: Simplicity First

**Principle**: Implement the simplest solution that satisfies requirements.

**Requirements**:
1. Avoid over-engineering and premature optimization
2. YAGNI (You Aren't Gonna Need It) - no speculative features
3. Complexity MUST be justified by requirements
4. Refactor for simplicity, not cleverness
5. Three similar lines of code is better than a premature abstraction

**Validation**:
- Agent 02 selects appropriate (not excessive) technology
- Agent 07 reviews for unnecessary complexity

---

### Article VI: Code Review Required

**Principle**: All code MUST be reviewed before merging.

**Requirements**:
1. All code MUST be reviewed by at least one other developer (or agent)
2. Reviews MUST check: correctness, security, maintainability
3. Self-merges prohibited on shared branches
4. Review comments MUST be addressed before merge

**Validation**:
- GATE-07: Code review completed
- Agent 07 performs automated review checks

---

### Article VII: Artifact Traceability

**Principle**: Every code element MUST trace back to a requirement.

**Requirements**:
1. Maintain traceability matrix: Requirements -> Design -> Tests -> Code
2. No orphan code (code without corresponding requirement)
3. No orphan requirements (requirements without implementation)
4. Commit messages MUST reference requirement IDs

**Validation**:
- Agent 01 creates initial traceability matrix
- Agent 05 references requirement IDs in code/commits
- GATE-07 verifies complete traceability

---

### Article VIII: Documentation Currency

**Principle**: Documentation MUST be updated with code changes.

**Requirements**:
1. Code changes MUST include corresponding documentation updates
2. README MUST reflect current setup/run instructions
3. API contracts (OpenAPI/Swagger) MUST match implementation
4. Architecture decisions MUST be recorded in ADRs

**Project-Specific Additions**:
5. Agent markdown files MUST be updated when agent behavior changes
6. CLAUDE.md MUST reflect current agent/skill/hook counts
7. Skills manifest MUST be updated when skills are added/removed/moved
8. AGENTS.md and agent-skill-mapping.md MUST be regenerated after structural changes

**Validation**:
- Agent 05 updates inline documentation during implementation
- Agent 07 verifies documentation during code review

---

### Article IX: Quality Gate Integrity

**Principle**: Quality gates cannot be skipped. Failures require remediation. Gate enforcement applies to all workflow types.

**Requirements**:
1. All quality gates MUST be validated before phase advancement
2. Gate failures MUST be remediated (cannot be waived)
3. "Move fast and break things" is FORBIDDEN
4. Gate fails twice -> Escalate to human
5. Workflow phase sequences are fixed -- phases cannot be skipped or reordered
6. Gate requirements may vary by workflow type but gates themselves cannot be bypassed

**Validation**:
- Orchestrator validates all gate criteria before advancement
- `gate-validation.json` MUST show PASS status
- Gate enforcement applies to all workflows: build, test-run, test-generate, upgrade

---

### Article X: Fail-Safe Defaults

**Principle**: Systems MUST default to secure, safe, and conservative behaviors.

**Requirements**:
1. Security: Deny by default, allow explicitly
2. Data: Validate all inputs, sanitize all outputs
3. Errors: Fail securely (no sensitive data in error messages)
4. Permissions: Least privilege by default
5. Failures MUST leave system in safe state

**Project-Specific Additions**:
6. All hooks MUST fail-open on errors (exit 0, no output) -- a hook error must never block the user's workflow
7. Missing configuration files MUST be handled gracefully with sensible defaults
8. The skill-validator MUST never block agent delegation -- it is observability-only
9. State.json corruption MUST not crash hooks; degrade gracefully to defaults

**Validation**:
- Agent 02 designs fail-safe architecture
- Agent 08 validates fail-safe behaviors in security testing

---

### Article XI: Test Quality Beyond Coverage

**Principle**: Tests MUST verify behavior, not just execute code. Line coverage alone is insufficient proof of test quality.

**Requirements**:

1. **Tests MUST cover error paths, not just happy paths**
   - Every public function with error handling MUST have tests for failure cases
   - Edge cases (empty inputs, boundary values, null/undefined) MUST be tested
   - The framework verifies error-path test presence by scanning test files for negative-case patterns

2. **Integration tests MUST NOT mock the system under test**
   - Mocking/stubbing of the module being tested is FORBIDDEN in integration tests
   - External dependencies MAY be mocked in unit tests only
   - The framework scans integration test files for mock patterns and flags violations

3. **Test descriptions MUST be meaningful**
   - Test names MUST describe the expected behavior, not the implementation
   - The framework flags generic test names ("test 1", "it works", "should pass")

4. **Regression tests MUST accompany bug fixes**
   - Every bug fix MUST include a test that reproduces the original failure
   - The test MUST fail without the fix and pass with it (TDD red-green)

**Project-Specific Additions**:
5. Hook tests MUST copy hook files to a temporary directory outside the package to avoid ESM/CJS resolution conflicts (per Article XIII)
6. Prompt verification tests MUST validate agent file counts and skill manifest consistency

**Enforcement** (framework-verified):
- Error path scan: Framework scans test files for negative-case patterns (`.rejects`, `.throws`, `expect(err)`, error status codes). Flags modules with zero error-path tests.
- Mock-in-integration scan: Framework scans files matching `**/integration/**` or `**/e2e/**` for mock/stub patterns (`jest.mock`, `vi.mock`, `sinon.stub`, `nock`). Matches block the gate.
- Test name quality: Framework flags test descriptions shorter than 10 characters or matching generic patterns.

**Validation**:
- GATE-06: Error path coverage present for critical modules
- GATE-06: No mocking detected in integration test files
- GATE-06: Test descriptions meet quality threshold
- Agent 06 enforces these rules during test execution

---

## Domain-Specific Articles

---

### Article XII: Cross-Platform Compatibility

**Principle**: The iSDLC framework MUST work reliably across all supported platforms and Node.js versions.

**Requirements**:
1. All code MUST be tested on macOS, Linux, and Windows
2. File path operations MUST use `path.join()` / `path.resolve()` -- never hardcode `/` or `\`
3. Shell scripts MUST use POSIX-compatible syntax (no bashisms in critical paths)
4. The CI matrix MUST cover: Ubuntu, macOS, Windows x Node 20, 22, 24 (9 combinations)
5. Line endings MUST be handled correctly (LF vs CRLF)
6. Symlinks MUST be tested on Windows (may require Developer Mode)

**Validation**:
- GATE-09: CI/CD passes on all 9 matrix combinations
- GATE-10: Local testing verifies on developer's OS
- Agent 05 uses `path` module for all path operations

---

### Article XIII: Module System Consistency

**Principle**: The ESM/CommonJS dual-module architecture MUST be maintained correctly.

**Requirements**:
1. CLI and lib files (`lib/*.js`, `bin/*.js`) MUST use ES Module syntax (`import`/`export`)
2. Core layer files (`src/core/**/*.js`) MUST use ES Module syntax (`import`/`export`)
3. Hook files (`src/claude/hooks/*.cjs`) MUST use CommonJS syntax (`require`/`module.exports`) with `.cjs` extension
4. Bridge files (`src/core/bridge/*.cjs`) provide CJS-to-ESM adapters for hooks to call core modules
5. This separation exists because Claude Code spawns hooks as standalone node processes outside package scope -- `.cjs` extension ensures CommonJS resolution regardless of package.json `"type"` setting
6. Tests for hooks MUST copy hook files to a temporary directory outside the package to avoid ESM/CJS resolution conflicts
7. New dependencies imported in hooks MUST be available via `require()` (no ESM-only packages in hooks)
8. Provider adapter files (`src/providers/**/*.js`) MUST use ES Module syntax

**Validation**:
- GATE-05: No ESM imports in hook/bridge `.cjs` files, no CommonJS require in lib/core `.js` files
- GATE-06: Hook tests execute from temp directories (not in-tree)
- Agent 07 verifies module system boundaries during code review

---

### Article XIV: State Management Integrity

**Principle**: Framework state MUST be reliable, recoverable, and never cause data loss in the target project.

**Requirements**:
1. `state.json` MUST be the single source of runtime state -- no shadow state files
2. State writes MUST be atomic (write full JSON, not partial updates)
3. State corruption MUST never prevent the user from using Claude Code normally
4. The updater MUST preserve user artifacts: state.json, providers.yaml, constitution.md, CLAUDE.md, settings.local.json
5. Monorepo project isolation MUST be maintained -- one project's state changes cannot affect another
6. The `skill_usage_log` array MUST be append-only (no retroactive modifications)
7. State schema changes MUST be backwards-compatible or include migration logic

**Validation**:
- GATE-05: State operations use writeState() from common.js (centralized)
- GATE-06: State integrity tests validate concurrent access, corruption recovery
- Agent 08 verifies no cross-project state leakage in monorepo mode

---

### Article XV: Tool Preference Enforcement

**Principle**: Agents MUST use the highest-fidelity tool available. User-installed and user-configured tools take precedence over built-in defaults.

**Requirements**:
1. When a higher-fidelity MCP tool is available for an operation, agents MUST prefer it over built-in tools (Grep, Glob, Read)
2. Tool routing rules are config-driven via `tool-routing.json` -- users can add, modify, or override rules without code changes
3. Rule priority follows: user-explicit > skill-declared > inferred > framework defaults
4. Each rule supports exemptions for legitimate uses (edit prep, targeted reads, single-file grep)
5. If the preferred tool is unavailable at runtime, the original tool MUST be allowed through (fail-open per Article X)
6. All routing decisions MUST be logged to the audit trail (`.isdlc/tool-routing-audit.jsonl`)

**Validation**:
- GATE-05: `tool-router.cjs` hook registered for Grep, Glob, Read matchers in settings.json
- GATE-05: `tool-routing.json` config file contains framework default rules
- GATE-06: Tool routing tests verify block/warn/allow/exempt/fail-open paths
- Agent 05 implements routing logic per FR-001 through FR-011

---

## Constitutional Enforcement

### How Enforcement Works

The constitution is enforced through a 4-layer pipeline (see `docs/ARCHITECTURE.md → Constitution Enforcement Pipeline` for full technical details):

1. **Session Cache Injection**: The full constitution text is embedded into every conversation's system prompt via the session cache. All agents see it at startup.
2. **Gate Requirements Injection**: When a phase agent is delegated, the Phase-Loop Controller injects the specific articles that apply to that phase (from `iteration-requirements.json`) into the agent's CRITICAL CONSTRAINTS block.
3. **Constitutional Validation Hook**: `constitution-validator.cjs` blocks phase completion unless the agent has recorded a valid compliance attestation in `state.json`.
4. **Gate Blocker**: `gate-blocker.cjs` independently verifies constitutional validation as one of 4 gate checks before allowing phase advancement.

**Violation Handling**:
   - First failure: Agent is re-delegated with remediation instructions
   - After 3 retries: Escalate to human
   - Persistent violations: Constitution may need amendment

### Amending the Constitution

1. Propose amendment with justification
2. Discuss with team
3. Update this file
4. Communicate changes to all stakeholders
5. Version the change (e.g., "Constitution v2.0.0")

**Important**: Agents don't automatically detect constitution changes mid-project. Inform the orchestrator if major amendments occur.

---

## Amendment Log

| Version | Date | Amendment | Reason |
|---------|------|-----------|--------|
| 1.0.0 | 2026-02-07 | Initial constitution | Project discovery and setup |
| 1.1.0 | 2026-02-07 | Article II: Added 555-test baseline, regression threshold, per-module coverage status, and 87 AC traceability metrics | Full deep discovery with behavior extraction established comprehensive test baseline |
| 1.2.0 | 2026-02-10 | Article XII req 4: Updated Node version matrix from "Node 18, 20, 22" to "Node 20, 22, 24" | Node 18 reached EOL (April 2025); dropped in favor of Node 24 Active LTS (ADR-0008) |
| 1.3.0 | 2026-03-27 | Preamble: Updated project context (70 agents, 276 skills, 30 hooks, dual-provider). Article II: Updated baseline from 555 to 1,600 tests, updated module coverage to reflect core/providers/embedding/search layers. Article XIII: Updated to reflect .cjs hook convention, added core layer and bridge layer rules. | Full re-discovery revealed significant codebase growth since 2026-02-07 |
| 1.4.0 | 2026-03-29 | Article XV: Tool Preference Enforcement added. Agents must use highest-fidelity tool available; config-driven routing via tool-routing.json; fail-open when preferred tool unavailable. | REQ-GH-214: PreToolUse enforcement for higher-fidelity MCP tool routing |
| 1.5.0 | 2026-04-04 | Article I req 5: User-confirmed task plans are binding specifications. Phase agents may refine into sub-tasks but must not alter parent task scope without user approval. | REQ-GH-223: Tasks as user contract |
| 1.5.0 | 2026-04-03 | Article XI rewritten: "Integration Testing Integrity" → "Test Quality Beyond Coverage". Removed unenforceable requirements (mutation testing, fuzz testing, adversarial testing, property-based testing) that required specific tooling dependencies. Replaced with framework-enforceable principles (error path coverage, mock-in-integration scan, test name quality). Article III: Added secret scan enforcement block with patterns, exemptions, and override mechanism. | Constitution must be enforceable by the framework without requiring project-specific tool dependencies |
| 1.6.0 | 2026-04-09 | Preamble: Updated counts (71 agents, 280 skills). Article II: Updated baseline from 1,600 to 7,400+ tests across 597 files. Updated module coverage: lib 69 prod modules (~900 tests), hooks 30+14 (~4,664 tests), core 137 modules (~1,578 tests), providers 13 modules (~249 tests). Noted ~420 known failing tests (stale expectations). | Full re-discovery revealed 4.6x test count growth since 2026-03-27 |

---

**Framework Version**: 0.1.0-alpha
