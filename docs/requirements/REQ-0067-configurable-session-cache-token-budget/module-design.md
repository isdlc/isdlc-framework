# Module Design: Configurable Session Cache Token Budget

**REQ-0067** | **Status**: Accepted | **Generated**: 2026-03-16

---

## Module 1: `readConfig(projectRoot?)`

**Location**: `src/claude/hooks/lib/common.cjs`
**Responsibility**: Read `.isdlc/config`, deep-merge with defaults, cache per-process

### Public Interface

```js
/**
 * @param {string} [projectRoot] - Override project root (for testing)
 * @returns {{ cache: { budget_tokens: number, section_priorities: Record<string, number> } }}
 */
function readConfig(projectRoot)
```

### Data Structures

**Default config**:
```js
const DEFAULT_CONFIG = {
  cache: {
    budget_tokens: 100000,
    section_priorities: {
      constitution: 1,
      workflow_config: 2,
      iteration_requirements: 3,
      artifact_paths: 4,
      skills_manifest: 5,
      skill_index: 6,
      external_skills: 7,
      roundtable_context: 8,
      instructions: 9
    }
  }
};
```

### Behavior

1. If module-level cache exists and `projectRoot` matches cached root: return cached value
2. Read `.isdlc/config` from disk. If missing: return defaults (no warning)
3. Parse JSON. If malformed: stderr warning, return defaults
4. Deep-merge user config over defaults (user values win, missing keys filled from defaults)
5. Validate `budget_tokens`: must be positive number. If invalid: stderr warning, use 100000
6. Validate each priority value: must be positive number. If invalid: stderr warning, use default for that section
7. Unknown section names in priorities: ignored (forward-compatible)
8. Cache merged result in module-level variable
9. Return merged config

### Dependencies

- `fs.readFileSync` (Node.js built-in)
- `path.join` (Node.js built-in)
- `getProjectRoot()` (existing in common.cjs)

---

## Module 2: Budget Allocation in `rebuildSessionCache()`

**Location**: `src/claude/hooks/lib/common.cjs` (existing function, modified)
**Responsibility**: Allocate section content within token budget by priority

### Changes to Existing Function

After all `buildSection()` calls produce section content (existing logic unchanged), insert budget allocation step before assembling final output.

### Algorithm

```
function allocateSections(sectionParts, config):
  budget = config.cache.budget_tokens
  priorities = config.cache.section_priorities

  // Build section metadata
  sections = sectionParts.map(part => ({
    name: extractSectionName(part),
    content: part,
    priority: priorities[name] ?? 99,
    tokens: Math.ceil(part.length / 4)
  }))

  // Sort by priority (ascending = highest priority first)
  sections.sort((a, b) => a.priority - b.priority)

  usedTokens = 0
  result = []

  for section in sections:
    if usedTokens + section.tokens <= budget:
      // Full fit
      result.push(section.content)
      usedTokens += section.tokens
    else:
      remainingTokens = budget - usedTokens
      if remainingTokens > 100:  // minimum meaningful content
        // Partial fit: truncate at line boundary
        remainingChars = remainingTokens * 4
        truncated = section.content.substring(0, remainingChars)
        lastNewline = truncated.lastIndexOf('\n')
        if lastNewline > 0:
          truncated = truncated.substring(0, lastNewline)
        truncated += '\n[... truncated for context budget ...]\n'
        truncated += `<!-- /SECTION: ${section.name} -->`
        result.push(truncated)
        usedTokens = budget  // budget exhausted
      else:
        // No fit: skip
        result.push(`<!-- SECTION: ${section.name} SKIPPED: budget_exceeded -->`)
      // All subsequent sections also skipped (budget exhausted)
      for remaining in sections[currentIndex+1:]:
        result.push(`<!-- SECTION: ${remaining.name} SKIPPED: budget_exceeded -->`)
      break

  return { parts: result, usedTokens, totalTokens: sum(sections.tokens) }
```

### External Skill Truncation

Replace hardcoded `5000` at line 4292 with:

```js
const config = readConfig(root);
const externalSkillBudgetChars = Math.max(
  1000,
  Math.floor((config.cache.budget_tokens * 4 - usedCharsBeforeExternalSkills) / skillCount)
);
```

Note: This requires knowing how many chars were used by higher-priority sections before the external skills section is built. The implementation should pass remaining budget into the external skills `buildSection` callback.

### Warning Replacement

Replace line 4409 (`output.length > 128000`):

```js
const config = readConfig(root);
const budgetChars = config.cache.budget_tokens * 4;
if (output.length > budgetChars) {
  const usedTokens = Math.ceil(output.length / 4);
  process.stderr.write(
    `WARNING: Session cache exceeds budget (${usedTokens} tokens > ${config.cache.budget_tokens} token budget)\n`
  );
}
```

---

## Module 3: CLI Budget Reporting

**Location**: `bin/rebuild-cache.js`
**Responsibility**: Display budget usage after rebuild

### Changes

Add after existing output (line 34-37):

```js
const config = common.readConfig();
const usedTokens = Math.ceil(result.size / 4);
const budget = config.cache.budget_tokens;
const percent = Math.round((usedTokens / budget) * 100);
console.log(`  Budget: ${usedTokens}/${budget} tokens (${percent}%)`);
if (result.skipped.length > 0) {
  console.log(`  Skipped: ${result.skipped.join(', ')}`);
}
```

---

## Error Taxonomy

| Code | Trigger | Severity | Recovery |
|------|---------|----------|----------|
| CONFIG_MISSING | `.isdlc/config` does not exist | Info | Silent fallback to defaults |
| CONFIG_MALFORMED | JSON parse error | Warning | stderr warning, fallback to defaults |
| BUDGET_INVALID | `budget_tokens` is not a positive number | Warning | stderr warning, use 100000 |
| PRIORITY_INVALID | Priority value is not a positive number | Warning | stderr warning, use default for that section |
| BUDGET_EXCEEDED | Generated cache exceeds configured budget | Warning | stderr warning (informational) |
| SECTION_SKIPPED | Section dropped due to budget | Info | `SKIPPED: budget_exceeded` marker in cache |
| SECTION_TRUNCATED | Section partially included | Info | `[... truncated for context budget ...]` in content |
