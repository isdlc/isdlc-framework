# Test Cases: E2E CLI Lifecycle Tests

**Location**: `tests/e2e/cli-lifecycle.test.js`
**Test Runner**: node:test (ESM)
**Approach**: Subprocess-based (`execSync` / `execFileSync`)
**Dependencies**: npm ci (chalk must be resolvable)

---

## E2E-001: Full Lifecycle (init -> doctor -> update -> uninstall)

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0, .isdlc/ created, .claude/ created, state.json exists |
| 2 | `isdlc doctor` | exit 0, "8 checks passed" in stdout |
| 3 | `isdlc update --force` | exit 0, "up to date" or "Updated" in stdout |
| 4 | `isdlc uninstall --force` | exit 0, .isdlc/ removed, .claude/settings.json hooks removed |
| 5 | Verify cleanup | no .isdlc/ directory, no .claude/hooks/ directory |

## E2E-002: Init Idempotency

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0, .isdlc/state.json created |
| 2 | Note state.json created timestamp | |
| 3 | `isdlc init --force` | exit 0, no error |
| 4 | Verify state.json | exists, not corrupted, created timestamp unchanged |

## E2E-003: Update from Stale Installation

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 |
| 2 | Modify .isdlc/installed-files.json version to "0.0.1" | |
| 3 | `isdlc update` | exit 0, "Updating" in stdout |
| 4 | Verify version updated | installed-files.json version matches current |

## E2E-004: Doctor Detects Problems

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 |
| 2 | Delete .claude/settings.json | |
| 3 | `isdlc doctor` | exit 1 or warning, reports missing settings |

## E2E-005: Uninstall Is Clean

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 |
| 2 | Create user file: `src/app.js` | |
| 3 | `isdlc uninstall --force` | exit 0 |
| 4 | Verify src/app.js still exists | user file preserved |
| 5 | Verify no .isdlc/ directory | framework removed |

## E2E-006: Monorepo Init

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force --monorepo` | exit 0 |
| 2 | Verify .isdlc/monorepo.json exists | |
| 3 | Verify structure | projects dir or scan_paths configured |

## E2E-007: Dry-Run Safety

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --dry-run` | exit 0 |
| 2 | Verify no .isdlc/ directory | |
| 3 | Verify no .claude/ directory | |
| 4 | Verify stdout shows plan | "Would create" or similar |

## E2E-008: Force Flag Bypass

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 (no prompts) |
| 2 | Verify complete installation | all expected dirs/files exist |

## E2E-009: Version Command

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc version` | exit 0 |
| 2 | Verify stdout matches semver | matches /^\d+\.\d+\.\d+/ |

## E2E-010: Help Command

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc help` | exit 0 |
| 2 | `isdlc -h` | exit 0 |
| 3 | `isdlc` (no args) | exit 0, shows help |
| 4 | Verify commands listed | "init", "update", "uninstall", "doctor", "version" in stdout |

## E2E-011: Unknown Command Error

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc foobar` | exit 1 |
| 2 | Verify stderr | contains "Unknown command" or error message |
| 3 | Verify stdout | contains help text |

## E2E-012: Provider Mode Options

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force --provider-mode free` | exit 0 |
| 2 | Verify providers.yaml | mode matches "free" |
| 3 | Cleanup and repeat for "quality" | |
| 4 | Cleanup and repeat for "custom" | |

## E2E-013: Update --force

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 |
| 2 | `isdlc update --force` | exit 0 even when already up to date |

## E2E-014: Uninstall --purge

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --force` | exit 0 |
| 2 | `isdlc uninstall --force --purge` | exit 0 |
| 3 | Verify .isdlc/state.json removed | purge removes state |

## E2E-015: Error Exit Codes

| Step | Command | Assertions |
|------|---------|------------|
| 1 | `isdlc init --provider-mode invalid` | non-zero exit |
| 2 | `isdlc update` (no installation) | non-zero exit |
| 3 | `isdlc uninstall` (no installation) | non-zero exit or graceful message |
