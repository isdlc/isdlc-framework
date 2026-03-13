# Test Cases: Roundtable Memory Layer (REQ-0063)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0063
**Total Test Cases**: 92 (62 unit + 18 integration + 12 behavioral)
**AC Coverage**: 40/40 (100%)

---

## Unit Tests: `lib/memory.test.js`

### UT-001: readUserProfile — Happy Path
**Requirement**: FR-001 (AC-001-01)
**Type**: positive
**Given**: `~/.isdlc/user-memory/profile.json` exists with valid schema (version, topics with preferred_depth, weight, last_updated, override_count, session_count)
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns parsed UserProfile object with all fields populated
**Verify**: Returned object has `version`, `last_compacted`, `topics` keys; topic entries have required fields

### UT-002: readUserProfile — File Not Found (MEM-001)
**Requirement**: FR-008 (AC-008-01)
**Type**: negative
**Given**: `userMemoryDir` points to a directory where `profile.json` does not exist
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns `null`; does not throw

### UT-003: readUserProfile — Malformed JSON (MEM-003)
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: `profile.json` contains invalid JSON (`{broken`)
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns `null`; does not throw

### UT-004: readUserProfile — Partial Schema (MEM-005)
**Requirement**: FR-008 (AC-008-03)
**Type**: boundary
**Given**: `profile.json` has valid JSON but missing `version` field and some topic entries lack `weight`
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns UserProfile with defaults applied (version=1, weight=0.5); valid entries preserved, invalid entries skipped

### UT-005: readUserProfile — Empty File
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: `profile.json` exists but is empty (0 bytes)
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns `null`; does not throw

### UT-006: readUserProfile — Empty Topics Object
**Requirement**: FR-001 (AC-001-01)
**Type**: boundary
**Given**: `profile.json` has valid JSON with `topics: {}`
**When**: `readUserProfile(userMemoryDir)` is called
**Then**: Returns UserProfile with empty topics map

### UT-007: readProjectMemory — Happy Path
**Requirement**: FR-002 (AC-002-01)
**Type**: positive
**Given**: `.isdlc/roundtable-memory.json` exists with valid schema (version, summary with per-topic aggregates, sessions array)
**When**: `readProjectMemory(projectRoot)` is called
**Then**: Returns parsed ProjectMemory object with summary and sessions

### UT-008: readProjectMemory — File Not Found (MEM-002)
**Requirement**: FR-008 (AC-008-01)
**Type**: negative
**Given**: `.isdlc/roundtable-memory.json` does not exist in projectRoot
**When**: `readProjectMemory(projectRoot)` is called
**Then**: Returns `null`; does not throw

### UT-009: readProjectMemory — Malformed JSON (MEM-004)
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: `roundtable-memory.json` contains invalid JSON
**When**: `readProjectMemory(projectRoot)` is called
**Then**: Returns `null`; does not throw

### UT-010: readProjectMemory — Per-Topic Record Format
**Requirement**: FR-002 (AC-002-02)
**Type**: positive
**Given**: Valid project memory with topics containing `topic_id`, `depth_used`, `assumptions_count`, `assumptions_amended`
**When**: `readProjectMemory(projectRoot)` is called
**Then**: Returned summary.topics entries have all required fields

### UT-011: readProjectMemory — Deterministic JSON Output
**Requirement**: FR-002 (AC-002-04)
**Type**: positive
**Given**: Project memory written by `writeSessionRecord()`
**When**: File is read back
**Then**: JSON output has sorted keys and consistent formatting (suitable for version control diffs)

### UT-012: mergeMemory — Both Inputs Present, No Conflicts
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: UserProfile with `architecture: brief` (weight 0.8) and ProjectMemory with `architecture: brief` (avg_depth)
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Returns MemoryContext with `architecture` topic entry having `conflict: false`, both user_preference and project_history populated

### UT-013: mergeMemory — Both Inputs Present, Conflict Detected
**Requirement**: FR-005 (AC-005-01)
**Type**: positive
**Given**: UserProfile with `security: brief` (weight 0.7) and ProjectMemory with `security: deep` (avg_depth)
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Returns MemoryContext with `security` topic entry having `conflict: true`

### UT-014: mergeMemory — Conflict Not Flagged for Weak Preferences
**Requirement**: FR-005 (AC-005-01)
**Type**: boundary
**Given**: UserProfile with `security: brief` (weight 0.3) and ProjectMemory with `security: deep`
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Returns MemoryContext with `security` topic entry having `conflict: false` (weight < 0.5 threshold)

### UT-015: mergeMemory — Only User Profile Present
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: Valid UserProfile, projectMemory is `null`
**When**: `mergeMemory(userProfile, null)` is called
**Then**: Returns MemoryContext with user_preference populated, project_history null, no conflicts

### UT-016: mergeMemory — Only Project Memory Present
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: userProfile is `null`, valid ProjectMemory
**When**: `mergeMemory(null, projectMemory)` is called
**Then**: Returns MemoryContext with project_history populated, user_preference null, no conflicts

### UT-017: mergeMemory — Both Inputs Null
**Requirement**: FR-008 (AC-008-01)
**Type**: negative
**Given**: Both userProfile and projectMemory are `null`
**When**: `mergeMemory(null, null)` is called
**Then**: Returns `{ topics: {} }` (empty context)

### UT-018: mergeMemory — Topics From Both Sources Combined
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: UserProfile has topics `[arch, security]`, ProjectMemory has topics `[security, testing]`
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Returns MemoryContext with 3 topics: `arch` (user only), `security` (both), `testing` (project only)

### UT-019: mergeMemory — Distinguishes User vs Project Source
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: Topic exists in both layers
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Merged entry has separate `user_preference` and `project_history` fields

### UT-020: formatMemoryContext — Non-Empty Topics
**Requirement**: FR-003 (AC-003-03)
**Type**: positive
**Given**: MemoryContext with 2 topics (one with conflict, one without)
**When**: `formatMemoryContext(memoryContext)` is called
**Then**: Returns formatted string starting with `MEMORY_CONTEXT:` containing per-topic sections with `--- topic: {id} ---` separators

### UT-021: formatMemoryContext — Empty Topics
**Requirement**: FR-003 (AC-003-04)
**Type**: boundary
**Given**: MemoryContext with `topics: {}`
**When**: `formatMemoryContext(memoryContext)` is called
**Then**: Returns empty string

### UT-022: formatMemoryContext — Follows Inlining Pattern
**Requirement**: FR-003 (AC-003-03)
**Type**: positive
**Given**: MemoryContext with topics
**When**: `formatMemoryContext(memoryContext)` is called
**Then**: Output format matches PERSONA_CONTEXT/TOPIC_CONTEXT inlining pattern (block header + structured entries)

### UT-023: formatMemoryContext — Conflict Indication
**Requirement**: FR-005 (AC-005-01)
**Type**: positive
**Given**: MemoryContext with a topic where `conflict: true`
**When**: `formatMemoryContext(memoryContext)` is called
**Then**: Output includes `conflict: true` for that topic

### UT-024: writeSessionRecord — Happy Path (Both Layers)
**Requirement**: FR-006 (AC-006-01, AC-006-02)
**Type**: positive
**Given**: Valid SessionRecord with session_id, slug, timestamp, topics array; valid projectRoot and userMemoryDir
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: true, projectWritten: true }`; user session file exists at `sessions/{timestamp}.json`; project memory sessions array updated

### UT-025: writeSessionRecord — Session Record Schema
**Requirement**: FR-006 (AC-006-03)
**Type**: positive
**Given**: SessionRecord with topics containing topic_id, depth_used, acknowledged, overridden, assumptions_count
**When**: Record is written and read back
**Then**: All fields preserved in written file

### UT-026: writeSessionRecord — User Write Failure (MEM-006)
**Requirement**: FR-006 (AC-006-04), FR-008 (AC-008-05)
**Type**: negative
**Given**: User memory directory is read-only
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: false, projectWritten: true }`; does not throw

### UT-027: writeSessionRecord — Project Write Failure (MEM-007)
**Requirement**: FR-006 (AC-006-04), FR-008 (AC-008-05)
**Type**: negative
**Given**: `.isdlc/` directory is read-only or missing
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: true, projectWritten: false }`; does not throw

### UT-028: writeSessionRecord — Both Writes Fail
**Requirement**: FR-008 (AC-008-05)
**Type**: negative
**Given**: Both user and project directories are read-only
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: false, projectWritten: false }`; does not throw

### UT-029: writeSessionRecord — Creates User Memory Directory (MEM-008)
**Requirement**: FR-001 (AC-001-02)
**Type**: positive
**Given**: `userMemoryDir/sessions/` does not exist
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Directory is created automatically; session file written successfully

### UT-030: writeSessionRecord — Dir Creation Failure (MEM-008)
**Requirement**: FR-008 (AC-008-05)
**Type**: negative
**Given**: Parent of userMemoryDir is read-only (cannot create subdirectories)
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: false, ... }`; does not throw

### UT-031: writeSessionRecord — Project Memory Append
**Requirement**: FR-006 (AC-006-02)
**Type**: positive
**Given**: `.isdlc/roundtable-memory.json` exists with 2 sessions
**When**: `writeSessionRecord(record, projectRoot)` is called
**Then**: Sessions array now has 3 entries; existing entries preserved

### UT-032: writeSessionRecord — Project Memory File Does Not Exist Yet
**Requirement**: FR-006 (AC-006-02)
**Type**: positive
**Given**: `.isdlc/` exists but `roundtable-memory.json` does not
**When**: `writeSessionRecord(record, projectRoot)` is called
**Then**: New file created with version, empty summary, and sessions array containing the record

### UT-033: compact — Happy Path (Both Layers)
**Requirement**: FR-007 (AC-007-01, AC-007-04)
**Type**: positive
**Given**: 10 user session files and project memory with 10 sessions, 3 topics
**When**: `compact({ user: true, project: true, projectRoot, userMemoryDir })` is called
**Then**: Returns CompactionResult with sessionsRead=10 for both layers; profile.json updated with aggregated topics; roundtable-memory.json summary updated

### UT-034: compact — User Only
**Requirement**: FR-007 (AC-007-02)
**Type**: positive
**Given**: 5 user session files
**When**: `compact({ user: true, project: false, userMemoryDir })` is called
**Then**: Returns CompactionResult with user field populated, project field undefined; profile.json updated

### UT-035: compact — Project Only
**Requirement**: FR-007 (AC-007-03)
**Type**: positive
**Given**: Project memory with 5 sessions
**When**: `compact({ user: false, project: true, projectRoot })` is called
**Then**: Returns CompactionResult with project field populated, user field undefined; roundtable-memory.json summary updated

### UT-036: compact — Aggregation Algorithm (Depth Counting)
**Requirement**: FR-007 (AC-007-04)
**Type**: positive
**Given**: 5 sessions where topic `arch` used `brief` 3 times and `deep` 2 times
**When**: Compaction runs
**Then**: Aggregated preferred_depth for `arch` is `brief` (most frequent)

### UT-037: compact — Weight Calculation with Age Decay
**Requirement**: FR-010 (AC-010-03)
**Type**: positive
**Given**: Sessions spanning 6 months, older sessions favor `deep`, recent sessions favor `brief`
**When**: Compaction runs
**Then**: Weight reflects recency bias (recent sessions have higher weight); age_factor = 0.95^months_old

### UT-038: compact — Override Count Aggregation
**Requirement**: FR-010 (AC-010-01)
**Type**: positive
**Given**: 10 sessions, 3 with overridden=true for topic `security`
**When**: Compaction runs
**Then**: Aggregated override_count for `security` is 3

### UT-039: compact — Empty Sessions Directory
**Requirement**: FR-007 (AC-007-04)
**Type**: boundary
**Given**: User sessions directory exists but is empty
**When**: `compact({ user: true, ... })` is called
**Then**: Returns CompactionResult with sessionsRead=0; profile.json written with empty topics

### UT-040: compact — Malformed Session Files Skipped
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: 5 session files, 2 with malformed JSON
**When**: Compaction runs
**Then**: 3 valid sessions processed; malformed files skipped; no errors thrown

### UT-041: compact — Session Log Pruning
**Requirement**: FR-007 (AC-007-05)
**Type**: positive
**Given**: 10 raw session files after compaction
**When**: Compaction with pruning completes
**Then**: Raw session files can be archived or removed; profile.json contains aggregated data

### UT-042: compact — Read Failure User Sessions (MEM-009)
**Requirement**: FR-007
**Type**: negative
**Given**: User sessions directory does not exist or is unreadable
**When**: `compact({ user: true, ... })` is called
**Then**: Throws error (CLI command reports to user)

### UT-043: compact — Read Failure Project (MEM-010)
**Requirement**: FR-007
**Type**: negative
**Given**: Project memory file is unreadable
**When**: `compact({ user: false, project: true, projectRoot })` is called
**Then**: Throws error (CLI command reports to user)

### UT-044: compact — Write Failure (MEM-011)
**Requirement**: FR-007
**Type**: negative
**Given**: Profile.json is read-only
**When**: Compaction tries to write
**Then**: Throws error with descriptive message

### UT-045: Weight Decay — Override Reduces Weight
**Requirement**: FR-010 (AC-010-01)
**Type**: positive
**Given**: Topic with weight 0.8, user overrides preference
**When**: Override is recorded and compaction runs
**Then**: Weight decreases (weight < 0.8)

### UT-046: Weight Decay — Confirmation Increases Weight
**Requirement**: FR-010 (AC-010-02)
**Type**: positive
**Given**: Topic with weight 0.6, user confirms preference
**When**: Confirmation is recorded and compaction runs
**Then**: Weight increases (weight > 0.6, max 1.0)

### UT-047: Weight Decay — Stale Preferences Decay
**Requirement**: FR-010 (AC-010-03)
**Type**: positive
**Given**: Topic last updated 6 months ago, no recent sessions
**When**: Compaction runs
**Then**: Weight decayed toward neutral (lower than original)

### UT-048: User Memory Cross-Project Persistence
**Requirement**: FR-001 (AC-001-03)
**Type**: positive
**Given**: Two different project roots, same userMemoryDir
**When**: Sessions are written from both projects, then readUserProfile() is called
**Then**: Profile reflects sessions from both projects; userMemoryDir is project-independent

### UT-049: User Memory Local Only
**Requirement**: FR-001 (AC-001-04)
**Type**: positive
**Given**: Valid userMemoryDir path
**When**: `writeSessionRecord()` is called
**Then**: Files are written only under userMemoryDir (home directory); no files written to projectRoot for user memory

### UT-050: Project Memory Shared
**Requirement**: FR-002 (AC-002-03)
**Type**: positive
**Given**: Valid projectRoot
**When**: `writeSessionRecord()` is called
**Then**: Project memory written to `.isdlc/roundtable-memory.json` in projectRoot (accessible to all team members)

### UT-051: Schema Validation — Version Field Default
**Requirement**: FR-008 (AC-008-02)
**Type**: boundary
**Given**: Profile.json with no `version` field
**When**: `readUserProfile()` is called
**Then**: Assumes version 1; returns valid profile

### UT-052: Schema Validation — Missing Topics Default
**Requirement**: FR-008 (AC-008-02)
**Type**: boundary
**Given**: Profile.json with no `topics` field
**When**: `readUserProfile()` is called
**Then**: Uses empty `{}` for topics; returns valid profile

### UT-053: Schema Validation — Missing Weight Default
**Requirement**: FR-008 (AC-008-03)
**Type**: boundary
**Given**: Topic entry missing `weight` field
**When**: `readUserProfile()` is called
**Then**: Uses default weight of 0.5

### UT-054: Schema Validation — Missing last_updated Default
**Requirement**: FR-008 (AC-008-03)
**Type**: boundary
**Given**: Topic entry missing `last_updated` field
**When**: `readUserProfile()` is called
**Then**: Uses epoch as default

### UT-055: Schema Validation — Missing Sessions Default
**Requirement**: FR-008 (AC-008-02)
**Type**: boundary
**Given**: Project memory with no `sessions` field
**When**: `readProjectMemory()` is called
**Then**: Uses empty array `[]` for sessions

### UT-056: Schema Validation — Session Missing Topics
**Requirement**: FR-008 (AC-008-03)
**Type**: boundary
**Given**: Session record in sessions array missing `topics` field
**When**: `readProjectMemory()` is called
**Then**: Session record is skipped during reads

### UT-057: Path Traversal Prevention
**Requirement**: Security
**Type**: negative
**Given**: `projectRoot` contains path traversal (`../../etc`)
**When**: `readProjectMemory(maliciousPath)` is called
**Then**: Returns null; does not access files outside the intended directory

### UT-058: Deeply Nested JSON Input
**Requirement**: Security
**Type**: negative
**Given**: Profile.json contains deeply nested objects (100 levels)
**When**: `readUserProfile()` is called
**Then**: Handles gracefully (returns null or valid partial data); does not crash

### UT-059: Oversized String Input
**Requirement**: Security
**Type**: negative
**Given**: Profile.json contains a topic_id that is 10MB string
**When**: `readUserProfile()` is called
**Then**: Handles gracefully; does not cause memory issues

### UT-060: mergeMemory — Agreement Applied Silently
**Requirement**: FR-005 (AC-005-03)
**Type**: positive
**Given**: User and project both prefer `brief` for `architecture`
**When**: `mergeMemory(userProfile, projectMemory)` is called
**Then**: Returns entry with `conflict: false`; agreement is applied (acknowledged but not flagged as conflict)

### UT-061: mergeMemory — All Topics Treated Equally
**Requirement**: FR-004 (AC-004-05)
**Type**: positive
**Given**: Memory with 5 different topic types (requirements, architecture, security, testing, deployment)
**When**: `mergeMemory()` is called
**Then**: All topics processed with identical logic; no special-casing for any topic

### UT-062: writeSessionRecord — Append-Only Behavior
**Requirement**: FR-001 (AC-001-02)
**Type**: positive
**Given**: 3 existing session files in user sessions directory
**When**: `writeSessionRecord()` is called
**Then**: New file created with new timestamp; existing files untouched

---

## Integration Tests

### IT-001: Full Read Path — Profile + Project + Merge + Format
**Requirement**: FR-003 (AC-003-01, AC-003-02)
**Type**: positive
**Given**: Valid profile.json and roundtable-memory.json on disk
**When**: Full dispatch injection path is executed (readUserProfile -> readProjectMemory -> mergeMemory -> formatMemoryContext)
**Then**: Produces valid MEMORY_CONTEXT string with per-topic entries from both sources

### IT-002: Full Read Path — Missing User Profile
**Requirement**: FR-003 (AC-003-04), FR-008 (AC-008-01)
**Type**: negative
**Given**: No profile.json exists; valid roundtable-memory.json exists
**When**: Full dispatch injection path is executed
**Then**: MEMORY_CONTEXT contains only project memory entries; no error

### IT-003: Full Read Path — Missing Project Memory
**Requirement**: FR-003 (AC-003-04), FR-008 (AC-008-01)
**Type**: negative
**Given**: Valid profile.json; no roundtable-memory.json
**When**: Full dispatch injection path is executed
**Then**: MEMORY_CONTEXT contains only user preference entries; no error

### IT-004: Full Read Path — Both Missing
**Requirement**: FR-008 (AC-008-01)
**Type**: negative
**Given**: Neither profile.json nor roundtable-memory.json exist
**When**: Full dispatch injection path is executed
**Then**: MEMORY_CONTEXT is empty string; roundtable dispatch omits the block

### IT-005: Full Read Path — Both Corrupted
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: Both files contain malformed JSON
**When**: Full dispatch injection path is executed
**Then**: MEMORY_CONTEXT is empty string; no errors thrown

### IT-006: Full Write-Back Path — Session Record Written to Both Layers
**Requirement**: FR-006 (AC-006-01, AC-006-02)
**Type**: positive
**Given**: Valid temp directories for user and project
**When**: `writeSessionRecord()` is called, then files read back
**Then**: User session file contains exact record; project memory sessions array contains the record as last entry

### IT-007: Full Write-Back Path — Write Failure Non-Blocking
**Requirement**: FR-006 (AC-006-04), FR-008 (AC-008-05)
**Type**: negative
**Given**: User directory is read-only; project directory is valid
**When**: `writeSessionRecord()` is called
**Then**: Returns without throwing; project write succeeds; user write fails gracefully

### IT-008: Compaction Flow — Read Sessions, Aggregate, Write Summary
**Requirement**: FR-007 (AC-007-01, AC-007-04)
**Type**: positive
**Given**: 10 user session files with 3 topics, project memory with 10 sessions
**When**: `compact()` is called
**Then**: profile.json has per-topic summaries with correct depth counts, weights, override counts; roundtable-memory.json summary section updated with per-topic project aggregates

### IT-009: Compaction Flow — User Only Flag
**Requirement**: FR-007 (AC-007-02)
**Type**: positive
**Given**: User sessions and project memory both exist
**When**: `compact({ user: true, project: false })` is called
**Then**: Only user profile.json updated; project memory unchanged

### IT-010: Compaction Flow — Project Only Flag
**Requirement**: FR-007 (AC-007-03)
**Type**: positive
**Given**: User sessions and project memory both exist
**When**: `compact({ user: false, project: true })` is called
**Then**: Only project memory summary updated; user profile unchanged

### IT-011: CLI Subcommand — isdlc memory compact
**Requirement**: FR-007 (AC-007-01)
**Type**: positive
**Given**: Valid user and project memory with session data
**When**: `node bin/isdlc.js memory compact` is executed via subprocess
**Then**: Exit code 0; output contains session/topic counts; files updated

### IT-012: CLI Subcommand — isdlc memory compact --user
**Requirement**: FR-007 (AC-007-02)
**Type**: positive
**Given**: Valid user memory with sessions
**When**: `node bin/isdlc.js memory compact --user` is executed
**Then**: Exit code 0; only user compaction output shown

### IT-013: CLI Subcommand — isdlc memory compact --project
**Requirement**: FR-007 (AC-007-03)
**Type**: positive
**Given**: Valid project memory with sessions
**When**: `node bin/isdlc.js memory compact --project` is executed
**Then**: Exit code 0; only project compaction output shown

### IT-014: Performance — Full Read Path Under Threshold
**Requirement**: FR-009 (AC-009-01)
**Type**: positive
**Given**: Profile.json with 20 topics, roundtable-memory.json with 100 sessions
**When**: Full read path (readUserProfile + readProjectMemory + mergeMemory + formatMemoryContext) is timed
**Then**: Total time < 1 second (1000ms)

### IT-015: Performance — Compaction Under Threshold
**Requirement**: FR-009
**Type**: positive
**Given**: 260 user session files (1 year of usage), 20 topics per session
**When**: `compact()` is timed
**Then**: Total time < 5 seconds

### IT-016: Performance Warning Triggered
**Requirement**: FR-009 (AC-009-01)
**Type**: positive
**Given**: Memory reads configured to exceed 1 second (large dataset or artificial delay)
**When**: Performance warning check runs
**Then**: Warning message includes suggestion to run `isdlc memory compact`

### IT-017: Performance Warning — Session Continues
**Requirement**: FR-009 (AC-009-02)
**Type**: positive
**Given**: Performance warning is triggered
**When**: After warning, normal flow continues
**Then**: Memory context is still produced; roundtable proceeds normally

### IT-018: Privacy — User Memory Isolation
**Requirement**: FR-001 (AC-001-04)
**Type**: positive
**Given**: User memory operations complete
**When**: All files in projectRoot are inspected
**Then**: No user preference data appears in `.isdlc/roundtable-memory.json` (only session records, not user-level aggregates)

---

## Behavioral / Prompt Verification Tests

### BT-001: MEMORY_CONTEXT Parsing by Roundtable Agent
**Requirement**: FR-004 (AC-004-01)
**Type**: positive
**Given**: Roundtable agent prompt contains valid `MEMORY_CONTEXT:` block with 3 topic entries
**When**: Agent parses the prompt
**Then**: Agent's roundtable-analyst.md instructions reference MEMORY_CONTEXT parsing in Section 2.1 opening steps

### BT-002: Acknowledgment at Topic Transition
**Requirement**: FR-004 (AC-004-02)
**Type**: positive
**Given**: MEMORY_CONTEXT has preference for topic `architecture: brief` with no conflict
**When**: Roundtable transitions to architecture topic
**Then**: Agent prompt instructs acknowledgment pattern: "From past sessions, you tend to [preference] -- same here?"

### BT-003: User Confirm/Override Support
**Requirement**: FR-004 (AC-004-03)
**Type**: positive
**Given**: Acknowledgment surfaced for a topic preference
**When**: User responds
**Then**: Agent prompt supports both confirmation and override paths

### BT-004: Memory as Weighted Signal, Not Prescriptive
**Requirement**: FR-004 (AC-004-04)
**Type**: positive
**Given**: MEMORY_CONTEXT indicates `brief` for a topic
**When**: Real-time conversational cues indicate deep exploration needed
**Then**: Agent prompt allows adjustment based on real-time cues (memory is advisory)

### BT-005: Equal Topic Treatment
**Requirement**: FR-004 (AC-004-05)
**Type**: positive
**Given**: MEMORY_CONTEXT has entries for 5 different topics
**When**: Each topic is processed
**Then**: Same acknowledgment/conflict logic applied to all topics; no special-casing in prompt instructions

### BT-006: Conflict Surfacing — User vs Project Disagreement
**Requirement**: FR-005 (AC-005-01)
**Type**: positive
**Given**: MEMORY_CONTEXT shows conflict for `security` (user: brief, project: deep)
**When**: Roundtable reaches security topic
**Then**: Agent prompt instructs surfacing both signals: "Your usual preference is [X], but this project has used [Y] recently -- which way?"

### BT-007: Conflict Resolution — Choice Recorded
**Requirement**: FR-005 (AC-005-02)
**Type**: positive
**Given**: Conflict surfaced and user chooses a depth
**When**: Session record is generated
**Then**: Agent prompt instructs recording the choice (acknowledged=true, overridden based on which was chosen)

### BT-008: No Conflict — Agreement Applied Silently
**Requirement**: FR-005 (AC-005-03)
**Type**: positive
**Given**: User and project agree on topic depth
**When**: Topic is reached
**Then**: Brief acknowledgment without surfacing conflict; no explicit user choice required

### BT-009: Session Record Output
**Requirement**: FR-006 (AC-006-03)
**Type**: positive
**Given**: Roundtable session completes with 4 topics covered
**When**: Agent produces SESSION_RECORD output
**Then**: Agent prompt instructs output of JSON block with session_id, slug, timestamp, and per-topic entries (topic_id, depth_used, acknowledged, overridden, assumptions_count)

### BT-010: No MEMORY_CONTEXT — Roundtable Unchanged
**Requirement**: FR-008 (AC-008-01, AC-008-04)
**Type**: positive
**Given**: Dispatch prompt does not contain MEMORY_CONTEXT block
**When**: Roundtable proceeds
**Then**: Agent behaves exactly as before the memory feature (no errors, no warnings, no degraded behavior)

### BT-011: MEMORY_CONTEXT Parse Failure (MEM-012)
**Requirement**: FR-008 (AC-008-02)
**Type**: negative
**Given**: MEMORY_CONTEXT block is malformed in the prompt
**When**: Agent attempts to parse it
**Then**: Agent prompt instructs skipping memory and proceeding with real-time sensing only; no error visible to user

### BT-012: No Error Messages for Memory Failures
**Requirement**: FR-008 (AC-008-04)
**Type**: negative
**Given**: Any memory failure scenario (missing files, corrupted data, write failures)
**When**: Roundtable session runs
**Then**: No error messages or warnings shown to user for memory-related issues
