## Add Command
Add a new item to the iSDLC backlog.

### Usage
```
/add "<description>"
/add "#42"
/add "JIRA-1250"
```

### Description
The `/add` command adds items to the backlog for later analysis and implementation. It supports GitHub issues (`#N`), Jira tickets (`PROJECT-N`), and manual descriptions.

This is a thin wrapper that delegates to `/isdlc add`. All arguments are forwarded.

### Implementation
When this command is invoked, delegate to the isdlc skill:

```
/isdlc add {args}
```

Where `{args}` is the full argument string passed by the user.
