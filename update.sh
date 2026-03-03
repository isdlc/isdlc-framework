#!/bin/bash

# iSDLC Framework - In-Place Update Script
#
# Updates framework files while preserving all user artifacts.
#
# Usage:
#   1. Clone or download the latest iSDLC framework
#   2. From your project root: ./isdlc-framework/update.sh
#
# Options:
#   --force             Skip confirmation prompts and version check
#   --dry-run           Show what would change without making changes
#   --backup            Create timestamped backup before updating
#   --no-search-setup   Skip search tool detection and configuration
#   --help              Show this help message
#
# What gets UPDATED (overwritten):
#   - .claude/agents/, skills/, commands/, hooks/ — framework files
#   - .claude/settings.json — deep-merged (user keys preserved)
#   - .isdlc/config/, templates/, scripts/, checklists/ — framework config
#   - .isdlc/installed-files.json — regenerated
#   - state.json framework_version field — bumped
#
# What is PRESERVED (never touched):
#   - .isdlc/state.json (except version field + history entry)
#   - .isdlc/providers.yaml, monorepo.json
#   - docs/isdlc/constitution.md, checklists/
#   - CLAUDE.md, settings.local.json
#   - User-created files not in the old manifest

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# Parse flags
# ============================================================================
FORCE=false
DRY_RUN=false
BACKUP=false
NO_SEARCH_SETUP=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --backup)
            BACKUP=true
            shift
            ;;
        --no-search-setup)
            NO_SEARCH_SETUP=true
            shift
            ;;
        --help|-h)
            echo "iSDLC Framework - In-Place Update Script"
            echo ""
            echo "Usage: ./isdlc-framework/update.sh [options]"
            echo ""
            echo "Run this from your project root directory."
            echo ""
            echo "Options:"
            echo "  --force             Skip confirmation prompts and version check"
            echo "  --dry-run           Show what would change without making changes"
            echo "  --backup            Create timestamped backup (tar.gz) before updating"
            echo "  --no-search-setup   Skip search tool detection and configuration"
            echo "  --help              Show this help message"
            echo ""
            echo "UPDATED (overwritten):"
            echo "  .claude/agents/, skills/, commands/, hooks/"
            echo "  .claude/settings.json (deep-merged)"
            echo "  .isdlc/config/, templates/, scripts/, checklists/"
            echo ""
            echo "PRESERVED (never touched):"
            echo "  .isdlc/state.json, providers.yaml, monorepo.json"
            echo "  docs/isdlc/constitution.md, CLAUDE.md, settings.local.json"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run with --help for usage information."
            exit 1
            ;;
    esac
done

# ============================================================================
# Determine directories
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$SCRIPT_DIR/src"
PROJECT_ROOT="$(pwd)"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           iSDLC Framework - In-Place Update                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project Directory:${NC} $PROJECT_ROOT"
echo -e "${BLUE}Framework Source:${NC}  $SCRIPT_DIR"
echo ""

# ============================================================================
# Step 1: Verify existing installation
# ============================================================================
echo -e "${BLUE}[1/10]${NC} Verifying existing installation..."

if [ ! -d "$PROJECT_ROOT/.isdlc" ] || [ ! -d "$PROJECT_ROOT/.claude" ]; then
    echo -e "${RED}Error: No iSDLC installation found.${NC}"
    echo "  Expected .isdlc/ and .claude/ to exist."
    echo "  Run install.sh first to set up the framework."
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/.isdlc/state.json" ]; then
    echo -e "${RED}Error: .isdlc/state.json not found — installation may be corrupted.${NC}"
    exit 1
fi

echo -e "${GREEN}  ✓ Installation detected${NC}"

# ============================================================================
# Step 2: Read and compare versions
# ============================================================================
echo -e "${BLUE}[2/10]${NC} Comparing versions..."

# Read installed version from state.json
if command -v jq &> /dev/null; then
    INSTALLED_VERSION=$(jq -r '.framework_version // "0.0.0"' "$PROJECT_ROOT/.isdlc/state.json" 2>/dev/null)
else
    INSTALLED_VERSION=$(grep -o '"framework_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PROJECT_ROOT/.isdlc/state.json" 2>/dev/null | head -1 | sed 's/.*"framework_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    [ -z "$INSTALLED_VERSION" ] && INSTALLED_VERSION="0.0.0"
fi

# Read new version from framework package.json
NEW_VERSION_FILE="$SCRIPT_DIR/package.json"
if [ -f "$NEW_VERSION_FILE" ]; then
    if command -v jq &> /dev/null; then
        NEW_VERSION=$(jq -r '.version // "0.0.0"' "$NEW_VERSION_FILE" 2>/dev/null)
    else
        NEW_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$NEW_VERSION_FILE" 2>/dev/null | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        [ -z "$NEW_VERSION" ] && NEW_VERSION="0.0.0"
    fi
else
    echo -e "${RED}Error: package.json not found at $NEW_VERSION_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}  Installed:${NC} $INSTALLED_VERSION"
echo -e "${BLUE}  Available:${NC} $NEW_VERSION"

if [ "$INSTALLED_VERSION" = "$NEW_VERSION" ] && [ "$FORCE" = false ]; then
    echo ""
    echo -e "${GREEN}Already up to date!${NC}"
    echo -e "${YELLOW}  Use --force to reinstall the current version.${NC}"
    exit 0
fi

# ============================================================================
# Step 3: Confirm
# ============================================================================
if [ "$FORCE" = false ]; then
    echo ""
    echo -e "${YELLOW}This will update framework files:${NC}"
    echo "  - .claude/agents/, skills/, commands/, hooks/"
    echo "  - .claude/settings.json (deep-merged)"
    echo "  - .isdlc/config/, templates/, scripts/, checklists/"
    echo ""
    echo -e "${GREEN}User artifacts will NOT be changed:${NC}"
    echo "  - .isdlc/state.json, providers.yaml, monorepo.json"
    echo "  - docs/isdlc/constitution.md, CLAUDE.md"
    echo "  - .claude/settings.local.json"
    echo ""
    read -p "Update $INSTALLED_VERSION → $NEW_VERSION? [Y/n]: " CONFIRM
    CONFIRM=${CONFIRM:-Y}

    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Update cancelled.${NC}"
        exit 0
    fi
fi

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${CYAN}  (--dry-run mode: no changes will be made)${NC}"
fi
echo ""

# ============================================================================
# Step 4: Backup (if --backup)
# ============================================================================
if [ "$BACKUP" = true ]; then
    echo -e "${BLUE}[4/10]${NC} Creating backup..."

    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    BACKUP_FILE="$PROJECT_ROOT/isdlc-backup-${TIMESTAMP}.tar.gz"

    BACKUP_PATHS=()
    [ -d "$PROJECT_ROOT/.claude" ] && BACKUP_PATHS+=(".claude")
    [ -d "$PROJECT_ROOT/.isdlc" ]  && BACKUP_PATHS+=(".isdlc")

    if [ ${#BACKUP_PATHS[@]} -gt 0 ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}  [dry-run] Would create backup: $BACKUP_FILE${NC}"
        else
            tar -czf "$BACKUP_FILE" -C "$PROJECT_ROOT" "${BACKUP_PATHS[@]}" 2>/dev/null
            echo -e "${GREEN}  ✓ Backup created: $BACKUP_FILE${NC}"
        fi
    fi
else
    echo -e "${BLUE}[4/10]${NC} Skipping backup (use --backup to enable)"
fi
echo ""

# ============================================================================
# Step 5: Load old manifest
# ============================================================================
echo -e "${BLUE}[5/10]${NC} Loading installation manifest..."

MANIFEST_FILE="$PROJECT_ROOT/.isdlc/installed-files.json"
HAS_OLD_MANIFEST=false
declare -a OLD_MANIFEST_FILES=()

if [ -f "$MANIFEST_FILE" ]; then
    if command -v jq &> /dev/null; then
        while IFS= read -r file; do
            OLD_MANIFEST_FILES+=("$file")
        done < <(jq -r '.files[]' "$MANIFEST_FILE" 2>/dev/null)
        HAS_OLD_MANIFEST=true
        echo -e "${GREEN}  ✓ Old manifest loaded (${#OLD_MANIFEST_FILES[@]} files tracked)${NC}"
    else
        echo -e "${YELLOW}  Warning: jq not available — cannot parse manifest${NC}"
        echo -e "${YELLOW}  Removed-files cleanup will be skipped${NC}"
    fi
else
    echo -e "${YELLOW}  No installation manifest found (legacy install)${NC}"
    echo -e "${YELLOW}  Removed-files cleanup will be skipped${NC}"
fi
echo ""

# ============================================================================
# Step 6: Copy .claude/ framework files
# ============================================================================
echo -e "${BLUE}[6/10]${NC} Updating .claude/ framework files..."

FRAMEWORK_CLAUDE="$FRAMEWORK_DIR/claude"

if [ ! -d "$FRAMEWORK_CLAUDE" ]; then
    echo -e "${RED}Error: Framework source not found at $FRAMEWORK_CLAUDE${NC}"
    exit 1
fi

# Copy agents
if [ -d "$FRAMEWORK_CLAUDE/agents" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  [dry-run] Would update agents/${NC}"
    else
        cp -r "$FRAMEWORK_CLAUDE/agents" "$PROJECT_ROOT/.claude/"
        echo -e "${GREEN}  ✓ Updated agents/${NC}"
    fi
fi

# Copy commands
if [ -d "$FRAMEWORK_CLAUDE/commands" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  [dry-run] Would update commands/${NC}"
    else
        cp -r "$FRAMEWORK_CLAUDE/commands" "$PROJECT_ROOT/.claude/"
        echo -e "${GREEN}  ✓ Updated commands/${NC}"
    fi
fi

# Copy skills
if [ -d "$FRAMEWORK_CLAUDE/skills" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  [dry-run] Would update skills/${NC}"
    else
        cp -r "$FRAMEWORK_CLAUDE/skills" "$PROJECT_ROOT/.claude/"
        echo -e "${GREEN}  ✓ Updated skills/${NC}"
    fi
fi

# Copy hooks
if [ -d "$FRAMEWORK_CLAUDE/hooks" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  [dry-run] Would update hooks/${NC}"
    else
        mkdir -p "$PROJECT_ROOT/.claude/hooks"
        mkdir -p "$PROJECT_ROOT/.claude/hooks/dispatchers"
        cp -r "$FRAMEWORK_CLAUDE/hooks/"* "$PROJECT_ROOT/.claude/hooks/"
        echo -e "${GREEN}  ✓ Updated hooks/${NC}"
    fi
fi

# Merge settings.json (preserve user keys)
if [ -f "$FRAMEWORK_CLAUDE/settings.json" ]; then
    if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
        if command -v jq &> /dev/null; then
            if [ "$DRY_RUN" = true ]; then
                echo -e "${YELLOW}  [dry-run] Would merge settings.json${NC}"
            else
                tmp_file=$(mktemp)
                jq -s '.[0] * .[1]' "$PROJECT_ROOT/.claude/settings.json" "$FRAMEWORK_CLAUDE/settings.json" > "$tmp_file"
                mv "$tmp_file" "$PROJECT_ROOT/.claude/settings.json"
                echo -e "${GREEN}  ✓ Merged settings.json${NC}"
            fi
        else
            echo -e "${YELLOW}  Warning: jq not found — settings.json may need manual merge${NC}"
            if [ "$DRY_RUN" = false ]; then
                cp "$FRAMEWORK_CLAUDE/settings.json" "$PROJECT_ROOT/.claude/settings.json.new"
                echo -e "${YELLOW}  Saved new settings to .claude/settings.json.new — please merge manually${NC}"
            fi
        fi
    else
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}  [dry-run] Would copy settings.json${NC}"
        else
            cp "$FRAMEWORK_CLAUDE/settings.json" "$PROJECT_ROOT/.claude/settings.json"
            echo -e "${GREEN}  ✓ Copied settings.json${NC}"
        fi
    fi
fi

# Merge settings.local.json (preserve user overrides, update framework defaults)
if [ -f "$FRAMEWORK_CLAUDE/settings.local.json" ]; then
    if [ -f "$PROJECT_ROOT/.claude/settings.local.json" ]; then
        if command -v jq &> /dev/null; then
            if [ "$DRY_RUN" = true ]; then
                echo -e "${YELLOW}  [dry-run] Would merge settings.local.json${NC}"
            else
                tmp_file=$(mktemp)
                jq -s '.[0] * .[1]' "$PROJECT_ROOT/.claude/settings.local.json" "$FRAMEWORK_CLAUDE/settings.local.json" > "$tmp_file"
                mv "$tmp_file" "$PROJECT_ROOT/.claude/settings.local.json"
                echo -e "${GREEN}  ✓ Merged settings.local.json${NC}"
            fi
        else
            echo -e "${YELLOW}  Warning: jq not found — settings.local.json may need manual merge${NC}"
            if [ "$DRY_RUN" = false ]; then
                cp "$FRAMEWORK_CLAUDE/settings.local.json" "$PROJECT_ROOT/.claude/settings.local.json.new"
                echo -e "${YELLOW}  Saved new settings to .claude/settings.local.json.new — please merge manually${NC}"
            fi
        fi
    else
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}  [dry-run] Would copy settings.local.json${NC}"
        else
            cp "$FRAMEWORK_CLAUDE/settings.local.json" "$PROJECT_ROOT/.claude/settings.local.json"
            echo -e "${GREEN}  ✓ Copied settings.local.json${NC}"
        fi
    fi
fi
echo ""

# ============================================================================
# Step 7: Copy .isdlc/ framework config
# ============================================================================
echo -e "${BLUE}[7/10]${NC} Updating .isdlc/ framework config..."

FRAMEWORK_ISDLC="$FRAMEWORK_DIR/isdlc"

# Copy config directories (overwrite)
for DIR in config checklists templates scripts; do
    if [ -d "$FRAMEWORK_ISDLC/$DIR" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}  [dry-run] Would update .isdlc/$DIR/${NC}"
        else
            cp -r "$FRAMEWORK_ISDLC/$DIR" "$PROJECT_ROOT/.isdlc/"
            echo -e "${GREEN}  ✓ Updated .isdlc/$DIR/${NC}"
        fi
    fi
done

# Copy skills manifest to hooks config
mkdir -p "$PROJECT_ROOT/.claude/hooks/config"
if [ -f "$FRAMEWORK_ISDLC/config/skills-manifest.yaml" ]; then
    if [ "$DRY_RUN" = false ]; then
        cp "$FRAMEWORK_ISDLC/config/skills-manifest.yaml" "$PROJECT_ROOT/.claude/hooks/config/"

        # Convert YAML to JSON
        if command -v yq &> /dev/null; then
            yq -o=json "$PROJECT_ROOT/.claude/hooks/config/skills-manifest.yaml" > "$PROJECT_ROOT/.claude/hooks/config/skills-manifest.json"
            echo -e "${GREEN}  ✓ Updated skills manifest in hooks/config/ (yq)${NC}"
        elif command -v python3 &> /dev/null && python3 -c "import yaml, json" 2>/dev/null; then
            python3 -c "
import yaml, json
with open('$PROJECT_ROOT/.claude/hooks/config/skills-manifest.yaml') as f:
    data = yaml.safe_load(f)
with open('$PROJECT_ROOT/.claude/hooks/config/skills-manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
            echo -e "${GREEN}  ✓ Updated skills manifest in hooks/config/ (Python)${NC}"
        elif [ -f "$FRAMEWORK_ISDLC/config/skills-manifest.json" ]; then
            cp "$FRAMEWORK_ISDLC/config/skills-manifest.json" "$PROJECT_ROOT/.claude/hooks/config/"
            echo -e "${GREEN}  ✓ Updated skills manifest in hooks/config/ (pre-converted)${NC}"
        else
            echo -e "${YELLOW}  Warning: Could not convert manifest. Install yq or Python+PyYAML.${NC}"
        fi
    else
        echo -e "${YELLOW}  [dry-run] Would update skills manifest in hooks/config/${NC}"
    fi
fi

# Copy workflows.json
if [ -f "$FRAMEWORK_ISDLC/config/workflows.json" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  [dry-run] Would update workflow definitions${NC}"
    else
        cp "$FRAMEWORK_ISDLC/config/workflows.json" "$PROJECT_ROOT/.isdlc/config/"
        cp "$FRAMEWORK_ISDLC/config/workflows.json" "$PROJECT_ROOT/.claude/hooks/config/"
        echo -e "${GREEN}  ✓ Updated workflow definitions${NC}"
    fi
fi
echo ""

# ============================================================================
# Step 8: Clean removed files (old manifest diff)
# ============================================================================
echo -e "${BLUE}[8/10]${NC} Cleaning removed files..."

if [ "$HAS_OLD_MANIFEST" = true ] && [ ${#OLD_MANIFEST_FILES[@]} -gt 0 ] && command -v jq &> /dev/null; then
    REMOVED_COUNT=0

    # Build new file list
    declare -a NEW_FILES=()
    for DIR in agents skills commands hooks; do
        if [ -d "$PROJECT_ROOT/.claude/$DIR" ]; then
            while IFS= read -r file; do
                REL_PATH="${file#$PROJECT_ROOT/}"
                NEW_FILES+=("$REL_PATH")
            done < <(find "$PROJECT_ROOT/.claude/$DIR" -type f 2>/dev/null)
        fi
    done
    if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
        NEW_FILES+=(".claude/settings.json")
    fi

    # Check each old file against new set
    for OLD_FILE in "${OLD_MANIFEST_FILES[@]}"; do
        FOUND=false
        for NEW_FILE in "${NEW_FILES[@]}"; do
            if [ "$OLD_FILE" = "$NEW_FILE" ]; then
                FOUND=true
                break
            fi
        done
        if [ "$FOUND" = false ] && [ -f "$PROJECT_ROOT/$OLD_FILE" ]; then
            if [ "$DRY_RUN" = true ]; then
                echo -e "${YELLOW}  [dry-run] Would remove obsolete: $OLD_FILE${NC}"
            else
                rm -f "$PROJECT_ROOT/$OLD_FILE"
            fi
            ((REMOVED_COUNT++))
        fi
    done

    if [ "$REMOVED_COUNT" -gt 0 ]; then
        echo -e "${GREEN}  ✓ Removed $REMOVED_COUNT obsolete files${NC}"
    else
        echo -e "${GREEN}  ✓ No obsolete files to remove${NC}"
    fi
else
    echo -e "${YELLOW}  Skipped (no old manifest or jq not available)${NC}"
fi
echo ""

# ============================================================================
# Step 9: Regenerate manifest
# ============================================================================
echo -e "${BLUE}[9/10]${NC} Regenerating installation manifest..."

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ "$DRY_RUN" = false ]; then
    # Collect all installed framework files
    declare -a INSTALLED_FILES=()
    for DIR in agents skills commands hooks; do
        if [ -d "$PROJECT_ROOT/.claude/$DIR" ]; then
            while IFS= read -r file; do
                REL_PATH="${file#$PROJECT_ROOT/}"
                INSTALLED_FILES+=("$REL_PATH")
            done < <(find "$PROJECT_ROOT/.claude/$DIR" -type f 2>/dev/null)
        fi
    done
    if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
        INSTALLED_FILES+=(".claude/settings.json")
    fi

    # Build JSON manifest
    MANIFEST_JSON='{"version":"1.0.0","created":"'"$TIMESTAMP"'","framework_version":"'"$NEW_VERSION"'","files":['
    FIRST_FILE=true
    for file in "${INSTALLED_FILES[@]}"; do
        if [ "$FIRST_FILE" = false ]; then
            MANIFEST_JSON+=','
        fi
        MANIFEST_JSON+='"'"$file"'"'
        FIRST_FILE=false
    done
    MANIFEST_JSON+=']}'

    if command -v jq &> /dev/null; then
        echo "$MANIFEST_JSON" | jq '.' > "$MANIFEST_FILE"
    else
        echo "$MANIFEST_JSON" > "$MANIFEST_FILE"
    fi

    echo -e "${GREEN}  ✓ Manifest regenerated (${#INSTALLED_FILES[@]} files tracked)${NC}"
else
    echo -e "${YELLOW}  [dry-run] Would regenerate manifest${NC}"
fi
echo ""

# ============================================================================
# Step 10: Update state.json version + history
# ============================================================================
echo -e "${BLUE}[10/10]${NC} Updating state.json..."

if [ "$DRY_RUN" = false ]; then
    if command -v jq &> /dev/null; then
        STATE_FILE="$PROJECT_ROOT/.isdlc/state.json"
        tmp_state=$(mktemp)

        jq --arg v "$NEW_VERSION" --arg ts "$TIMESTAMP" --arg old "$INSTALLED_VERSION" '
          .framework_version = $v |
          .history += [{
            "timestamp": $ts,
            "agent": "update-script",
            "action": ("Framework updated from " + $old + " to " + $v)
          }]
        ' "$STATE_FILE" > "$tmp_state" && mv "$tmp_state" "$STATE_FILE"

        echo -e "${GREEN}  ✓ Updated state.json ($INSTALLED_VERSION → $NEW_VERSION)${NC}"

        # Update monorepo per-project states if present
        if [ -f "$PROJECT_ROOT/.isdlc/monorepo.json" ]; then
            for PROJ_STATE in "$PROJECT_ROOT"/.isdlc/projects/*/state.json; do
                [ -f "$PROJ_STATE" ] || continue
                tmp_proj=$(mktemp)
                jq --arg v "$NEW_VERSION" --arg ts "$TIMESTAMP" --arg old "$INSTALLED_VERSION" '
                  .framework_version = $v |
                  .history += [{
                    "timestamp": $ts,
                    "agent": "update-script",
                    "action": ("Framework updated from " + $old + " to " + $v)
                  }]
                ' "$PROJ_STATE" > "$tmp_proj" && mv "$tmp_proj" "$PROJ_STATE"
            done
            echo -e "${GREEN}  ✓ Updated monorepo project states${NC}"
        fi
    else
        # Fallback: use sed to update framework_version (less reliable)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/"framework_version"[[:space:]]*:[[:space:]]*"[^"]*"/"framework_version": "'"$NEW_VERSION"'"/' "$PROJECT_ROOT/.isdlc/state.json"
        else
            sed -i 's/"framework_version"[[:space:]]*:[[:space:]]*"[^"]*"/"framework_version": "'"$NEW_VERSION"'"/' "$PROJECT_ROOT/.isdlc/state.json"
        fi
        echo -e "${GREEN}  ✓ Updated framework_version in state.json${NC}"
        echo -e "${YELLOW}  Warning: History entry not added (jq not available)${NC}"
    fi
else
    echo -e "${YELLOW}  [dry-run] Would update state.json ($INSTALLED_VERSION → $NEW_VERSION)${NC}"
fi
echo ""

# ============================================================================
# Search Setup: Detect and configure search tools (fail-open)
# ============================================================================
if [ "$NO_SEARCH_SETUP" = false ] && [ "$DRY_RUN" = false ]; then
    ISDLC_BIN="$SCRIPT_DIR/bin/isdlc.js"
    if command -v node &> /dev/null && [ -f "$ISDLC_BIN" ]; then
        echo -e "${BLUE}[*]${NC} Setting up search capabilities..."
        (cd "$PROJECT_ROOT" && node "$ISDLC_BIN" search-setup --force) 2>/dev/null || echo -e "${YELLOW}  Search setup skipped (non-fatal)${NC}"
    else
        echo -e "${YELLOW}  Search setup skipped (Node.js not available). Run 'isdlc search-setup' later.${NC}"
    fi
    echo ""
fi

# ============================================================================
# Summary
# ============================================================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${GREEN}║            Dry Run Complete                                ║${NC}"
else
    echo -e "${GREEN}║            Update Complete!                                ║${NC}"
fi
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Previous version:${NC} $INSTALLED_VERSION"
echo -e "${BLUE}New version:${NC}      $NEW_VERSION"
echo ""
echo -e "${GREEN}  ✓ Framework files updated${NC}"
echo -e "${GREEN}  ✓ User artifacts preserved${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}No changes were made. Run without --dry-run to update.${NC}"
    echo ""
fi

# Offer to clean up the framework clone directory
if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
    echo -e "${YELLOW}Framework source directory: $SCRIPT_DIR${NC}"
    read -p "Remove framework source directory? [Y/n]: " CLEANUP_CONFIRM
    CLEANUP_CONFIRM=${CLEANUP_CONFIRM:-Y}

    if [[ "$CLEANUP_CONFIRM" =~ ^[Yy]$ ]]; then
        rm -rf "$SCRIPT_DIR"
        echo -e "${GREEN}  ✓ Removed $SCRIPT_DIR${NC}"
    else
        echo -e "${YELLOW}  Framework source left at $SCRIPT_DIR${NC}"
    fi
    echo ""
fi

echo -e "${CYAN}Run 'isdlc doctor' to verify installation health.${NC}"
echo ""
