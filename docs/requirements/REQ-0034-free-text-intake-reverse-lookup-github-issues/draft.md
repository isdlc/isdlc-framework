# Free-text intake: reverse-lookup GitHub issues and auto-create if no match found

**Source**: manual
**Created**: 2026-02-22

## Description

When a user provides free text to `/isdlc add` or `/isdlc analyze` (rather than a `#N` GitHub issue or `PROJECT-N` Jira ticket reference), the framework should:

1. Search existing GitHub issues for a matching issue (using `gh issue list --search "..."`)
2. If a match is found, link to the existing issue (set `source = "github"`, `source_id = "GH-N"`)
3. If no match is found, offer to create a new GitHub issue and link it
4. Then proceed with the normal add/analyze flow

Currently, free-text input creates a `source: "manual"` entry with no external tracking link, which means there's no GitHub issue for tracking, no labels, no project board visibility.
