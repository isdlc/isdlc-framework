# Interface Specification — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 85%

---

## 1. Inference Log Entry (Internal Protocol)

The inference log is maintained in the LLM's context during conversation. Each entry follows this structure:

```typescript
interface InferenceEntry {
  id: string;                    // Sequential: "INF-001", "INF-002", ...
  assumption: string;            // What was assumed (human-readable text)
  trigger: string;               // Why: "user brief on topic", "no user input", "codebase pattern"
  confidence: "Medium" | "Low";  // Medium = inferred from user+codebase, Low = codebase only
  topic_id: string;              // Topic this relates to: "problem-discovery", "architecture", etc.
  fr_ids: string[];              // Affected FRs: ["FR-003", "FR-004"] (may be empty early in conversation)
  exchange_number: number;       // Which exchange this was logged during
}
```

**Note**: This is a protocol specification for LLM behavior, not a runtime data structure. The roundtable maintains this as structured tracking within its reasoning.

---

## 2. Scope Recommendation (meta.json Output)

Added to `meta.json` at analysis completion:

```typescript
interface ScopeRecommendation {
  scope: "trivial" | "light" | "standard" | "epic";  // Recommended build scope
  rationale: string;                                    // Brief explanation (1-2 sentences)
  user_confirmed: boolean;                              // Did user agree with recommendation?
  user_override: string | null;                         // Original recommendation if user overrode (null if no override)
}
```

**meta.json location**: `meta.recommended_scope`

**Example**:
```json
{
  "recommended_scope": {
    "scope": "light",
    "rationale": "Single-file prompt change with well-understood scope. User consistently brief across all topics.",
    "user_confirmed": true,
    "user_override": null
  }
}
```

---

## 3. Topic File depth_guidance (Restructured Format)

Current format (prescriptive):
```yaml
depth_guidance:
  brief: "Accept surface-level answers. 1-2 questions max."
  standard: "Probe each area with follow-up. 3-5 exchanges."
  deep: "Exhaustive exploration. Challenge every assumption. 6+ exchanges."
```

New format (behavioral calibration):
```yaml
depth_guidance:
  brief:
    behavior: "Accept the user's framing at face value. Do not probe for edge cases unless the user raises them. Fill gaps from codebase analysis and log as inferences."
    acceptance: "Surface-level answers are sufficient. Single-sentence responses are complete."
    inference_policy: "Infer freely from codebase patterns. Log all inferences."
  standard:
    behavior: "Probe each area with follow-up questions. Ask about edge cases for critical paths. Validate assumptions with the user."
    acceptance: "Expect multi-sentence answers. Seek clarification on ambiguous responses."
    inference_policy: "Infer from codebase when user input is partial. Confirm major inferences."
  deep:
    behavior: "Challenge every assumption. Explore alternative interpretations. Push for concrete examples and boundary conditions."
    acceptance: "Expect detailed answers with examples. Do not accept vague responses without follow-up."
    inference_policy: "Minimize inference. Ask rather than assume. Only infer from strongly evidenced codebase patterns."
```

**Compatibility**: The YAML keys (`depth_guidance.brief`, `depth_guidance.standard`, `depth_guidance.deep`) remain the same. The value changes from a string to an object with `behavior`, `acceptance`, and `inference_policy` keys.

---

## 4. Confirmation Summary Assumptions Section

Added to each domain summary during the confirmation sequence.

### Topic-Level View (Default)

Format within summary presentation:
```markdown
### Assumptions and Inferences

- **Error Handling** (3 assumptions): Inferred standard error propagation from codebase patterns
- **Security** (1 assumption): Assumed no new auth requirements based on scope
- **Data Flow** (0 assumptions): Fully covered in conversation

Ask me to expand any topic for FR-level detail.
```

### FR-Level View (On Demand)

When user requests detail on a topic:
```markdown
### Error Handling -- Detailed Assumptions

| ID | Assumption | Confidence | Rationale | Affects |
|----|-----------|------------|-----------|---------|
| INF-007 | Errors propagate via standard throw/catch pattern | Medium | User gave 1-sentence answer; inferred from existing error handling in codebase | FR-005 |
| INF-008 | No custom error codes needed | Low | No user input on error codes; codebase uses generic Error types | FR-005, FR-006 |
| INF-009 | Retry logic not needed for this change | Medium | User said "straightforward" -- inferred no transient failure scenarios | FR-003 |
```

---

## 5. Deprecation Notice Format

When `--light` flag is used:

```
NOTE: The --light flag is deprecated and will be removed in a future release.
The roundtable now adapts analysis depth automatically based on the conversation
and recommends build scope at the end of analysis. The --light flag has been
applied as a starting suggestion (scope: light) which the roundtable may adjust
based on the discussion.
```

---

## 6. Scope-to-Phase Mapping

The `recommended_scope` maps to build workflow phases as follows:

| Scope | Phases Included | Phases Skipped |
|-------|----------------|----------------|
| trivial | Direct edit (no workflow phases) | All |
| light | 00-quick-scan, 01-requirements, 05-test-strategy, 06-implementation, 16-quality-loop, 08-code-review | 03-architecture, 04-design |
| standard | All phases | None |
| epic | All phases (with extended iteration budgets) | None |

This mapping is consumed by the build workflow (isdlc.md, ANTIGRAVITY.md) and is consistent with the existing `light_skip_phases` configuration in `workflows.json`.
