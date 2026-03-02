# Test Cases: Characterization Test Activation

**Source Files**: `tests/characterization/*.test.js` (7 files)
**Test Runner**: node:test (ESM)
**Pattern**: Convert `it.skip()` to `it()` and implement test body

---

## Domain 1: Workflow Orchestration (workflow-orchestration.test.js)

### TC-WO-001: CLI Command Routing
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-WO-001a | routes "init" to install() | CLI args `['init', '--force']` | `run()` processes args | install() is called, exit code 0 |
| TC-WO-001b | routes "update" to update() | CLI args `['update']` | `run()` processes args | update() is called |
| TC-WO-001c | routes unknown command to error | CLI args `['foobar']` | `run()` processes args | stderr contains error, exit code 1 |
| TC-WO-001d | routes no command to help | CLI args `[]` | `run()` processes args | stdout contains usage info |

### TC-WO-002: CLI Argument Parsing
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-WO-002a | extracts boolean flags | args `['init', '--monorepo', '--force', '--dry-run']` | parseArgs() | command='init', options correct |
| TC-WO-002b | extracts --provider-mode value | args `['init', '--provider-mode', 'free']` | parseArgs() | options.providerMode='free' |
| TC-WO-002c | handles -h short flag | args `['-h']` | parseArgs() | command='help' |
| TC-WO-002d | handles -v short flag | args `['-v']` | parseArgs() | command='version' |

### TC-WO-003: Provider Mode Validation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-WO-003a | accepts 'quality' mode | --provider-mode quality | init processes | No error thrown |
| TC-WO-003b | accepts 'free' mode | --provider-mode free | init processes | No error thrown |
| TC-WO-003c | rejects 'turbo' (invalid) | --provider-mode turbo | init processes | Error with valid modes list |

### TC-WO-004: Background Update Check
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-WO-004a | suppresses notification for version cmd | `isdlc version` | command completes | No update notification in stdout |

### TC-WO-009: Setup Command Bypass
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-WO-009a | allows discover through gate-blocker | Task prompt with "discover" | gate-blocker processes | isGateAdvancementAttempt() returns false |

---

## Domain 2: Installation & Lifecycle (installation-lifecycle.test.js)

### TC-IL-001: Existing Installation Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-001a | detects .isdlc and .claude dirs | dir with .isdlc/ and .claude/ | detectExistingIsdlc() | installed=true, version from state.json |
| TC-IL-001b | reports not installed | empty directory | detectExistingIsdlc() | installed=false, version=null |

### TC-IL-002: Project Type Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-002a | detects Node.js from package.json | dir with package.json | detectExistingProject() | isExisting=true, ecosystem='node' |
| TC-IL-002b | detects Python from requirements.txt | dir with requirements.txt | detectExistingProject() | isExisting=true, ecosystem='python' |
| TC-IL-002c | detects new project when empty | empty directory | detectExistingProject() | isExisting=false |

### TC-IL-005: Settings.json Deep Merge
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-005a | preserves user-added keys | existing settings with "customTheme" | merge runs | customTheme preserved, framework keys added |
| TC-IL-005b | framework keys override at leaf | existing hooks: [] | merge with hooks: [{...}] | hooks replaced with framework hooks |

### TC-IL-007: Eight-Step Update Flow
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-007a | rejects when no installation | empty directory | update() called | throws "No iSDLC installation found" |
| TC-IL-007b | reports already up to date | versions match | update() without --force | "Already up to date!" |

### TC-IL-009: Obsolete File Cleanup
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-009a | removes files in old manifest not new | old manifest has fileA.md, new does not | updater step 7 | fileA.md removed from disk |

### TC-IL-013: Doctor Health Validation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-013a | passes all 8 checks | properly installed framework | runDoctor() | 8 passed, 0 issues |
| TC-IL-013b | detects starter constitution | STARTER_TEMPLATE marker present | runDoctor() | warning "Needs customization" |

### TC-IL-014: Dry-Run Mode
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-014a | no files created in dry-run | --dry-run flag | install() | no .isdlc or .claude dirs created |

### TC-IL-016: Installation Manifest
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IL-016a | manifest contains all tracked files | installation completes | manifest written | installed-files.json has version, created, files[] |

---

## Domain 3: Iteration Enforcement (iteration-enforcement.test.js)

### TC-IE-001: Gate Advancement Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-001a | detects Task "advance" keyword | Task with prompt "advance to next phase" | isGateAdvancementAttempt() | returns true |
| TC-IE-001b | detects Skill "sdlc advance" | Skill with args "advance" | isGateAdvancementAttempt() | returns true |
| TC-IE-001c | ignores non-gate Task calls | Task with subagent "software-developer" | isGateAdvancementAttempt() | returns false |

### TC-IE-002: Four-Check Gate Validation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-002a | blocks when tests not passed | tests not run | gate advancement | blocked: test_iteration |
| TC-IE-002b | blocks when constitution not validated | tests passed, no validation | gate advancement | blocked: constitutional_validation |
| TC-IE-002c | blocks when no agent delegation | other checks pass, no delegation | gate advancement | blocked: agent_delegation |
| TC-IE-002d | allows when all checks pass | all satisfied | gate advancement | allowed (exit 0) |

### TC-IE-004: Test Command Pattern Recognition
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-004a | recognizes `npm test` | Bash command "npm test" | pattern check | isTestCommand=true |
| TC-IE-004b | recognizes `pytest` | Bash command "pytest tests/" | pattern check | isTestCommand=true |
| TC-IE-004c | recognizes `cargo test` | Bash command "cargo test" | pattern check | isTestCommand=true |
| TC-IE-004d | recognizes `node --test` | Bash command "node --test *.test.js" | pattern check | isTestCommand=true |
| TC-IE-004e | rejects `npm install` | Bash command "npm install" | pattern check | isTestCommand=false |

### TC-IE-005: Test Result Parsing
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-005a | parses "All tests passed" | stdout "All tests passed" | parseResult() | passed=true |
| TC-IE-005b | parses "3 failed" | stdout "3 failed" | parseResult() | passed=false, count=3 |
| TC-IE-005c | uses exit code as fallback | exit_code=0, no patterns | parseResult() | passed=true |
| TC-IE-005d | defaults to failure | exit_code=1, no patterns | parseResult() | passed=false |

### TC-IE-006: Circuit Breaker
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-006a | triggers after 3 identical failures | same error 3x | test-watcher | status="escalated", reason="circuit_breaker" |

### TC-IE-007: Max Iteration Escalation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-007a | escalates at max iterations | current >= max | test-watcher | status="escalated", reason="max_iterations" |

### TC-IE-008: TEST_CORRIDOR
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-008a | blocks Task during test failure | tests failing, corridor active | Task "advance" | blocked with corridor message |
| TC-IE-008b | allows non-advance during failure | tests failing, corridor active | Bash tool call | allowed through |

### TC-IE-009: CONST_CORRIDOR
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-009a | blocks advancement during const validation | tests passed, validation in_progress | Task "advance" | blocked with article list |

### TC-IE-012: Menu Interaction Tracking
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-012a | detects A/R/C menu | result contains "[A] Adjust" + "[R] Refine" + "[C] Continue" | menu-tracker | menu_presented=true |
| TC-IE-012b | detects save selection | result contains "selected: [S] Save" | menu-tracker | completed=true |

### TC-IE-015: ATDD Skipped Test Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-IE-015a | detects skipped tests in ATDD mode | atdd_mode=true, "5 skipped" in output | test-watcher | warns about skipped tests |

---

## Domain 4: Skill Observability (skill-observability.test.js)

### TC-SO-001: Task Tool Call Interception
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-001a | only processes Task calls | tool_name="Task" | skill-validator | processes normally |
| TC-SO-001b | passes through Bash calls | tool_name="Bash" | skill-validator | exits 0, no output |
| TC-SO-001c | passes through Read calls | tool_name="Read" | skill-validator | exits 0, no output |

### TC-SO-002: Agent Name Normalization
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-002a | normalizes "orchestrator" | input="orchestrator" | normalize() | "sdlc-orchestrator" |
| TC-SO-002b | normalizes "01-requirements-analyst" | input="01-requirements-analyst" | normalize() | "requirements-analyst" |
| TC-SO-002c | normalizes "d6" | input="d6" | normalize() | "feature-mapper" |
| TC-SO-002d | normalizes "developer" | input="developer" | normalize() | "software-developer" |
| TC-SO-002e | passes through unknown names | input="custom-agent" | normalize() | "custom-agent" |

### TC-SO-003: Never-Block Model
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-003a | allows cross-phase in observe mode | mode="observe", cross-phase | skill-validator | exit 0, no output |
| TC-SO-003b | allows cross-phase in strict mode (legacy) | mode="strict" | skill-validator | exit 0, no output |
| TC-SO-003c | always exits 0 | any input | skill-validator | exit 0, no stdout |

### TC-SO-006: Skill Usage Logging
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-006a | log entry has all fields | valid Task call | log-skill-usage | entry has agent, phase, timestamp, status |
| TC-SO-006b | appends to skill_usage_log | existing log entries | log-skill-usage | array length increases |
| TC-SO-006c | never blocks on logging errors | broken state.json | log-skill-usage | exit 0, no output |

### TC-SO-007: Cross-Phase Categorization
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-007a | logs "observed" in observe mode | observe mode, cross-phase | log-skill-usage | status="observed" |
| TC-SO-007b | logs "authorized-phase-match" for match | agent phase matches current | log-skill-usage | status="authorized-phase-match" |
| TC-SO-007c | logs "authorized-orchestrator" for orch | agent="sdlc-orchestrator" | log-skill-usage | status="authorized-orchestrator" |

### TC-SO-010: Fail-Open on All Errors
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-SO-010a | exits 0 on JSON parse error | malformed stdin | skill-validator | exit 0 |
| TC-SO-010b | exits 0 on missing state.json | no state.json | skill-validator | exit 0 |
| TC-SO-010c | exits 0 on missing manifest | no manifest | skill-validator | exit 0 |

---

## Domain 5: Multi-Provider LLM Routing (provider-routing.test.js)

### TC-PR-001: Task-Only Interception
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-001a | only processes Task | tool_name="Task" | model-provider-router | processes normally |
| TC-PR-001b | passes through without providers.yaml | no providers.yaml | model-provider-router | exit 0, no output |

### TC-PR-002: Five-Level Provider Selection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-002a | CLI override highest priority | CLI + agent + phase + mode set | selection | CLI value used |
| TC-PR-002b | agent-specific overrides phase | agent + phase set | selection | agent value used |
| TC-PR-002c | falls back to mode defaults | only mode defaults set | selection | mode default used |

### TC-PR-003: Health Check and Fallback
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-003a | uses fallback when primary unhealthy | primary.healthy=false | routing | fallback provider used |
| TC-PR-003b | blocks when all providers fail | all.healthy=false | routing | blocks with error |

### TC-PR-005: Environment Override Injection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-005a | outputs environment_overrides JSON | valid provider selected | routing | stdout has environment_overrides |
| TC-PR-005b | includes provider_selection metadata | valid provider | routing | metadata in output |

### TC-PR-007: YAML Parser
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-007a | parses nested objects | YAML with nested keys | parseYaml() | correct nested object |
| TC-PR-007b | parses arrays | YAML with `- item` | parseYaml() | correct array |
| TC-PR-007c | skips comments | YAML with `# comment` | parseYaml() | comments ignored |
| TC-PR-007d | handles quoted strings | YAML with `"value"` | parseYaml() | unquoted value |

### TC-PR-009: Fail-Open
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-PR-009a | exits 0 on any error | malformed input | model-provider-router | exit 0 |
| TC-PR-009b | logs error to stderr | parse error | model-provider-router | stderr has message |

---

## Domain 6: Constitution Management (constitution-management.test.js)

### TC-CM-001: Phase Completion Interception
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-CM-001a | detects "phase complete" | Task prompt "phase complete" | constitution-validator | intercepts |
| TC-CM-001b | detects "ready for gate" | Task prompt "ready for gate" | constitution-validator | intercepts |
| TC-CM-001c | bypasses discover commands | Task with "discover" | constitution-validator | passes through |
| TC-CM-001d | ignores non-Task tools | tool_name="Bash" | constitution-validator | passes through |

### TC-CM-002: Validation Status Check
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-CM-002a | blocks when not started | no constitutional_validation | gate advancement | blocked |
| TC-CM-002b | blocks when in progress | status="iterating" | gate advancement | blocked |
| TC-CM-002c | allows when compliant | status="compliant" | gate advancement | allowed |
| TC-CM-002d | allows escalated+approved | status="escalated", approved | gate advancement | allowed |
| TC-CM-002e | blocks escalated not approved | status="escalated", not approved | gate advancement | blocked |

### TC-CM-003: Validation Loop Message
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-CM-003a | includes article checklist | blocked | output | contains article descriptions |
| TC-CM-003b | includes JSON schema | blocked | output | contains state update schema |
| TC-CM-003c | includes iteration count | blocked, iter 2/5 | output | shows "3 iterations remaining" |

### TC-CM-005: Starter Constitution Generation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-CM-005a | includes STARTER_TEMPLATE marker | generated constitution | content | contains marker |
| TC-CM-005b | includes 5 generic articles | generated constitution | content | 5 article headings |
| TC-CM-005c | includes customization warning | generated constitution | content | contains warning section |

### TC-CM-006: Constitution Path Resolution
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-CM-006a | single project path | no monorepo | resolve | docs/isdlc/constitution.md |
| TC-CM-006b | monorepo project-specific path | monorepo active | resolve | project-scoped path |
| TC-CM-006c | fallback to legacy path | new path missing | resolve | legacy path used |

---

## Domain 7: Monorepo & Project Detection (monorepo-detection.test.js)

### TC-MD-001: Workspace File Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-001a | detects pnpm-workspace.yaml | file exists | detect | isMonorepo=true |
| TC-MD-001b | detects turbo.json | file exists | detect | isMonorepo=true |
| TC-MD-001c | detects nx.json | file exists | detect | isMonorepo=true |
| TC-MD-001d | not monorepo when no markers | empty dir | detect | isMonorepo=false |

### TC-MD-002: Directory Structure Detection
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-002a | detects 2+ projects in apps/ | apps/a, apps/b | detect | isMonorepo=true |
| TC-MD-002b | not monorepo with 1 project | apps/a only | detect | isMonorepo=false |

### TC-MD-004: Project Discovery
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-004a | discovers projects in standard dirs | apps/, packages/ | discover | projects found |
| TC-MD-004b | discovers root-level projects | project at root | discover | project found |
| TC-MD-004c | deduplicates by name | same name in 2 dirs | discover | 1 result |

### TC-MD-006: CWD-Based Resolution
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-006a | longest prefix match | CWD in apps/frontend | resolve | frontend project |
| TC-MD-006b | null when outside root | CWD is /tmp | resolve | null |

### TC-MD-007: Three-Level Resolution
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-007a | ISDLC_PROJECT env takes priority | env set + CWD + default | resolve | env value used |
| TC-MD-007b | falls back to CWD detection | no env, CWD in project | resolve | CWD-matched project |
| TC-MD-007c | falls back to default_project | no env, no CWD match | resolve | default_project |

### TC-MD-008: Project-Scoped State Routing
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-008a | per-project state in monorepo | monorepo active | state path | .isdlc/projects/{id}/state.json |
| TC-MD-008b | root state in single project | no monorepo | state path | .isdlc/state.json |

### TC-MD-009: Path Resolution Functions
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-009a | constitution: new location | monorepo | resolveConstitutionPath | project-scoped |
| TC-MD-009b | docs: respects docs_location | docs_location="project" | resolveDocsPath | project-scoped |
| TC-MD-009c | external skills: project-scoped | monorepo | resolveExternalSkillsPath | project-scoped |

### TC-MD-012: Updater Monorepo Propagation
| ID | Test | Given | When | Then |
|----|------|-------|------|------|
| TC-MD-012a | updates all project states | 3 projects | update | all 3 state files updated |
| TC-MD-012b | bumps framework_version | 0.1.0 -> 0.2.0 | update | version bumped in each |
