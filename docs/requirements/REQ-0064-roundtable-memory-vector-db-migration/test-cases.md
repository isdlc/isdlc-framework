# Test Cases: Roundtable Memory Vector DB Migration (REQ-0064)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0064
**Total Test Cases**: 146 (118 unit + 24 integration + 4 performance)
**AC Coverage**: 70/70 (100%)

---

## Unit Tests: `lib/memory-store-adapter.test.js` (42 tests)

### MSA-001: createUserStore -- Creates SQLite DB and tables on first open
**Requirement**: FR-003 (AC-003-01)
**Type**: positive
**Given**: A temp directory path where no `memory.db` exists
**When**: `createUserStore(dbPath)` is called
**Then**: SQLite database is created at `dbPath` with `memories` table and all required columns (id, session_id, chunk_id, content, vector, dimensions, embed_model, timestamp, importance, appeared_count, accessed_count, is_latest, pinned, archived, container, tags, merge_history, updates_ref, ttl, created_at, updated_at)
**Verify**: Table schema matches specification; all indexes created

### MSA-002: createUserStore -- Opens existing SQLite DB without data loss
**Requirement**: FR-003 (AC-003-01)
**Type**: positive
**Given**: A `memory.db` already exists with 5 memory entries
**When**: `createUserStore(dbPath)` is called
**Then**: Returns MemoryStore with access to existing 5 entries; no data loss

### MSA-003: createUserStore -- Returns MemoryStore interface
**Requirement**: FR-003 (AC-003-06)
**Type**: positive
**Given**: Valid dbPath
**When**: `createUserStore(dbPath)` is called
**Then**: Returned object implements all MemoryStore methods: search, add, remove, incrementAccess, pin, archive, tag, getModel, getCount, prune, rebuild, close

### MSA-004: createProjectStore -- Creates .emb file on first add
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: A temp directory path where no `.emb` file exists
**When**: `createProjectStore(embPath)` is called, then `store.add(chunks)` with valid chunks
**Then**: `.emb` file is created at `embPath` with vectors and metadata

### MSA-005: createProjectStore -- Loads existing .emb file
**Requirement**: FR-003 (AC-003-02)
**Type**: positive
**Given**: An existing `.emb` file with 3 vectors
**When**: `createProjectStore(embPath)` is called
**Then**: Returns MemoryStore with access to existing 3 vectors

### MSA-006: createProjectStore -- Returns MemoryStore interface
**Requirement**: FR-003 (AC-003-06)
**Type**: positive
**Given**: Valid embPath
**When**: `createProjectStore(embPath)` is called
**Then**: Returned object implements all MemoryStore methods

### MSA-007: UserStore.add -- Tier 1 Reject (similarity >= 0.95)
**Requirement**: FR-013 (AC-013-02)
**Type**: positive
**Given**: User store with an existing vector V1; new chunk C1 has cosine similarity >= 0.95 to V1
**When**: `store.add([C1])` is called
**Then**: Returns `{ rejected: 1, added: 0, updated: 0, extended: 0 }`; store count unchanged

### MSA-008: UserStore.add -- Tier 2 Update (0.85-0.94, contradicts)
**Requirement**: FR-013 (AC-013-03)
**Type**: positive
**Given**: User store with vector V1; new chunk C1 has similarity 0.90 and `relationshipHint: 'updates'`
**When**: `store.add([C1])` is called
**Then**: V1 marked `is_latest: false`; C1 inserted with `is_latest: true` and `updates_ref` pointing to V1's chunkId; returns `{ updated: 1 }`

### MSA-009: UserStore.add -- Tier 3 Extend (0.85-0.94, additive)
**Requirement**: FR-013 (AC-013-04)
**Type**: positive
**Given**: User store with vector V1; new chunk C1 has similarity 0.90 and `relationshipHint: 'extends'`
**When**: `store.add([C1])` is called
**Then**: V1's content is merged with C1's content; `appeared_count` incremented; `merge_history` updated; returns `{ extended: 1 }`

### MSA-010: UserStore.add -- Tier 3 Extend with null hint (default)
**Requirement**: FR-013 (AC-013-04)
**Type**: positive
**Given**: User store with vector V1; new chunk C1 has similarity 0.90 and `relationshipHint: null`
**When**: `store.add([C1])` is called
**Then**: Treated as Extend (null defaults to additive); V1 extended

### MSA-011: UserStore.add -- Tier 4 New (similarity < 0.85)
**Requirement**: FR-013 (AC-013-05)
**Type**: positive
**Given**: User store with vector V1; new chunk C1 has similarity 0.60 to V1
**When**: `store.add([C1])` is called
**Then**: C1 inserted as new entry; returns `{ added: 1 }`; store count increases by 1

### MSA-012: UserStore.add -- Multiple chunks with mixed tiers
**Requirement**: FR-013 (AC-013-01)
**Type**: positive
**Given**: User store with 2 existing vectors; batch of 4 new chunks spanning all 4 tiers
**When**: `store.add([reject, update, extend, new])` is called
**Then**: Returns aggregate counts for each tier

### MSA-013: UserStore.search -- Self-ranking formula
**Requirement**: FR-012 (AC-012-02)
**Type**: positive
**Given**: User store with 3 vectors: A (cosine=0.8, hit_rate=2.0), B (cosine=0.85, hit_rate=0.0), C (cosine=0.7, hit_rate=5.0)
**When**: `store.search(queryVector, 3)` is called
**Then**: Results ranked by `cosine * (1 + log(1 + hit_rate)) * (1 + importance/20)`; order reflects combined score, not raw cosine alone

### MSA-014: UserStore.search -- Importance boost in ranking
**Requirement**: FR-014 (AC-014-03)
**Type**: positive
**Given**: User store with 2 vectors: A (cosine=0.8, importance=2), B (cosine=0.75, importance=10)
**When**: `store.search(queryVector, 2)` is called
**Then**: B ranks higher than A due to importance boost despite lower raw cosine

### MSA-015: UserStore.search -- Pinned always included
**Requirement**: FR-015 (AC-015-01)
**Type**: positive
**Given**: User store with pinned vector P (cosine=0.3) and unpinned vector U (cosine=0.8); minScore=0.5
**When**: `store.search(queryVector, 10, { minScore: 0.5 })` is called
**Then**: Both P and U are in results; P included despite score below minScore

### MSA-016: UserStore.search -- Archived excluded
**Requirement**: FR-015 (AC-015-02)
**Type**: negative
**Given**: User store with archived vector A (cosine=0.9) and active vector B (cosine=0.7)
**When**: `store.search(queryVector, 10)` is called
**Then**: Only B is in results; A excluded despite high similarity

### MSA-017: UserStore.search -- Container filter
**Requirement**: FR-017 (AC-017-03)
**Type**: positive
**Given**: User store with vectors: A (container='auth'), B (container='deployment'), C (container=null)
**When**: `store.search(queryVector, 10, { container: 'auth' })` is called
**Then**: Only A is returned

### MSA-018: UserStore.search -- No container filter returns all
**Requirement**: FR-017 (AC-017-04)
**Type**: positive
**Given**: User store with vectors with mixed containers
**When**: `store.search(queryVector, 10)` is called (no container option)
**Then**: All non-archived vectors are returned

### MSA-019: UserStore.search -- is_latest filter
**Requirement**: FR-013 (AC-013-03)
**Type**: positive
**Given**: User store with V1 (is_latest=false) and V2 (is_latest=true, updates_ref=V1)
**When**: `store.search(queryVector, 10)` is called
**Then**: Only V2 (is_latest=true) is in results

### MSA-020: UserStore.incrementAccess -- Updates accessed_count
**Requirement**: FR-012 (AC-012-03)
**Type**: positive
**Given**: User store with vector V1 having accessed_count=3
**When**: `store.incrementAccess([V1.chunkId])` is called
**Then**: V1's accessed_count becomes 4

### MSA-021: UserStore.pin -- Sets pinned flag
**Requirement**: FR-015 (AC-015-01)
**Type**: positive
**Given**: User store with unpinned vector V1
**When**: `store.pin(V1.chunkId)` is called
**Then**: V1's pinned field becomes true

### MSA-022: UserStore.archive -- Sets archived flag
**Requirement**: FR-015 (AC-015-02)
**Type**: positive
**Given**: User store with active vector V1
**When**: `store.archive(V1.chunkId)` is called
**Then**: V1's archived field becomes true; V1 excluded from future searches

### MSA-023: UserStore.tag -- Adds tags
**Requirement**: FR-015 (AC-015-03)
**Type**: positive
**Given**: User store with vector V1 having tags=[]
**When**: `store.tag(V1.chunkId, ['architecture', 'auth'])` is called
**Then**: V1's tags becomes ['architecture', 'auth']

### MSA-024: UserStore.getModel -- Returns embed model
**Requirement**: FR-007 (AC-007-01)
**Type**: positive
**Given**: User store with vectors embedded using 'openai' model
**When**: `store.getModel()` is called
**Then**: Returns 'openai'

### MSA-025: UserStore.getModel -- Returns null for empty store
**Requirement**: FR-007 (AC-007-01)
**Type**: boundary
**Given**: Empty user store with no vectors
**When**: `store.getModel()` is called
**Then**: Returns null

### MSA-026: UserStore.getCount -- Returns vector count
**Requirement**: FR-016 (AC-016-01)
**Type**: positive
**Given**: User store with 42 vectors
**When**: `store.getCount()` is called
**Then**: Returns 42

### MSA-027: UserStore.prune -- Removes lowest-ranked non-pinned entries
**Requirement**: FR-016 (AC-016-02)
**Type**: positive
**Given**: User store with 20 vectors (2 pinned, 18 unpinned) of varying scores
**When**: `store.prune(15)` is called
**Then**: 5 lowest-ranked unpinned vectors removed; pinned vectors preserved; count becomes 15

### MSA-028: UserStore.prune -- Pinned never pruned
**Requirement**: FR-016 (AC-016-03)
**Type**: positive
**Given**: User store with 10 vectors, all pinned
**When**: `store.prune(5)` is called
**Then**: No vectors removed; count remains 10 (all pinned, exempt from pruning)

### MSA-029: UserStore.remove -- Filter by olderThan
**Requirement**: FR-009 (AC-009-01)
**Type**: positive
**Given**: User store with vectors from 3 months ago and 9 months ago
**When**: `store.remove({ olderThan: new Date('6 months ago') })` is called
**Then**: Only 9-month-old vectors removed; 3-month-old vectors preserved

### MSA-030: UserStore.remove -- Filter by expiredTtl
**Requirement**: FR-016 (AC-016-07)
**Type**: positive
**Given**: User store with vector V1 (ttl='2026-03-01') and V2 (ttl='2026-12-31') and V3 (ttl=null)
**When**: `store.remove({ expiredTtl: true })` at current date 2026-03-15
**Then**: V1 archived (TTL expired); V2 and V3 unchanged

### MSA-031: UserStore.close -- Closes SQLite connection
**Requirement**: FR-003 (AC-003-01)
**Type**: positive
**Given**: Open user store
**When**: `store.close()` is called
**Then**: No error; subsequent operations on this store throw

### MSA-032: ProjectStore.add -- Tiered dedup same as UserStore
**Requirement**: FR-013 (AC-013-07)
**Type**: positive
**Given**: Project store with existing vector; new chunk at similarity 0.96
**When**: `store.add([chunk])` is called
**Then**: Rejected (same Tier 1 behavior as user store); dedup applies independently per index

### MSA-033: ProjectStore.search -- Cosine similarity ranking
**Requirement**: FR-004 (AC-004-02)
**Type**: positive
**Given**: Project store with 5 vectors of varying similarity to query
**When**: `store.search(queryVector, 3)` is called
**Then**: Top 3 results by cosine similarity returned, sorted descending

### MSA-034: ProjectStore.pin -- Triggers .emb rebuild
**Requirement**: FR-015 (AC-015-05)
**Type**: positive
**Given**: Project store with vector V1
**When**: `store.pin(V1.chunkId)` is called
**Then**: V1 metadata updated with `pinned: true`; .emb package rebuilt

### MSA-035: ProjectStore.archive -- Triggers .emb rebuild
**Requirement**: FR-015 (AC-015-05)
**Type**: positive
**Given**: Project store with vector V1
**When**: `store.archive(V1.chunkId)` is called
**Then**: V1 metadata updated with `archived: true`; .emb package rebuilt

### MSA-036: ProjectStore.tag -- Triggers .emb rebuild
**Requirement**: FR-015 (AC-015-05)
**Type**: positive
**Given**: Project store with vector V1
**When**: `store.tag(V1.chunkId, ['security'])` is called
**Then**: V1 metadata updated with `tags: ['security']`; .emb package rebuilt

### MSA-037: createUserStore -- Missing directory creates it
**Requirement**: FR-003 (AC-003-05)
**Type**: boundary
**Given**: dbPath points to a non-existent directory
**When**: `createUserStore(dbPath)` is called
**Then**: Directory created; SQLite DB initialized; no error

### MSA-038: createProjectStore -- Missing .emb returns empty store
**Requirement**: FR-003 (AC-003-05)
**Type**: boundary
**Given**: embPath points to non-existent .emb file
**When**: `createProjectStore(embPath)` is called
**Then**: Returns MemoryStore with getCount()=0; search returns []; no error

### MSA-039: createUserStore -- Corrupt database file
**Requirement**: FR-011 (AC-011-03)
**Type**: negative
**Given**: dbPath points to a file with garbage content (not valid SQLite)
**When**: `createUserStore(dbPath)` is called
**Then**: Fails gracefully; returns a MemoryStore that returns empty results on search

### MSA-040: createProjectStore -- Corrupt .emb file
**Requirement**: FR-011 (AC-011-03)
**Type**: negative
**Given**: embPath points to a file with garbage content (not valid .emb)
**When**: `createProjectStore(embPath)` is called
**Then**: Fails gracefully; returns a MemoryStore that returns empty results on search

### MSA-041: UserStore.search -- Temporal decay for episodic memories
**Requirement**: FR-016 (AC-016-06)
**Type**: positive
**Given**: Two vectors same similarity: E (appeared_count=1, 6 months old) and P (appeared_count=5, 6 months old)
**When**: Search with age decay applied
**Then**: P (preference, half decay rate) ranks higher than E (episodic, full decay rate)

### MSA-042: UserStore.search -- Zero accessed_count after 5+ sessions
**Requirement**: FR-012 (AC-012-04)
**Type**: positive
**Given**: Vector with accessed_count=0, appeared_count=6
**When**: Search ranking is computed
**Then**: Additional age decay penalty applied (memory never retrieved = lower relevance)

---

## Unit Tests: `lib/memory-embedder.test.js` (28 tests)

### ME-001: embedSession -- Happy path (both stores)
**Requirement**: FR-002 (AC-002-01)
**Type**: positive
**Given**: EnrichedSessionRecord with summary and 3 context_notes; both stores open; engine configured
**When**: `embedSession(record, userStore, projectStore, config)` is called
**Then**: Returns `{ embedded: true, vectorsAdded: N, error: undefined }`; both stores received add() calls

### ME-002: embedSession -- Chunks summary via pipeline
**Requirement**: FR-002 (AC-002-01)
**Type**: positive
**Given**: Record with summary of 1000 characters
**When**: `embedSession()` processes the record
**Then**: `chunkDocument()` called with summary text and `{ format: 'text', maxTokens: 256 }`

### ME-003: embedSession -- Embeds each context_note separately
**Requirement**: FR-001 (AC-001-02)
**Type**: positive
**Given**: Record with 3 context_notes with distinct content
**When**: `embedSession()` processes the record
**Then**: Each context_note's content is chunked and embedded independently

### ME-004: embedSession -- Sets importance from record
**Requirement**: FR-014 (AC-014-02)
**Type**: positive
**Given**: Record with importance=8
**When**: `embedSession()` builds MemoryChunks
**Then**: All chunks have `importance: 8`

### ME-005: embedSession -- Passes relationship_hint from context_notes
**Requirement**: FR-013 (AC-013-06)
**Type**: positive
**Given**: Record with context_note having `relationship_hint: 'updates'`
**When**: `embedSession()` builds MemoryChunks
**Then**: Chunk has `relationshipHint: 'updates'`; store.add() uses this for tiered dedup

### ME-006: embedSession -- Passes container tag
**Requirement**: FR-017 (AC-017-02)
**Type**: positive
**Given**: Record with `container: 'auth'`
**When**: `embedSession()` builds MemoryChunks
**Then**: All chunks have `container: 'auth'`

### ME-007: embedSession -- Updates raw session JSON (embedded: true)
**Requirement**: FR-002 (AC-002-04)
**Type**: positive
**Given**: Raw session JSON file with `embedded: false`
**When**: `embedSession()` completes successfully
**Then**: Session JSON file updated to `embedded: true` and `embed_model` populated

### ME-008: embedSession -- Failure leaves embedded: false
**Requirement**: FR-002 (AC-002-03)
**Type**: negative
**Given**: Engine throws during embedding
**When**: `embedSession()` catches the error
**Then**: Returns `{ embedded: false, error: '...' }`; raw session JSON unchanged (embedded: false)

### ME-009: embedSession -- Never throws
**Requirement**: FR-002 (AC-002-03)
**Type**: negative
**Given**: All dependencies throw errors
**When**: `embedSession()` is called
**Then**: Returns error result object; does not throw exception

### ME-010: embedSession -- User store failure does not block project store
**Requirement**: FR-011 (AC-011-01)
**Type**: negative
**Given**: User store.add() throws; project store.add() succeeds
**When**: `embedSession()` is called
**Then**: Project store receives chunks; result reports partial success

### ME-011: embedSession -- Project store failure does not block user store
**Requirement**: FR-011 (AC-011-01)
**Type**: negative
**Given**: Project store.add() throws; user store.add() succeeds
**When**: `embedSession()` is called
**Then**: User store receives chunks; result reports partial success

### ME-012: embedSession -- Auto-prune when capacity exceeded
**Requirement**: FR-016 (AC-016-04)
**Type**: positive
**Given**: User store at 505 vectors (limit=500); project store at 300
**When**: `embedSession()` completes
**Then**: User store pruned to 450 (90% of 500); project store untouched

### ME-013: embedSession -- Auto-prune warning logged
**Requirement**: FR-016 (AC-016-05)
**Type**: positive
**Given**: Store exceeds capacity limit
**When**: Auto-prune runs
**Then**: Result includes pruned count > 0

### ME-014: embedSession -- Custom capacity limit
**Requirement**: FR-016 (AC-016-01)
**Type**: positive
**Given**: options.capacityLimit = 100; store has 105 vectors
**When**: `embedSession()` completes
**Then**: Store pruned to 90 (90% of 100)

### ME-015: embedSession -- Non-enriched record (no summary)
**Requirement**: FR-001 (AC-001-06)
**Type**: boundary
**Given**: Plain SessionRecord without summary field
**When**: `embedSession()` is called
**Then**: Returns `{ embedded: false, vectorsAdded: 0 }`; no embedding attempted

### ME-016: embedSession -- Empty context_notes array
**Requirement**: FR-001 (AC-001-02)
**Type**: boundary
**Given**: EnrichedSessionRecord with summary but context_notes=[]
**When**: `embedSession()` is called
**Then**: Only summary is chunked and embedded; returns `{ embedded: true }`

### ME-017: embedSession -- TTL passed through to chunks
**Requirement**: FR-016 (AC-016-07)
**Type**: positive
**Given**: Record with `ttl: '2026-04-01'`
**When**: Chunks are built
**Then**: Chunks carry `ttl: '2026-04-01'` for store to persist

### ME-018: rebuildIndex -- Happy path
**Requirement**: FR-007 (AC-007-04)
**Type**: positive
**Given**: Sessions directory with 5 enriched JSON files
**When**: `rebuildIndex(sessionsDir, indexPath, config)` is called
**Then**: Returns `{ rebuilt: true, sessionsProcessed: 5, vectorCount: N }`; .emb created at indexPath

### ME-019: rebuildIndex -- Skips non-enriched records
**Requirement**: FR-007 (AC-007-04)
**Type**: positive
**Given**: Sessions directory with 3 enriched and 2 plain SessionRecord files
**When**: `rebuildIndex()` is called
**Then**: Only 3 enriched records processed; `sessionsProcessed: 3`

### ME-020: rebuildIndex -- Empty directory
**Requirement**: FR-007 (AC-007-04)
**Type**: boundary
**Given**: Sessions directory with no JSON files
**When**: `rebuildIndex()` is called
**Then**: Returns `{ rebuilt: true, vectorCount: 0, sessionsProcessed: 0 }`

### ME-021: rebuildIndex -- Never throws
**Requirement**: FR-007 (AC-007-04)
**Type**: negative
**Given**: Sessions directory does not exist
**When**: `rebuildIndex()` is called
**Then**: Returns `{ rebuilt: false, error: '...' }`; does not throw

### ME-022: embedSession -- Dedup applies per-index independently
**Requirement**: FR-013 (AC-013-07)
**Type**: positive
**Given**: User store has vector V1; project store has no similar vector; new chunk similar to V1
**When**: `embedSession()` is called
**Then**: Chunk rejected/extended in user store; chunk added as new in project store

### ME-023: embedSession -- Preserves existing SessionRecord fields
**Requirement**: FR-001 (AC-001-06)
**Type**: positive
**Given**: EnrichedSessionRecord with session_id, slug, timestamp, topics (REQ-0063 fields)
**When**: Raw JSON is written
**Then**: All original SessionRecord fields preserved unchanged alongside new enriched fields

### ME-024: embedSession -- Records embed_model
**Requirement**: FR-001 (AC-001-05)
**Type**: positive
**Given**: Engine config with provider='openai'
**When**: `embedSession()` succeeds
**Then**: Session JSON updated with `embed_model: 'openai'`

### ME-025: embedSession -- Handles playbook_entry field
**Requirement**: FR-001 (AC-001-03)
**Type**: positive
**Given**: Record with playbook_entry of 2-3 sentences
**When**: `embedSession()` processes the record
**Then**: playbook_entry content is included in the embedding (chunked with summary)

### ME-026: embedSession -- Handles embedded=false initial state
**Requirement**: FR-001 (AC-001-04)
**Type**: positive
**Given**: Record with `embedded: false`
**When**: `embedSession()` succeeds
**Then**: Updated to `embedded: true`; confirms initial false state handled correctly

### ME-027: embedSession -- Multiple context_notes with mixed hints
**Requirement**: FR-013 (AC-013-06)
**Type**: positive
**Given**: Record with 3 context_notes: hint='updates', hint='extends', hint=null
**When**: Chunks are built
**Then**: Each chunk carries its respective relationship_hint for per-chunk dedup

### ME-028: embedSession -- Concurrent calls to same store
**Requirement**: FR-002 (AC-002-01)
**Type**: negative
**Given**: Two embedSession calls running concurrently on the same store
**When**: Both complete
**Then**: No corruption; both return valid results (SQLite handles serialization)

---

## Unit Tests: `lib/memory-search.test.js` (30 tests)

### MS-001: searchMemory -- Happy path (both stores return results)
**Requirement**: FR-004 (AC-004-02)
**Type**: positive
**Given**: User store with 5 vectors; project store with 3 vectors; valid engine config
**When**: `searchMemory('auth token handling', userDbPath, projectIndexPath, config)` is called
**Then**: Returns merged results from both stores, sorted by score descending, tagged with layer

### MS-002: searchMemory -- Results tagged with layer
**Requirement**: FR-003 (AC-003-04)
**Type**: positive
**Given**: Both stores return results
**When**: `searchMemory()` completes
**Then**: Each result has `layer: 'user'` or `layer: 'project'`

### MS-003: searchMemory -- maxResults limits output
**Requirement**: FR-004 (AC-004-04)
**Type**: positive
**Given**: 20 total results from both stores; maxResults=10
**When**: `searchMemory(..., { maxResults: 10 })` is called
**Then**: Exactly 10 results returned (top 10 by score)

### MS-004: searchMemory -- Default maxResults is 10
**Requirement**: FR-004 (AC-004-04)
**Type**: positive
**Given**: 20 total results; no maxResults option
**When**: `searchMemory()` is called
**Then**: 10 results returned (default limit)

### MS-005: searchMemory -- minScore filters low scores
**Requirement**: FR-004 (AC-004-02)
**Type**: positive
**Given**: Results with scores [0.9, 0.7, 0.4, 0.3]; minScore=0.5
**When**: `searchMemory(..., { minScore: 0.5 })` is called
**Then**: Only results with score >= 0.5 returned (2 results)

### MS-006: searchMemory -- Default minScore is 0.5
**Requirement**: FR-004 (AC-004-02)
**Type**: positive
**Given**: Results with scores [0.9, 0.4]
**When**: `searchMemory()` with no minScore option
**Then**: Only score=0.9 result returned

### MS-007: searchMemory -- Container filter
**Requirement**: FR-017 (AC-017-03)
**Type**: positive
**Given**: Results from both stores with mixed containers
**When**: `searchMemory(..., { container: 'auth' })` is called
**Then**: Only results with container='auth' returned

### MS-008: searchMemory -- No container filter returns all
**Requirement**: FR-017 (AC-017-04)
**Type**: positive
**Given**: Results with mixed containers
**When**: `searchMemory()` with no container option
**Then**: All non-archived results returned regardless of container

### MS-009: searchMemory -- Increments accessed_count for user results
**Requirement**: FR-012 (AC-012-03)
**Type**: positive
**Given**: User store returns results with chunkIds [A, B]
**When**: `searchMemory()` completes
**Then**: `userStore.incrementAccess(['A', 'B'])` called

### MS-010: searchMemory -- Does not increment accessed_count for project results
**Requirement**: FR-012 (AC-012-03)
**Type**: positive
**Given**: Project store returns results
**When**: `searchMemory()` completes
**Then**: `incrementAccess()` not called on project store for project-layer results

### MS-011: searchMemory -- User store missing (fail-open)
**Requirement**: FR-003 (AC-003-05), FR-011 (AC-011-02)
**Type**: negative
**Given**: userDbPath does not exist; project store has results
**When**: `searchMemory()` is called
**Then**: Returns project results only; no error thrown

### MS-012: searchMemory -- Project store missing (fail-open)
**Requirement**: FR-003 (AC-003-05), FR-011 (AC-011-02)
**Type**: negative
**Given**: projectIndexPath does not exist; user store has results
**When**: `searchMemory()` is called
**Then**: Returns user results only; no error thrown

### MS-013: searchMemory -- Both stores missing (fail-open)
**Requirement**: FR-011 (AC-011-02)
**Type**: negative
**Given**: Neither store exists
**When**: `searchMemory()` is called
**Then**: Returns empty array; no error thrown

### MS-014: searchMemory -- Never throws
**Requirement**: FR-011 (AC-011-01)
**Type**: negative
**Given**: Engine throws during query embedding
**When**: `searchMemory()` is called
**Then**: Returns empty array; does not throw

### MS-015: searchMemory -- Model mismatch on user store
**Requirement**: FR-007 (AC-007-03)
**Type**: negative
**Given**: User store model='codebert'; engine config provider='openai'
**When**: `searchMemory()` is called
**Then**: User store skipped with warning; project store searched; partial results returned

### MS-016: searchMemory -- Model mismatch on project store
**Requirement**: FR-007 (AC-007-03)
**Type**: negative
**Given**: Project store model='voyage-code-3'; engine config provider='openai'
**When**: `searchMemory()` is called
**Then**: Project store skipped with warning; user store searched; partial results returned

### MS-017: searchMemory -- Both stores model mismatch
**Requirement**: FR-007 (AC-007-03)
**Type**: negative
**Given**: Both stores have different model than engine config
**When**: `searchMemory()` is called
**Then**: Returns empty array (both skipped); no error thrown

### MS-018: searchMemory -- Lazy embed of un-embedded records
**Requirement**: FR-008 (AC-008-01, AC-008-02)
**Type**: positive
**Given**: Sessions directory with 2 records having `embedded: false`; engine available
**When**: `searchMemory(..., { userSessionsDir: dir })` is called
**Then**: Un-embedded records are embedded before search; those new vectors included in results

### MS-019: searchMemory -- Lazy embed failure is non-blocking
**Requirement**: FR-008 (AC-008-03)
**Type**: negative
**Given**: Sessions with `embedded: false`; embedding fails
**When**: `searchMemory()` is called
**Then**: Search proceeds without those records; returns results from already-embedded vectors

### MS-020: searchMemory -- Lazy embed updates record on success
**Requirement**: FR-008 (AC-008-04)
**Type**: positive
**Given**: Session record with `embedded: false`
**When**: Lazy embed succeeds during search
**Then**: Record updated to `embedded: true`

### MS-021: searchMemory -- No indexes, first run
**Requirement**: FR-004 (AC-004-05)
**Type**: boundary
**Given**: First run, no indexes exist anywhere
**When**: `searchMemory()` is called
**Then**: Returns empty array; handler proceeds without memory priming

### MS-022: checkModelConsistency -- Consistent models
**Requirement**: FR-007 (AC-007-02)
**Type**: positive
**Given**: .emb manifest has model='openai'; engine config provider='openai'
**When**: `checkModelConsistency(indexPath, config)` is called
**Then**: Returns `{ consistent: true, indexModel: 'openai', currentModel: 'openai' }`

### MS-023: checkModelConsistency -- Inconsistent models
**Requirement**: FR-007 (AC-007-02)
**Type**: negative
**Given**: .emb manifest has model='codebert'; engine config provider='openai'
**When**: `checkModelConsistency(indexPath, config)` is called
**Then**: Returns `{ consistent: false, indexModel: 'codebert', currentModel: 'openai' }`

### MS-024: checkModelConsistency -- Missing index file
**Requirement**: FR-007 (AC-007-02)
**Type**: negative
**Given**: indexPath does not exist
**When**: `checkModelConsistency(indexPath, config)` is called
**Then**: Returns `{ consistent: false, indexModel: 'unknown', currentModel: 'openai' }`

### MS-025: formatSemanticMemoryContext -- Formats results
**Requirement**: FR-004 (AC-004-03)
**Type**: positive
**Given**: 3 MemorySearchResult objects with varying scores and layers
**When**: `formatSemanticMemoryContext(results)` is called
**Then**: Returns formatted string with `MEMORY_CONTEXT:` header; each result in `--- memory-result (score: X.XX, layer: Y) ---` format

### MS-026: formatSemanticMemoryContext -- Empty results
**Requirement**: FR-004 (AC-004-05)
**Type**: boundary
**Given**: Empty results array
**When**: `formatSemanticMemoryContext([])` is called
**Then**: Returns empty string

### MS-027: searchMemory -- Corrupt user store (fail-open)
**Requirement**: FR-011 (AC-011-03)
**Type**: negative
**Given**: User store file is corrupted (not valid SQLite)
**When**: `searchMemory()` is called
**Then**: User store skipped; project store searched; no crash

### MS-028: searchMemory -- Corrupt project store (fail-open)
**Requirement**: FR-011 (AC-011-03)
**Type**: negative
**Given**: Project .emb file is corrupted
**When**: `searchMemory()` is called
**Then**: Project store skipped; user store searched; no crash

### MS-029: searchMemory -- No error messages for expected degradation
**Requirement**: FR-011 (AC-011-04)
**Type**: negative
**Given**: No embedding backend configured
**When**: `searchMemory()` is called
**Then**: Returns empty array silently; no error/warning output to user

### MS-030: searchMemory -- Score includes rawSimilarity field
**Requirement**: FR-012 (AC-012-02)
**Type**: positive
**Given**: Search returns results
**When**: Results examined
**Then**: Each result has both `score` (boosted) and `rawSimilarity` (raw cosine) fields

---

## Unit Tests: `lib/memory.test.js` -- Extended (18 tests)

### MX-001: writeSessionRecord -- Accepts EnrichedSessionRecord
**Requirement**: FR-001 (AC-001-06)
**Type**: positive
**Given**: EnrichedSessionRecord with summary, context_notes, playbook_entry, importance, embedded=false
**When**: `writeSessionRecord(record, projectRoot, userMemoryDir)` is called
**Then**: Returns `{ userWritten: true, projectWritten: true, enriched: true }`

### MX-002: writeSessionRecord -- Returns enriched=true for enriched records
**Requirement**: FR-001 (AC-001-01)
**Type**: positive
**Given**: Record with summary field present
**When**: `writeSessionRecord()` is called
**Then**: Returns `enriched: true`

### MX-003: writeSessionRecord -- Returns enriched=false for plain SessionRecord
**Requirement**: FR-010 (AC-010-01)
**Type**: positive
**Given**: Plain SessionRecord without summary field (REQ-0063 format)
**When**: `writeSessionRecord()` is called
**Then**: Returns `enriched: false`; write behavior identical to REQ-0063

### MX-004: writeSessionRecord -- Preserves all SessionRecord fields
**Requirement**: FR-001 (AC-001-06)
**Type**: positive
**Given**: EnrichedSessionRecord with session_id, slug, timestamp, topics plus new fields
**When**: Written to disk and read back
**Then**: All original SessionRecord fields present and unchanged

### MX-005: writeSessionRecord -- Persists enriched fields in JSON
**Requirement**: FR-001 (AC-001-01, AC-001-02, AC-001-03)
**Type**: positive
**Given**: EnrichedSessionRecord with summary, context_notes (with relationship_hints), playbook_entry
**When**: Written to disk and read back
**Then**: All enriched fields present in persisted JSON

### MX-006: writeSessionRecord -- Persists importance field
**Requirement**: FR-014 (AC-014-01)
**Type**: positive
**Given**: Record with `importance: 8`
**When**: Written and read back
**Then**: `importance: 8` present in JSON

### MX-007: writeSessionRecord -- Persists container tag
**Requirement**: FR-017 (AC-017-01)
**Type**: positive
**Given**: Record with `container: 'auth'`
**When**: Written and read back
**Then**: `container: 'auth'` present in JSON

### MX-008: writeSessionRecord -- Persists ttl field
**Requirement**: FR-016 (AC-016-07)
**Type**: positive
**Given**: Record with `ttl: '2026-04-01'`
**When**: Written and read back
**Then**: `ttl: '2026-04-01'` present in JSON

### MX-009: writeSessionRecord -- context_notes with relationship_hints
**Requirement**: FR-013 (AC-013-06)
**Type**: positive
**Given**: Record with context_notes array, each entry having topic, content, relationship_hint
**When**: Written and read back
**Then**: All context_notes preserved with relationship_hints intact

### MX-010: writeSessionRecord -- embedded=false initial state persisted
**Requirement**: FR-001 (AC-001-04)
**Type**: positive
**Given**: Record with `embedded: false`
**When**: Written and read back
**Then**: `embedded: false` in persisted JSON

### MX-011: compact -- vectorPrune option invokes store adapter
**Requirement**: FR-009 (AC-009-01)
**Type**: positive
**Given**: Valid user and project stores with vectors; vectorPrune=true
**When**: `compact({ vectorPrune: true, projectRoot, userMemoryDir })` is called
**Then**: Returns result with `vectorPruned` field containing removed/remaining/rebuilt counts

### MX-012: compact -- ageThresholdMonths prunes old vectors
**Requirement**: FR-009 (AC-009-01)
**Type**: positive
**Given**: Vectors older than 6 months and newer vectors; ageThresholdMonths=6
**When**: `compact({ vectorPrune: true, ageThresholdMonths: 6 })` is called
**Then**: Old vectors removed; new vectors preserved

### MX-013: compact -- dedupeThreshold removes near-duplicates
**Requirement**: FR-009 (AC-009-02)
**Type**: positive
**Given**: Two vectors with cosine similarity 0.97; dedupeThreshold=0.95
**When**: `compact({ vectorPrune: true, dedupeThreshold: 0.95 })` is called
**Then**: One duplicate removed; unique vectors preserved

### MX-014: compact -- Rebuilds .emb after pruning
**Requirement**: FR-009 (AC-009-03)
**Type**: positive
**Given**: Project store has 10 vectors, 3 pruned
**When**: `compact({ vectorPrune: true, project: true })` is called
**Then**: `vectorPruned.rebuilt: true`; .emb rebuilt with 7 vectors

### MX-015: compact -- Flat JSON compaction unchanged without vectorPrune
**Requirement**: FR-009 (AC-009-04), FR-010 (AC-010-01)
**Type**: positive
**Given**: Existing sessions and profile data
**When**: `compact({ user: true, project: true })` without vectorPrune
**Then**: Flat JSON compaction runs as before (REQ-0063 behavior); no vector operations

### MX-016: compact -- expireTtl auto-archives expired memories
**Requirement**: FR-016 (AC-016-07)
**Type**: positive
**Given**: Vector with `ttl: '2026-03-01'` (expired); vectorPrune=true
**When**: `compact({ vectorPrune: true })` is called
**Then**: Expired memory archived (not deleted); `vectorPruned.archived` count > 0

### MX-017: compact -- expireTtl defaults to true when vectorPrune set
**Requirement**: FR-016 (AC-016-07)
**Type**: boundary
**Given**: Vector with expired TTL; vectorPrune=true; expireTtl not specified
**When**: `compact({ vectorPrune: true })` is called
**Then**: TTL expiry runs by default

### MX-018: compact -- vectorPrune=false does not touch stores
**Requirement**: FR-010 (AC-010-04)
**Type**: negative
**Given**: Stores with vectors; vectorPrune=false
**When**: `compact({ vectorPrune: false })` is called
**Then**: No store operations performed; flat JSON compaction only

---

## Integration Tests: `lib/memory-integration.test.js` (24 tests)

### IT-001: End-to-end write path -- record to both stores
**Requirement**: FR-001 (AC-001-01), FR-002 (AC-002-01), FR-003 (AC-003-01, AC-003-02)
**Type**: positive
**Given**: Fresh temp directory; mocked embedding engine
**When**: writeSessionRecord(enrichedRecord) then embedSession(record, userStore, projectStore, config)
**Then**: Raw JSON written to both locations; vectors added to both stores; record updated to embedded=true

### IT-002: End-to-end read path -- search to ranked results
**Requirement**: FR-004 (AC-004-01, AC-004-02, AC-004-03)
**Type**: positive
**Given**: Pre-populated user store (SQLite) and project store (.emb) with known vectors
**When**: searchMemory(queryText, userDbPath, projectIndexPath, config)
**Then**: Returns merged, ranked results from both stores with layer tags

### IT-003: Write then read -- full cycle
**Requirement**: FR-001, FR-002, FR-003, FR-004
**Type**: positive
**Given**: Empty stores
**When**: Write enriched record -> embed -> search with related query
**Then**: Written content found in search results with expected score range

### IT-004: Fallback path -- no indexes to flat JSON
**Requirement**: FR-010 (AC-010-01, AC-010-02)
**Type**: positive
**Given**: No vector indexes; flat JSON profile.json and roundtable-memory.json exist
**When**: searchMemory returns [] -> readUserProfile + readProjectMemory -> mergeMemory -> formatMemoryContext
**Then**: Legacy MEMORY_CONTEXT format produced; roundtable can consume it

### IT-005: Fallback path -- no embedding backend
**Requirement**: FR-011 (AC-011-01)
**Type**: negative
**Given**: No embedding engine available (embed() throws)
**When**: Write path: writeSessionRecord succeeds, embedSession fails gracefully; Read path: searchMemory falls back
**Then**: Raw JSON persists; system operates on flat JSON path

### IT-006: Model mismatch recovery -- rebuildIndex
**Requirement**: FR-007 (AC-007-04)
**Type**: positive
**Given**: .emb index built with model A; engine now configured with model B
**When**: checkModelConsistency detects mismatch -> rebuildIndex called
**Then**: New .emb built with model B; subsequent search returns results

### IT-007: Conversational override flow
**Requirement**: FR-005 (AC-005-01, AC-005-02)
**Type**: positive
**Given**: User says "remember I prefer brief on security" -> handler creates EnrichedSessionRecord with this in summary and context_notes
**When**: Record written -> embedded -> future search with 'security preferences'
**Then**: Override content found in search results

### IT-008: Pin flow -- pin then search always includes
**Requirement**: FR-015 (AC-015-01)
**Type**: positive
**Given**: Write and embed a record -> pin one chunk
**When**: Search with low similarity to pinned chunk
**Then**: Pinned chunk always in results regardless of score

### IT-009: Archive flow -- archive then search excludes
**Requirement**: FR-015 (AC-015-02)
**Type**: positive
**Given**: Write and embed a record -> archive one chunk
**When**: Search with high similarity to archived chunk
**Then**: Archived chunk not in results

### IT-010: Tag flow -- tag then filter
**Requirement**: FR-015 (AC-015-03)
**Type**: positive
**Given**: Write and embed a record -> tag chunk with 'architecture'
**When**: Search with container='architecture'
**Then**: Tagged chunk found; unrelated chunks excluded

### IT-011: Tiered dedup -- Reject duplicate across write cycles
**Requirement**: FR-013 (AC-013-02)
**Type**: positive
**Given**: Embed session A; then embed session B with nearly identical content (similarity >= 0.95)
**When**: Check store count
**Then**: Count unchanged after session B (rejected as duplicate)

### IT-012: Tiered dedup -- Update supersedes old entry
**Requirement**: FR-013 (AC-013-03)
**Type**: positive
**Given**: Embed session "team chose middleware"; then embed "team switched to direct integration" with hint='updates'
**When**: Search for 'integration approach'
**Then**: Only latest entry (direct integration) in results; old entry preserved with is_latest=false

### IT-013: Tiered dedup -- Extend enriches existing
**Requirement**: FR-013 (AC-013-04)
**Type**: positive
**Given**: Embed "prefers brief on security"; then embed "because org handles at policy level" with hint='extends'
**When**: Search for 'security preferences'
**Then**: Merged content includes both original and extension; appeared_count incremented

### IT-014: Auto-prune during embed at capacity
**Requirement**: FR-016 (AC-016-01, AC-016-02, AC-016-04)
**Type**: positive
**Given**: Store pre-filled to capacity limit (500); embed new session
**When**: embedSession completes
**Then**: Store pruned to 450; lowest-ranked entries removed; new entries preserved

### IT-015: Compaction with vector pruning
**Requirement**: FR-009 (AC-009-01, AC-009-02, AC-009-03)
**Type**: positive
**Given**: Stores with old vectors (> 6 months) and near-duplicates (> 0.95 similarity)
**When**: compact({ vectorPrune: true, ageThresholdMonths: 6 })
**Then**: Old vectors removed; near-duplicates deduplicated; .emb rebuilt; flat JSON compaction also runs

### IT-016: Backward compatibility -- plain SessionRecord through full pipeline
**Requirement**: FR-010 (AC-010-01, AC-010-04)
**Type**: positive
**Given**: Plain SessionRecord (REQ-0063 format, no enriched fields)
**When**: writeSessionRecord -> enriched=false -> no embedding triggered
**Then**: Flat JSON path works unchanged; coexists with vector-stored records

### IT-017: Dual store independence -- one fails, other works
**Requirement**: FR-003 (AC-003-05), FR-011 (AC-011-01)
**Type**: negative
**Given**: User store working; project store path is unwritable
**When**: embedSession and searchMemory called
**Then**: User store operations succeed; project store failures isolated; no crash

### IT-018: Lazy embed on search
**Requirement**: FR-008 (AC-008-01, AC-008-02)
**Type**: positive
**Given**: 2 un-embedded session records (embedded: false) in sessions dir
**When**: searchMemory called with userSessionsDir pointing to those records
**Then**: Records embedded before search; embedded flag updated; vectors searchable

### IT-019: Conversational query -- search returns memory summary
**Requirement**: FR-006 (AC-006-01, AC-006-02, AC-006-03)
**Type**: positive
**Given**: Multiple embedded sessions across user and project stores
**When**: searchMemory('what do you remember about my preferences')
**Then**: Returns relevant memories from both stores with layer attribution

### IT-020: Container tag auto-assignment
**Requirement**: FR-017 (AC-017-01, AC-017-02)
**Type**: positive
**Given**: EnrichedSessionRecord with container='auth' (set by curator)
**When**: Embedded and stored -> search with container='auth'
**Then**: Record found with container tag; search without filter also returns it

### IT-021: Self-ranking evolution -- hit_rate changes over sessions
**Requirement**: FR-012 (AC-012-01, AC-012-02)
**Type**: positive
**Given**: Memory entry with appeared_count=3, accessed_count=0
**When**: Three search calls return this entry -> accessed_count becomes 3
**Then**: hit_rate = 3/3 = 1.0; entry ranks higher in subsequent searches due to hit_rate boost

### IT-022: MEMORY_CONTEXT format detection
**Requirement**: FR-010 (AC-010-02, AC-010-03)
**Type**: positive
**Given**: Both semantic results and legacy flat JSON available
**When**: Semantic search returns results
**Then**: formatSemanticMemoryContext produces new format; legacy format not used

### IT-023: TTL expiry during compaction
**Requirement**: FR-016 (AC-016-07)
**Type**: positive
**Given**: Memory with ttl='2026-03-01' (expired) and memory with ttl='2026-12-31' (active)
**When**: compact({ vectorPrune: true })
**Then**: Expired memory archived; active memory unchanged; archived memory retained for audit

### IT-024: Importance scoring in search ranking
**Requirement**: FR-014 (AC-014-01, AC-014-03)
**Type**: positive
**Given**: Two memories with same cosine similarity: A (importance=2) and B (importance=9)
**When**: searchMemory() with query matching both equally
**Then**: B ranks higher due to importance boost: `(1 + 9/20) = 1.45` vs `(1 + 2/20) = 1.10`

---

## Performance Tests (4 tests)

### PT-001: Search latency under target
**Requirement**: FR-004 (AC-004-03)
**Type**: performance
**Setup**: User store with 200 vectors; project store with 100 vectors
**Measure**: searchMemory() wall-clock time over 10 iterations
**Threshold**: p95 < 200ms

### PT-002: Search latency at capacity
**Requirement**: FR-004 (AC-004-03)
**Type**: performance
**Setup**: Both stores at 500 vectors
**Measure**: searchMemory() wall-clock time
**Threshold**: p95 < 500ms

### PT-003: Embedding throughput
**Requirement**: FR-002 (AC-002-02)
**Type**: performance
**Setup**: Record with 5 context_notes; mocked engine
**Measure**: embedSession() orchestration overhead
**Threshold**: < 100ms (excluding model inference)

### PT-004: Auto-prune latency
**Requirement**: FR-016 (AC-016-04)
**Type**: performance
**Setup**: Store at 510 vectors; prune to 450
**Measure**: prune() wall-clock time
**Threshold**: < 200ms
