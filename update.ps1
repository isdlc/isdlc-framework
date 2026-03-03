<#
.SYNOPSIS
    iSDLC Framework - In-Place Update Script for Windows
.DESCRIPTION
    Updates framework files while preserving all user artifacts.

    Usage:
      1. Clone or download the latest iSDLC framework
      2. From your project root: .\isdlc-framework\update.ps1

    What gets UPDATED (overwritten):
      - .claude/agents/, skills/, commands/, hooks/ -- framework files
      - .claude/settings.json -- deep-merged (user keys preserved)
      - .isdlc/config/, templates/, scripts/, checklists/ -- framework config
      - .isdlc/installed-files.json -- regenerated
      - state.json framework_version field -- bumped

    What is PRESERVED (never touched):
      - .isdlc/state.json (except version field + history entry)
      - .isdlc/providers.yaml, monorepo.json
      - docs/isdlc/constitution.md, checklists/
      - CLAUDE.md, settings.local.json
      - User-created files not in the old manifest
.NOTES
    Requires: PowerShell 5.1+ (Windows PowerShell) or PowerShell 7+ (pwsh)
    No external modules required.

    Execution Policy: If blocked, run one of:
      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
      powershell -ExecutionPolicy Bypass -File .\update.ps1
.PARAMETER Force
    Skip confirmation and version check.
.PARAMETER DryRun
    Show what would change without executing.
.PARAMETER Backup
    Create backup directory before updating.
.PARAMETER NoSearchSetup
    Skip search tool detection and configuration.
.PARAMETER Help
    Display usage text and exit.
.EXAMPLE
    .\update.ps1
    Interactive update with prompts.
.EXAMPLE
    .\update.ps1 -Force
    Non-interactive update.
.EXAMPLE
    .\update.ps1 -DryRun
    Show what would change without making changes.
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Backup,
    [switch]$NoSearchSetup,
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
    Write-Host "iSDLC Framework - In-Place Update Script"
    Write-Host ""
    Write-Host "Usage: .\update.ps1 [-Force] [-DryRun] [-Backup] [-NoSearchSetup] [-Help]"
    Write-Host ""
    Write-Host "Run this from your project root directory."
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Force           Skip confirmation prompts and version check"
    Write-Host "  -DryRun          Show what would change without making changes"
    Write-Host "  -Backup          Create timestamped backup before updating"
    Write-Host "  -NoSearchSetup   Skip search tool detection and configuration"
    Write-Host "  -Help            Show this help message"
    Write-Host ""
    Write-Host "UPDATED (overwritten):"
    Write-Host "  .claude/agents/, skills/, commands/, hooks/"
    Write-Host "  .claude/settings.json (deep-merged)"
    Write-Host "  .isdlc/config/, templates/, scripts/, checklists/"
    Write-Host ""
    Write-Host "PRESERVED (never touched):"
    Write-Host "  .isdlc/state.json, providers.yaml, monorepo.json"
    Write-Host "  docs/isdlc/constitution.md, CLAUDE.md, settings.local.json"
    exit 0
}

# Determine directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrameworkDir = Join-Path $ScriptDir "src"
$ProjectRoot = Get-Location | Select-Object -ExpandProperty Path
$FrameworkClaude = Join-Path $FrameworkDir "claude"
$FrameworkIsdlc = Join-Path $FrameworkDir "isdlc"
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# ============================================================================
# Step 1/10: Verify existing installation
# ============================================================================

Write-Banner "iSDLC Framework - In-Place Update"
Write-Host "  Project Directory: $ProjectRoot" -ForegroundColor Blue
Write-Host "  Framework Source:  $ScriptDir" -ForegroundColor Blue
Write-Host ""

Write-Step "1" "10" "Verifying existing installation..."

$isdlcExists = Test-Path (Join-Path $ProjectRoot ".isdlc")
$claudeExists = Test-Path (Join-Path $ProjectRoot ".claude")

if (-not $isdlcExists -or -not $claudeExists) {
    Write-Err "Error: No iSDLC installation found."
    Write-Host "  Expected .isdlc/ and .claude/ to exist."
    Write-Host "  Run install.ps1 first to set up the framework."
    exit 1
}

$stateFilePath = Join-Path (Join-Path $ProjectRoot ".isdlc") "state.json"
if (-not (Test-Path $stateFilePath)) {
    Write-Err "Error: .isdlc/state.json not found -- installation may be corrupted."
    exit 1
}

Write-Success "Installation detected"

# ============================================================================
# Step 2/10: Read and compare versions
# ============================================================================

Write-Step "2" "10" "Comparing versions..."

$state = Read-JsonFile $stateFilePath
$InstalledVersion = "0.0.0"
if ($null -ne $state -and $null -ne $state.framework_version) {
    $InstalledVersion = $state.framework_version
}

$packageJsonPath = Join-Path $ScriptDir "package.json"
if (-not (Test-Path $packageJsonPath)) {
    Write-Err "Error: package.json not found at $packageJsonPath"
    exit 1
}

$packageJson = Read-JsonFile $packageJsonPath
$NewVersion = "0.0.0"
if ($null -ne $packageJson -and $null -ne $packageJson.version) {
    $NewVersion = $packageJson.version
}

Write-Host "  Installed: " -ForegroundColor Blue -NoNewline
Write-Host $InstalledVersion
Write-Host "  Available: " -ForegroundColor Blue -NoNewline
Write-Host $NewVersion

if ($InstalledVersion -eq $NewVersion -and -not $Force) {
    Write-Host ""
    Write-Success "Already up to date!"
    Write-Warn "Use -Force to reinstall the current version."
    exit 0
}

# ============================================================================
# Step 3/10: Confirm
# ============================================================================

if (-not $Force) {
    Write-Host ""
    Write-Warn "This will update framework files:"
    Write-Host "  - .claude/agents/, skills/, commands/, hooks/"
    Write-Host "  - .claude/settings.json (deep-merged)"
    Write-Host "  - .isdlc/config/, templates/, scripts/, checklists/"
    Write-Host ""
    Write-Host "  User artifacts will NOT be changed:" -ForegroundColor Green
    Write-Host "  - .isdlc/state.json, providers.yaml, monorepo.json"
    Write-Host "  - docs/isdlc/constitution.md, CLAUDE.md"
    Write-Host "  - .claude/settings.local.json"
    Write-Host ""
    $confirm = Read-Host "  Update $InstalledVersion -> $NewVersion? [Y/n]"
    if ([string]::IsNullOrEmpty($confirm)) { $confirm = "Y" }
    if ($confirm -notmatch '^[Yy]$') {
        Write-Err "Update cancelled."
        exit 0
    }
}

if ($DryRun) {
    Write-Host ""
    Write-Host "  (-DryRun mode: no changes will be made)" -ForegroundColor Cyan
}
Write-Host ""

# ============================================================================
# Step 4/10: Backup (if -Backup)
# ============================================================================

if ($Backup) {
    Write-Step "4" "10" "Creating backup..."

    $BackupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $BackupDir = Join-Path $ProjectRoot "isdlc-backup-$BackupTimestamp"

    if ($DryRun) {
        Write-Warn "[dry-run] Would create backup: $BackupDir"
    }
    else {
        New-Item $BackupDir -ItemType Directory -Force | Out-Null
        foreach ($dir in @(".claude",".isdlc")) {
            $src = Join-Path $ProjectRoot $dir
            if (Test-Path $src) {
                Copy-Item $src (Join-Path $BackupDir $dir) -Recurse
            }
        }
        Write-Success "Backup created: $BackupDir"
    }
}
else {
    Write-Step "4" "10" "Skipping backup (use -Backup to enable)"
}
Write-Host ""

# ============================================================================
# Step 5/10: Load old manifest
# ============================================================================

Write-Step "5" "10" "Loading installation manifest..."

$ManifestFile = Join-Path (Join-Path $ProjectRoot ".isdlc") "installed-files.json"
$HasOldManifest = $false
$OldManifestFiles = @()

if (Test-Path $ManifestFile) {
    $manifest = Read-JsonFile $ManifestFile
    if ($null -ne $manifest -and $null -ne $manifest.files) {
        $OldManifestFiles = @($manifest.files)
        $HasOldManifest = $true
        Write-Success "Old manifest loaded ($($OldManifestFiles.Count) files tracked)"
    }
    else {
        Write-Warn "Failed to parse manifest -- cleanup will be skipped"
    }
}
else {
    Write-Warn "No installation manifest found (legacy install)"
    Write-Warn "Removed-files cleanup will be skipped"
}
Write-Host ""

# ============================================================================
# Step 6/10: Copy .claude/ framework files
# ============================================================================

Write-Step "6" "10" "Updating .claude/ framework files..."

if (-not (Test-Path $FrameworkClaude -PathType Container)) {
    Write-Err "Error: Framework source not found at $FrameworkClaude"
    exit 1
}

# Copy agents, commands, skills
foreach ($dir in @("agents","commands","skills")) {
    $src = Join-Path $FrameworkClaude $dir
    if (Test-Path $src -PathType Container) {
        if ($DryRun) {
            Write-Warn "[dry-run] Would update $dir/"
        }
        else {
            Copy-Item $src (Join-Path $ProjectRoot ".claude") -Recurse -Force
            Write-Success "Updated $dir/"
        }
    }
}

# Copy hooks
$hooksSrc = Join-Path $FrameworkClaude "hooks"
if (Test-Path $hooksSrc -PathType Container) {
    if ($DryRun) {
        Write-Warn "[dry-run] Would update hooks/"
    }
    else {
        $hooksDst = Join-Path (Join-Path $ProjectRoot ".claude") "hooks"
        New-Item $hooksDst -ItemType Directory -Force | Out-Null
        Copy-Item (Join-Path $hooksSrc "*") $hooksDst -Recurse -Force
        Write-Success "Updated hooks/"
    }
}

# Merge settings.json
$fwSettings = Join-Path $FrameworkClaude "settings.json"
$projSettings = Join-Path (Join-Path $ProjectRoot ".claude") "settings.json"
if (Test-Path $fwSettings) {
    if (Test-Path $projSettings) {
        if ($DryRun) {
            Write-Warn "[dry-run] Would merge settings.json"
        }
        else {
            $existing = Read-JsonFile $projSettings
            $framework = Read-JsonFile $fwSettings
            if ($null -ne $existing -and $null -ne $framework) {
                $merged = Merge-JsonDeep -Base $existing -Override $framework
                Write-JsonFile $projSettings $merged
                Write-Success "Merged settings.json"
            }
            else {
                Copy-Item $fwSettings $projSettings -Force
                Write-Warn "Could not parse settings.json -- replaced"
            }
        }
    }
    else {
        if (-not $DryRun) {
            Copy-Item $fwSettings $projSettings -Force
            Write-Success "Copied settings.json"
        }
    }
}

# Merge settings.local.json
$fwSettingsLocal = Join-Path $FrameworkClaude "settings.local.json"
$projSettingsLocal = Join-Path (Join-Path $ProjectRoot ".claude") "settings.local.json"
if (Test-Path $fwSettingsLocal) {
    if (Test-Path $projSettingsLocal) {
        if (-not $DryRun) {
            $existing = Read-JsonFile $projSettingsLocal
            $framework = Read-JsonFile $fwSettingsLocal
            if ($null -ne $existing -and $null -ne $framework) {
                $merged = Merge-JsonDeep -Base $existing -Override $framework
                Write-JsonFile $projSettingsLocal $merged
                Write-Success "Merged settings.local.json"
            }
        }
    }
    else {
        if (-not $DryRun) {
            Copy-Item $fwSettingsLocal $projSettingsLocal -Force
            Write-Success "Copied settings.local.json"
        }
    }
}
Write-Host ""

# ============================================================================
# Step 7/10: Copy .isdlc/ framework config
# ============================================================================

Write-Step "7" "10" "Updating .isdlc/ framework config..."

# Copy config directories (overwrite)
foreach ($dir in @("config","checklists","templates","scripts")) {
    $src = Join-Path $FrameworkIsdlc $dir
    if (Test-Path $src -PathType Container) {
        if ($DryRun) {
            Write-Warn "[dry-run] Would update .isdlc/$dir/"
        }
        else {
            Copy-Item $src (Join-Path $ProjectRoot ".isdlc") -Recurse -Force
            Write-Success "Updated .isdlc/$dir/"
        }
    }
}

# Copy skills manifest to hooks config
$hooksConfigDir = Join-Path (Join-Path (Join-Path $ProjectRoot ".claude") "hooks") "config"
New-Item $hooksConfigDir -ItemType Directory -Force | Out-Null

$yamlManifest = Join-Path (Join-Path $FrameworkIsdlc "config") "skills-manifest.yaml"
if ((Test-Path $yamlManifest) -and -not $DryRun) {
    Copy-Item $yamlManifest $hooksConfigDir -Force
}

$jsonManifest = $null
$candidate1 = Join-Path (Join-Path $FrameworkClaude "hooks") (Join-Path "config" "skills-manifest.json")
$candidate2 = Join-Path (Join-Path $FrameworkIsdlc "config") "skills-manifest.json"

if (Test-Path $candidate1) { $jsonManifest = $candidate1 }
elseif (Test-Path $candidate2) { $jsonManifest = $candidate2 }

if ($null -ne $jsonManifest -and -not $DryRun) {
    Copy-Item $jsonManifest $hooksConfigDir -Force
    Write-Success "Updated skills manifest in hooks/config/"
}
elseif ($DryRun) {
    Write-Warn "[dry-run] Would update skills manifest in hooks/config/"
}
else {
    Write-Warn "No pre-built JSON manifest found"
}

# Copy workflows.json to both locations
$workflowsSrc = Join-Path (Join-Path $FrameworkIsdlc "config") "workflows.json"
if (Test-Path $workflowsSrc) {
    if ($DryRun) {
        Write-Warn "[dry-run] Would update workflow definitions"
    }
    else {
        $isdlcConfigDir = Join-Path (Join-Path $ProjectRoot ".isdlc") "config"
        New-Item $isdlcConfigDir -ItemType Directory -Force | Out-Null
        Copy-Item $workflowsSrc $isdlcConfigDir -Force
        Copy-Item $workflowsSrc $hooksConfigDir -Force
        Write-Success "Updated workflow definitions"
    }
}
Write-Host ""

# ============================================================================
# Step 8/10: Clean removed files (old manifest diff)
# ============================================================================

Write-Step "8" "10" "Cleaning removed files..."

if ($HasOldManifest -and $OldManifestFiles.Count -gt 0) {
    $RemovedCount = 0

    # Build new file list from current .claude/ contents
    $NewFiles = [System.Collections.ArrayList]::new()
    foreach ($dir in @("agents","skills","commands","hooks")) {
        $dirPath = Join-Path (Join-Path $ProjectRoot ".claude") $dir
        if (Test-Path $dirPath) {
            Get-ChildItem $dirPath -Recurse -File | ForEach-Object {
                [void]$NewFiles.Add((Get-RelativePath $_.FullName $ProjectRoot))
            }
        }
    }
    $settingsPath = Join-Path (Join-Path $ProjectRoot ".claude") "settings.json"
    if (Test-Path $settingsPath) {
        [void]$NewFiles.Add(".claude/settings.json")
    }

    # Check each old file against new set
    foreach ($oldFile in $OldManifestFiles) {
        $found = $false
        foreach ($newFile in $NewFiles) {
            if ($oldFile -eq $newFile) { $found = $true; break }
        }
        if (-not $found) {
            $fullPath = Join-Path $ProjectRoot ($oldFile -replace '/', '\')
            if (Test-Path $fullPath -PathType Leaf) {
                if ($DryRun) {
                    Write-Warn "[dry-run] Would remove obsolete: $oldFile"
                }
                else {
                    Remove-Item $fullPath -Force
                }
                $RemovedCount++
            }
        }
    }

    if ($RemovedCount -gt 0) {
        Write-Success "Removed $RemovedCount obsolete files"
    }
    else {
        Write-Success "No obsolete files to remove"
    }
}
else {
    Write-Warn "Skipped (no old manifest)"
}
Write-Host ""

# ============================================================================
# Step 9/10: Regenerate manifest
# ============================================================================

Write-Step "9" "10" "Regenerating installation manifest..."

if (-not $DryRun) {
    $newManifest = New-ManifestJson -ProjectRoot $ProjectRoot -Timestamp $Timestamp -FrameworkVersion $NewVersion
    Write-JsonFile $ManifestFile $newManifest
    Write-Success "Manifest regenerated ($($newManifest.files.Count) files tracked)"
}
else {
    Write-Warn "[dry-run] Would regenerate manifest"
}
Write-Host ""

# ============================================================================
# Step 10/10: Update state.json version + history
# ============================================================================

Write-Step "10" "10" "Updating state.json..."

if (-not $DryRun) {
    $state = Read-JsonFile $stateFilePath

    if ($null -ne $state) {
        # Update framework_version
        $state.framework_version = $NewVersion

        # Append history entry
        $historyEntry = [PSCustomObject]@{
            timestamp = $Timestamp
            agent = "update-script"
            action = "Framework updated from $InstalledVersion to $NewVersion"
        }
        if ($state.history -is [array]) {
            $newHistory = [System.Collections.ArrayList]::new()
            foreach ($item in $state.history) { [void]$newHistory.Add($item) }
            [void]$newHistory.Add($historyEntry)
            $state.history = $newHistory.ToArray()
        }
        else {
            $state.history = @($historyEntry)
        }

        Write-JsonFile $stateFilePath $state
        Write-Success "Updated state.json ($InstalledVersion -> $NewVersion)"

        # Update monorepo per-project states
        $monorepoPath = Join-Path (Join-Path $ProjectRoot ".isdlc") "monorepo.json"
        if (Test-Path $monorepoPath) {
            $projectsDir = Join-Path (Join-Path $ProjectRoot ".isdlc") "projects"
            if (Test-Path $projectsDir) {
                $projDirs = Get-ChildItem $projectsDir -Directory -ErrorAction SilentlyContinue
                if ($null -ne $projDirs) {
                    foreach ($projDir in $projDirs) {
                        $projStatePath = Join-Path $projDir.FullName "state.json"
                        if (Test-Path $projStatePath) {
                            $projState = Read-JsonFile $projStatePath
                            if ($null -ne $projState) {
                                $projState.framework_version = $NewVersion
                                $projHistoryEntry = [PSCustomObject]@{
                                    timestamp = $Timestamp
                                    agent = "update-script"
                                    action = "Framework updated from $InstalledVersion to $NewVersion"
                                }
                                if ($projState.history -is [array]) {
                                    $newHist = [System.Collections.ArrayList]::new()
                                    foreach ($h in $projState.history) { [void]$newHist.Add($h) }
                                    [void]$newHist.Add($projHistoryEntry)
                                    $projState.history = $newHist.ToArray()
                                }
                                Write-JsonFile $projStatePath $projState
                            }
                        }
                    }
                    Write-Success "Updated monorepo project states"
                }
            }
        }
    }
    else {
        Write-Warn "Could not parse state.json -- version not updated"
    }
}
else {
    Write-Warn "[dry-run] Would update state.json ($InstalledVersion -> $NewVersion)"
}
Write-Host ""

# ============================================================================
# Search Setup: Detect and configure search tools (fail-open)
# ============================================================================
if (-not $NoSearchSetup -and -not $DryRun) {
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
    Write-Host ""
}

# ============================================================================
# Summary
# ============================================================================

$summaryText = ""
if ($DryRun) { $summaryText = "Dry Run Complete" }
else { $summaryText = "Update Complete!" }

$sBorder = [string]::new([char]0x2550, 60)
$sTop    = [char]0x2554 + $sBorder + [char]0x2557
$sBottom = [char]0x255A + $sBorder + [char]0x255D
$sSide   = [char]0x2551
$sPadded = $summaryText.PadRight(58)

Write-Host $sTop -ForegroundColor Green
Write-Host "$sSide  $sPadded  $sSide" -ForegroundColor Green
Write-Host $sBottom -ForegroundColor Green
Write-Host ""

Write-Host "  Previous version: " -ForegroundColor Blue -NoNewline
Write-Host $InstalledVersion
Write-Host "  New version:      " -ForegroundColor Blue -NoNewline
Write-Host $NewVersion
Write-Host ""
Write-Success "Framework files updated"
Write-Success "User artifacts preserved"
Write-Host ""

if ($DryRun) {
    Write-Host "  No changes were made. Run without -DryRun to update." -ForegroundColor Cyan
    Write-Host ""
}

# Offer to clean up the framework clone directory
if (-not $DryRun -and -not $Force) {
    Write-Warn "Framework source directory: $ScriptDir"
    $cleanupConfirm = Read-Host "  Remove framework source directory? [Y/n]"
    if ([string]::IsNullOrEmpty($cleanupConfirm)) { $cleanupConfirm = "Y" }
    if ($cleanupConfirm -match '^[Yy]$') {
        Remove-Item $ScriptDir -Recurse -Force
        Write-Success "Removed $ScriptDir"
    }
    else {
        Write-Warn "Framework source left at $ScriptDir"
    }
    Write-Host ""
}

Write-Host "  Run 'isdlc doctor' to verify installation health." -ForegroundColor Cyan
Write-Host ""
