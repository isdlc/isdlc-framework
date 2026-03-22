# Requirements Specification — REQ-0136 Provider instruction generation

## Functional Requirements

### FR-001: generateInstructions(providerName, projectConfig)
Produces the system instruction file content for a provider. Loads agent classifications, skill manifest, constitution summary, and workflow definitions. Assembles into the provider's template format.

**MoSCoW**: Must Have

### FR-002: Provider instruction mapping
Maps provider names to their instruction file:
- Claude -> CLAUDE.md
- Codex -> CODEX.md
- Cursor -> .cursorrules
- Windsurf -> .windsurfrules

**MoSCoW**: Must Have

### FR-003: Content sourcing
Extracts role_spec sections from agent-classification (portable content from Phase 5). Adds provider-specific RuntimePackaging template per provider.

**MoSCoW**: Must Have

### FR-004: Instruction file structure
Generated instruction files contain: project context, workflow commands, constitutional summary, agent roster, skill index, governance rules.

**MoSCoW**: Must Have

### FR-005: getInstructionPath(providerName)
Returns the target file path for a provider's instruction file within the project root.

**MoSCoW**: Must Have

### FR-006: Provider template registry
Frozen map of provider name to template configuration (file name, format, sections to include). Immutable at runtime.

**MoSCoW**: Must Have

### FR-007: Integrates with installer
installCore() + installClaude()/installCodex() can call generateInstructions() to produce the instruction file during installation.

**MoSCoW**: Must Have

## Out of Scope

- Cursor/Windsurf templates (stub entries, implemented when those providers are added)
- Modifying existing CLAUDE.md content
