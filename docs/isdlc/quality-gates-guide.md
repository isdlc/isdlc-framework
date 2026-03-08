# Quality Gates Guide — Configuring and Extending Enforcement

iSDLC ships with 28 hooks that enforce quality at every phase boundary. This guide covers how to tune, extend, and replace that enforcement.

## How Gates Work

Hooks are Node.js processes that intercept tool calls via `PreToolUse` and `PostToolUse` events. They run outside the LLM conversation — the AI cannot argue with, reinterpret, or ignore them. All hooks fail open: if a hook crashes, it allows the operation rather than blocking work.

The six core enforcement hooks:

| Hook | What it enforces |
|------|-----------------|
| `gate-blocker.cjs` | 5 checks before phase advancement: iteration requirements, workflow state, phase sequencing, agent delegation, artifact presence |
| `iteration-corridor.cjs` | When tests are failing, confines the agent to fix-and-retest — no delegation, no gate advancement |
| `test-watcher.cjs` | Tracks test executions, enforces coverage minimums, circuit-breaks after 3 identical failures |
| `constitution-validator.cjs` | Blocks phase completion until artifacts comply with constitutional articles |
| `phase-sequence-guard.cjs` | Blocks out-of-order phase execution — no skipping ahead |
| `delegation-gate.cjs` | Validates the correct agent is delegated for each phase |

## Gate Profiles

Profiles control how rigorous gates are. Three ship out of the box:

### Rapid

Minimal gates for simple changes or prototyping.

```json
{
  "name": "rapid",
  "triggers": ["quick", "fast", "minimal", "rapid", "spike", "prototype"],
  "global_overrides": {
    "constitutional_validation": { "enabled": false },
    "interactive_elicitation": { "min_menu_interactions": 1 },
    "test_iteration": { "max_iterations": 3, "success_criteria": { "min_coverage_percent": 60 } }
  }
}
```

- Coverage threshold: 60%
- Constitutional validation: off
- Elicitation: 1 interaction
- Use for: spikes, simple changes, trusted developers

### Standard

Default — balanced rigor for most work. No overrides; uses base iteration requirements as-is.

- Coverage threshold: 80%
- Constitutional validation: on
- Elicitation: 3 interactions
- Use for: most feature and fix work

### Strict

Maximum rigor for critical or regulated code.

```json
{
  "name": "strict",
  "triggers": ["strict", "critical", "regulated", "compliance", "audit"],
  "global_overrides": {
    "test_iteration": { "success_criteria": { "min_coverage_percent": 95 } },
    "constitutional_validation": { "max_iterations": 8 }
  }
}
```

- Coverage threshold: 95%
- Constitutional validation: on with up to 8 iterations
- Use for: critical/regulated code, compliance-sensitive systems

### Triggering a Profile

Profiles activate from natural language signal words:

```
"quick build"           → rapid
"this is critical"      → strict
"build the feature"     → standard (default)
```

Or set a default in your constitution.

### Creating Custom Profiles

Add a JSON file to `src/claude/hooks/config/profiles/`:

```json
{
  "name": "paranoid",
  "description": "Nuclear-grade enforcement for payment processing",
  "triggers": ["paranoid", "payment", "financial"],
  "global_overrides": {
    "test_iteration": {
      "max_iterations": 15,
      "success_criteria": { "min_coverage_percent": 98 }
    },
    "constitutional_validation": { "max_iterations": 10 }
  }
}
```

The profile merges with base iteration requirements — you only override what you want to change.

## Extending with Custom Validators

Drop domain-specific validation scripts in `.isdlc/hooks/`:

```
.isdlc/hooks/
  validate-api-contracts.cjs    ← runs at phase boundaries
  check-license-headers.cjs     ← enforces file-level rules
```

Custom hooks follow the same interface as built-in hooks: they receive tool call context on stdin and return JSON on stdout. They must fail open (exit 0 on errors).

## Iteration Requirements

Each phase has configurable iteration requirements defined in `src/claude/hooks/config/iteration-requirements.json`. Key settings per phase:

| Setting | What it controls |
|---------|-----------------|
| `interactive_elicitation.min_menu_interactions` | Minimum user interactions before advancing |
| `test_iteration.max_iterations` | Maximum test-fix cycles before escalating |
| `test_iteration.circuit_breaker_threshold` | Identical failures before circuit-breaking |
| `constitutional_validation.max_iterations` | Maximum constitutional compliance attempts |
| `constitutional_validation.articles` | Which constitutional articles apply to this phase |

## Writing Custom Gate Logic

For full control, you can replace the gate validation logic entirely. The gate-blocker performs 5 checks:

1. **Test iteration** — tests run and passing (or escalated)
2. **Constitutional validation** — artifacts comply with constitution
3. **Interactive elicitation** — user engaged for input
4. **Agent delegation** — correct agent used for the phase
5. **Artifact presence** — required files exist on disk

Each check reads from `state.json` and returns PASS or BLOCK. To replace a check, modify the corresponding validation function in `src/claude/hooks/lib/` and update the gate-blocker to call your version.

## Reference

- [HOOKS.md](../HOOKS.md) — complete list of all 28 hooks
- [ARCHITECTURE.md](../ARCHITECTURE.md) — how hooks fit into the system architecture
- [Constitution Guide](constitution-guide.md) — the rules hooks enforce
