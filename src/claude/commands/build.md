## Build Command
Start the implementation workflow for an analyzed backlog item.

### Usage
```
/build "<item>"
/build "#42"
/build "payment-processing"
/build "item" --supervised
/build "item" --debate
```

### Description
The `/build` command starts the Phase-Loop Controller to implement a previously analyzed item. It runs phases: Test Strategy (05) -> Implementation (06) -> Quality Loop (16) -> Code Review (08).

Items must be analyzed first (via `/analyze`). Build will reject unanalyzed items.

Branch naming is inferred from the artifact folder prefix: `BUG-*` items get `bugfix/` branches, `REQ-*` items get `feature/` branches.

This is a thin wrapper that delegates to `/isdlc build`. All arguments are forwarded.

### Implementation
When this command is invoked, delegate to the isdlc skill:

```
/isdlc build {args}
```

Where `{args}` is the full argument string passed by the user.
