# Module Design — REQ-0136 Provider instruction generation

## File: src/core/orchestration/instruction-generator.js (~150 lines)

### INSTRUCTION_TEMPLATES

Frozen map of provider name to template configuration:

```js
{
  claude: { fileName: 'CLAUDE.md', format: 'markdown', sections: [...] },
  codex:  { fileName: 'CODEX.md', format: 'markdown', sections: [...] },
  cursor: { fileName: '.cursorrules', format: 'text', sections: [...] },
  windsurf: { fileName: '.windsurfrules', format: 'text', sections: [...] }
}
```

### generateInstructions(providerName, projectConfig)

- Loads agent classifications (role_spec only) from Phase 5 content
- Loads skill manifest summary
- Loads constitution summary
- Loads workflow definitions
- Assembles into template-specific format based on provider
- Returns `{ content: string, fileName: string, format: string }`

### getInstructionPath(providerName, projectRoot)

Returns the full absolute path for the instruction file (e.g., `{projectRoot}/CLAUDE.md`).

### listSupportedProviders()

Returns array of provider names that have templates (e.g., `['claude', 'codex', 'cursor', 'windsurf']`).

## Section Composition

**All providers include**:
- Project context
- Workflow command reference
- Constitution articles summary
- Agent roster (names + phases)
- Governance rules

**Claude-specific additions**:
- Hook configuration
- Session cache structure
- Tool usage patterns

**Codex-specific additions**:
- Instruction format notes
- Sandbox constraints

**Cursor/Windsurf**:
- Stub templates with basic project context only (future implementation)
