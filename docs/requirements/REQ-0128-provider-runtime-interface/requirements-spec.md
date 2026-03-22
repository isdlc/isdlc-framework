# Requirements Specification: REQ-0128 — ProviderRuntime Interface Contract

## 1. Business Context
iSDLC supports multiple developer tools (Claude Code, Codex, Antigravity, future Cursor/Windsurf). Each tool needs a different execution mechanism but the orchestration logic is the same. The ProviderRuntime interface defines the contract between provider-neutral orchestration (src/core/orchestration/) and provider-specific execution (src/providers/{name}/runtime.js).

**Source**: GitHub #194 (CODEX-059)
**Dependencies**: REQ-0094 (team spec model), REQ-0114 (Codex adapter)

## 2. Functional Requirements

### FR-001: Interface Definition
**Confidence**: High
- AC-001-01: Frozen PROVIDER_RUNTIME_INTERFACE object listing all required methods
- AC-001-02: Each method entry specifies params[] and returns type

### FR-002: executeTask Method
**Confidence**: High
- AC-002-01: Signature: executeTask(phase, agent, context) → Promise<TaskResult>
- AC-002-02: TaskResult has: { status, output, duration_ms, error? }
- AC-002-03: context includes: artifact_folder, workflow_type, instructions, skill_context

### FR-003: executeParallel Method
**Confidence**: High
- AC-003-01: Signature: executeParallel(tasks[]) → Promise<TaskResult[]>
- AC-003-02: tasks is array of { id, phase, agent, context }
- AC-003-03: Results array preserves input order (results[i] corresponds to tasks[i])
- AC-003-04: Individual task failures don't reject the whole promise (per-task error handling)

### FR-004: presentInteractive Method
**Confidence**: High
- AC-004-01: Signature: presentInteractive(prompt) → Promise<string>
- AC-004-02: Used for roundtable conversation, discover menus, confirmation sequences
- AC-004-03: Provider determines HOW to present (Claude: relay loop, Codex: interactive session)

### FR-005: readUserResponse Method
**Confidence**: High
- AC-005-01: Signature: readUserResponse(options?) → Promise<string>
- AC-005-02: options can include: choices[], prompt, timeout
- AC-005-03: Used for simple confirmations (Y/n), menu selections, freeform input

### FR-006: validateRuntime Method
**Confidence**: High
- AC-006-01: Signature: validateRuntime() → Promise<{ available: boolean, reason?: string }>
- AC-006-02: Checks if the provider tool is installed and configured (e.g., claude CLI exists, codex CLI exists)

### FR-007: Factory Function
**Confidence**: High
- AC-007-01: createProviderRuntime(providerName, config) returns a runtime implementing the interface
- AC-007-02: Throws on unknown provider name with available providers listed
- AC-007-03: Lazy-loads provider adapters (dynamic import) to avoid importing all providers

### FR-008: Runtime Validation
**Confidence**: High
- AC-008-01: validateProviderRuntime(runtime) checks all required methods exist and are functions
- AC-008-02: Returns { valid: boolean, missing: string[] }

## 3. Out of Scope
- Implementing Claude or Codex runtime adapters (REQ-0134/0135)
- Orchestration logic (REQ-0129-0133)
- Provider-specific prompt formatting

## 4. MoSCoW
All FRs are Must Have.
