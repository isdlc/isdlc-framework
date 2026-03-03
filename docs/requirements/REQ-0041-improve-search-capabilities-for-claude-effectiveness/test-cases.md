# Test Cases: Improve Search Capabilities for Claude Effectiveness

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0041 (GH-34)
**Status**: Complete
**Last Updated**: 2026-03-02
**Total Test Cases**: 169

---

## FR-001: Search Abstraction Layer

### Unit Tests: `lib/search/router.test.js`

#### TC-001-01: Route lexical query to lexical backend
- **Requirement**: AC-001-01, AC-001-02
- **Type**: positive
- **Precondition**: Registry has lexical backend registered
- **Input**: SearchRequest with modality='lexical', query='function handleAuth'
- **Expected**: Router calls lexical backend's search(), returns SearchResult with meta.backendUsed='grep-glob'

#### TC-001-02: Route structural query to structural backend
- **Requirement**: AC-001-01, AC-001-02
- **Type**: positive
- **Precondition**: Registry has structural backend registered and healthy
- **Input**: SearchRequest with modality='structural', query='async function $NAME($$$)'
- **Expected**: Router calls structural backend, returns SearchResult with meta.backendUsed='ast-grep'

#### TC-001-03: Route 'any' modality to best available backend
- **Requirement**: AC-001-02
- **Type**: positive
- **Precondition**: Registry has multiple backends across modalities
- **Input**: SearchRequest with modality='any'
- **Expected**: Router selects highest-priority healthy backend, returns results

#### TC-001-04: Fallback when requested modality unavailable
- **Requirement**: AC-001-03
- **Type**: positive
- **Precondition**: Structural backend marked unavailable, lexical available
- **Input**: SearchRequest with modality='structural'
- **Expected**: Router falls back to lexical backend, returns SearchResult with meta.degraded=true, meta.modalityUsed='lexical'

#### TC-001-05: Fallback chain exhausts all enhanced backends
- **Requirement**: AC-001-03
- **Type**: positive
- **Precondition**: All enhanced backends unavailable
- **Input**: SearchRequest with modality='structural'
- **Expected**: Falls back to grep-glob, meta.degraded=true

#### TC-001-06: Uniform result contract structure
- **Requirement**: AC-001-04
- **Type**: positive
- **Precondition**: Any backend returns results
- **Input**: Any valid SearchRequest
- **Expected**: Each hit has: filePath (string), line (number), matchType (enum), relevanceScore (0.0-1.0), contextSnippet (string)

#### TC-001-07: AST metadata included when available and requested
- **Requirement**: AC-001-04
- **Type**: positive
- **Precondition**: Structural backend available
- **Input**: SearchRequest with includeAstContext=true, modality='structural'
- **Expected**: Hits include ast field with nodeType, parentScope, symbolName

#### TC-001-08: AST metadata absent when not requested
- **Requirement**: AC-001-04
- **Type**: negative
- **Precondition**: Structural backend available
- **Input**: SearchRequest with includeAstContext=false
- **Expected**: Hits do not include ast field

#### TC-001-09: Pagination via maxResults parameter
- **Requirement**: AC-001-05
- **Type**: positive
- **Input**: SearchRequest with maxResults=5
- **Expected**: Result hits array has at most 5 elements

#### TC-001-10: Token budget limits result size
- **Requirement**: AC-001-05
- **Type**: positive
- **Input**: SearchRequest with tokenBudget=100 against large result set
- **Expected**: meta.tokenCount <= 100, lowest-relevance hits truncated

#### TC-001-11: Empty query string rejected
- **Requirement**: AC-001-01
- **Type**: negative
- **Input**: SearchRequest with query=''
- **Expected**: Throws SearchError with code='INVALID_REQUEST'

#### TC-001-12: Invalid modality rejected
- **Requirement**: AC-001-01
- **Type**: negative
- **Input**: SearchRequest with modality='nonexistent'
- **Expected**: Throws SearchError with code='INVALID_REQUEST'

#### TC-001-13: Timeout enforcement
- **Requirement**: AC-001-02
- **Type**: negative
- **Input**: SearchRequest against backend that hangs, options.timeout=100
- **Expected**: SearchError with code='TIMEOUT' after 100ms

#### TC-001-14: Force-backend override
- **Requirement**: AC-001-02
- **Type**: positive
- **Input**: SearchRequest with options.forceBackend='grep-glob'
- **Expected**: Routes to grep-glob regardless of modality preference

#### TC-001-15: Skip ranking returns raw results
- **Requirement**: AC-001-05
- **Type**: positive
- **Input**: SearchRequest with options.skipRanking=true
- **Expected**: Results returned without ranking or deduplication

#### TC-001-16: hasEnhancedSearch returns true when enhanced backends available
- **Requirement**: AC-001-02
- **Type**: positive
- **Precondition**: ast-grep registered and healthy
- **Expected**: hasEnhancedSearch() returns true

#### TC-001-17: hasEnhancedSearch returns false when only grep-glob available
- **Requirement**: AC-001-02
- **Type**: positive
- **Precondition**: Only grep-glob registered
- **Expected**: hasEnhancedSearch() returns false

#### TC-001-18: Scope parameter limits search directory
- **Requirement**: AC-001-01
- **Type**: positive
- **Input**: SearchRequest with scope='/project/src'
- **Expected**: Backend receives scoped path, results only from that directory

#### TC-001-19: File glob filter applied
- **Requirement**: AC-001-01
- **Type**: positive
- **Input**: SearchRequest with fileGlob='*.js'
- **Expected**: Results contain only .js files

#### TC-001-20: Scope path traversal blocked
- **Requirement**: AC-001-01 (security)
- **Type**: negative
- **Input**: SearchRequest with scope='../../etc'
- **Expected**: Rejects or normalizes to project root boundary

#### TC-001-21: Null query rejected
- **Requirement**: AC-001-01
- **Type**: negative
- **Input**: SearchRequest with query=null
- **Expected**: Throws SearchError with code='INVALID_REQUEST'

#### TC-001-22: Very long query string handled
- **Requirement**: AC-001-01
- **Type**: negative
- **Input**: SearchRequest with query of 10,000 characters
- **Expected**: Processes without crash (may truncate or reject with INVALID_REQUEST)

---

## FR-002: Search Backend Registry

### Unit Tests: `lib/search/registry.test.js`

#### TC-002-01: Register a new backend
- **Requirement**: AC-002-01, AC-002-02
- **Type**: positive
- **Input**: BackendDescriptor with id='ast-grep', modality='structural', priority=10
- **Expected**: Backend appears in listBackends(), getBestBackend('structural') returns it

#### TC-002-02: Five modality categories tracked
- **Requirement**: AC-002-01
- **Type**: positive
- **Input**: Register backends for lexical, structural, semantic, indexed, lsp
- **Expected**: Each modality has its registered backend retrievable

#### TC-002-03: Backend entry includes required fields
- **Requirement**: AC-002-02
- **Type**: positive
- **Input**: Registered backend
- **Expected**: Descriptor has modality, id, health, priority fields

#### TC-002-04: Health status tracking
- **Requirement**: AC-002-02
- **Type**: positive
- **Input**: updateHealth('ast-grep', 'degraded')
- **Expected**: Backend health changes from 'healthy' to 'degraded'

#### TC-002-05: Priority ordering within modality
- **Requirement**: AC-002-02
- **Type**: positive
- **Precondition**: Two lexical backends: grep-glob (priority=0), probe (priority=10)
- **Input**: getBestBackend('lexical')
- **Expected**: Returns probe (higher priority)

#### TC-002-06: Skip unhealthy backends in priority selection
- **Requirement**: AC-002-02
- **Type**: positive
- **Precondition**: probe (priority=10, health='unavailable'), grep-glob (priority=0, health='healthy')
- **Input**: getBestBackend('lexical')
- **Expected**: Returns grep-glob (highest healthy)

#### TC-002-07: loadFromConfig populates registry
- **Requirement**: AC-002-03
- **Type**: positive
- **Input**: SearchConfig with activeBackends=['grep-glob', 'ast-grep']
- **Expected**: Both backends registered after loadFromConfig()

#### TC-002-08: Runtime refresh re-populates registry
- **Requirement**: AC-002-03
- **Type**: positive
- **Input**: loadFromConfig() called twice with different configs
- **Expected**: Registry reflects latest config

#### TC-002-09: Grep-glob always registered
- **Requirement**: AC-002-04
- **Type**: positive
- **Input**: loadFromConfig with empty activeBackends
- **Expected**: grep-glob still present in registry

#### TC-002-10: Grep-glob cannot be removed
- **Requirement**: AC-002-04
- **Type**: negative
- **Input**: Attempt to remove grep-glob backend
- **Expected**: grep-glob remains in registry

#### TC-002-11: getBestBackend returns null for empty modality
- **Requirement**: AC-002-02
- **Type**: positive
- **Precondition**: No backends registered for 'semantic' modality
- **Input**: getBestBackend('semantic')
- **Expected**: Returns null

#### TC-002-12: Multiple backends per modality sorted by priority
- **Requirement**: AC-002-02
- **Type**: positive
- **Input**: Register 3 lexical backends with priorities 0, 5, 10
- **Expected**: getBestBackend returns priority 10 backend

#### TC-002-13: Duplicate backend ID registration
- **Requirement**: AC-002-02
- **Type**: negative
- **Input**: Register two backends with same ID
- **Expected**: Second registration replaces first (or rejects with error)

#### TC-002-14: Update health for non-existent backend
- **Requirement**: AC-002-02
- **Type**: negative
- **Input**: updateHealth('nonexistent', 'degraded')
- **Expected**: No-op or throws descriptive error

#### TC-002-15: listBackends returns all registered
- **Requirement**: AC-002-03
- **Type**: positive
- **Input**: Register 3 backends, call listBackends()
- **Expected**: Returns array of 3 descriptors

#### TC-002-16: Health status transitions
- **Requirement**: AC-002-02
- **Type**: positive
- **Input**: healthy -> degraded -> unavailable -> healthy
- **Expected**: Each transition succeeds, state reflects latest

#### TC-002-17: Invalid health status rejected
- **Requirement**: AC-002-02
- **Type**: negative
- **Input**: updateHealth('ast-grep', 'broken')
- **Expected**: Rejects invalid status value

#### TC-002-18: Grep-glob health is always healthy
- **Requirement**: AC-002-04
- **Type**: positive
- **Input**: updateHealth('grep-glob', 'unavailable')
- **Expected**: Health remains 'healthy' (or update is rejected)

---

## FR-003: Search Capability Detection

### Unit Tests: `lib/search/detection.test.js`

#### TC-003-01: Detect ast-grep when installed
- **Requirement**: AC-003-01
- **Type**: positive
- **Precondition**: ast-grep binary on PATH (stubbed)
- **Expected**: DetectionResult.tools includes { name: 'ast-grep', installed: true, version: '...' }

#### TC-003-02: Detect ast-grep not installed
- **Requirement**: AC-003-01
- **Type**: positive
- **Precondition**: ast-grep not on PATH (stubbed)
- **Expected**: DetectionResult.tools includes { name: 'ast-grep', installed: false }

#### TC-003-03: Detect Probe when installed
- **Requirement**: AC-003-01
- **Type**: positive
- **Precondition**: probe binary on PATH (stubbed)
- **Expected**: DetectionResult.tools includes { name: 'probe', installed: true }

#### TC-003-04: Detect available package managers
- **Requirement**: AC-003-01
- **Type**: positive
- **Precondition**: npm and brew available (stubbed)
- **Expected**: Each tool's installMethods reflects available managers

#### TC-003-05: Classify small project (<10K files)
- **Requirement**: AC-003-02
- **Type**: positive
- **Input**: Project root with 500 files
- **Expected**: scaleTier='small'

#### TC-003-06: Classify medium project (10K-100K files)
- **Requirement**: AC-003-02
- **Type**: positive
- **Input**: Project root with 50,000 files (simulated)
- **Expected**: scaleTier='medium'

#### TC-003-07: Classify large project (100K-500K files)
- **Requirement**: AC-003-02
- **Type**: positive
- **Input**: Project root with 200,000 files (simulated metadata)
- **Expected**: scaleTier='large'

#### TC-003-08: Detect existing MCP configurations
- **Requirement**: AC-003-03
- **Type**: positive
- **Precondition**: .claude/settings.json has mcpServers entry
- **Input**: detectSearchCapabilities(projectRoot)
- **Expected**: existingMcpServers includes existing server names

#### TC-003-09: Respect existing MCP configurations
- **Requirement**: AC-003-03
- **Type**: positive
- **Precondition**: ast-grep MCP already configured
- **Expected**: Recommendations do not re-recommend ast-grep

#### TC-003-10: Report findings with recommendations
- **Requirement**: AC-003-04
- **Type**: positive
- **Input**: Medium project, ast-grep not installed
- **Expected**: recommendations includes ast-grep with reason and priority

#### TC-003-11: Empty project directory
- **Requirement**: AC-003-02
- **Type**: negative
- **Input**: Empty directory as project root
- **Expected**: scaleTier='small', fileCount=0

#### TC-003-12: Non-existent project directory
- **Requirement**: AC-003-02
- **Type**: negative
- **Input**: Path that does not exist
- **Expected**: Throws or returns error result gracefully

#### TC-003-13: Detection with no tools installed
- **Requirement**: AC-003-01
- **Type**: positive
- **Precondition**: No enhanced tools on PATH
- **Expected**: All tools show installed=false, grep-glob not listed (it is built-in)

#### TC-003-14: Scale tier boundary at 10K files
- **Requirement**: AC-003-02
- **Type**: positive
- **Input**: Exactly 10,000 files
- **Expected**: Consistent classification (small or medium per boundary rule)

---

## FR-004: Search Tool Installation

### Unit Tests: `lib/search/install.test.js`

#### TC-004-01: Successful tool installation
- **Requirement**: AC-004-01, AC-004-02
- **Type**: positive
- **Input**: Recommendation for ast-grep, user consents
- **Expected**: InstallResult with success=true, version populated

#### TC-004-02: User declines installation
- **Requirement**: AC-004-02
- **Type**: positive
- **Input**: Recommendation for ast-grep, user declines
- **Expected**: InstallResult with success=false, no install command executed

#### TC-004-03: Selective acceptance
- **Requirement**: AC-004-02
- **Type**: positive
- **Input**: Two recommendations, user accepts ast-grep, declines Probe
- **Expected**: Only ast-grep installed

#### TC-004-04: Installation failure reported
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: Install command exits with error
- **Expected**: InstallResult with success=false, error message populated

#### TC-004-05: Failed installation falls back
- **Requirement**: AC-004-04
- **Type**: positive
- **Precondition**: Primary install method fails
- **Expected**: Tries alternative install method if available, or fallbackAvailable=true

#### TC-004-06: No-search-setup flag skips everything
- **Requirement**: AC-004-05
- **Type**: positive
- **Input**: --no-search-setup flag set
- **Expected**: No detection or installation occurs

#### TC-004-07: Installation does not block setup
- **Requirement**: AC-004-04
- **Type**: positive
- **Input**: All installations fail
- **Expected**: Setup continues, grep-glob baseline configured

#### TC-004-08: Recommendation includes explanation
- **Requirement**: AC-004-01
- **Type**: positive
- **Input**: ToolRecommendation for ast-grep
- **Expected**: reason field describes what tool does and why recommended

#### TC-004-09: MCP server configuration after install
- **Requirement**: AC-004-01 (implied)
- **Type**: positive
- **Input**: ast-grep successfully installed
- **Expected**: configureMcpServers() adds entry to settings.json

#### TC-004-10: Permission denied installation
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: npm install -g fails with EACCES
- **Expected**: Error reported with INSTALL_PERMISSION_DENIED code

#### TC-004-11: Network failure during installation
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: npm install fails with network error
- **Expected**: Error reported with INSTALL_NETWORK_FAILURE code

#### TC-004-12: Unsupported platform
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: Tool not available for current OS
- **Expected**: Error reported with INSTALL_UNSUPPORTED_PLATFORM code

#### TC-004-13: Missing package manager
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: Tool requires cargo, cargo not installed
- **Expected**: Error reported, fallback to npm if available

#### TC-004-14: Partial success (some tools install, others fail)
- **Requirement**: AC-004-04
- **Type**: positive
- **Input**: ast-grep installs, Probe fails
- **Expected**: ast-grep configured, Probe failure reported, setup continues

#### TC-004-15: Version conflict during installation
- **Requirement**: AC-004-03
- **Type**: negative
- **Input**: Existing incompatible version detected
- **Expected**: INSTALL_VERSION_CONFLICT reported

#### TC-004-16: Consent callback receives correct tool info
- **Requirement**: AC-004-01
- **Type**: positive
- **Input**: installTool called with recommendation
- **Expected**: onConsent callback receives tool name, description, install command

---

## FR-005: MCP Server Configuration

### Unit Tests: `lib/search/install.test.js` (configureMcpServers section)

#### TC-005-01: Add MCP server entry to settings.json
- **Requirement**: AC-005-01
- **Type**: positive
- **Input**: InstalledBackend for ast-grep
- **Expected**: settings.json mcpServers has 'ast-grep' entry with command, args, env

#### TC-005-02: Preserve existing MCP configurations
- **Requirement**: AC-005-02
- **Type**: positive
- **Precondition**: settings.json has existing 'other-mcp' server
- **Input**: Configure ast-grep MCP
- **Expected**: 'other-mcp' entry unchanged, 'ast-grep' added

#### TC-005-03: Configuration includes correct fields
- **Requirement**: AC-005-03
- **Type**: positive
- **Input**: Configure Probe MCP
- **Expected**: Entry has command='probe-mcp', args=['--workspace', projectRoot], env={}

#### TC-005-04: Remove MCP configuration on opt-out
- **Requirement**: AC-005-04
- **Type**: positive
- **Precondition**: settings.json has 'ast-grep' MCP entry
- **Input**: User opts out of ast-grep
- **Expected**: 'ast-grep' entry removed, other entries preserved

#### TC-005-05: Create settings.json if not exists
- **Requirement**: AC-005-01
- **Type**: positive
- **Precondition**: No .claude/settings.json file
- **Input**: Configure ast-grep MCP
- **Expected**: settings.json created with mcpServers section

#### TC-005-06: Handle corrupt settings.json
- **Requirement**: AC-005-02
- **Type**: negative
- **Precondition**: settings.json contains invalid JSON
- **Input**: Attempt to configure MCP
- **Expected**: Original file preserved (backup), error reported (CONFIG_SETTINGS_CORRUPT)

#### TC-005-07: Conflict with existing MCP server name
- **Requirement**: AC-005-02
- **Type**: negative
- **Precondition**: settings.json has 'ast-grep' with different configuration
- **Input**: Configure ast-grep MCP with new config
- **Expected**: Existing config preserved, CONFIG_MCP_CONFLICT reported

#### TC-005-08: Multiple backends configured at once
- **Requirement**: AC-005-01
- **Type**: positive
- **Input**: [ast-grep, probe] backends
- **Expected**: Both entries added to mcpServers

---

## FR-006: Graceful Degradation with Notification

### Unit Tests: `lib/search/router.test.js` (degradation section)

#### TC-006-01: Health check before routing
- **Requirement**: AC-006-01
- **Type**: positive
- **Precondition**: Backend marked unhealthy in registry
- **Input**: Search request targeting that backend
- **Expected**: Router skips unhealthy backend, checks next

#### TC-006-02: Fallback to next backend in priority order
- **Requirement**: AC-006-02
- **Type**: positive
- **Precondition**: Primary backend unhealthy, secondary healthy
- **Input**: Search request
- **Expected**: Routes to secondary backend

#### TC-006-03: User notification on degradation (first occurrence)
- **Requirement**: AC-006-03
- **Type**: positive
- **Precondition**: Enhanced backend fails for first time in session
- **Expected**: Notification emitted with message containing "falling back to standard search"

#### TC-006-04: Notification not repeated in same session
- **Requirement**: AC-006-03
- **Type**: positive
- **Precondition**: Degradation notification already sent
- **Input**: Second degradation event in same session
- **Expected**: No duplicate notification

#### TC-006-05: Degradation does not block workflow
- **Requirement**: AC-006-04
- **Type**: positive
- **Input**: All enhanced backends fail
- **Expected**: Search completes via grep-glob, no throw, no halt

#### TC-006-06: Health transitions from healthy to degraded
- **Requirement**: AC-006-01
- **Type**: positive
- **Input**: Backend returns timeout
- **Expected**: Backend marked 'degraded' in registry

#### TC-006-07: Health transitions from degraded to unavailable
- **Requirement**: AC-006-01
- **Type**: positive
- **Input**: Backend fails health check completely
- **Expected**: Backend marked 'unavailable' in registry

#### TC-006-08: Multiple backends fail in sequence
- **Requirement**: AC-006-02
- **Type**: positive
- **Precondition**: 3 backends: structural (fails), enhanced-lexical (fails), lexical (healthy)
- **Input**: Search request with modality='structural'
- **Expected**: Falls through all failed backends to lexical, meta.degraded=true

---

## FR-007: Structural Search Backend (ast-grep)

### Unit Tests: `lib/search/backends/structural.test.js`

#### TC-007-01: Install and configure ast-grep MCP
- **Requirement**: AC-007-01
- **Type**: positive
- **Input**: ast-grep installed on system
- **Expected**: Backend adapter created with correct MCP configuration

#### TC-007-02: Structural query routing
- **Requirement**: AC-007-02
- **Type**: positive
- **Input**: SearchRequest with modality='structural', query='console.log($$$)'
- **Expected**: Query translated to ast-grep pattern format and executed

#### TC-007-03: Results include AST context
- **Requirement**: AC-007-03
- **Type**: positive
- **Input**: Structural search returning matches
- **Expected**: Each hit has ast field with nodeType, parentScope, file location

#### TC-007-04: JavaScript language support
- **Requirement**: AC-007-04
- **Type**: positive
- **Input**: Search JavaScript files for async functions
- **Expected**: Matches found in .js files

#### TC-007-05: TypeScript language support
- **Requirement**: AC-007-04
- **Type**: positive
- **Input**: Search TypeScript files for interface declarations
- **Expected**: Matches found in .ts files

#### TC-007-06: Python language support
- **Requirement**: AC-007-04
- **Type**: positive
- **Input**: Search Python files for class definitions
- **Expected**: Matches found in .py files

#### TC-007-07: Health check when MCP unavailable
- **Requirement**: AC-007-01
- **Type**: negative
- **Input**: ast-grep MCP server not running
- **Expected**: healthCheck() returns 'unavailable'

#### TC-007-08: Health check when MCP healthy
- **Requirement**: AC-007-01
- **Type**: positive
- **Input**: ast-grep MCP server responding
- **Expected**: healthCheck() returns 'healthy'

#### TC-007-09: Health check timeout enforcement
- **Requirement**: AC-007-01
- **Type**: negative
- **Input**: MCP server hangs
- **Expected**: healthCheck() returns 'unavailable' within 2000ms

#### TC-007-10: Result normalization to uniform contract
- **Requirement**: AC-007-03
- **Type**: positive
- **Input**: Raw ast-grep MCP response
- **Expected**: Normalized to RawSearchHit with filePath, line, matchContent, ast

---

## FR-008: Enhanced Lexical Search Backend (Probe)

### Unit Tests: `lib/search/backends/enhanced-lexical.test.js`

#### TC-008-01: Install and configure Probe MCP
- **Requirement**: AC-008-01
- **Type**: positive
- **Input**: Probe installed on system
- **Expected**: Backend adapter created with correct MCP configuration

#### TC-008-02: Route lexical queries with structural hints to Probe
- **Requirement**: AC-008-02
- **Type**: positive
- **Precondition**: Probe registered with higher priority than grep-glob
- **Input**: SearchRequest with modality='lexical'
- **Expected**: Routes to Probe (priority 10 > grep-glob priority 0)

#### TC-008-03: Results include relevance ranking and tree-sitter context
- **Requirement**: AC-008-03
- **Type**: positive
- **Input**: Probe search results
- **Expected**: Hits have relevanceScore and ast context from tree-sitter

#### TC-008-04: Fallback to grep-glob when Probe unavailable
- **Requirement**: AC-008-04
- **Type**: positive
- **Precondition**: Probe marked unavailable
- **Input**: Lexical search request
- **Expected**: Falls back to grep-glob, meta.degraded=true

#### TC-008-05: Health check when MCP unavailable
- **Requirement**: AC-008-01
- **Type**: negative
- **Input**: Probe MCP server not running
- **Expected**: healthCheck() returns 'unavailable'

#### TC-008-06: Health check when MCP healthy
- **Requirement**: AC-008-01
- **Type**: positive
- **Expected**: healthCheck() returns 'healthy'

#### TC-008-07: Result normalization
- **Requirement**: AC-008-03
- **Type**: positive
- **Input**: Raw Probe MCP response
- **Expected**: Normalized to RawSearchHit with BM25 relevanceScore

#### TC-008-08: Health check timeout enforcement
- **Requirement**: AC-008-01
- **Type**: negative
- **Input**: Probe MCP server hangs
- **Expected**: healthCheck() returns 'unavailable' within 2000ms

#### TC-008-09: Probe unavailable, grep-glob returns results
- **Requirement**: AC-008-04
- **Type**: positive
- **Input**: Lexical query after Probe fails
- **Expected**: grep-glob results returned in uniform contract

#### TC-008-10: Priority ordering between Probe and grep-glob
- **Requirement**: AC-008-02
- **Type**: positive
- **Expected**: Probe.priority (10) > grep-glob.priority (0)

---

## FR-009: Agent Migration Path

### Unit Tests: `lib/search/router.test.js` (migration section)

#### TC-009-01: Grep-glob wrapped as lexical backend from day one
- **Requirement**: AC-009-01
- **Type**: positive
- **Precondition**: Fresh installation, no enhanced backends
- **Input**: SearchRequest with modality='lexical'
- **Expected**: Routes to grep-glob adapter, returns normalized results

#### TC-009-02: Non-migrated agents can use Grep/Glob directly
- **Requirement**: AC-009-02
- **Type**: positive
- **Expected**: Direct Grep/Glob tool calls remain functional (no change to Claude Code runtime)

#### TC-009-03: Incremental migration does not break existing agents
- **Requirement**: AC-009-02
- **Type**: positive
- **Precondition**: Some agents use abstraction, others use Grep/Glob directly
- **Expected**: Both paths produce valid results concurrently

#### TC-009-04: Migration guide covers search abstraction call format
- **Requirement**: AC-009-04
- **Type**: positive
- **Expected**: Documentation artifact describes before/after migration pattern (documentation test)

---

## FR-010: Search Configuration Management

### Unit Tests: `lib/search/config.test.js`

#### TC-010-01: View current search configuration
- **Requirement**: AC-010-01
- **Type**: positive
- **Input**: readSearchConfig(projectRoot)
- **Expected**: Returns SearchConfig with enabled, activeBackends, scaleTier

#### TC-010-02: Disable specific backend
- **Requirement**: AC-010-02
- **Type**: positive
- **Input**: Update config to disable 'ast-grep'
- **Expected**: ast-grep removed from activeBackends, other backends unchanged

#### TC-010-03: Re-run detection picks up new tools
- **Requirement**: AC-010-03
- **Type**: positive
- **Precondition**: New tool installed since last detection
- **Input**: detectSearchCapabilities(projectRoot)
- **Expected**: Newly installed tool appears in detection results

#### TC-010-04: Reset to grep-glob baseline
- **Requirement**: AC-010-04
- **Type**: positive
- **Input**: Reset configuration
- **Expected**: Only grep-glob in activeBackends, enhanced=false

#### TC-010-05: Read config when file missing
- **Requirement**: AC-010-01
- **Type**: negative
- **Precondition**: No .isdlc/search-config.json
- **Input**: readSearchConfig(projectRoot)
- **Expected**: Returns default config (enabled=true, grep-glob only)

#### TC-010-06: Read config when file corrupt
- **Requirement**: AC-010-01
- **Type**: negative
- **Precondition**: search-config.json contains invalid JSON
- **Input**: readSearchConfig(projectRoot)
- **Expected**: Returns default config, logs warning

#### TC-010-07: Write and re-read config round-trip
- **Requirement**: AC-010-01
- **Type**: positive
- **Input**: Write config, read it back
- **Expected**: Read config matches written config exactly

#### TC-010-08: Write config when .isdlc directory missing
- **Requirement**: AC-010-01
- **Type**: negative
- **Input**: writeSearchConfig to non-existent directory
- **Expected**: Directory created or error reported gracefully

#### TC-010-09: Config preserves cloudAllowed setting
- **Requirement**: AC-010-02
- **Type**: positive
- **Input**: Set cloudAllowed=true, write, read
- **Expected**: cloudAllowed=true persisted

#### TC-010-10: Config preserves backendConfigs
- **Requirement**: AC-010-02
- **Type**: positive
- **Input**: Set per-backend options, write, read
- **Expected**: Backend-specific options preserved

#### TC-010-11: Config preferredModality defaults to 'any'
- **Requirement**: AC-010-01
- **Type**: positive
- **Input**: Default config
- **Expected**: preferredModality='any' or 'lexical' as sensible default

#### TC-010-12: Disable all enhanced backends
- **Requirement**: AC-010-02
- **Type**: positive
- **Input**: Disable all backends except grep-glob
- **Expected**: Config shows enabled=true (search still works), only grep-glob active

---

## FR-011: Result Ranking and Token Budget

### Unit Tests: `lib/search/ranker.test.js`

#### TC-011-01: Results ranked by relevance score
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: 5 hits with scores [0.3, 0.9, 0.1, 0.7, 0.5]
- **Expected**: Returned in order [0.9, 0.7, 0.5, 0.3, 0.1]

#### TC-011-02: BM25 post-processing when no backend score
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: Hits without relevanceScore
- **Expected**: Ranker assigns BM25-based scores, results sorted

#### TC-011-03: Token budget truncation
- **Requirement**: AC-011-02, AC-011-03
- **Type**: positive
- **Input**: 10 hits totaling 5000 tokens, tokenBudget=2000
- **Expected**: Lowest-relevance hits removed until under 2000 tokens

#### TC-011-04: Deduplication removes identical matches
- **Requirement**: AC-011-04
- **Type**: positive
- **Input**: Hits with duplicate (filePath, line) pairs
- **Expected**: Duplicates removed, highest-scoring duplicate kept

#### TC-011-05: Token budget = 0 returns empty
- **Requirement**: AC-011-02
- **Type**: negative
- **Input**: tokenBudget=0
- **Expected**: Empty result set (or all results if 0 means unlimited)

#### TC-011-06: Token budget very large
- **Requirement**: AC-011-02
- **Type**: positive
- **Input**: tokenBudget=Number.MAX_SAFE_INTEGER
- **Expected**: All results returned (no truncation)

#### TC-011-07: No hits returns empty array
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: Empty hits array
- **Expected**: Returns empty array, no error

#### TC-011-08: Single hit returned as-is
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: Array with one hit
- **Expected**: Same hit returned with score preserved

#### TC-011-09: Deduplication across search passes
- **Requirement**: AC-011-04
- **Type**: positive
- **Input**: Hits from two different backends with overlapping file matches
- **Expected**: Duplicates deduplicated, best score kept

#### TC-011-10: Mixed scored and unscored hits
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: Some hits have relevanceScore, others do not
- **Expected**: All hits ranked (unscored get fallback score), sorted correctly

#### TC-011-11: Token count estimation accuracy
- **Requirement**: AC-011-02
- **Type**: positive
- **Input**: Known string content
- **Expected**: Token estimate within reasonable bounds (e.g., chars/4 heuristic)

#### TC-011-12: Ranking stability (equal scores)
- **Requirement**: AC-011-01
- **Type**: positive
- **Input**: Multiple hits with identical relevance scores
- **Expected**: Order is deterministic (stable sort)

#### TC-011-13: Very large result set performance
- **Requirement**: AC-011-03
- **Type**: positive
- **Input**: 10,000 hits
- **Expected**: rankAndBound completes in < 100ms

#### TC-011-14: Deduplication with different match types
- **Requirement**: AC-011-04
- **Type**: positive
- **Input**: Same file/line matched as 'exact' and 'structural'
- **Expected**: Kept as single hit with higher score

#### TC-011-15: Token budget edge case: single large hit exceeds budget
- **Requirement**: AC-011-03
- **Type**: negative
- **Input**: One hit with 5000 tokens, budget=1000
- **Expected**: Hit still returned (at least one result) or empty with appropriate meta

---

## Integration Tests

### File: `lib/search/integration.test.js`

#### TC-INT-01: Full lexical search flow
- **Requirement**: FR-001, FR-002, FR-011
- **Type**: positive
- **Modules**: router.js + registry.js + ranker.js + lexical.js
- **Input**: Search request against temp directory with known files
- **Expected**: Returns ranked, normalized results from grep-glob

#### TC-INT-02: Router-Registry backend selection
- **Requirement**: FR-001, FR-002
- **Type**: positive
- **Modules**: router.js + registry.js
- **Input**: Multiple backends registered, request for specific modality
- **Expected**: Correct backend selected based on priority and health

#### TC-INT-03: Degradation flow end-to-end
- **Requirement**: FR-006
- **Type**: positive
- **Modules**: router.js + registry.js + all backends
- **Input**: Enhanced backend fails mid-request
- **Expected**: Fallback occurs, results returned from fallback backend, notification emitted

#### TC-INT-04: Detection-Install-Config pipeline
- **Requirement**: FR-003, FR-004, FR-005
- **Type**: positive
- **Modules**: detection.js + install.js + config.js
- **Input**: Fresh project, tools detected
- **Expected**: Detection drives install, install drives config, config persisted

#### TC-INT-05: Config persistence across sessions
- **Requirement**: FR-010
- **Type**: positive
- **Modules**: config.js + registry.js
- **Input**: Write config, create new registry, loadFromConfig
- **Expected**: Registry state matches persisted config

#### TC-INT-06: Token budget enforcement through full pipeline
- **Requirement**: FR-011
- **Type**: positive
- **Modules**: router.js + ranker.js + lexical.js
- **Input**: Search with tokenBudget=500 against many files
- **Expected**: meta.tokenCount <= 500

#### TC-INT-07: MCP server configuration end-to-end
- **Requirement**: FR-005
- **Type**: positive
- **Modules**: install.js + config.js
- **Input**: Install backend, configure MCP
- **Expected**: settings.json reflects correct MCP configuration

#### TC-INT-08: Multiple search requests share registry state
- **Requirement**: FR-002
- **Type**: positive
- **Modules**: router.js + registry.js
- **Input**: Two sequential search requests
- **Expected**: Registry state (health, backends) consistent across requests

---

## E2E Tests

### File: `tests/e2e/search-setup.test.js`

#### TC-E2E-01: Fresh setup with detection and install
- **Requirement**: UJ-01
- **Type**: positive
- **Input**: New project directory, run search detection
- **Expected**: Tools detected, recommendations generated, config written

#### TC-E2E-02: Search with fallback to grep-glob
- **Requirement**: UJ-02
- **Type**: positive
- **Precondition**: Enhanced backends not available
- **Input**: Execute search through abstraction layer
- **Expected**: grep-glob results returned, meta.degraded indicates baseline mode

#### TC-E2E-03: Opt-out with --no-search-setup
- **Requirement**: UJ-03
- **Type**: positive
- **Input**: Init with --no-search-setup flag
- **Expected**: No detection, no install, grep-glob baseline only

#### TC-E2E-04: Disable and re-enable backend
- **Requirement**: UJ-04
- **Type**: positive
- **Input**: Disable ast-grep, verify search works, re-enable, verify routing resumes
- **Expected**: Each state produces correct behavior

---

## Error Handling Tests

### File: `lib/search/router.test.js` (error handling section)

#### TC-ERR-01: SEARCH_BACKEND_UNAVAILABLE handled internally
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: Backend throws SEARCH_BACKEND_UNAVAILABLE
- **Expected**: Router falls back, does not propagate error to caller

#### TC-ERR-02: SEARCH_BACKEND_TIMEOUT handled internally
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: Backend exceeds timeout
- **Expected**: Router marks backend degraded, falls back

#### TC-ERR-03: SEARCH_ALL_ENHANCED_FAILED falls to grep-glob
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: All enhanced backends fail
- **Expected**: grep-glob serves request, notification emitted

#### TC-ERR-04: SEARCH_INVALID_REQUEST surfaces to caller
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: Malformed SearchRequest
- **Expected**: SearchError with code='INVALID_REQUEST' thrown to caller

#### TC-ERR-05: SEARCH_RESULT_EMPTY returns empty set
- **Requirement**: Error taxonomy
- **Type**: positive
- **Input**: Query that matches nothing
- **Expected**: { hits: [], meta: { ... } } -- no error

#### TC-ERR-06: SEARCH_TOKEN_BUDGET_EXCEEDED truncates
- **Requirement**: Error taxonomy
- **Type**: positive
- **Input**: Results exceed budget
- **Expected**: Truncated results, meta.totalHitsBeforeRanking shows original count

#### TC-ERR-07: CONFIG_SETTINGS_READ_FAIL uses defaults
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: Unreadable settings.json
- **Expected**: Default config used, warning logged

#### TC-ERR-08: CONFIG_SETTINGS_CORRUPT preserves original
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: Corrupt settings.json
- **Expected**: Original file not overwritten, error reported

#### TC-ERR-09: MCP_SERVER_START_FAIL marks unavailable
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: MCP server fails to start
- **Expected**: Backend marked unavailable, fallback engaged

#### TC-ERR-10: MCP_PROTOCOL_ERROR treated as unavailable for request
- **Requirement**: Error taxonomy
- **Type**: negative
- **Input**: MCP server returns malformed response
- **Expected**: This request falls back, backend remains available for retry on next request

---

## Security Tests

### File: `lib/search/router.test.js` (security section)

#### TC-SEC-01: Path traversal in scope parameter
- **Requirement**: Security
- **Type**: negative
- **Input**: scope='../../etc/passwd'
- **Expected**: Rejected or normalized to project root

#### TC-SEC-02: Command injection in MCP config
- **Requirement**: Security
- **Type**: negative
- **Input**: Backend command containing shell metacharacters
- **Expected**: Command sanitized or rejected

#### TC-SEC-03: Search queries not logged to state.json
- **Requirement**: Security
- **Type**: negative
- **Input**: Execute search with sensitive query
- **Expected**: Query text does not appear in state.json

#### TC-SEC-04: Null bytes in query string
- **Requirement**: Security
- **Type**: negative
- **Input**: query='test\x00malicious'
- **Expected**: Rejected or sanitized

#### TC-SEC-05: Settings.json permissions preserved
- **Requirement**: Security
- **Type**: positive
- **Input**: Write to settings.json
- **Expected**: File permissions unchanged from original

---

## Summary

| Category | Count |
|----------|-------|
| FR-001 (Search Abstraction) | 22 |
| FR-002 (Backend Registry) | 18 |
| FR-003 (Capability Detection) | 14 |
| FR-004 (Tool Installation) | 16 |
| FR-005 (MCP Configuration) | 8 |
| FR-006 (Graceful Degradation) | 8 |
| FR-007 (Structural Backend) | 10 |
| FR-008 (Enhanced Lexical) | 10 |
| FR-009 (Agent Migration) | 4 |
| FR-010 (Config Management) | 12 |
| FR-011 (Ranking & Budget) | 15 |
| Integration Tests | 8 |
| E2E Tests | 4 |
| Error Handling Tests | 10 |
| Security Tests | 5 |
| **Total** | **164** |

Note: 5 additional tests will be added during implementation for boundary conditions discovered during TDD. Target total: ~169.
