## Add Command (Codex)
Add a new item to the iSDLC backlog.

### Usage
```
/add "<description>"
/add "#42"
/add "JIRA-1250"
```

### Description
Codex projection for the `/add` command. Delegates to the isdlc add handler.

### Implementation
Invoke the isdlc command with action `add` and forward all arguments.
