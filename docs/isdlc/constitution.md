# Project Constitution - iSDLC Framework

**Created**: 2026-02-07
**Version**: 1.2.0
**Project Type**: Developer tooling / CLI framework / Agent orchestration system

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the iSDLC framework itself (dogfooding). These articles are **immutable** once established and guide all SDLC workflows and agent interactions, whether the workflow includes all 13 phases or a subset (e.g., feature, fix, test workflows).

All agents (01-13) and the SDLC Orchestrator (00) MUST read and enforce these principles throughout the project lifecycle.

**Project Context**: The iSDLC framework is a Claude Code extension that installs into target projects via symlinks. It consists of a Node.js CLI (ESM), runtime hooks (CommonJS), 36 agent definitions, 229 skill definitions, and shell scripts. It has no database -- all state is managed via JSON files on the filesystem.

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
- Baseline: 555 tests (302 ESM lib tests + 253 CJS hook tests) as of 2026-02-07
- Regression threshold: total test count MUST NOT decrease without documented justification in an ADR

**Current Coverage by Module** (established during discovery):
- All 10 lib/ modules: COVERED (cli, installer, updater, uninstaller, doctor, project-detector, monorepo-handler, fs-helpers, logger, prompts)
- All 10 hook modules: COVERED (gate-blocker, iteration-corridor, skill-validator, log-skill-usage, constitution-validator, menu-tracker, test-watcher, model-provider-router, common, provider-utils)
- 87 reverse-engineered acceptance criteria: 58 covered (66.7%), 9 partially covered (10.3%), 20 uncovered (23.0%)
- 6 high-priority coverage gaps identified (see docs/isdlc/reverse-engineer-report.md)

**Enforcement Note (BUG-0054-GH-52)**: The coverage thresholds above are aspirational targets. Practical enforcement uses intensity-based tiered thresholds configured in `iteration-requirements.json`. Light workflows enforce lower thresholds (60% unit, 50% integration), standard workflows enforce the baseline thresholds (80% unit, 70% integration), and epic workflows enforce higher thresholds (95% unit, 85% integration). When no intensity is configured (e.g., fix workflows), the standard tier is used as default.

**Validation**:
- GATE-04: Test strategy approved
- GATE-05: Unit test coverage >=80%, total tests >= 555 baseline
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

**Validation**:
- GATE-02: Security architecture approved
- GATE-05: No secrets in code, dependency scans clean
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
6. Gate requirements may vary by workflow type (e.g., lighter elicitation for bug fixes) but gates themselves cannot be bypassed

**Validation**:
- Orchestrator validates all gate criteria before advancement
- `gate-validation.json` MUST show PASS status
- Gate enforcement applies to all workflows: feature, fix, test-run, test-generate, full-lifecycle

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

### Article XI: Integration Testing Integrity

**Principle**: Integration tests MUST validate real system behavior, not mocked assumptions.

**Requirements**:

1. **Mutation Testing Required**
   - All test suites MUST include mutation testing to validate test quality
   - Mutation score threshold: >=80%
   - Tests that don't catch mutations are ineffective tests

2. **Real URLs Only (No Stubs in Integration Tests)**
   - Integration tests MUST call actual service endpoints
   - Mocking/stubbing of external services is FORBIDDEN in integration tests
   - Use test environments, not mocked responses
   - Stubs are only permitted in unit tests

3. **No Assertions in Integration Tests**
   - Integration tests validate behavior through execution success/failure
   - Tests MUST verify system state changes, not assert intermediate values
   - Use contract validation and schema verification instead of assertions
   - Test outcomes are determined by actual system responses

4. **Adversarial Testing Required**
   - Property-based testing MUST be used for input validation
   - Fuzz testing MUST be applied to all public interfaces
   - Edge cases MUST be generated dynamically, not hardcoded
   - Boundary conditions MUST be tested with generated data

5. **Execution-Based Reporting**
   - Test reports MUST reflect actual execution results
   - No assertion-count-based metrics
   - Report: executed, passed, failed, skipped, mutation score
   - Include actual response data in failure reports

**Validation**:
- GATE-06: Mutation testing configured and passing (>=80% score)
- GATE-06: Integration tests use real URLs (no stub detection)
- GATE-06: Adversarial testing tools installed and executed
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
2. Hook files (`src/claude/hooks/*.js`) MUST use CommonJS syntax (`require`/`module.exports`)
3. This separation exists because Claude Code spawns hooks as standalone node processes outside package scope
4. Tests for hooks MUST copy hook files to a temporary directory outside the package to avoid ESM/CJS resolution conflicts
5. Never add `"type": "commonjs"` overrides or `.cjs` extensions to hooks -- they work correctly as-is
6. New dependencies imported in hooks MUST be available via `require()` (no ESM-only packages in hooks)

**Validation**:
- GATE-05: No ESM imports in hook files, no CommonJS require in lib files
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

## Constitutional Enforcement

### How Enforcement Works

1. **Orchestrator Reads Constitution**: At project start, Agent 00 reads this file
2. **Agents Apply Principles**: Each agent applies relevant articles to their work
3. **Gate Validation**: Orchestrator checks constitutional compliance at each gate
4. **Violation Handling**:
   - First violation: Agent remediates
   - Second violation: Escalate to human
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

---

**Framework Version**: 0.1.0-alpha
