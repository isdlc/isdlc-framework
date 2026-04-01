## Build Command (Codex)
Start the implementation workflow for an analyzed backlog item.

### Usage
```
/build "<item>"
/build "#42"
/build "item" --supervised
```

### Description
Codex projection for the `/build` command. Delegates to the isdlc build handler.

### Implementation
Invoke the isdlc command with action `build` and forward all arguments.
