# Change Record: REQ-0033-framework-file-operations-permission-GH-3

Audit trail for trivial-tier changes. Each entry below represents
a direct edit made without a full workflow.

---

## Entry: 2026-02-21T16:15:00.000Z

**Tier**: trivial
**Summary**: Added Write and Edit allow patterns for .isdlc/ paths to src/claude/settings.json so framework file operations (state.json, hook-activity.log, etc.) don't prompt the user for permission. Also updated .claude/settings.json (gitignored local deploy) with the same patterns.
**Files Modified**:
- src/claude/settings.json
- .claude/settings.json (gitignored, local only)

**Commit**: 37a1501

### Diff Summary

#### src/claude/settings.json
```diff
@@ -166,7 +166,9 @@
       "Bash(SKILL_VALIDATOR_DEBUG=*)",
       "Bash(CI=*)",
       "Bash(NODE_ENV=*)",
-      "Bash(PATH=*)"
+      "Bash(PATH=*)",
+      "Write(*/.isdlc/*)",
+      "Edit(*/.isdlc/*)"
     ]
   },
   "hooks": {
```
