# Test Cases: Team Continuity Memory (REQ-0066)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0066
**Last Updated**: 2026-03-15
**Total New Test Cases**: 100 (78 unit + 18 integration + 4 performance)

---

## 1. Unit Tests: `memory-search.js` (32 tests)

### 1.1 Hybrid Search — searchMemory() with codebase index (FR-001)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| HS-001 | searches codebase index when codebaseIndexPath provided | FR-001 | AC-001-01 | positive | Given a codebase .emb index mock, when searchMemory() called with codebaseIndexPath, then codebaseResults[] contains results tagged with layer:'codebase' |
| HS-002 | tags codebase results with layer codebase | FR-001 | AC-001-01 | positive | Given codebase search returns results, then each result has layer:'codebase', filePath, and chunkId fields |
| HS-003 | runs all three searches in parallel via Promise.allSettled | FR-001 | AC-001-02 | positive | Given all three stores provided, when one store search is slow (delayed mock), then all three results are still collected |
| HS-004 | continues when codebase search fails | FR-001 | AC-001-02 | negative | Given codebase store throws, when searchMemory() executes, then memory results are returned without error |
| HS-005 | applies maxResultsPerSource limit per source | FR-001 | AC-001-03 | positive | Given 10 results per source, when maxResultsPerSource=3, then at most 3 from each source in results |
| HS-006 | defaults maxResultsPerSource to 5 | FR-001 | AC-001-03 | positive | Given no maxResultsPerSource specified, when results returned, then at most 5 per source |
| HS-007 | ranks merged results by score | FR-001 | AC-001-03 | positive | Given results from all sources, then merged results are sorted by score descending |
| HS-008 | returns memory-only when codebase index missing | FR-001 | AC-001-04 | negative | Given codebaseIndexPath points to non-existent file, when searchMemory() called, then codebaseResults:[] and memory results returned |
| HS-009 | returns memory-only when codebase index corrupted | FR-001 | AC-001-04 | negative | Given codebase store creation throws, then codebaseResults:[] and no error propagated |
| HS-010 | backward compatible without codebaseIndexPath | FR-001 | AC-001-05 | positive | Given no codebaseIndexPath provided, when searchMemory() called, then behavior identical to REQ-0064 (returns MemorySearchResult[], no codebaseResults) |
| HS-011 | returns HybridSearchResult shape with sources metadata | FR-001 | AC-001-01 | positive | Given hybrid search completes, then result has { results, codebaseResults, profile, sources: { memory, codebase, profile } } |

### 1.2 Team Profile Loading (FR-002)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| HS-012 | loads team profile when includeProfile true and file exists | FR-002 | AC-002-02 | positive | Given team-profile.json exists at profilePath, when includeProfile:true, then result.profile contains static and dynamic arrays |
| HS-013 | returns profile null when file missing | FR-002 | AC-002-03 | negative | Given profilePath points to non-existent file, then result.profile is null, no error |
| HS-014 | returns profile null when file is invalid JSON | FR-002 | AC-002-03 | negative | Given profilePath points to corrupted JSON file, then result.profile is null, no error |
| HS-015 | skips profile load when includeProfile false | FR-002 | AC-002-02 | positive | Given includeProfile:false, then result.profile is undefined/null, no file read attempted |
| HS-016 | defaults includeProfile to true | FR-002 | AC-002-02 | positive | Given no includeProfile specified, when profilePath exists, then profile is loaded |

### 1.3 Link Traversal — traverseLinks() (FR-006)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| HS-017 | fetches linked chunks and attaches as linkedMemories | FR-006 | AC-006-01 | positive | Given results with links[], when traverseLinks runs, then linkedMemories[] populated on each parent |
| HS-018 | skips broken links silently | FR-006 | AC-006-02 | negative | Given link targetChunkId not in store, when traversal runs, then broken link skipped, no error |
| HS-019 | attaches as linkedMemories not in main results | FR-006 | AC-006-03 | positive | Given linked chunks fetched, then they appear in result.linkedMemories[] not in top-level results[] |
| HS-020 | deduplicates linked chunks across results | FR-006 | AC-006-04 | positive | Given same chunkId linked from 2 results, when traversal runs, then chunk fetched once (getByIds called with deduplicated list) |
| HS-021 | skips traversal when traverseLinks false | FR-006 | AC-006-05 | positive | Given traverseLinks:false, then no linkedMemories[] on results, no store.getByIds called |
| HS-022 | defaults traverseLinks to true | FR-006 | AC-006-01 | positive | Given no traverseLinks option, when results have links, then linked chunks are fetched |
| HS-023 | handles results with empty links array | FR-006 | AC-006-01 | positive | Given result has links:[], then linkedMemories is empty array, no getByIds call |
| HS-024 | handles results with no links field | FR-006 | AC-006-01 | positive | Given result has no links property, then linkedMemories is empty, no error |

### 1.4 Lineage Tracking — formatHybridMemoryContext() (FR-008)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| HS-025 | formats profile static and dynamic sections | FR-002 | AC-002-02 | positive | Given HybridSearchResult with profile, then output includes "--- team-profile (static) ---" and "--- team-profile (dynamic) ---" sections |
| HS-026 | formats memory results with score and layer | FR-001 | AC-001-01 | positive | Given memory results, then output includes "--- memory (score: N.NN, layer: user|project) ---" |
| HS-027 | formats codebase results with file path | FR-001 | AC-001-01 | positive | Given codebase results, then output includes "--- codebase (score: N.NN, file: path) ---" |
| HS-028 | includes linked memory relationship context | FR-008 | AC-008-04 | positive | Given linked memories with relationType, then output includes "[builds_on] linked content" |
| HS-029 | formats supersedes relationship in lineage | FR-008 | AC-008-03 | positive | Given linked memory with relationType:supersedes, then output includes "[supersedes] content" |
| HS-030 | returns empty string when all sources empty | FR-001 | AC-001-04 | positive | Given empty results, codebaseResults, and null profile, then returns '' |
| HS-031 | omits profile section when profile null | FR-002 | AC-002-03 | positive | Given profile is null, then no "--- team-profile" sections in output |
| HS-032 | handles all sources empty gracefully | FR-001 | AC-001-04 | negative | Given { results:[], codebaseResults:[], profile:null }, then returns empty string |

---

## 2. Unit Tests: `memory-embedder.js` (24 tests)

### 2.1 Search-Driven Link Creation (FR-005)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| ME-029 | creates related_to links for similarity 0.70-0.84 | FR-005 | AC-005-01 | positive | Given new chunk embedded, when store search returns matches with similarity in [0.70, 0.84], then bidirectional related_to links created |
| ME-030 | skips links below 0.70 similarity | FR-005 | AC-005-01 | negative | Given matches with similarity 0.69, then no links created |
| ME-031 | skips links above 0.84 similarity | FR-005 | AC-005-01 | negative | Given matches with similarity 0.85, then no links created (these are near-duplicates handled by dedup) |
| ME-032 | enforces max 5 links per chunk | FR-005 | AC-005-02 | positive | Given chunk already has 5 links, when search finds more matches, then no additional links created |
| ME-033 | link creation failure is non-blocking | FR-005 | AC-005-03 | negative | Given updateLinks throws, when embedder continues, then embedding result.embedded is true, error not propagated |
| ME-034 | respects createLinks false opt-out | FR-005 | AC-005-04 | positive | Given createLinks:false, then no search-driven links created, linksCreated:0 |
| ME-035 | creates bidirectional links | FR-005 | AC-005-01 | positive | Given link created on new chunk, then inverse link also created on matched chunk via updateLinks |
| ME-036 | counts links created in result | FR-005 | AC-005-01 | positive | Given 3 link pairs created, then result.linksCreated === 6 (3 forward + 3 inverse) |

### 2.2 Curator-Driven Link Creation (FR-004)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| ME-037 | creates builds_on link from curator hint | FR-004 | AC-004-02 | positive | Given chunk with relationship_hint:'builds_on' and matched existing chunk, then builds_on link created with createdBy:'curator' |
| ME-038 | creates contradicts link from curator hint | FR-004 | AC-004-02 | positive | Given relationship_hint:'contradicts', then contradicts link created |
| ME-039 | creates supersedes link from curator hint | FR-004 | AC-004-02 | positive | Given relationship_hint:'supersedes', then supersedes link created |
| ME-040 | creates inverse link on target chunk | FR-004 | AC-004-03 | positive | Given builds_on link on new chunk, then inverse builds_on link created on target chunk |
| ME-041 | supersedes creates inverse on target | FR-004 | AC-004-03 | positive | Given supersedes link on new chunk, then supersedes inverse link on target with reversed direction |
| ME-042 | no link created for null hint | FR-004 | AC-004-04 | positive | Given relationship_hint:null, then no curator-driven links created |
| ME-043 | no link created for existing REQ-0064 hints | FR-004 | AC-004-04 | positive | Given relationship_hint:'updates' or 'extends', then no new-style curator links created (backward compat) |

### 2.3 Session Linking (FR-007)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| ME-044 | creates session links for similarity > 0.60 | FR-007 | AC-007-02 | positive | Given past session with summary similarity > 0.60, then session-links.json entry created |
| ME-045 | skips sessions below threshold | FR-007 | AC-007-02 | negative | Given past session with similarity 0.55, then no session link created |
| ME-046 | reads last 10 past sessions | FR-007 | AC-007-01 | positive | Given 15 session files, when session linking runs, then only last 10 compared |
| ME-047 | session link format matches schema | FR-007 | AC-007-03 | positive | Given session link created, then JSON contains { sessionId, relatedSessions: [{ sessionId, similarity, createdAt }] } |
| ME-048 | session linking failure is non-blocking | FR-007 | AC-007-04 | negative | Given session file read throws, then embedding completes, result.sessionLinksCreated remains 0 |

### 2.4 Team Profile Recomputation (FR-002)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| ME-049 | recomputes profile with static and dynamic segments | FR-002 | AC-002-01 | positive | Given stores with entries, when recomputeProfile:true, then team-profile.json written with static (high-value) and dynamic (recent) entries |
| ME-050 | static segment filters by appeared_count and accessed_count | FR-002 | AC-002-04 | positive | Given entries with varied counts, then static only includes appeared_count>3 AND accessed_count>5 |
| ME-051 | dynamic segment contains last 5 sessions | FR-002 | AC-002-04 | positive | Given 10 session entries, then dynamic contains last 5 by timestamp |
| ME-052 | profile recomputation failure is non-blocking | FR-002 | AC-002-05 | negative | Given profile write throws, then embedding completes, result.profileRecomputed is false |

---

## 3. Unit Tests: `memory-store-adapter.js` (16 tests)

### 3.1 Schema Migration (FR-003)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| MSA-043 | adds links column on first open | FR-003 | AC-003-04 | positive | Given existing REQ-0064 SQLite store without links column, when store opened, then links column added with DEFAULT '[]' |
| MSA-044 | does not error on re-open with links column | FR-003 | AC-003-04 | positive | Given store already has links column, when re-opened, then no error, no duplicate column |
| MSA-045 | preserves existing data during migration | FR-003 | AC-003-04 | positive | Given store with 10 existing entries, when migration runs, then all 10 entries intact with links:'[]' |
| MSA-046 | links column stores valid JSON array | FR-003 | AC-003-01 | positive | Given links column exists, when chunk stored with links array, then JSON roundtrips correctly |

### 3.2 getByIds() (FR-006)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| MSA-047 | returns results for found IDs | FR-006 | AC-006-01 | positive | Given 5 chunks in store, when getByIds([id1,id3,id5]) called, then 3 results returned |
| MSA-048 | excludes archived chunks | FR-006 | AC-006-01 | positive | Given archived chunk ID in request, then excluded from results |
| MSA-049 | silently excludes unfound IDs | FR-006 | AC-006-02 | negative | Given non-existent chunkId in list, then that ID omitted from results, no error |
| MSA-050 | returns empty array for empty input | FR-006 | AC-006-01 | positive | Given getByIds([]) called, then returns [] |
| MSA-051 | returns results in input order | FR-006 | AC-006-01 | positive | Given IDs [c,a,b], then results ordered [c,a,b] |
| MSA-052 | works for project (.emb) store | FR-006 | AC-006-01 | positive | Given project store with chunks, when getByIds called, then results returned from .emb metadata |

### 3.3 updateLinks() (FR-003, FR-004, FR-005)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| MSA-053 | appends links to existing array | FR-003 | AC-003-01 | positive | Given chunk with links:[], when updateLinks adds 2 links, then links array has 2 entries |
| MSA-054 | validates relationType values | FR-003 | AC-003-03 | negative | Given link with invalid relationType, then rejected or error logged |
| MSA-055 | no-op for non-existent chunkId | FR-003 | AC-003-01 | negative | Given updateLinks called with unknown chunkId, then no error, no crash |
| MSA-056 | appends to non-empty links array | FR-003 | AC-003-01 | positive | Given chunk with 2 existing links, when updateLinks adds 1, then links has 3 entries |
| MSA-057 | link structure has required fields | FR-003 | AC-003-01 | positive | Given link created, then it has { targetChunkId, relationType, createdAt, createdBy } |
| MSA-058 | works for project (.emb) store | FR-003 | AC-003-02 | positive | Given project store chunk, when updateLinks called, then .emb metadata updated |

---

## 4. Unit Tests: `memory.js` (6 tests)

### 4.1 Extended ContextNote (FR-004)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| MEM-076 | accepts builds_on relationship_hint | FR-004 | AC-004-01 | positive | Given ContextNote with relationship_hint:'builds_on', then record accepted without error |
| MEM-077 | accepts contradicts relationship_hint | FR-004 | AC-004-01 | positive | Given relationship_hint:'contradicts', then accepted |
| MEM-078 | accepts supersedes relationship_hint | FR-004 | AC-004-01 | positive | Given relationship_hint:'supersedes', then accepted |
| MEM-079 | preserves updates and extends hints | FR-004 | AC-004-01 | positive | Given relationship_hint:'updates' or 'extends', then still accepted (backward compat) |
| MEM-080 | accepts null relationship_hint | FR-004 | AC-004-04 | positive | Given relationship_hint:null, then accepted (default) |
| MEM-081 | rejects invalid relationship_hint values | FR-004 | AC-004-01 | negative | Given relationship_hint:'invalid_type', then rejected or sanitized to null |

---

## 5. Integration Tests (18 tests)

### 5.1 Hybrid Search End-to-End

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-001 | hybrid search returns memory + codebase + profile | FR-001, FR-002 | AC-001-01, AC-002-02 | positive | Given populated stores and profile file, when searchMemory called with all options, then result contains all three sources |
| INT-002 | hybrid search degrades to memory-only when codebase missing | FR-001 | AC-001-04 | negative | Given no codebase index, then memory results returned with codebaseResults:[] |
| INT-003 | backward compat: no new params = REQ-0064 behavior | FR-001 | AC-001-05 | positive | Given searchMemory called without new REQ-0066 options, then returns MemorySearchResult[] compatible with REQ-0064 |

### 5.2 Link Creation During Embedding + Traversal at Search

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-004 | embed creates links then search traverses them | FR-005, FR-006 | AC-005-01, AC-006-01 | positive | Given embedSession creates related_to links, when searchMemory runs with traverseLinks:true, then linkedMemories populated from those links |
| INT-005 | curator link created during embed traversed at search | FR-004, FR-006 | AC-004-02, AC-006-01 | positive | Given embedSession creates builds_on link from curator hint, when search finds that chunk, then linkedMemory attached with relationType |
| INT-006 | broken link from pruned chunk handled gracefully | FR-006, FR-005 | AC-006-02, AC-005-03 | negative | Given link target pruned after embedding, when traversal runs, then broken link skipped silently |

### 5.3 Profile Recomputation + Delivery

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-007 | embed recomputes profile then search loads it | FR-002 | AC-002-01, AC-002-02 | positive | Given embedSession with recomputeProfile:true writes team-profile.json, when searchMemory called with includeProfile:true, then profile loaded |
| INT-008 | stale profile served when recomputation fails | FR-002 | AC-002-05 | negative | Given profile exists from previous run, when current recomputation fails, then old profile still served at search time |

### 5.4 Session Linking End-to-End

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-009 | session linking writes and reads session-links.json | FR-007 | AC-007-03 | positive | Given embedSession creates session links, then session-links.json exists with correct schema |
| INT-010 | session linking appends to existing file | FR-007 | AC-007-03 | positive | Given existing session-links.json with 2 entries, when new session embedded, then entry appended (3 total) |

### 5.5 Lineage Chain Traversal

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-011 | 1-hop lineage: supersedes chain | FR-008 | AC-008-01 | positive | Given A supersedes B (1-hop), when search returns A with traverseLinks, then B attached as linkedMemory with relationType:'supersedes' |
| INT-012 | 1-hop only: does not traverse 2-hop | FR-008 | AC-008-02 | positive | Given A->B->C chain, when traversal for C, then B fetched but A not fetched (1-hop limit) |
| INT-013 | lineage formatted with relationship context | FR-008 | AC-008-04 | positive | Given linked memories with types, when formatHybridMemoryContext called, then output includes "[supersedes]" and "[builds_on]" annotations |

### 5.6 Schema Migration Integration

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-014 | REQ-0064 store migrated then used for links | FR-003 | AC-003-04 | positive | Given REQ-0064 store without links column, when opened + updateLinks called, then links stored successfully |
| INT-015 | migration preserves existing search results | FR-003 | AC-003-04 | positive | Given migrated store, when search runs, then existing entries still searchable with correct scores |

### 5.7 All-Failure Graceful Degradation

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| INT-016 | all stores fail returns empty result | FR-001 | AC-001-04 | negative | Given user, project, and codebase stores all fail, then result has empty arrays, no crash |
| INT-017 | all embedding steps fail still returns embedded true | FR-005, FR-007, FR-002 | AC-005-03, AC-007-04, AC-002-05 | negative | Given link creation, session linking, and profile recomp all fail, then embedding core still succeeds |
| INT-018 | concurrent searches on same store | FR-001 | AC-001-02 | positive | Given two parallel searchMemory calls, then both complete without interference |

---

## 6. Performance Tests (4 tests)

| ID | Test Name | FR | AC | Type | Description |
|----|-----------|----|----|------|-------------|
| PT-001 | hybrid search < 300ms with 3 indexes + traversal + profile | FR-001 | AC-001-02 | positive | Given 300 vectors across stores, 10 results with links, then wall-clock < 300ms p95 |
| PT-002 | link traversal overhead < 50ms | FR-006 | AC-006-01 | positive | Given 10 results with 5 links each, then traversal adds < 50ms vs traverseLinks:false |
| PT-003 | profile recomputation < 100ms | FR-002 | AC-002-01 | positive | Given 200 entries, then profile computation + write < 100ms |
| PT-004 | link creation < 200ms for 5 chunks | FR-005 | AC-005-01 | positive | Given 5 new chunks with up to 25 matches, then link creation step < 200ms |
