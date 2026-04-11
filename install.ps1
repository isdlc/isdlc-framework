<#
.SYNOPSIS
    iSDLC Framework - Install Script for Windows
.DESCRIPTION
    Installs the iSDLC framework into your existing project.

    Usage:
      1. Clone the iSDLC framework into your project: git clone <repo> isdlc-framework
      2. Run: .\isdlc-framework\install.ps1
      3. The script will set up the framework and clean up after itself

    What it does:
      - Creates or merges .claude/ folder with agent definitions and skills
      - Creates docs/ folder for requirements and documentation
      - Creates .isdlc/ folder for project state tracking
      - Removes the isdlc-framework folder after installation
.NOTES
    Requires: PowerShell 5.1+ (Windows PowerShell) or PowerShell 7+ (pwsh)
    No external modules required.

    Execution Policy: If blocked, run one of:
      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
      powershell -ExecutionPolicy Bypass -File .\install.ps1
.PARAMETER Force
    Skip all interactive prompts, use default values.
.PARAMETER Help
    Display usage text and exit.
.EXAMPLE
    .\install.ps1
    Interactive installation with prompts.
.EXAMPLE
    .\install.ps1 -Force
    Non-interactive installation with all defaults.
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Help
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# ── Helper Functions ─────────────────────────────────────────

function Write-Banner {
    param(
        [Parameter(Mandatory)] [string]$Text
    )
    $border = [string]::new([char]0x2550, 60)
    $top    = [char]0x2554 + $border + [char]0x2557
    $bottom = [char]0x255A + $border + [char]0x255D
    $side   = [char]0x2551
    $padded = $Text.PadRight(58)
    Write-Host ""
    Write-Host $top -ForegroundColor Cyan
    Write-Host "$side  $padded  $side" -ForegroundColor Cyan
    Write-Host $bottom -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param(
        [Parameter(Mandatory)] [string]$Number,
        [Parameter(Mandatory)] [string]$Total,
        [Parameter(Mandatory)] [string]$Message
    )
    Write-Host "[$Number/$Total] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param(
        [Parameter(Mandatory)] [string]$Message
    )
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param(
        [Parameter(Mandatory)] [string]$Message
    )
    Write-Host "  $Message" -ForegroundColor Yellow
}

function Write-Err {
    param(
        [Parameter(Mandatory)] [string]$Message
    )
    Write-Host "  $Message" -ForegroundColor Red
}

function ConvertTo-ForwardSlashPath {
    param(
        [Parameter(Mandatory)] [string]$Path
    )
    return $Path -replace '\\', '/'
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Content
    )
    $Content = $Content -replace "`r`n", "`n"
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Merge-JsonDeep {
    param(
        [Parameter(Mandatory)] $Base,
        [Parameter(Mandatory)] $Override
    )
    if ($null -eq $Base) { return $Override }
    if ($null -eq $Override) { return $Base }

    $Result = $Base.PSObject.Copy()
    foreach ($prop in $Override.PSObject.Properties) {
        $name = $prop.Name
        $overrideVal = $prop.Value
        if ($Result.PSObject.Properties[$name]) {
            $baseVal = $Result.$name
            if ($baseVal -is [PSCustomObject] -and $overrideVal -is [PSCustomObject]) {
                $Result.$name = Merge-JsonDeep -Base $baseVal -Override $overrideVal
            }
            else {
                $Result.$name = $overrideVal
            }
        }
        else {
            $Result | Add-Member -NotePropertyName $name -NotePropertyValue $overrideVal
        }
    }
    return $Result
}

function Read-JsonFile {
    param(
        [Parameter(Mandatory)] [string]$Path
    )
    if (-not (Test-Path $Path)) { return $null }
    try {
        $content = Get-Content $Path -Raw -ErrorAction Stop
        return $content | ConvertFrom-Json
    }
    catch {
        Write-Warn "Failed to parse JSON: $Path"
        return $null
    }
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] $Object,
        [int]$Depth = 10
    )
    $json = $Object | ConvertTo-Json -Depth $Depth
    Write-Utf8NoBom -Path $Path -Content $json
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory)] [string]$FullPath,
        [Parameter(Mandatory)] [string]$BasePath
    )
    $normalizedBase = $BasePath.TrimEnd('\', '/')
    $rel = $FullPath.Substring($normalizedBase.Length)
    if ($rel.StartsWith('\') -or $rel.StartsWith('/')) {
        $rel = $rel.Substring(1)
    }
    return ConvertTo-ForwardSlashPath $rel
}

# ── Script-Specific Functions ────────────────────────────────

function Test-ProjectExists {
    param([string]$Root)
    $markers = @(
        "package.json", "requirements.txt", "pyproject.toml",
        "go.mod", "Cargo.toml", "pom.xml", "build.gradle",
        "Gemfile", "composer.json", "Makefile"
    )
    foreach ($m in $markers) {
        if (Test-Path (Join-Path $Root $m)) { return $true }
    }
    $dirs = @("src", "lib", "app", "pkg", "cmd")
    foreach ($d in $dirs) {
        if (Test-Path (Join-Path $Root $d) -PathType Container) { return $true }
    }
    $extensions = @("*.js","*.ts","*.py","*.go","*.rs","*.java","*.rb","*.php","*.cs")
    foreach ($ext in $extensions) {
        $found = Get-ChildItem $Root -Filter $ext -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $true }
    }
    return $false
}

function Test-MonorepoIndicators {
    param([string]$Root)
    $workspaceFiles = @{
        "pnpm-workspace.yaml" = "pnpm"
        "lerna.json"          = "lerna"
        "turbo.json"          = "turbo"
        "nx.json"             = "nx"
        "rush.json"           = "rush"
    }
    foreach ($entry in $workspaceFiles.GetEnumerator()) {
        if (Test-Path (Join-Path $Root $entry.Key)) {
            return @{ IsMonorepo = $true; Type = $entry.Value; Projects = @() }
        }
    }

    # Check directory structure (apps/, packages/, services/)
    $subprojectCount = 0
    foreach ($dir in @("apps", "packages", "services")) {
        $path = Join-Path $Root $dir
        if (Test-Path $path -PathType Container) {
            $children = Get-ChildItem $path -Directory -ErrorAction SilentlyContinue
            if ($children) {
                $subprojectCount += @($children).Count
            }
        }
    }
    if ($subprojectCount -ge 2) {
        return @{ IsMonorepo = $true; Type = "directory-structure"; Projects = @() }
    }

    # Check root-level directories with project markers
    $scriptDirName = Split-Path -Leaf $ScriptDir
    $skipDirs = @(".claude",".isdlc",".git","docs","node_modules","scripts",
                  "vendor","dist","build","target",$scriptDirName)
    $rootProjects = @()
    $rootChildren = Get-ChildItem $Root -Directory -ErrorAction SilentlyContinue
    if ($rootChildren) {
        foreach ($dir in $rootChildren) {
            if ($skipDirs -contains $dir.Name) { continue }
            $hasMarker = $false
            foreach ($marker in @("package.json","go.mod","Cargo.toml","pyproject.toml","pom.xml","build.gradle")) {
                if (Test-Path (Join-Path $dir.FullName $marker)) { $hasMarker = $true; break }
            }
            if (-not $hasMarker -and (Test-Path (Join-Path $dir.FullName "src") -PathType Container)) {
                $hasMarker = $true
            }
            if ($hasMarker) { $rootProjects += $dir.Name }
        }
    }
    if ($rootProjects.Count -ge 2) {
        return @{ IsMonorepo = $true; Type = "root-directories"; Projects = $rootProjects }
    }

    return @{ IsMonorepo = $false; Type = ""; Projects = @() }
}

function New-ManifestJson {
    param(
        [string]$ProjectRoot,
        [string]$Timestamp,
        [string]$FrameworkVersion
    )

    $files = [System.Collections.ArrayList]::new()

    foreach ($dir in @("agents","skills","commands","hooks")) {
        $dirPath = Join-Path (Join-Path $ProjectRoot ".claude") $dir
        if (Test-Path $dirPath) {
            Get-ChildItem $dirPath -Recurse -File | ForEach-Object {
                [void]$files.Add((Get-RelativePath $_.FullName $ProjectRoot))
            }
        }
    }

    $settingsPath = Join-Path (Join-Path $ProjectRoot ".claude") "settings.json"
    if (Test-Path $settingsPath) {
        [void]$files.Add(".claude/settings.json")
    }

    return [PSCustomObject]@{
        version = "1.0.0"
        created = $Timestamp
        framework_version = $FrameworkVersion
        files = $files.ToArray()
    }
}

# ── Main Logic ───────────────────────────────────────────────

# Help
if ($Help) {
    Write-Host "iSDLC Framework - Install Script for Windows"
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [-Force] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -Force    Skip all interactive prompts, use default values"
    Write-Host "  -Help     Display this help message"
    Write-Host ""
    Write-Host "What it does:"
    Write-Host "  - Creates or merges .claude/ folder with agent definitions and skills"
    Write-Host "  - Creates docs/ folder for requirements and documentation"
    Write-Host "  - Creates .isdlc/ folder for project state tracking"
    Write-Host "  - Removes the isdlc-framework folder after installation"
    exit 0
}

# Determine directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrameworkDir = Join-Path $ScriptDir "src"
$FrameworkClaude = Join-Path $FrameworkDir "claude"
$FrameworkIsdlc = Join-Path $FrameworkDir "isdlc"
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Install-failure safety net: if the script exits before the explicit
# Remove-Item $CleanupDir at the end, tell the user where the half-installed
# framework folder is and how to clean it up. Flipped to $true only after the
# successful Remove-Item, so clean runs produce no extra output. Matches the
# EXIT trap pattern in install.sh.
$Script:InstallCompleted = $false
trap {
    if (-not $Script:InstallCompleted -and $ScriptDir -and (Test-Path $ScriptDir)) {
        Write-Host ""
        Write-Host "Install failed. Framework folder left in place:" -ForegroundColor Red
        Write-Host "  $ScriptDir"
        Write-Host ""
        Write-Host "Fix the error above, then either re-run the installer or remove" -ForegroundColor Yellow
        Write-Host "the framework folder manually:" -ForegroundColor Yellow
        Write-Host "  Remove-Item -Recurse -Force '$ScriptDir'"
        Write-Host ""
    }
    # Re-raise the terminating error so the script still exits non-zero
    break
}

# ============================================================================
# Sanity check: $ScriptDir must be an iSDLC framework clone
# ============================================================================
# Catches the "extracted framework files into project root and ran install.ps1"
# failure mode. In the correct layout the script lives at
# <project>\isdlc-framework\install.ps1, so $ScriptDir contains the framework
# source tree and specific marker files. Mirror of install.sh sanity block.
$sanityErrors = @()
if (-not (Test-Path (Join-Path $ScriptDir "ANTIGRAVITY.md"))) {
    $sanityErrors += "    - missing: $ScriptDir\ANTIGRAVITY.md"
}
if (-not (Test-Path (Join-Path $ScriptDir "src\claude\agents"))) {
    $sanityErrors += "    - missing: $ScriptDir\src\claude\agents\"
}
if (-not (Test-Path (Join-Path $ScriptDir "bin\isdlc.js"))) {
    $sanityErrors += "    - missing: $ScriptDir\bin\isdlc.js"
}
$pkgJsonPath = Join-Path $ScriptDir "package.json"
if (Test-Path $pkgJsonPath) {
    $pkgContent = Get-Content $pkgJsonPath -Raw -ErrorAction SilentlyContinue
    # Accept any name containing "isdlc": "isdlc", "isdlc-framework",
    # "@isdlc/framework", "@some-scope/isdlc", etc.
    if ($pkgContent -and $pkgContent -notmatch '"name"\s*:\s*"[^"]*isdlc[^"]*"') {
        $sanityErrors += "    - $ScriptDir\package.json name does not contain 'isdlc'"
    }
}
if ($sanityErrors.Count -gt 0) {
    # Don't let the trap fire its "framework left behind" message here — in
    # this case $ScriptDir is likely the user's actual project root and we
    # explicitly do NOT want to suggest Remove-Item'ing it.
    $Script:InstallCompleted = $true
    Write-Host ""
    Write-Host "ERROR: install.ps1 is not running from an iSDLC framework clone." -ForegroundColor Red
    Write-Host ""
    Write-Host "Sanity check failures:" -ForegroundColor Yellow
    foreach ($line in $sanityErrors) { Write-Host $line }
    Write-Host ""
    Write-Host "Correct usage:" -ForegroundColor Cyan
    Write-Host "  git clone <repo-url> isdlc-framework"
    Write-Host "  .\isdlc-framework\install.ps1"
    Write-Host ""
    Write-Host "Do NOT extract framework files into your project root." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If you extracted framework files into a project directory by mistake,"
    Write-Host "run the content-aware cleanup tool (ships with any correct clone):"
    Write-Host "  bash <framework-path>/scripts/recover-stray-framework.sh"
    Write-Host ""
    exit 1
}

# ── Step 0: Prerequisites cleanup ────────────────────────────

# Remove development files from framework clone
Remove-Item (Join-Path $ScriptDir ".git") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir ".gitignore") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir ".npmignore") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "CHANGELOG.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "NEXT-SESSION.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "CLAUDE.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "BACKLOG.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "framework-info.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "setup-remotes.sh") -Force -ErrorAction SilentlyContinue

# Development session logs
$sessionDocs = Join-Path $ScriptDir "docs"
if (Test-Path $sessionDocs) {
    Get-ChildItem $sessionDocs -Filter "SESSION-*.md" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    $archiveDir = Join-Path $sessionDocs "archive"
    if (Test-Path $archiveDir) {
        Remove-Item $archiveDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Dogfooding docs (analysis artifacts, constitution, etc.)
foreach ($dir in @("requirements", "isdlc", "architecture", "design", "common", "testing", ".validations")) {
    $dirPath = Join-Path $sessionDocs $dir
    if (Test-Path $dirPath) {
        Remove-Item $dirPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Remove-Item (Join-Path $sessionDocs "agent-skill-mapping.md") -Force -ErrorAction SilentlyContinue
Get-ChildItem $sessionDocs -Filter "BUG-*" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Test files (not distributed to end users)
Remove-Item (Join-Path $ScriptDir "tests") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "src" "claude" "hooks" "tests") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir "coverage") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScriptDir ".validations") -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $ScriptDir "lib") -Filter "*.test.js" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $ScriptDir "lib") -Filter "*.test.cjs" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
$testHelpers = Join-Path $ScriptDir "lib" "utils" "test-helpers.js"
if (Test-Path $testHelpers) { Remove-Item $testHelpers -Force -ErrorAction SilentlyContinue }

# Development tooling
Remove-Item (Join-Path $ScriptDir "src" "claude" "agents-backup") -Recurse -Force -ErrorAction SilentlyContinue
# scripts/ is NOT cleaned up here — it now holds user-facing recovery tools
# (scripts/recover-stray-framework.sh) that install.ps1 copies to
# .isdlc/scripts/ below. Dev-only scripts were moved out of this directory.
Remove-Item (Join-Path $ScriptDir ".github") -Recurse -Force -ErrorAction SilentlyContinue

# OS artifacts
Get-ChildItem $ScriptDir -Filter ".DS_Store" -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# ── Step 0b: Banner + Confirmation ───────────────────────────

Write-Banner "iSDLC Framework - Project Installation"
Write-Host "  Project Directory: $ProjectRoot" -ForegroundColor Blue
Write-Host ""

Write-Host "  This will install the iSDLC framework into your project:" -ForegroundColor Yellow
Write-Host "    - .claude/        (agents and skills)"
Write-Host "    - .isdlc/         (project state tracking)"
Write-Host "    - docs/           (requirements and documentation)"
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "  Continue with installation? [Y/n]"
    if ([string]::IsNullOrEmpty($confirm)) { $confirm = "Y" }
    if ($confirm -notmatch '^[Yy]$') {
        Write-Err "Installation cancelled."
        exit 0
    }
}

Write-Host ""

# Get project name from directory
$ProjectName = Split-Path -Leaf $ProjectRoot
Write-Host "  Project Name: $ProjectName" -ForegroundColor Blue

# ── Step 0c: Detect Existing Project ─────────────────────────

$IsExistingProject = Test-ProjectExists -Root $ProjectRoot

# ── Step 0d: Detect Monorepo ─────────────────────────────────

$monoResult = Test-MonorepoIndicators -Root $ProjectRoot
$IsMonorepo = $monoResult.IsMonorepo
$MonorepoType = $monoResult.Type
$DetectedProjects = @()

# Auto-detect projects in monorepo
if ($IsMonorepo) {
    foreach ($scanDir in @("apps", "packages", "services")) {
        $scanPath = Join-Path $ProjectRoot $scanDir
        if (Test-Path $scanPath -PathType Container) {
            $projDirs = Get-ChildItem $scanPath -Directory -ErrorAction SilentlyContinue
            if ($projDirs) {
                foreach ($projDir in $projDirs) {
                    $projRelPath = "$scanDir/$($projDir.Name)"
                    $DetectedProjects += @{ Name = $projDir.Name; Path = $projRelPath }
                }
            }
        }
    }
    # Also include root-level project directories (from Test-MonorepoIndicators)
    if ($monoResult.Projects.Count -gt 0) {
        foreach ($dirName in $monoResult.Projects) {
            $alreadyAdded = $false
            foreach ($existing in $DetectedProjects) {
                if ($existing.Name -eq $dirName) { $alreadyAdded = $true; break }
            }
            if (-not $alreadyAdded) {
                $DetectedProjects += @{ Name = $dirName; Path = $dirName }
            }
        }
    }
}

# ── Step 0e: Monorepo Confirmation ───────────────────────────

Write-Host ""
if ($IsMonorepo) {
    Write-Banner "MONOREPO INDICATORS DETECTED"
    Write-Warn "This appears to be a monorepo ($MonorepoType)."
    if ($DetectedProjects.Count -gt 0) {
        Write-Warn "Detected $($DetectedProjects.Count) sub-projects:"
        foreach ($proj in $DetectedProjects) {
            Write-Host "    - $($proj.Name) ($($proj.Path))"
        }
    }
    Write-Host ""
    if (-not $Force) {
        $monoAnswer = Read-Host "  Is this a monorepo? [Y/n]"
        if ([string]::IsNullOrEmpty($monoAnswer)) { $monoAnswer = "Y" }
    }
    else {
        # -Force defaults to single-project
        $monoAnswer = "N"
    }
}
else {
    if ($IsExistingProject) {
        Write-Banner "EXISTING PROJECT DETECTED"
        Write-Warn "This appears to be an existing project with code."
    }
    else {
        Write-Banner "NEW PROJECT DETECTED"
        Write-Warn "This appears to be a new project."
    }
    Write-Host ""
    if (-not $Force) {
        $monoAnswer = Read-Host "  Is this a monorepo? [y/N]"
        if ([string]::IsNullOrEmpty($monoAnswer)) { $monoAnswer = "N" }
    }
    else {
        $monoAnswer = "N"
    }
}

# User's answer is final
if ($monoAnswer -match '^[Yy]$') {
    $IsMonorepo = $true
    if ([string]::IsNullOrEmpty($MonorepoType)) { $MonorepoType = "user-specified" }

    # If projects were detected, let user confirm or edit
    if ($DetectedProjects.Count -gt 0 -and -not $Force) {
        Write-Host ""
        Write-Warn "Detected sub-projects:"
        foreach ($proj in $DetectedProjects) {
            Write-Host "    - $($proj.Name) ($($proj.Path))"
        }
        Write-Host ""
        $useDetected = Read-Host "  Use these projects? [Y/n]"
        if ([string]::IsNullOrEmpty($useDetected)) { $useDetected = "Y" }
        if ($useDetected -notmatch '^[Yy]$') {
            $DetectedProjects = @()
        }
    }

    # If no projects (none detected or user rejected), ask for manual entry
    if ($DetectedProjects.Count -eq 0 -and -not $Force) {
        Write-Host ""
        Write-Warn "Enter project directories (comma-separated, relative to project root):"
        Write-Warn "  Example: frontend, backend, shared"
        $manualDirs = Read-Host "  >"
        if (-not [string]::IsNullOrEmpty($manualDirs)) {
            $dirArray = $manualDirs -split ','
            foreach ($rawDir in $dirArray) {
                $dirTrimmed = $rawDir.Trim()
                if ([string]::IsNullOrEmpty($dirTrimmed)) { continue }
                if (Test-Path (Join-Path $ProjectRoot $dirTrimmed) -PathType Container) {
                    $dirBase = Split-Path -Leaf $dirTrimmed
                    $DetectedProjects += @{ Name = $dirBase; Path = $dirTrimmed }
                    Write-Success "$dirTrimmed"
                }
                else {
                    Write-Err "$dirTrimmed (not found -- skipping)"
                }
            }
        }
        if ($DetectedProjects.Count -eq 0) {
            Write-Err "No valid project directories found. Falling back to single-project mode."
            $IsMonorepo = $false
        }
    }
}
else {
    $IsMonorepo = $false
    Write-Warn "Installing as single-project."
}
Write-Host ""

# ── Step 0f: Claude Code Detection ───────────────────────────

Write-Banner "CLAUDE CODE DETECTION"

$ClaudeCodeFound = $false
$ClaudeCodeVersion = ""

$claudeCmd = Get-Command "claude" -ErrorAction SilentlyContinue
if ($null -ne $claudeCmd) {
    try {
        $ClaudeCodeVersion = & claude --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ClaudeCodeFound = $true
            Write-Success "Claude Code detected: $ClaudeCodeVersion"
        }
        else {
            $ClaudeCodeFound = $false
        }
    }
    catch {
        $ClaudeCodeFound = $false
    }
}

if (-not $ClaudeCodeFound) {
    Write-Err "Claude Code CLI not found on PATH"
    Write-Host ""
    Write-Warn "iSDLC is a framework designed for Claude Code."
    Write-Warn "It requires the 'claude' CLI to function."
    Write-Host ""
    Write-Host "  Install Claude Code:" -ForegroundColor Cyan
    Write-Success "https://docs.anthropic.com/en/docs/claude-code/overview"
    Write-Host ""
    if (-not $Force) {
        $claudeContinue = Read-Host "  Continue anyway? Framework files will be ready when you install Claude Code. [y/N]"
        if ([string]::IsNullOrEmpty($claudeContinue)) { $claudeContinue = "N" }
        if ($claudeContinue -notmatch '^[Yy]$') {
            Write-Err "Installation cancelled. Install Claude Code first, then re-run."
            exit 0
        }
    }
}
Write-Host ""

# ── Step 0g: LLM Provider Selection ───────────────────────────

Write-Banner "LLM PROVIDER SELECTION"

Write-Warn "Choose how Claude Code connects to an LLM:"
Write-Host ""
Write-Host "  1) Claude Code (Anthropic API) -- Recommended"
Write-Host "  2) Ollama (local LLM)"
Write-Host ""

if (-not $Force) {
    $providerAnswer = Read-Host "  Choice [1]"
    if ([string]::IsNullOrEmpty($providerAnswer)) { $providerAnswer = "1" }
}
else {
    $providerAnswer = "1"
}

switch ($providerAnswer) {
    "1" { $ProviderMode = "claude-code" }
    "2" { $ProviderMode = "ollama" }
    default {
        $ProviderMode = "claude-code"
        Write-Warn "Invalid choice -- defaulting to Claude Code"
    }
}
Write-Success "Provider: $ProviderMode"
Write-Host ""

# Workflow track is determined by orchestrator at runtime
$Track = "auto"
$TrackName = "Orchestrator-managed"

Set-Location $ProjectRoot

# ============================================================================
# Step 1/6: Handle .claude folder
# ============================================================================
Write-Step "1" "6" "Setting up .claude folder..."

if (-not (Test-Path $FrameworkClaude -PathType Container)) {
    Write-Err "Error: Framework .claude folder not found at $FrameworkClaude"
    exit 1
}

# Delete CLAUDE.md from the framework's .claude folder (it's for framework development only)
$fwClaudeMd = Join-Path $FrameworkClaude "CLAUDE.md"
if (Test-Path $fwClaudeMd) {
    Remove-Item $fwClaudeMd -Force
    Write-Warn "Removed framework CLAUDE.md (not needed for user projects)"
}

$claudeDir = Join-Path $ProjectRoot ".claude"
if (Test-Path $claudeDir -PathType Container) {
    Write-Warn "Existing .claude folder found - merging contents..."

    # Backup existing CLAUDE.md if it exists
    $existingClaudeMd = Join-Path $claudeDir "CLAUDE.md"
    if (Test-Path $existingClaudeMd) {
        Write-Warn "Backing up existing CLAUDE.md to CLAUDE.md.backup"
        Copy-Item $existingClaudeMd (Join-Path $claudeDir "CLAUDE.md.backup") -Force
    }

    # Copy agents, commands, skills (overwrite)
    foreach ($subDir in @("agents", "commands", "skills")) {
        $src = Join-Path $FrameworkClaude $subDir
        if (Test-Path $src -PathType Container) {
            Copy-Item $src $claudeDir -Recurse -Force
            Write-Success "Copied $subDir/"
        }
    }

    # Copy or merge settings.local.json
    $fwSettingsLocal = Join-Path $FrameworkClaude "settings.local.json"
    $projSettingsLocal = Join-Path $claudeDir "settings.local.json"
    if (Test-Path $fwSettingsLocal) {
        if (Test-Path $projSettingsLocal) {
            $existingLocal = Read-JsonFile $projSettingsLocal
            $frameworkLocal = Read-JsonFile $fwSettingsLocal
            if ($null -ne $existingLocal -and $null -ne $frameworkLocal) {
                $merged = Merge-JsonDeep -Base $existingLocal -Override $frameworkLocal
                Write-JsonFile $projSettingsLocal $merged
                Write-Success "Merged settings.local.json"
            }
            else {
                Write-Warn "Warning: Could not merge settings.local.json -- may need manual merge"
                Copy-Item $fwSettingsLocal "$projSettingsLocal.new" -Force
            }
        }
        else {
            Copy-Item $fwSettingsLocal $claudeDir -Force
            Write-Success "Copied settings.local.json"
        }
    }
}
else {
    Write-Warn "Creating new .claude folder..."
    New-Item $claudeDir -ItemType Directory -Force | Out-Null

    foreach ($subDir in @("agents", "commands", "skills")) {
        $src = Join-Path $FrameworkClaude $subDir
        if (Test-Path $src -PathType Container) {
            Copy-Item $src $claudeDir -Recurse -Force
        }
    }
    $fwSettingsLocal = Join-Path $FrameworkClaude "settings.local.json"
    if (Test-Path $fwSettingsLocal) {
        Copy-Item $fwSettingsLocal $claudeDir -Force
    }
    Write-Success "Created .claude/"
}

# Permission review warning
Write-Host ""
Write-Warn "Review .claude/settings.local.json permissions -- adjust if your security requirements differ"

# ============================================================================
# Step 1b/6: Setup skill enforcement hooks
# ============================================================================
Write-Step "1b" "6" "Setting up skill enforcement hooks..."

# Check for Node.js
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
    Write-Warn "Warning: Node.js not found. Hooks require Node.js to run."
    Write-Warn "Install Node.js from https://nodejs.org/"
}

# Create hooks directory structure
$hooksDir = Join-Path $claudeDir "hooks"
$hooksLibDir = Join-Path $hooksDir "lib"
$hooksDispatchersDir = Join-Path $hooksDir "dispatchers"
$hooksTestsDir = Join-Path (Join-Path $hooksDir "tests") "test-scenarios"
New-Item $hooksLibDir -ItemType Directory -Force | Out-Null
New-Item $hooksDispatchersDir -ItemType Directory -Force | Out-Null
New-Item $hooksTestsDir -ItemType Directory -Force | Out-Null

# Copy hook scripts from framework
$fwHooks = Join-Path $FrameworkClaude "hooks"
if (Test-Path $fwHooks -PathType Container) {
    Copy-Item (Join-Path $fwHooks "*") $hooksDir -Recurse -Force
    Write-Success "Copied skill enforcement hooks (Node.js)"
}

# Merge settings.json (hooks configuration)
$fwSettings = Join-Path $FrameworkClaude "settings.json"
$projSettings = Join-Path $claudeDir "settings.json"
if (Test-Path $fwSettings) {
    if (Test-Path $projSettings) {
        $existingSettings = Read-JsonFile $projSettings
        $frameworkSettings = Read-JsonFile $fwSettings
        if ($null -ne $existingSettings -and $null -ne $frameworkSettings) {
            $merged = Merge-JsonDeep -Base $existingSettings -Override $frameworkSettings
            Write-JsonFile $projSettings $merged
            Write-Success "Merged hooks into existing settings.json"
        }
        else {
            Write-Warn "Warning: Could not merge settings.json -- may need manual merge"
            Copy-Item $fwSettings "$projSettings.hooks" -Force
        }
    }
    else {
        Copy-Item $fwSettings $projSettings -Force
        Write-Success "Created settings.json with hooks"
    }
}

# ============================================================================
# Step 2/6: Create docs folder
# ============================================================================
Write-Step "2" "6" "Setting up docs folder..."

$docsDir = Join-Path $ProjectRoot "docs"
if (Test-Path $docsDir -PathType Container) {
    Write-Warn "docs/ folder already exists"
}
else {
    New-Item $docsDir -ItemType Directory -Force | Out-Null
    Write-Success "Created docs/"
}

# Create initial structure
foreach ($sub in @("requirements", "architecture", "design")) {
    New-Item (Join-Path $docsDir $sub) -ItemType Directory -Force | Out-Null
}
$isdlcChecklists = Join-Path (Join-Path $docsDir "isdlc") "checklists"
New-Item $isdlcChecklists -ItemType Directory -Force | Out-Null
Write-Success "Created docs/isdlc/ for iSDLC documents"

# Copy templates to docs if they exist
$reqTemplates = Join-Path (Join-Path $FrameworkIsdlc "templates") "requirements"
if (Test-Path $reqTemplates -PathType Container) {
    $mdFiles = Get-ChildItem $reqTemplates -Filter "*.md" -ErrorAction SilentlyContinue
    if ($mdFiles) {
        foreach ($f in $mdFiles) {
            Copy-Item $f.FullName (Join-Path $docsDir "requirements") -Force
        }
        Write-Success "Copied requirement templates to docs/requirements/"
    }
}

# Create a README in docs
$docsReadme = @'
# Project Documentation

This folder contains all project documentation following the iSDLC framework.

## Structure

```
docs/
+-- isdlc/              # iSDLC-generated documents
|   +-- constitution.md # Project constitution
|   +-- tasks.md        # Task plan
|   +-- checklists/     # Gate checklist responses
+-- requirements/       # Requirements specifications and user stories
+-- architecture/       # Architecture decisions and system design
+-- design/            # Detailed design documents
+-- README.md          # This file
```

## Getting Started

1. Start with requirements in `requirements/`
2. Document architecture decisions in `architecture/`
3. Add detailed designs in `design/`

See `.isdlc/state.json` for current project phase and progress.
'@
Write-Utf8NoBom -Path (Join-Path $docsDir "README.md") -Content $docsReadme
Write-Success "Created docs/README.md"

# ============================================================================
# Step 3/6: Create .isdlc folder with state
# ============================================================================
Write-Step "3" "6" "Setting up .isdlc folder..."

$isdlcDir = Join-Path $ProjectRoot ".isdlc"

# Create phase artifact directories
$phases = @(
    "01-requirements","02-architecture","03-design","04-test-strategy",
    "05-implementation","06-testing","07-code-review","08-validation",
    "09-cicd","10-local-testing","11-test-deploy","12-production","13-operations"
)
foreach ($phase in $phases) {
    $artifactsDir = Join-Path (Join-Path (Join-Path $isdlcDir "phases") $phase) "artifacts"
    New-Item $artifactsDir -ItemType Directory -Force | Out-Null
}

# Copy config files
$fwConfig = Join-Path $FrameworkIsdlc "config"
if (Test-Path $fwConfig -PathType Container) {
    Copy-Item $fwConfig $isdlcDir -Recurse -Force
    Write-Success "Copied config files"
}

# Copy skills manifest to hooks config folder
$hooksConfigDir = Join-Path (Join-Path $claudeDir "hooks") "config"
New-Item $hooksConfigDir -ItemType Directory -Force | Out-Null

$yamlManifest = Join-Path (Join-Path $FrameworkIsdlc "config") "skills-manifest.yaml"
if (Test-Path $yamlManifest) {
    Copy-Item $yamlManifest $hooksConfigDir -Force
}

# Copy pre-built JSON manifest for runtime hooks
$jsonManifest = $null
$candidate1 = Join-Path (Join-Path $FrameworkClaude "hooks") (Join-Path "config" "skills-manifest.json")
$candidate2 = Join-Path (Join-Path $FrameworkIsdlc "config") "skills-manifest.json"

if (Test-Path $candidate1) { $jsonManifest = $candidate1 }
elseif (Test-Path $candidate2) { $jsonManifest = $candidate2 }

if ($null -ne $jsonManifest) {
    Copy-Item $jsonManifest $hooksConfigDir -Force
    Write-Success "Copied skills manifest to hooks/config/"
}
else {
    # Try yq or python as fallback
    $yqCmd = Get-Command "yq" -ErrorAction SilentlyContinue
    $yamlTarget = Join-Path $hooksConfigDir "skills-manifest.yaml"
    $jsonTarget = Join-Path $hooksConfigDir "skills-manifest.json"
    if ($null -ne $yqCmd -and (Test-Path $yamlTarget)) {
        try {
            $yqOutput = & yq -o=json $yamlTarget
            Write-Utf8NoBom -Path $jsonTarget -Content ($yqOutput -join "`n")
            Write-Success "Converted skills manifest to hooks/config/ (yq)"
        }
        catch {
            Write-Warn "Warning: Could not convert manifest. Install yq or Python+PyYAML."
        }
    }
    else {
        $py3Cmd = Get-Command "python3" -ErrorAction SilentlyContinue
        $pyCmd = Get-Command "python" -ErrorAction SilentlyContinue
        $pythonExe = $null
        if ($null -ne $py3Cmd) { $pythonExe = "python3" }
        elseif ($null -ne $pyCmd) { $pythonExe = "python" }

        if ($null -ne $pythonExe -and (Test-Path $yamlTarget)) {
            try {
                $pyScript = "import yaml, json; f=open('$($yamlTarget -replace '\\','\\\\')'); data=yaml.safe_load(f); f.close(); o=open('$($jsonTarget -replace '\\','\\\\')','w'); json.dump(data,o,indent=2); o.close()"
                & $pythonExe -c $pyScript 2>$null
                Write-Success "Converted skills manifest to hooks/config/ (Python)"
            }
            catch {
                Write-Warn "Warning: Could not convert manifest. Install yq or Python+PyYAML."
            }
        }
        else {
            Write-Warn "Warning: Could not convert manifest. Install yq or Python+PyYAML."
        }
    }
}

# Copy workflows.json to both locations
$workflowsSrc = Join-Path (Join-Path $FrameworkIsdlc "config") "workflows.json"
if (Test-Path $workflowsSrc) {
    $isdlcConfigDir = Join-Path $isdlcDir "config"
    New-Item $isdlcConfigDir -ItemType Directory -Force | Out-Null
    Copy-Item $workflowsSrc $isdlcConfigDir -Force
    Copy-Item $workflowsSrc $hooksConfigDir -Force
    Write-Success "Copied workflow definitions"
}

# Copy checklists
$fwChecklists = Join-Path $FrameworkIsdlc "checklists"
if (Test-Path $fwChecklists -PathType Container) {
    Copy-Item $fwChecklists $isdlcDir -Recurse -Force
    Write-Success "Copied gate checklists"
}

# Copy templates
$fwTemplates = Join-Path $FrameworkIsdlc "templates"
if (Test-Path $fwTemplates -PathType Container) {
    Copy-Item $fwTemplates $isdlcDir -Recurse -Force
    Write-Success "Copied templates"
}

# Copy scripts
$fwScripts = Join-Path $FrameworkIsdlc "scripts"
if (Test-Path $fwScripts -PathType Container) {
    Copy-Item $fwScripts $isdlcDir -Recurse -Force
    Write-Success "Copied utility scripts"
}

# Copy constitution
$fwConstitution = Join-Path (Join-Path $FrameworkIsdlc "templates") "constitution.md"
if (Test-Path $fwConstitution) {
    Copy-Item $fwConstitution (Join-Path (Join-Path $docsDir "isdlc") "constitution.md") -Force
    Write-Success "Copied constitution"
}

# Generate providers.yaml from template
# NOTE: Disabled -- framework is Claude Code-specific. No providers.yaml needed.
# $providersTarget = Join-Path $isdlcDir "providers.yaml"
# if (Test-Path $providersTarget) {
#     Write-Warn "providers.yaml already exists -- skipping (use /provider set to change mode)"
# }
# else {
#     $providersTemplate = Join-Path (Join-Path $FrameworkIsdlc "templates") "providers.yaml.template"
#     if (Test-Path $providersTemplate) {
#         $providersContent = Get-Content $providersTemplate -Raw
#         $providersContent = $providersContent -replace 'active_mode: "[^"]*"', "active_mode: `"$ProviderMode`""
#         Write-Utf8NoBom -Path $providersTarget -Content $providersContent
#         Write-Success "Generated providers.yaml (mode: $ProviderMode)"
#     }
#     else {
#         Write-Warn "providers.yaml.template not found -- skipping provider config"
#     }
# }

# Create state.json
$isNewProject = -not $IsExistingProject
$stateObj = [PSCustomObject]@{
    framework_version = "0.1.0-alpha"
    project = [PSCustomObject]@{
        name = $ProjectName
        created = $Timestamp
        description = ""
        is_new_project = $isNewProject
    }
    provider_selection = $ProviderMode
    complexity_assessment = [PSCustomObject]@{
        level = $null
        track = $Track
        assessed_at = $Timestamp
        assessed_by = "manual"
        dimensions = [PSCustomObject]@{
            architectural = $null
            security = $null
            testing = $null
            deployment = $null
            team = $null
            timeline = $null
        }
    }
    workflow = [PSCustomObject]@{
        track = $Track
        track_name = $TrackName
        phases_required = $null
        phases_optional = $null
        phases_skipped = $null
    }
    constitution = [PSCustomObject]@{
        enforced = $true
        path = "docs/isdlc/constitution.md"
        validated_at = $null
    }
    autonomous_iteration = [PSCustomObject]@{
        enabled = $true
        max_iterations = 10
        timeout_per_iteration_minutes = 5
        circuit_breaker_threshold = 3
    }
    skill_enforcement = [PSCustomObject]@{
        enabled = $true
        mode = "observe"
        fail_behavior = "allow"
        manifest_version = "2.0.0"
    }
    cloud_configuration = [PSCustomObject]@{
        provider = "undecided"
        configured_at = $null
        credentials_validated = $false
        aws = $null
        gcp = $null
        azure = $null
        deployment = [PSCustomObject]@{
            staging_enabled = $false
            production_enabled = $false
            workflow_endpoint = "10-local-testing"
        }
    }
    iteration_enforcement = [PSCustomObject]@{
        enabled = $true
    }
    skill_usage_log = @()
    active_workflow = $null
    workflow_history = @()
    counters = [PSCustomObject]@{
        next_req_id = 1
        next_bug_id = 1
    }
    current_phase = "01-requirements"
    phases = [PSCustomObject]@{
        "01-requirements"   = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "02-architecture"   = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "03-design"         = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "04-test-strategy"  = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "05-implementation" = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@(); iteration_tracking=[PSCustomObject]@{ current=0; max=$null; history=@(); final_status=$null } }
        "06-testing"        = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@(); iteration_tracking=[PSCustomObject]@{ current=0; max=$null; history=@(); final_status=$null } }
        "07-code-review"    = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "08-validation"     = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "09-cicd"           = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "10-local-testing"  = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "11-test-deploy"    = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "12-production"     = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
        "13-operations"     = [PSCustomObject]@{ status="pending"; started=$null; completed=$null; gate_passed=$null; artifacts=@() }
    }
    blockers = @()
    active_agent = $null
    history = @(
        [PSCustomObject]@{
            timestamp = $Timestamp
            agent = "init-script"
            action = "Project initialized with iSDLC framework"
        }
    )
}

$statePath = Join-Path $isdlcDir "state.json"
Write-JsonFile $statePath $stateObj
Write-Success "Created state.json"

# ----------------------------------------------------------------------------
# FR-010 (REQ-GH-239): install-time embeddings opt-in prompt
# ----------------------------------------------------------------------------
# Parity with install.sh lines 920-960. Default N. Non-interactive (-Force or
# redirected stdin) and the EOF / broken-input branches all fall through to
# disabled (NFR-006 fail-open). Exact prompt wording is binding — must match
# install.sh and tests/bin/isdlc-init.test.js character-for-character.
$EmbeddingsEnabled = $false
$isInteractive = (-not $Force) -and (-not [Console]::IsInputRedirected) -and [Environment]::UserInteractive
if ($isInteractive) {
    Write-Host ""
    Write-Host "Code Embeddings (Optional)"
    Write-Host "Enables semantic code search, sprawl detection, duplication analysis."
    Write-Host "First generation: ~30-60 min on medium codebases. Refresh: seconds-minutes."
    Write-Host ""
    $embAnswer = $null
    try {
        $embAnswer = Read-Host "Enable code embeddings for semantic search? [y/N]"
    } catch {
        $embAnswer = $null
    }
    if ($embAnswer -and ($embAnswer.Trim().ToLower() -in @('y','yes'))) {
        $EmbeddingsEnabled = $true
    }
}

$isdlcConfigPath = Join-Path $isdlcDir "config.json"
if (Test-Path $isdlcConfigPath) {
    Write-Warn "  .isdlc/config.json already exists -- leaving user config untouched"
} else {
    if ($EmbeddingsEnabled) {
        # Heredoc matches install.sh embeddings_config_block() byte-for-byte
        # (sans bash-specific indentation). Contributors: if you change this,
        # change install.sh line 83-102 too.
        $configContent = @'
{
  "embeddings": {
    "provider": "jina-code",
    "model": "jinaai/jina-embeddings-v2-base-code",
    "server": {
      "port": 7777,
      "host": "localhost",
      "auto_start": true
    },
    "parallelism": "auto",
    "device": "auto",
    "dtype": "auto",
    "batch_size": 32,
    "session_options": {},
    "max_memory_gb": null,
    "refresh_on_finalize": true
  }
}
'@
    } else {
        $configContent = @'
{
}
'@
    }
    Write-Utf8NoBom -Path $isdlcConfigPath -Content $configContent
    if ($EmbeddingsEnabled) {
        Write-Success "Created .isdlc/config.json (embeddings enabled)"
        Write-Host "  -> Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap."
    } else {
        Write-Success "Created .isdlc/config.json"
        Write-Host "  -> Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable."
    }
}

# Create provider.env for Ollama users
if ($ProviderMode -eq "ollama") {
    $providerEnvContent = @"
# iSDLC Ollama Provider Configuration
# Created by installer. Edit to change provider settings.
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
"@
    $providerEnvPath = Join-Path $isdlcDir "provider.env"
    Write-Utf8NoBom -Path $providerEnvPath -Content $providerEnvContent
    Write-Success "Created .isdlc/provider.env (Ollama configuration)"

    # Also create PowerShell variant for Windows users
    $providerEnvPs1Content = @"
# iSDLC Ollama Provider Configuration (PowerShell)
# Created by installer. Edit to change provider settings.
`$env:ANTHROPIC_BASE_URL = "http://localhost:11434"
`$env:ANTHROPIC_AUTH_TOKEN = "ollama"
`$env:ANTHROPIC_API_KEY = ""
"@
    $providerEnvPs1Path = Join-Path $isdlcDir "provider.env.ps1"
    Write-Utf8NoBom -Path $providerEnvPs1Path -Content $providerEnvPs1Content
    Write-Success "Created .isdlc/provider.env.ps1 (PowerShell variant)"
}

# ============================================================================
# Step 3b/6: Monorepo setup
# ============================================================================
if ($IsMonorepo) {
    Write-Step "3b" "6" "Setting up monorepo structure..."

    # Determine default project
    $DefaultProject = ""
    if ($DetectedProjects.Count -gt 0) {
        $DefaultProject = $DetectedProjects[0].Name
    }

    # Build scan_paths - deduplicate parent dirs
    $seenScanPaths = @{}
    $scanPathsList = [System.Collections.ArrayList]::new()
    foreach ($proj in $DetectedProjects) {
        $projPath = $proj.Path
        if ($projPath -match '/') {
            $scanPath = ($projPath -split '/')[0] + "/"
        }
        else {
            $scanPath = $projPath
        }
        if (-not $seenScanPaths.ContainsKey($scanPath)) {
            $seenScanPaths[$scanPath] = $true
            [void]$scanPathsList.Add($scanPath)
        }
    }

    # Build projects object
    $projectsObj = [PSCustomObject]@{}
    foreach ($proj in $DetectedProjects) {
        $projectsObj | Add-Member -NotePropertyName $proj.Name -NotePropertyValue ([PSCustomObject]@{
            name = $proj.Name
            path = $proj.Path
            registered_at = $Timestamp
            discovered = $true
        })
    }

    # Ask where project docs should live
    if (-not $Force) {
        Write-Host ""
        Write-Warn "Where should project documentation live?"
        Write-Host "  1) Root docs folder  -- docs/{project-id}/  (shared-concern monorepos: FE/BE/shared)"
        Write-Host "  2) Inside each project -- {project-path}/docs/  (multi-app monorepos: app1/app2/app3)"
        $docsLocAnswer = Read-Host "  Choice [1]"
        if ([string]::IsNullOrEmpty($docsLocAnswer)) { $docsLocAnswer = "1" }
    }
    else {
        $docsLocAnswer = "1"
    }
    if ($docsLocAnswer -eq "2") {
        $DocsLocation = "project"
    }
    else {
        $DocsLocation = "root"
    }

    # Create monorepo.json
    $monorepoObj = [PSCustomObject]@{
        version = "1.0.0"
        default_project = $DefaultProject
        docs_location = $DocsLocation
        projects = $projectsObj
        scan_paths = $scanPathsList.ToArray()
    }
    $monorepoPath = Join-Path $isdlcDir "monorepo.json"
    Write-JsonFile $monorepoPath $monorepoObj
    Write-Success "Created monorepo.json"

    # Create per-project directories and state files
    $projectsDir = Join-Path $isdlcDir "projects"
    New-Item $projectsDir -ItemType Directory -Force | Out-Null
    $docsIsdlcProjects = Join-Path (Join-Path $docsDir "isdlc") "projects"
    New-Item $docsIsdlcProjects -ItemType Directory -Force | Out-Null

    foreach ($proj in $DetectedProjects) {
        $projName = $proj.Name
        $projPath = $proj.Path

        # Create project runtime directory
        $projRuntimeDir = Join-Path $projectsDir $projName
        New-Item $projRuntimeDir -ItemType Directory -Force | Out-Null
        $projSkillsDir = Join-Path (Join-Path $projRuntimeDir "skills") "external"
        New-Item $projSkillsDir -ItemType Directory -Force | Out-Null

        # Create project docs directory
        $projDocsDir = Join-Path $docsIsdlcProjects $projName
        New-Item $projDocsDir -ItemType Directory -Force | Out-Null

        # Check if sub-project has existing code
        $projIsNew = $true
        $projFullPath = Join-Path $ProjectRoot $projPath
        foreach ($marker in @("package.json","go.mod","Cargo.toml")) {
            if (Test-Path (Join-Path $projFullPath $marker)) { $projIsNew = $false; break }
        }
        if ($projIsNew -and (Test-Path (Join-Path $projFullPath "src") -PathType Container)) {
            $projIsNew = $false
        }

        # Create per-project state.json
        $projStateObj = [PSCustomObject]@{
            framework_version = "0.1.0-alpha"
            project = [PSCustomObject]@{
                name = $projName
                path = $projPath
                created = $Timestamp
                description = ""
                is_new_project = $projIsNew
            }
            constitution = [PSCustomObject]@{
                enforced = $true
                path = "docs/isdlc/constitution.md"
                override_path = $null
                validated_at = $null
            }
            skill_enforcement = [PSCustomObject]@{
                enabled = $true
                mode = "observe"
                fail_behavior = "allow"
                manifest_version = "2.0.0"
            }
            cloud_configuration = [PSCustomObject]@{
                provider = "undecided"
                configured_at = $null
                credentials_validated = $false
                deployment = [PSCustomObject]@{
                    staging_enabled = $false
                    production_enabled = $false
                    workflow_endpoint = "10-local-testing"
                }
            }
            skill_usage_log = @()
            active_workflow = $null
            workflow_history = @()
            counters = [PSCustomObject]@{
                next_req_id = 1
                next_bug_id = 1
            }
            current_phase = $null
            phases = [PSCustomObject]@{}
            blockers = @()
            active_agent = $null
            history = @(
                [PSCustomObject]@{
                    timestamp = $Timestamp
                    agent = "init-script"
                    action = "Project registered in monorepo"
                }
            )
        }
        $projStatePath = Join-Path $projRuntimeDir "state.json"
        Write-JsonFile $projStatePath $projStateObj
        Write-Success "Created state for project: $projName"

        # Create empty external skills manifest
        $extManifestObj = [PSCustomObject]@{
            version = "1.0.0"
            project_id = $projName
            updated_at = $Timestamp
            skills = [PSCustomObject]@{}
        }
        $extManifestPath = Join-Path $projDocsDir "external-skills-manifest.json"
        Write-JsonFile $extManifestPath $extManifestObj
        Write-Success "Created external skills manifest for: $projName"

        # Create per-project docs directories
        if ($DocsLocation -eq "project") {
            foreach ($sub in @("requirements", "architecture", "design")) {
                New-Item (Join-Path (Join-Path $projFullPath "docs") $sub) -ItemType Directory -Force | Out-Null
            }
            Write-Success "Created $projPath/docs/"
        }
        else {
            foreach ($sub in @("requirements", "architecture", "design")) {
                New-Item (Join-Path (Join-Path $docsDir $projName) $sub) -ItemType Directory -Force | Out-Null
            }
            Write-Success "Created docs/$projName/"
        }
    }

    Write-Success "Monorepo setup complete ($($DetectedProjects.Count) projects)"
}

# CLAUDE.md - seed from template if missing
$claudeMdPath = Join-Path $ProjectRoot "CLAUDE.md"
if (-not (Test-Path $claudeMdPath)) {
    $templatePath = Join-Path (Join-Path $ProjectRoot ".claude") "CLAUDE.md.template"
    if (Test-Path $templatePath) {
        Copy-Item $templatePath $claudeMdPath
    } else {
        Write-Utf8NoBom -Path $claudeMdPath -Content ""
    }
    Write-Host ""
    Write-Warn "CLAUDE.md was missing - created from template in project root"
}

# ============================================================================
# Step 4/6: Configure project constitution
# ============================================================================
Write-Step "4" "6" "Configuring project constitution..."

$constitutionPath = Join-Path (Join-Path $docsDir "isdlc") "constitution.md"
if (Test-Path $constitutionPath) {
    $dateStr = (Get-Date).ToString("yyyy-MM-dd")
    $constitutionContent = @"
# Project Constitution - $ProjectName

<!-- CONSTITUTION_STATUS: STARTER_TEMPLATE -->
<!-- This marker indicates this constitution needs customization -->
<!-- Run /discover to customize -->

**Created**: $dateStr
**Status**: NEEDS CUSTOMIZATION

---

## CUSTOMIZATION REQUIRED

This is a **starter constitution** auto-generated during framework installation.
It contains generic articles that may not match your project's specific needs.

**To customize this constitution:**
Run ``/discover`` to analyze your project and generate tailored articles interactively.

**This constitution will be treated as a TEMPLATE until customized.**

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the **$ProjectName** project. These articles guide all SDLC phases and all agent interactions.

All agents (01-13) and the SDLC Orchestrator (00) will read and enforce these principles throughout the project lifecycle.

---

## Articles (Generic - Customize for Your Project)

### Article I: Specification Primacy

**Principle**: Specifications are the source of truth. Code serves specifications.

**Requirements**:
1. Code MUST implement specifications exactly as defined
2. Any deviation from specifications MUST be documented and justified
3. Specifications MUST be updated before code changes

---

### Article II: Test-First Development

**Principle**: Tests MUST be written before implementation.

**Requirements**:
1. Test cases MUST be designed before implementation
2. Unit tests MUST be written before production code
3. Code without tests CANNOT pass quality gates

**Coverage Thresholds**:
- Unit test coverage: >=80%
- Integration test coverage: >=70%

---

### Article III: Security by Design

**Principle**: Security considerations MUST precede implementation decisions.

**Requirements**:
1. No secrets in code - use environment variables
2. All inputs validated, all outputs sanitized
3. Critical/High vulnerabilities MUST be resolved before deployment

---

### Article IV: Simplicity First

**Principle**: Implement the simplest solution that satisfies requirements.

**Requirements**:
1. Avoid over-engineering and premature optimization
2. YAGNI (You Aren't Gonna Need It) - no speculative features
3. Complexity MUST be justified by requirements

---

### Article V: Quality Gate Integrity

**Principle**: Quality gates cannot be skipped. Failures require remediation.

**Requirements**:
1. All quality gates MUST be validated before phase advancement
2. Gate failures MUST be remediated (cannot be waived)
3. Gate fails twice -> Escalate to human

---

## Customization Notes

Review and modify these articles based on your project's specific needs:
- Add compliance requirements (HIPAA, GDPR, PCI-DSS)
- Add performance SLAs
- Add accessibility requirements
- Adjust coverage thresholds
- Add domain-specific constraints

---

**Constitution Version**: 1.0.0
**Framework Version**: 2.0.0
"@
    Write-Utf8NoBom -Path $constitutionPath -Content $constitutionContent
    Write-Success "Created project constitution"
}

if ($IsExistingProject) {
    Write-Warn "Existing project - constitution template created at docs/isdlc/constitution.md"
}
else {
    Write-Warn "Constitution template created at docs/isdlc/constitution.md"
}
Write-Warn "Next step: Run /discover to customize your project constitution"

# ============================================================================
# Step 5/6: Generate installation manifest
# ============================================================================
Write-Step "5" "6" "Generating installation manifest..."

$manifest = New-ManifestJson -ProjectRoot $ProjectRoot -Timestamp $Timestamp -FrameworkVersion "0.1.0-alpha"
$manifestPath = Join-Path $isdlcDir "installed-files.json"
Write-JsonFile $manifestPath $manifest
Write-Success "Created installation manifest ($($manifest.files.Count) files tracked)"
Write-Warn "This manifest enables safe uninstall - user files will be preserved"

# ============================================================================
# Search Setup: Detect and configure search tools (fail-open)
# ============================================================================
$isdlcBin = Join-Path (Join-Path $ScriptDir "bin") "isdlc.js"
$nodeAvailable = $false
try { $null = Get-Command node -ErrorAction Stop; $nodeAvailable = $true } catch {}

if ($nodeAvailable -and (Test-Path $isdlcBin)) {
    Write-Host ""
    Write-Step "*" "*" "Setting up search capabilities..."
    try {
        Push-Location $ProjectRoot
        & node $isdlcBin search-setup --force 2>$null
        Pop-Location
    }
    catch {
        Pop-Location
        Write-Warn "Search setup skipped (non-fatal)"
    }
}
else {
    Write-Warn "Search setup skipped (Node.js not available). Run 'isdlc search-setup' later."
}

# ============================================================================
# Step 6/6: Cleanup + Copy Scripts
# ============================================================================
Write-Step "6" "6" "Cleaning up installation files..."

# Copy uninstall and update scripts before removing the framework folder
$scriptsTarget = Join-Path $isdlcDir "scripts"
New-Item $scriptsTarget -ItemType Directory -Force | Out-Null

# Copy PowerShell scripts
foreach ($scriptName in @("uninstall.ps1", "update.ps1")) {
    $scriptSrc = Join-Path $ScriptDir $scriptName
    if (Test-Path $scriptSrc) {
        Copy-Item $scriptSrc $scriptsTarget -Force
        Write-Success "Copied $scriptName to .isdlc/scripts/"
    }
}

# Also copy bash scripts if they exist (for cross-platform)
foreach ($scriptName in @("uninstall.sh", "update.sh")) {
    $scriptSrc = Join-Path $ScriptDir $scriptName
    if (Test-Path $scriptSrc) {
        Copy-Item $scriptSrc $scriptsTarget -Force
        Write-Success "Copied $scriptName to .isdlc/scripts/"
    }
}

# Copy the stray-framework recovery tool so users can clean up a misplaced
# framework extraction post-install without re-cloning.
$recoverSrc = Join-Path (Join-Path $ScriptDir "scripts") "recover-stray-framework.sh"
if (Test-Path $recoverSrc) {
    Copy-Item $recoverSrc $scriptsTarget -Force
    Write-Success "Copied recover-stray-framework.sh to .isdlc/scripts/"
}

# Store the script dir before we delete it
$CleanupDir = $ScriptDir

Write-Warn "Removing isdlc-framework/ folder..."

# Delete the framework folder
Set-Location $ProjectRoot
Remove-Item $CleanupDir -Recurse -Force

# Mark install as complete so the trap's failure-notice branch is a no-op.
$Script:InstallCompleted = $true

Write-Success "Removed isdlc-framework/"

# ============================================================================
# Done!
# ============================================================================

$completeBorder = [string]::new([char]0x2550, 60)
$completeTop    = [char]0x2554 + $completeBorder + [char]0x2557
$completeBottom = [char]0x255A + $completeBorder + [char]0x255D
$completeSide   = [char]0x2551
$completeText   = "Installation Complete!".PadRight(58)

Write-Host ""
Write-Host $completeTop -ForegroundColor Green
Write-Host "$completeSide  $completeText  $completeSide" -ForegroundColor Green
Write-Host $completeBottom -ForegroundColor Green
Write-Host ""

Write-Host "  Project Structure:" -ForegroundColor Cyan
Write-Host "    .claude/           - Agent definitions and skills"
Write-Host "    .isdlc/            - Project state and framework resources"
Write-Host "    docs/              - Documentation"
Write-Host ""

Write-Host "  AI Assistant:" -ForegroundColor Cyan
$versionSuffix = ""
if ($ClaudeCodeFound) { $versionSuffix = " ($ClaudeCodeVersion)" }
Write-Host "    Engine:   " -ForegroundColor Blue -NoNewline
Write-Host "Claude Code$versionSuffix" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Tour: Optional onboarding overview
# ============================================================================

$isInteractive = [Environment]::UserInteractive -and -not $Force

if ($isInteractive) {
    Write-Host ""
    $tourChoice = Read-Host "  Show a quick overview of the framework? [Y/n]"
    if ([string]::IsNullOrEmpty($tourChoice)) { $tourChoice = "Y" }

    if ($tourChoice -match '^[Yy]') {
        Write-Banner "QUICK OVERVIEW"

        Write-Host "  --- What is iSDLC? ---" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "    iSDLC is an AI Development Governance Harness -- it wraps your"
        Write-Host "    project with structure, enforcement, and context management for"
        Write-Host "    enterprise AI-assisted software engineering."
        Write-Host ""
        Write-Host "  --- What you get ---" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Constitutional governance       Living rulebook every agent must follow"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Spec-driven artifacts           Versioned markdown + JSON checked into your repo"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Deterministic enforcement       Runtime hooks that actually block drift"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Structured task management      tasks.md with dependency graphs + traceability"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Managed context                 Constitution + skills + session cache on every call"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Semantic code search (optional) Local embeddings, no data leaves your machine"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Hackable by design              Agents, skills, commands, hooks -- all markdown / JS"
        Write-Host "    > " -ForegroundColor Green -NoNewline
        Write-Host "Multi-provider                  Claude Code, Codex, Anthropic API, local Ollama"
        Write-Host ""
        Write-Host "  --- Core commands ---" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "    /discover  /add  /analyze  /build  /isdlc  /provider  /tour" -ForegroundColor Green
        Write-Host ""
        Write-Host "    Full documentation:      " -NoNewline
        Write-Host "https://github.com/vihang-hub/isdlc-framework" -ForegroundColor Green
        Write-Host "    Interactive walkthrough: run " -NoNewline
        Write-Host "/tour" -ForegroundColor Green -NoNewline
        Write-Host " in Claude Code"
        Write-Host ""
    }
    else {
        Write-Host ""
        Write-Warn "Skipped. Run /tour in Claude Code for the interactive guide."
        Write-Host ""
    }
}

# ============================================================================
# Next Steps
# ============================================================================

if ($ProviderMode -eq "ollama") {
    Write-Banner "PROVIDER CONFIGURED"
    Write-Host "  We created " -NoNewline
    Write-Host ".isdlc/provider.env" -ForegroundColor Green -NoNewline
    Write-Host " with:"
    Write-Host "    ANTHROPIC_BASE_URL=http://localhost:11434"
    Write-Host "    ANTHROPIC_AUTH_TOKEN=ollama"
    Write-Host '    ANTHROPIC_API_KEY=""'
    Write-Host "  To change these settings, edit " -NoNewline
    Write-Host ".isdlc/provider.env" -ForegroundColor Green
    Write-Host ""
}

Write-Banner "NEXT STEPS"

$step = 1
if (-not $ClaudeCodeFound) {
    Write-Host "  $step. Install Claude Code: " -NoNewline
    Write-Host "npm install -g @anthropic-ai/claude-code" -ForegroundColor Green
    $step++
}

if ($ProviderMode -eq "ollama") {
    Write-Host "  $step. Install Ollama (if not already installed):"
    Write-Host "     " -NoNewline
    Write-Host "https://ollama.com/download" -ForegroundColor Green
    $step++
    Write-Host "  $step. Pull a recommended model: " -NoNewline
    Write-Host "ollama pull qwen3-coder" -ForegroundColor Green
    $step++
    Write-Host "  $step. Start the Ollama server: " -NoNewline
    Write-Host "ollama serve" -ForegroundColor Green
    $step++
    Write-Host "  $step. Launch Claude Code with Ollama:"
    Write-Host "     " -NoNewline
    Write-Host ". .isdlc\provider.env.ps1; claude" -ForegroundColor Green
    $step++
}
else {
    Write-Host "  $step. Run " -NoNewline
    Write-Host "claude" -ForegroundColor Green -NoNewline
    Write-Host " to launch Claude Code"
    $step++
    Write-Host "  $step. Log in with your Anthropic account"
    $step++
}

Write-Host "  $step. Run " -NoNewline
Write-Host "/discover" -ForegroundColor Green -NoNewline
Write-Host " to analyze your codebase and generate your constitution"
if ($EmbeddingsEnabled) {
    Write-Host "     (Embeddings will be generated automatically during /discover, ~30-60 min first time)" -ForegroundColor Yellow
}
$step++
Write-Host "  $step. Review and edit " -NoNewline
Write-Host "docs/isdlc/constitution.md" -ForegroundColor Green -NoNewline
Write-Host " to reflect your team's standards"
$step++
Write-Host "  $step. Generate tests for existing code: " -NoNewline
Write-Host "/isdlc test generate" -ForegroundColor Green -NoNewline
Write-Host " (uses characterization scaffolds from /discover)"
$step++
Write-Host "  $step. Run " -NoNewline
Write-Host "/add" -ForegroundColor Green -NoNewline
Write-Host " `"your first item`" to seed the backlog, then " -NoNewline
Write-Host "/analyze" -ForegroundColor Green -NoNewline
Write-Host " and " -NoNewline
Write-Host "/build" -ForegroundColor Green
$step++
Write-Host "  $step. Run " -NoNewline
Write-Host "/tour" -ForegroundColor Green -NoNewline
Write-Host " anytime for the interactive walkthrough"
Write-Host ""

if ($IsExistingProject) {
    Write-Warn "Note: Your existing project structure was not modified."
}

Write-Host "  Workflow: Orchestrator determines phases based on task complexity" -ForegroundColor Cyan
Write-Host ""
