# Module Design: REQ-0138 — Codex Session Cache Re-priming + AGENTS.md Template

## 1. src/codex/AGENTS.md.template (~300 lines)

Adapted from src/claude/CLAUDE.md.template (329 lines):

| Section | Lines | Source | Adaptation |
|---------|-------|--------|------------|
| Workflow-First Development | ~50 | CLAUDE.md.template | Same intent table + consent rules |
| Intent Detection (reinforced) | ~40 | CLAUDE.md.template | "You MUST classify" + 2 examples per verb |
| Consent Patterns | ~20 | CLAUDE.md.template | Same good/bad examples |
| Analysis Completion Rules | ~25 | CLAUDE.md.template | Same three-domain confirmation |
| Agent Framework Context | ~40 | CLAUDE.md.template | codex exec instead of Task tool, no hooks, no relay |
| Session Cache Re-prime | ~25 | NEW | Conditional read/rebuild instruction |
| Governance (3-tier) | ~40 | NEW (REQ-0117) | Adapter-enforced / instruction-level / manual fallback |
| Provider-Owned Files | ~15 | NEW | Reference .codex/ for support files |
| Git Commit Prohibition | ~10 | CLAUDE.md.template | Identical |
| Constitutional Principles | ~10 | CLAUDE.md.template | Same preamble |
| Project Context | ~25 | CLAUDE.md.template | Same key files / version / conventions |

## 2. src/providers/codex/installer.js changes (+20 lines)

In installCodex():
- Resolve template: path.join(getFrameworkDir(), 'codex', 'AGENTS.md.template')
- Check if AGENTS.md exists at project root
- If not: copy template as AGENTS.md
- If yes: skip with warning "AGENTS.md already exists"

In updateCodex():
- Create backup of existing AGENTS.md (AGENTS.md.backup)
- Overwrite with latest template

## 3. src/providers/codex/projection.js changes (+45 lines)

New helper function:
```javascript
function parseCacheSections(content) {
  const sections = {};
  const regex = /<!-- SECTION: (\w+) -->([\s\S]*?)<!-- \/SECTION: \1 -->/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    sections[match[1]] = match[2].trim();
  }
  return sections;
}
```

In projectInstructions(), after assembleMarkdown():
- Try read .isdlc/session-cache.md from options.projectRoot
- Parse sections via parseCacheSections()
- Append CONSTITUTION, WORKFLOW_CONFIG, SKILL_INDEX, ITERATION_REQUIREMENTS sections
- Catch all errors silently (fail-open)

## 4. src/core/installer/index.js changes (+5 lines)

In installCore(), when providerMode includes 'codex':
- Ensure .codex/ directory exists at project root

## Error Taxonomy
- No new error codes — all paths are fail-open
