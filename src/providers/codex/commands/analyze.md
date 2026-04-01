## Analyze Command (Codex)
Run interactive roundtable analysis on a backlog item.

### Usage
```
/analyze "<item>"
/analyze "#42"
/analyze "JIRA-1250"
```

### Description
Codex projection for the `/analyze` command. Delegates to the isdlc analyze handler.

### Implementation
Invoke the isdlc command with action `analyze` and forward all arguments.
