## Analyze Command
Run interactive roundtable analysis on a backlog item.

### Usage
```
/analyze "<item>"
/analyze "#42"
/analyze "JIRA-1250"
/analyze -light "config-update"
```

### Description
The `/analyze` command runs a multi-persona roundtable analysis on a backlog item. It handles both bugs and features — classifying the item automatically and routing to the appropriate analysis flow.

For bugs: runs a bug roundtable (requirements + tracing) then auto-kicks off the build.
For features: runs a feature roundtable (requirements, impact analysis, architecture, design) then marks the item as ready to build.

This is a thin wrapper that delegates to `/isdlc analyze`. All arguments are forwarded.

### Implementation
When this command is invoked, delegate to the isdlc skill:

```
/isdlc analyze {args}
```

Where `{args}` is the full argument string passed by the user.
