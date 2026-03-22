# Test Strategy: Content Classification Modules (REQ-0099 through REQ-0102)

## 1. Scope

Unit tests for the content classification batch:
- `src/core/content/content-model.js` — shared schema enums and helpers
- `src/core/content/agent-classification.js` — 47 agent classifications
- `src/core/content/skill-classification.js` — 245 skill classifications, 17 categories
- `src/core/content/command-classification.js` — 4 command classifications
- `src/core/content/topic-classification.js` — 6 topic classifications
- `src/core/bridge/content-model.cjs` — CJS bridge

## 2. Test Framework

- **Runner**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Command**: `npm run test:core` (covers `tests/core/**/*.test.js`)
- **Parallel execution**: default `node --test` concurrency

## 3. Test File Layout

```
tests/core/content/
  content-model.test.js          — schema enums, createSectionEntry
  agent-classification.test.js   — lookup, list, standard template, special agents, portability
  skill-classification.test.js   — template, category portability, lookup
  command-classification.test.js — isdlc.md detail, other commands
  topic-classification.test.js   — all 6 topics, portability summary
  bridge-content-model.test.js   — CJS bridge parity
```

## 4. Test Categories

### 4.1 Schema Tests (content-model.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| CM-01 | FR-001 AC-001-02 | CLASSIFICATION_TYPES has exactly 3 values: role_spec, runtime_packaging, mixed |
| CM-02 | FR-001 AC-001-02 | PORTABILITY has exactly 3 values: full, partial, none |
| CM-03 | FR-001 AC-001-02 | createSectionEntry returns frozen object with name, type, portability |
| CM-04 | FR-001 AC-001-02 | createSectionEntry rejects invalid type |
| CM-05 | FR-001 AC-001-02 | createSectionEntry rejects invalid portability |
| CM-06 | — | Enums are frozen (immutable) |

### 4.2 Agent Classification Tests (agent-classification.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| AC-01 | FR-003 AC-003-03 | listClassifiedAgents returns exactly 47 names |
| AC-02 | FR-003 AC-003-02 | getAgentClassification returns sections for known agent |
| AC-03 | FR-003 AC-003-02 | getAgentClassification throws for unknown agent |
| AC-04 | FR-002 AC-002-01..08 | Standard agents have 7 canonical sections |
| AC-05 | FR-002 AC-002-01 | frontmatter classified as role_spec/full |
| AC-06 | FR-002 AC-002-04 | tool_usage classified as runtime_packaging/none |
| AC-07 | FR-002 AC-002-07 | iteration_protocol classified as mixed/partial |
| AC-08 | — | Special agents (roundtable-analyst) have custom sections |
| AC-09 | — | getAgentPortabilitySummary returns percentage breakdown |
| AC-10 | — | All classification entries are frozen |

### 4.3 Skill Classification Tests (skill-classification.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| SK-01 | FR-002 AC-002-01..06 | getSkillSectionTemplate returns 6 standard sections |
| SK-02 | FR-003 AC-003-02 | getSkillClassification returns sections for valid skill |
| SK-03 | FR-003 AC-003-01 | getCategoryPortability returns summary for each of 17 categories |
| SK-04 | FR-003 AC-003-01 | Category portability percentages sum to ~100 |
| SK-05 | — | listCategories returns exactly 17 categories |
| SK-06 | — | Template sections are frozen |
| SK-07 | FR-003 AC-003-02 | getSkillClassification throws for unknown skill |

### 4.4 Command Classification Tests (command-classification.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| CMD-01 | FR-001 AC-001-01 | getCommandClassification returns sections for isdlc |
| CMD-02 | FR-002 AC-002-01..06 | isdlc.md has 8 classified sections |
| CMD-03 | FR-002 AC-002-01 | action_definitions classified as role_spec/full |
| CMD-04 | FR-002 AC-002-04 | phase_loop_controller classified as runtime_packaging/none |
| CMD-05 | FR-003 AC-003-01..03 | Other 3 commands classified (provider, discover, tour) |
| CMD-06 | — | listClassifiedCommands returns exactly 4 |
| CMD-07 | — | getCommandClassification throws for unknown command |

### 4.5 Topic Classification Tests (topic-classification.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| TC-01 | FR-001 AC-001-01 | listClassifiedTopics returns exactly 6 topic IDs |
| TC-02 | FR-002 AC-002-01..06 | Each topic has 6 sections |
| TC-03 | FR-002 AC-002-01..05 | First 5 sections are role_spec/full |
| TC-04 | FR-002 AC-002-06 | source_step_files classified as runtime_packaging/none |
| TC-05 | FR-003 AC-003-01 | getTopicPortabilitySummary shows >95% portable |
| TC-06 | FR-003 AC-003-02 | getTopicClassification returns for valid topic |
| TC-07 | — | getTopicClassification throws for unknown topic |
| TC-08 | — | All classification entries are frozen |

### 4.6 CJS Bridge Tests (bridge-content-model.test.js)
| Test ID | Requirement | Description |
|---------|-------------|-------------|
| BR-01 | — | Bridge exports all content-model functions |
| BR-02 | — | Bridge getAgentClassification matches ESM |
| BR-03 | — | Bridge getSkillClassification matches ESM |
| BR-04 | — | Bridge getCommandClassification matches ESM |
| BR-05 | — | Bridge getTopicClassification matches ESM |
| BR-06 | — | Bridge CLASSIFICATION_TYPES matches ESM |

## 5. Coverage Target

- Line coverage: >= 80% (target 95%+ for pure data modules)
- Branch coverage: >= 80%
- All 47 agent names validated present
- All 17 skill categories validated present
- All 4 commands validated present
- All 6 topics validated present

## 6. Test Execution

```bash
npm run test:core    # Runs all core tests including new content tests
```

Expected: 566 existing + ~50 new = ~616 total tests, all passing.
