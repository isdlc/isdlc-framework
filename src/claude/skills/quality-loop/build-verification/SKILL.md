# QL-007: build-verification

## Description
Verify clean build from scratch with language-aware build command detection, mechanical error auto-fix, and honest failure reporting for logical errors.

## Owner
- **Agent**: quality-loop-engineer
- **Phase**: 16-quality-loop

## Usage
This skill is invoked during the Phase 16 quality loop. It is part of the parallel quality check that runs testing and automated QA simultaneously.

## Language-Aware Build Command Detection

Detect the project's build system by scanning for known build files. The detection is ordered by specificity -- use the first match found.

| Build File | Language | Build Command |
|-----------|----------|---------------|
| `pom.xml` | Java (Maven) | `mvn compile -q` |
| `build.gradle` | Java/Kotlin (Gradle) | `gradle build` |
| `package.json` | JS/TS (npm) | `npm run build` or `npx tsc --noEmit` |
| `Cargo.toml` | Rust | `cargo check` |
| `go.mod` | Go | `go build ./...` |
| `pyproject.toml` | Python | `python -m py_compile` (or skip) |
| `*.sln` / `*.csproj` | .NET | `dotnet build` |
| None detected | Any | Skip with warning (graceful degradation) |

When no build system is detected, the skill skips the build check with a warning. This is graceful degradation -- the workflow continues normally.

## Error Classification

Build errors are classified into two categories:

- **Mechanical** -- Auto-fixable issues: missing imports, wrong paths, incorrect package names, missing dependencies
- **Logical** -- Not auto-fixable: type mismatches, wrong API usage, missing method signatures, structural code errors

## Auto-Fix Procedures

For mechanical errors, the skill applies auto-fix within a bounded loop (maximum 3 iterations):

1. Parse build error output to identify mechanical issues
2. Apply targeted fix (correct import path, add dependency, fix package name)
3. Re-run build command
4. If still failing, repeat (up to 3 times)
5. After 3 iterations, escalate remaining errors with classification

## Failure Reporting

For logical errors (not auto-fixable), report failure honestly:

- List specific compilation errors with file paths
- Classify each error as mechanical or logical
- Do NOT declare QA APPROVED -- the build is broken
- Suggest `/isdlc analyze "<issue description>"` to address remaining issues

## Observability
Skill usage is logged for observability. Cross-phase usage is recorded but never blocked.
