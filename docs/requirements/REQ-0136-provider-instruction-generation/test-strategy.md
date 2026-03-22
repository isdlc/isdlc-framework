# Test Strategy — REQ-0136 Provider Instruction Generation + REQ-0137 Unified CLI

## Test Framework

- **Framework**: `node:test` (built-in Node.js test runner)
- **Assertions**: `node:assert/strict`
- **Pattern**: Unit tests in `tests/core/orchestration/` and `lib/`
- **Command**: `npm run test:core` for core tests, `npm test` for lib tests

## Test Suites

### Suite 1: `tests/core/orchestration/instruction-generator.test.js` (~25 tests)

Tests the instruction-generator module in isolation.

| Test ID | Description | Traces |
|---------|-------------|--------|
| IG-01 | INSTRUCTION_TEMPLATES is frozen | FR-006 |
| IG-02 | INSTRUCTION_TEMPLATES has exactly 4 providers | FR-006 |
| IG-03 | Claude template has correct fileName, format, sections | FR-002, FR-004 |
| IG-04 | Codex template has correct fileName, format, sections | FR-002, FR-004 |
| IG-05 | Cursor template has correct fileName, format, sections | FR-002 |
| IG-06 | Windsurf template has correct fileName, format, sections | FR-002 |
| IG-07 | Each template has required keys: fileName, format, sections | FR-006 |
| IG-08 | generateInstructions('claude', config) returns markdown | FR-001 |
| IG-09 | generateInstructions('claude') includes project context section | FR-004 |
| IG-10 | generateInstructions('claude') includes workflow commands | FR-004 |
| IG-11 | generateInstructions('claude') includes constitution summary | FR-004 |
| IG-12 | generateInstructions('claude') includes agent roster | FR-003, FR-004 |
| IG-13 | generateInstructions('claude') includes governance rules | FR-004 |
| IG-14 | generateInstructions('claude') includes hook configuration section | FR-004 |
| IG-15 | generateInstructions('claude') includes session cache section | FR-004 |
| IG-16 | generateInstructions('codex') includes codex-specific sections | FR-004 |
| IG-17 | generateInstructions('codex') includes instruction format notes | FR-004 |
| IG-18 | generateInstructions('codex') includes sandbox constraints | FR-004 |
| IG-19 | generateInstructions('cursor') returns text format | FR-001, FR-002 |
| IG-20 | generateInstructions('windsurf') returns text format | FR-001, FR-002 |
| IG-21 | generateInstructions with missing projectName degrades gracefully | FR-001 |
| IG-22 | generateInstructions with missing constitution degrades gracefully | FR-001 |
| IG-23 | generateInstructions with unknown provider throws | FR-001 |
| IG-24 | getInstructionPath returns correct paths for each provider | FR-005 |
| IG-25 | listSupportedProviders returns 4 providers | FR-006 |

### Suite 2: `lib/cli-provider.test.js` (~15 tests)

Tests CLI provider integration (parseArgs --provider flag, detectProvider).

| Test ID | Description | Traces |
|---------|-------------|--------|
| CP-01 | parseArgs recognizes --provider flag with value | REQ-0137 FR-001 |
| CP-02 | parseArgs --provider without value defaults to null | REQ-0137 FR-001 |
| CP-03 | parseArgs --provider combined with --force | REQ-0137 FR-004 |
| CP-04 | detectProvider with --provider flag returns flag value | REQ-0137 FR-001 |
| CP-05 | detectProvider without flag or config returns 'claude' | REQ-0137 FR-001, FR-005 |
| CP-06 | detectProvider with providers.yaml returns config value | REQ-0137 FR-001 |
| CP-07 | detectProvider error in loading config returns 'claude' | REQ-0137 FR-005 |
| CP-08 | init --provider codex generates CODEX.md | REQ-0137 FR-003 |
| CP-09 | help output includes --provider flag | REQ-0137 FR-004 |
| CP-10 | init with default provider generates CLAUDE.md | REQ-0137 FR-003, FR-005 |
| CP-11 | doctor command shows provider info | REQ-0137 FR-006 |
| CP-12 | update command regenerates instruction file | REQ-0137 FR-004 |
| CP-13 | --provider flag order does not matter | REQ-0137 FR-004 |
| CP-14 | detectProvider with autoDetectProvider result | REQ-0137 FR-001 |
| CP-15 | backward compatibility: existing init without --provider works | REQ-0137 FR-005 |

## Coverage Target

- **Target**: >= 80% line coverage for new code
- **Measurement**: Node.js built-in coverage via `--experimental-vm-modules`

## Test Patterns

- Uses `node:test` describe/it blocks
- Uses `node:assert/strict` for assertions
- Temp directories via `mkdtempSync` for file system tests
- Subprocess isolation (`execSync`) for CLI integration tests
- No external mocking library; manual stubs where needed

## Security Considerations (Article III)

- Input validation: unknown provider names must throw or degrade gracefully
- No user-supplied content injected into generated files without sanitization
- File paths constructed via `path.join` (no concatenation)

## Fail-Safe Behavior (Article X)

- Missing config fields -> sections omitted, not errors
- Unknown provider in detectProvider -> fallback to 'claude'
- File write failures -> logged, not swallowed silently
