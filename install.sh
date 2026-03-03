#!/bin/bash

# iSDLC Framework - Project Installation Script
#
# This script installs the iSDLC framework into your existing project.
#
# Usage:
#   1. Clone the iSDLC framework into your project: git clone <repo> isdlc-framework
#   2. Run: ./isdlc-framework/install.sh
#   3. The script will set up the framework and clean up after itself
#
# What it does:
#   - Creates or merges .claude/ folder with agent definitions and skills
#   - Creates docs/ folder for requirements and documentation
#   - Creates .isdlc/ folder for project state tracking
#   - Removes the isdlc-framework folder after installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get the directory where this script is located (the cloned isdlc-framework folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The project root is the parent of the cloned framework folder
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# Framework resources are in src/ subdirectory
FRAMEWORK_DIR="$SCRIPT_DIR/src"

# ============================================================================
# Remove framework development files (not needed by end users)
# ============================================================================
# Git artifacts
if [ -d "$SCRIPT_DIR/.git" ]; then
    rm -rf "$SCRIPT_DIR/.git"
fi
if [ -f "$SCRIPT_DIR/.gitignore" ]; then
    rm -f "$SCRIPT_DIR/.gitignore"
fi

# Framework development notes
rm -f "$SCRIPT_DIR/CHANGELOG.md" 2>/dev/null || true
rm -f "$SCRIPT_DIR/NEXT-SESSION.md" 2>/dev/null || true
rm -f "$SCRIPT_DIR/CLAUDE.md" 2>/dev/null || true
rm -f "$SCRIPT_DIR/BACKLOG.md" 2>/dev/null || true
rm -f "$SCRIPT_DIR/framework-info.md" 2>/dev/null || true
rm -f "$SCRIPT_DIR/setup-remotes.sh" 2>/dev/null || true
rm -f "$SCRIPT_DIR/.npmignore" 2>/dev/null || true

# Development session logs
rm -f "$SCRIPT_DIR/docs/SESSION-"*.md 2>/dev/null || true

# Archive of old documentation
rm -rf "$SCRIPT_DIR/docs/archive" 2>/dev/null || true

# Dogfooding docs (analysis artifacts, constitution, etc.)
rm -rf "$SCRIPT_DIR/docs/requirements" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/isdlc" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/architecture" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/design" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/common" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/testing" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/.validations" 2>/dev/null || true
rm -f "$SCRIPT_DIR/docs/agent-skill-mapping.md" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/docs/BUG-"* 2>/dev/null || true

# Test files (not distributed to end users)
rm -rf "$SCRIPT_DIR/tests" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/src/claude/hooks/tests" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/coverage" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/.validations" 2>/dev/null || true
find "$SCRIPT_DIR/lib" -name "*.test.js" -delete 2>/dev/null || true
find "$SCRIPT_DIR/lib" -name "*.test.cjs" -delete 2>/dev/null || true
rm -f "$SCRIPT_DIR/lib/utils/test-helpers.js" 2>/dev/null || true

# Development tooling
rm -rf "$SCRIPT_DIR/src/claude/agents-backup" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/scripts" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/.github" 2>/dev/null || true

# OS artifacts
find "$SCRIPT_DIR" -name ".DS_Store" -delete 2>/dev/null || true

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           iSDLC Framework - Project Installation           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project Directory:${NC} $PROJECT_ROOT"
echo ""

# Confirm installation
echo -e "${YELLOW}This will install the iSDLC framework into your project:${NC}"
echo "  - .claude/        (agents and skills)"
echo "  - .isdlc/         (project state tracking)"
echo "  - docs/           (requirements and documentation)"
echo ""
read -p "Continue with installation? [Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${RED}Installation cancelled.${NC}"
    exit 0
fi

echo ""

# Get project name from directory (no prompt needed)
PROJECT_NAME=$(basename "$PROJECT_ROOT")
echo -e "${BLUE}Project Name:${NC} $PROJECT_NAME"

# ============================================================================
# Detect if this is an existing project with code
# ============================================================================
IS_EXISTING_PROJECT=false

# Check for common indicators of an existing project
if [ -f "package.json" ] || [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || \
   [ -f "go.mod" ] || [ -f "Cargo.toml" ] || [ -f "pom.xml" ] || [ -f "build.gradle" ] || \
   [ -f "Gemfile" ] || [ -f "composer.json" ] || [ -f "*.csproj" ] || [ -f "Makefile" ] || \
   [ -d "src" ] || [ -d "lib" ] || [ -d "app" ] || [ -d "pkg" ] || [ -d "cmd" ]; then
    IS_EXISTING_PROJECT=true
fi

# Also check if there are any source code files
if [ "$IS_EXISTING_PROJECT" = false ]; then
    SOURCE_FILES=$(find "$PROJECT_ROOT" -maxdepth 3 -type f \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "*.cs" \) 2>/dev/null | head -1)
    if [ -n "$SOURCE_FILES" ]; then
        IS_EXISTING_PROJECT=true
    fi
fi

# ============================================================================
# Detect if this is a monorepo
# ============================================================================
IS_MONOREPO=false
MONOREPO_TYPE=""
declare -a DETECTED_PROJECTS=()

# Check for workspace indicators
if [ -f "$PROJECT_ROOT/pnpm-workspace.yaml" ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="pnpm"
elif [ -f "$PROJECT_ROOT/lerna.json" ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="lerna"
elif [ -f "$PROJECT_ROOT/turbo.json" ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="turbo"
elif [ -f "$PROJECT_ROOT/nx.json" ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="nx"
elif [ -f "$PROJECT_ROOT/rush.json" ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="rush"
fi

# Check for common monorepo directory patterns if not detected yet
if [ "$IS_MONOREPO" = false ]; then
    APPS_COUNT=0
    if [ -d "$PROJECT_ROOT/apps" ]; then
        APPS_COUNT=$(ls -d "$PROJECT_ROOT/apps"/*/ 2>/dev/null | wc -l | tr -d ' ')
    fi
    PACKAGES_COUNT=0
    if [ -d "$PROJECT_ROOT/packages" ]; then
        PACKAGES_COUNT=$(ls -d "$PROJECT_ROOT/packages"/*/ 2>/dev/null | wc -l | tr -d ' ')
    fi
    SERVICES_COUNT=0
    if [ -d "$PROJECT_ROOT/services" ]; then
        SERVICES_COUNT=$(ls -d "$PROJECT_ROOT/services"/*/ 2>/dev/null | wc -l | tr -d ' ')
    fi

    TOTAL_SUBPROJECTS=$((APPS_COUNT + PACKAGES_COUNT + SERVICES_COUNT))
    if [ "$TOTAL_SUBPROJECTS" -ge 2 ]; then
        IS_MONOREPO=true
        MONOREPO_TYPE="directory-structure"
    fi
fi

# Check root-level directories for project markers (catches frontend/ + backend/ layouts)
SKIP_DIRS=".claude .isdlc .git docs node_modules scripts vendor dist build target $(basename "$SCRIPT_DIR")"
declare -a ROOT_PROJECT_DIRS=()
for DIR in "$PROJECT_ROOT"/*/; do
    [ -d "$DIR" ] || continue
    DIR_NAME=$(basename "$DIR")
    # Skip known non-project directories
    SKIP=false
    for SKIP_NAME in $SKIP_DIRS; do
        if [ "$DIR_NAME" = "$SKIP_NAME" ]; then
            SKIP=true
            break
        fi
    done
    [ "$SKIP" = true ] && continue
    # Check for project markers
    if [ -f "$DIR/package.json" ] || [ -f "$DIR/go.mod" ] || [ -f "$DIR/Cargo.toml" ] || \
       [ -f "$DIR/pyproject.toml" ] || [ -f "$DIR/pom.xml" ] || [ -f "$DIR/build.gradle" ] || \
       [ -d "$DIR/src" ]; then
        ROOT_PROJECT_DIRS+=("$DIR_NAME")
    fi
done

if [ "$IS_MONOREPO" = false ] && [ ${#ROOT_PROJECT_DIRS[@]} -ge 2 ]; then
    IS_MONOREPO=true
    MONOREPO_TYPE="root-directories"
fi

# Auto-detect projects in monorepo
if [ "$IS_MONOREPO" = true ]; then
    for SCAN_DIR in apps packages services; do
        if [ -d "$PROJECT_ROOT/$SCAN_DIR" ]; then
            for PROJ_DIR in "$PROJECT_ROOT/$SCAN_DIR"/*/; do
                if [ -d "$PROJ_DIR" ]; then
                    PROJ_NAME=$(basename "$PROJ_DIR")
                    PROJ_REL_PATH="$SCAN_DIR/$PROJ_NAME"
                    DETECTED_PROJECTS+=("$PROJ_NAME:$PROJ_REL_PATH")
                fi
            done
        fi
    done
    # Also include root-level project directories
    for DIR_NAME in "${ROOT_PROJECT_DIRS[@]}"; do
        # Avoid duplicates (directory might already be under apps/packages/services)
        ALREADY_ADDED=false
        for EXISTING in "${DETECTED_PROJECTS[@]}"; do
            if [ "${EXISTING%%:*}" = "$DIR_NAME" ]; then
                ALREADY_ADDED=true
                break
            fi
        done
        if [ "$ALREADY_ADDED" = false ]; then
            DETECTED_PROJECTS+=("$DIR_NAME:$DIR_NAME")
        fi
    done
fi

# Always ask user about monorepo — auto-detection informs the default
echo ""
if [ "$IS_MONOREPO" = true ]; then
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           MONOREPO INDICATORS DETECTED                     ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}This appears to be a monorepo (${MONOREPO_TYPE}).${NC}"
    if [ ${#DETECTED_PROJECTS[@]} -gt 0 ]; then
        echo -e "${YELLOW}Detected ${#DETECTED_PROJECTS[@]} sub-projects:${NC}"
        for PROJ_ENTRY in "${DETECTED_PROJECTS[@]}"; do
            PROJ_NAME="${PROJ_ENTRY%%:*}"
            PROJ_PATH="${PROJ_ENTRY#*:}"
            echo "  - $PROJ_NAME ($PROJ_PATH)"
        done
    fi
    echo ""
    read -p "Is this a monorepo? [Y/n]: " MONOREPO_ANSWER
    MONOREPO_ANSWER=${MONOREPO_ANSWER:-Y}
else
    if [ "$IS_EXISTING_PROJECT" = true ]; then
        echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║           EXISTING PROJECT DETECTED                        ║${NC}"
        echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}This appears to be an existing project with code.${NC}"
    else
        echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║              NEW PROJECT DETECTED                          ║${NC}"
        echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}This appears to be a new project.${NC}"
    fi
    echo ""
    read -p "Is this a monorepo? [y/N]: " MONOREPO_ANSWER
    MONOREPO_ANSWER=${MONOREPO_ANSWER:-N}
fi

# User's answer is final
if [[ "$MONOREPO_ANSWER" =~ ^[Yy]$ ]]; then
    IS_MONOREPO=true
    [ -z "$MONOREPO_TYPE" ] && MONOREPO_TYPE="user-specified"

    # If projects were detected, let user confirm or edit
    if [ ${#DETECTED_PROJECTS[@]} -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Detected sub-projects:${NC}"
        for PROJ_ENTRY in "${DETECTED_PROJECTS[@]}"; do
            PROJ_NAME="${PROJ_ENTRY%%:*}"
            PROJ_PATH="${PROJ_ENTRY#*:}"
            echo "  - $PROJ_NAME ($PROJ_PATH)"
        done
        echo ""
        read -p "Use these projects? [Y/n]: " USE_DETECTED
        USE_DETECTED=${USE_DETECTED:-Y}
        if [[ ! "$USE_DETECTED" =~ ^[Yy]$ ]]; then
            DETECTED_PROJECTS=()
        fi
    fi

    # If no projects (none detected or user rejected), ask for manual entry
    if [ ${#DETECTED_PROJECTS[@]} -eq 0 ]; then
        echo ""
        echo -e "${YELLOW}Enter project directories (comma-separated, relative to project root):${NC}"
        echo -e "${YELLOW}  Example: frontend, backend, shared${NC}"
        read -p "> " MANUAL_DIRS
        if [ -n "$MANUAL_DIRS" ]; then
            IFS=',' read -ra DIR_ARRAY <<< "$MANUAL_DIRS"
            for RAW_DIR in "${DIR_ARRAY[@]}"; do
                DIR_TRIMMED=$(echo "$RAW_DIR" | xargs)  # trim whitespace
                if [ -d "$PROJECT_ROOT/$DIR_TRIMMED" ]; then
                    DIR_BASE=$(basename "$DIR_TRIMMED")
                    DETECTED_PROJECTS+=("$DIR_BASE:$DIR_TRIMMED")
                    echo -e "${GREEN}  ✓ $DIR_TRIMMED${NC}"
                else
                    echo -e "${RED}  ✗ $DIR_TRIMMED (not found — skipping)${NC}"
                fi
            done
        fi
        if [ ${#DETECTED_PROJECTS[@]} -eq 0 ]; then
            echo -e "${RED}No valid project directories found. Falling back to single-project mode.${NC}"
            IS_MONOREPO=false
        fi
    fi
else
    IS_MONOREPO=false
    echo -e "${YELLOW}Installing as single-project.${NC}"
fi
echo ""

# ============================================================================
# Claude Code detection
# ============================================================================
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║             CLAUDE CODE DETECTION                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

CLAUDE_CODE_FOUND=false
CLAUDE_CODE_VERSION=""

if command -v claude &> /dev/null; then
    CLAUDE_CODE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    CLAUDE_CODE_FOUND=true
    echo -e "${GREEN}  ✓ Claude Code detected: ${CLAUDE_CODE_VERSION}${NC}"
else
    echo -e "${RED}  ✗ Claude Code CLI not found on PATH${NC}"
    echo ""
    echo -e "${YELLOW}  iSDLC is a framework designed for Claude Code.${NC}"
    echo -e "${YELLOW}  It requires the 'claude' CLI to function.${NC}"
    echo ""
    echo -e "${CYAN}  Install Claude Code:${NC}"
    echo -e "    ${GREEN}https://docs.anthropic.com/en/docs/claude-code/overview${NC}"
    echo ""
    read -p "  Continue anyway? Framework files will be ready when you install Claude Code. [y/N]: " CLAUDE_CONTINUE
    CLAUDE_CONTINUE=${CLAUDE_CONTINUE:-N}
    if [[ ! "$CLAUDE_CONTINUE" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation cancelled. Install Claude Code first, then re-run.${NC}"
        exit 0
    fi
fi
echo ""

# ============================================================================
# Provider selection
# ============================================================================
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              LLM PROVIDER SELECTION                        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Choose how Claude Code connects to an LLM:${NC}"
echo ""
echo "  1) Claude Code (Anthropic API) — Recommended"
echo "  2) Ollama (local LLM)"
echo ""
read -p "Choice [1]: " PROVIDER_MODE_ANSWER
PROVIDER_MODE_ANSWER=${PROVIDER_MODE_ANSWER:-1}

case "$PROVIDER_MODE_ANSWER" in
    1) PROVIDER_MODE="claude-code" ;;
    2) PROVIDER_MODE="ollama" ;;
    *) PROVIDER_MODE="claude-code"
       echo -e "${YELLOW}  Invalid choice — defaulting to Claude Code${NC}" ;;
esac
echo -e "${GREEN}  ✓ Provider: $PROVIDER_MODE${NC}"
echo ""

# Workflow track is determined by orchestrator at runtime based on task complexity
TRACK="auto"
TRACK_NAME="Orchestrator-managed"
COMPLEXITY_LEVEL=null
PHASES_REQUIRED="null"
PHASES_OPTIONAL="null"
PHASES_SKIPPED="null"
MAX_ITERATIONS=10
ITERATION_TIMEOUT=5

cd "$PROJECT_ROOT"

# ============================================================================
# Step 1: Handle .claude folder
# ============================================================================
echo -e "${BLUE}[1/6]${NC} Setting up .claude folder..."

FRAMEWORK_CLAUDE="$FRAMEWORK_DIR/claude"

if [ ! -d "$FRAMEWORK_CLAUDE" ]; then
    echo -e "${RED}Error: Framework .claude folder not found at $FRAMEWORK_CLAUDE${NC}"
    exit 1
fi

# First, delete CLAUDE.md from the framework's .claude folder (it's for framework development only)
if [ -f "$FRAMEWORK_CLAUDE/CLAUDE.md" ]; then
    rm -f "$FRAMEWORK_CLAUDE/CLAUDE.md"
    echo -e "${YELLOW}  Removed framework CLAUDE.md (not needed for user projects)${NC}"
fi

if [ -d ".claude" ]; then
    echo -e "${YELLOW}  Existing .claude folder found - merging contents...${NC}"

    # Backup existing CLAUDE.md if it exists
    if [ -f ".claude/CLAUDE.md" ]; then
        echo -e "${YELLOW}  Backing up existing CLAUDE.md to CLAUDE.md.backup${NC}"
        cp ".claude/CLAUDE.md" ".claude/CLAUDE.md.backup"
    fi

    # Copy agents (overwrite)
    if [ -d "$FRAMEWORK_CLAUDE/agents" ]; then
        cp -r "$FRAMEWORK_CLAUDE/agents" ".claude/"
        echo -e "${GREEN}  ✓ Copied agents/${NC}"
    fi

    # Copy commands (overwrite)
    if [ -d "$FRAMEWORK_CLAUDE/commands" ]; then
        cp -r "$FRAMEWORK_CLAUDE/commands" ".claude/"
        echo -e "${GREEN}  ✓ Copied commands/${NC}"
    fi

    # Copy skills (overwrite)
    if [ -d "$FRAMEWORK_CLAUDE/skills" ]; then
        cp -r "$FRAMEWORK_CLAUDE/skills" ".claude/"
        echo -e "${GREEN}  ✓ Copied skills/${NC}"
    fi

    # Copy or merge settings.local.json
    if [ -f "$FRAMEWORK_CLAUDE/settings.local.json" ]; then
        if [ -f ".claude/settings.local.json" ]; then
            if command -v jq &> /dev/null; then
                tmp_file=$(mktemp)
                jq -s '.[0] * .[1]' ".claude/settings.local.json" "$FRAMEWORK_CLAUDE/settings.local.json" > "$tmp_file"
                mv "$tmp_file" ".claude/settings.local.json"
                echo -e "${GREEN}  ✓ Merged settings.local.json${NC}"
            else
                echo -e "${YELLOW}  Warning: jq not found, settings.local.json may need manual merge${NC}"
                cp "$FRAMEWORK_CLAUDE/settings.local.json" ".claude/settings.local.json.new"
            fi
        else
            cp "$FRAMEWORK_CLAUDE/settings.local.json" ".claude/"
            echo -e "${GREEN}  ✓ Copied settings.local.json${NC}"
        fi
    fi
else
    echo -e "${YELLOW}  Creating new .claude folder...${NC}"
    mkdir -p ".claude"

    # Copy only the framework components (CLAUDE.md already deleted above)
    if [ -d "$FRAMEWORK_CLAUDE/agents" ]; then
        cp -r "$FRAMEWORK_CLAUDE/agents" ".claude/"
    fi
    if [ -d "$FRAMEWORK_CLAUDE/commands" ]; then
        cp -r "$FRAMEWORK_CLAUDE/commands" ".claude/"
    fi
    if [ -d "$FRAMEWORK_CLAUDE/skills" ]; then
        cp -r "$FRAMEWORK_CLAUDE/skills" ".claude/"
    fi
    if [ -f "$FRAMEWORK_CLAUDE/settings.local.json" ]; then
        cp "$FRAMEWORK_CLAUDE/settings.local.json" ".claude/"
    fi

    echo -e "${GREEN}  ✓ Created .claude/${NC}"
fi

# Permission review warning
echo ""
echo -e "${YELLOW}  ⚠  Review .claude/settings.local.json permissions — adjust if your security requirements differ${NC}"

# ============================================================================
# Step 1b: Setup skill enforcement hooks (Node.js - Cross-Platform)
# ============================================================================
echo -e "${BLUE}[1b/6]${NC} Setting up skill enforcement hooks..."

# Check for Node.js (required for hooks)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}  Warning: Node.js not found. Hooks require Node.js to run.${NC}"
    echo -e "${YELLOW}  Install Node.js from https://nodejs.org/${NC}"
fi

# Create hooks directory structure
mkdir -p ".claude/hooks/lib"
mkdir -p ".claude/hooks/dispatchers"
mkdir -p ".claude/hooks/tests/test-scenarios"

# Copy hook scripts from framework (Node.js files)
if [ -d "$FRAMEWORK_CLAUDE/hooks" ]; then
    cp -r "$FRAMEWORK_CLAUDE/hooks/"* ".claude/hooks/"
    echo -e "${GREEN}  ✓ Copied skill enforcement hooks (Node.js)${NC}"
fi

# Merge settings.json (hooks configuration)
if [ -f "$FRAMEWORK_CLAUDE/settings.json" ]; then
    if [ -f ".claude/settings.json" ]; then
        # Merge hooks into existing settings
        if command -v jq &> /dev/null; then
            tmp_file=$(mktemp)
            jq -s '.[0] * .[1]' ".claude/settings.json" "$FRAMEWORK_CLAUDE/settings.json" > "$tmp_file"
            mv "$tmp_file" ".claude/settings.json"
            echo -e "${GREEN}  ✓ Merged hooks into existing settings.json${NC}"
        else
            echo -e "${YELLOW}  Warning: jq not found, settings.json may need manual merge${NC}"
            cp "$FRAMEWORK_CLAUDE/settings.json" ".claude/settings.json.hooks"
        fi
    else
        cp "$FRAMEWORK_CLAUDE/settings.json" ".claude/settings.json"
        echo -e "${GREEN}  ✓ Created settings.json with hooks${NC}"
    fi
fi

# ============================================================================
# Step 2: Create docs folder
# ============================================================================
echo -e "${BLUE}[2/6]${NC} Setting up docs folder..."

if [ -d "docs" ]; then
    echo -e "${YELLOW}  docs/ folder already exists${NC}"
else
    mkdir -p docs
    echo -e "${GREEN}  ✓ Created docs/${NC}"
fi

# Create initial structure in docs
mkdir -p docs/requirements
mkdir -p docs/architecture
mkdir -p docs/design

# Create docs/isdlc for iSDLC-generated documents
mkdir -p docs/isdlc/checklists
echo -e "${GREEN}  ✓ Created docs/isdlc/ for iSDLC documents${NC}"

# Note: framework-info.md is NOT copied to user projects.
# It is framework documentation available in the framework repo.
# Agents and commands are self-contained and don't need it.

# Copy templates to docs if they exist
if [ -d "$FRAMEWORK_DIR/isdlc/templates/requirements" ]; then
    cp "$FRAMEWORK_DIR/isdlc/templates/requirements/"*.md docs/requirements/ 2>/dev/null || true
    echo -e "${GREEN}  ✓ Copied requirement templates to docs/requirements/${NC}"
fi

# Create a README in docs
cat > docs/README.md << 'EOF'
# Project Documentation

This folder contains all project documentation following the iSDLC framework.

## Structure

```
docs/
├── isdlc/              # iSDLC-generated documents
│   ├── constitution.md # Project constitution
│   ├── tasks.md        # Task plan
│   └── checklists/     # Gate checklist responses
├── requirements/       # Requirements specifications and user stories
├── architecture/       # Architecture decisions and system design
├── design/            # Detailed design documents
└── README.md          # This file
```

## Getting Started

1. Start with requirements in `requirements/`
2. Document architecture decisions in `architecture/`
3. Add detailed designs in `design/`

See `.isdlc/state.json` for current project phase and progress.
EOF

echo -e "${GREEN}  ✓ Created docs/README.md${NC}"

# ============================================================================
# Step 3: Create .isdlc folder with state
# ============================================================================
echo -e "${BLUE}[3/6]${NC} Setting up .isdlc folder..."

mkdir -p .isdlc/phases/{01-requirements,02-architecture,03-design,04-test-strategy,05-implementation,06-testing,07-code-review,08-validation,09-cicd,10-local-testing,11-test-deploy,12-production,13-operations}/artifacts

# Copy config files
if [ -d "$FRAMEWORK_DIR/isdlc/config" ]; then
    cp -r "$FRAMEWORK_DIR/isdlc/config" ".isdlc/"
    echo -e "${GREEN}  ✓ Copied config files${NC}"
fi

# Copy skills manifest to hooks config folder (hooks config lives with hooks)
mkdir -p ".claude/hooks/config"
if [ -f "$FRAMEWORK_DIR/isdlc/config/skills-manifest.yaml" ]; then
    cp "$FRAMEWORK_DIR/isdlc/config/skills-manifest.yaml" ".claude/hooks/config/"

    # Copy pre-built JSON manifest for runtime hooks (hooks only read JSON)
    if [ -f "$FRAMEWORK_CLAUDE/hooks/config/skills-manifest.json" ]; then
        cp "$FRAMEWORK_CLAUDE/hooks/config/skills-manifest.json" ".claude/hooks/config/"
        echo -e "${GREEN}  ✓ Copied skills manifest to hooks/config/${NC}"
    elif [ -f "$FRAMEWORK_DIR/isdlc/config/skills-manifest.json" ]; then
        cp "$FRAMEWORK_DIR/isdlc/config/skills-manifest.json" ".claude/hooks/config/"
        echo -e "${GREEN}  ✓ Copied skills manifest to hooks/config/${NC}"
    # Fallback: convert YAML to JSON if pre-built JSON is missing
    elif command -v yq &> /dev/null; then
        yq -o=json ".claude/hooks/config/skills-manifest.yaml" > ".claude/hooks/config/skills-manifest.json"
        echo -e "${GREEN}  ✓ Converted skills manifest to hooks/config/ (yq)${NC}"
    elif command -v python3 &> /dev/null && python3 -c "import yaml, json" 2>/dev/null; then
        python3 -c "
import yaml, json
with open('.claude/hooks/config/skills-manifest.yaml') as f:
    data = yaml.safe_load(f)
with open('.claude/hooks/config/skills-manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
        echo -e "${GREEN}  ✓ Converted skills manifest to hooks/config/ (Python)${NC}"
    else
        echo -e "${YELLOW}  Warning: Could not convert manifest. Install yq or Python+PyYAML.${NC}"
    fi
fi

# Copy workflows.json to both .isdlc/config/ and .claude/hooks/config/
if [ -f "$FRAMEWORK_DIR/isdlc/config/workflows.json" ]; then
    mkdir -p ".isdlc/config"
    cp "$FRAMEWORK_DIR/isdlc/config/workflows.json" ".isdlc/config/"
    cp "$FRAMEWORK_DIR/isdlc/config/workflows.json" ".claude/hooks/config/"
    echo -e "${GREEN}  ✓ Copied workflow definitions${NC}"
fi

# Copy checklists
if [ -d "$FRAMEWORK_DIR/isdlc/checklists" ]; then
    cp -r "$FRAMEWORK_DIR/isdlc/checklists" ".isdlc/"
    echo -e "${GREEN}  ✓ Copied gate checklists${NC}"
fi

# Copy templates
if [ -d "$FRAMEWORK_DIR/isdlc/templates" ]; then
    cp -r "$FRAMEWORK_DIR/isdlc/templates" ".isdlc/"
    echo -e "${GREEN}  ✓ Copied templates${NC}"
fi

# Copy scripts (validate-state.sh, generate-report.sh)
if [ -d "$FRAMEWORK_DIR/isdlc/scripts" ]; then
    cp -r "$FRAMEWORK_DIR/isdlc/scripts" ".isdlc/"
    echo -e "${GREEN}  ✓ Copied utility scripts${NC}"
fi

# Copy constitution
if [ -f "$FRAMEWORK_DIR/isdlc/templates/constitution.md" ]; then
    cp "$FRAMEWORK_DIR/isdlc/templates/constitution.md" "docs/isdlc/constitution.md"
    echo -e "${GREEN}  ✓ Copied constitution${NC}"
fi

# Generate providers.yaml from template
# NOTE: Disabled — framework is Claude Code-specific. No providers.yaml needed.
# PROVIDERS_TARGET=".isdlc/providers.yaml"
# if [ -f "$PROVIDERS_TARGET" ]; then
#     echo -e "${YELLOW}  providers.yaml already exists — skipping (use /provider set to change mode)${NC}"
# else
#     PROVIDERS_TEMPLATE="$FRAMEWORK_DIR/isdlc/templates/providers.yaml.template"
#     if [ -f "$PROVIDERS_TEMPLATE" ]; then
#         cp "$PROVIDERS_TEMPLATE" "$PROVIDERS_TARGET"
#         if [[ "$OSTYPE" == "darwin"* ]]; then
#             sed -i '' "s/^active_mode: \"[^\"]*\"/active_mode: \"$PROVIDER_MODE\"/" "$PROVIDERS_TARGET"
#         else
#             sed -i "s/^active_mode: \"[^\"]*\"/active_mode: \"$PROVIDER_MODE\"/" "$PROVIDERS_TARGET"
#         fi
#         echo -e "${GREEN}  ✓ Generated providers.yaml (mode: $PROVIDER_MODE)${NC}"
#     else
#         echo -e "${YELLOW}  providers.yaml.template not found — skipping provider config${NC}"
#     fi
# fi

# Create state.json
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > .isdlc/state.json << EOF
{
  "framework_version": "0.1.0-alpha",
  "project": {
    "name": "$PROJECT_NAME",
    "created": "$TIMESTAMP",
    "description": "",
    "is_new_project": $( [ "$IS_EXISTING_PROJECT" = true ] && echo "false" || echo "true" )
  },
  "provider_selection": "$PROVIDER_MODE",
  "complexity_assessment": {
    "level": $COMPLEXITY_LEVEL,
    "track": "$TRACK",
    "assessed_at": "$TIMESTAMP",
    "assessed_by": "manual",
    "dimensions": {
      "architectural": null,
      "security": null,
      "testing": null,
      "deployment": null,
      "team": null,
      "timeline": null
    }
  },
  "workflow": {
    "track": "$TRACK",
    "track_name": "$TRACK_NAME",
    "phases_required": $PHASES_REQUIRED,
    "phases_optional": $PHASES_OPTIONAL,
    "phases_skipped": $PHASES_SKIPPED
  },
  "constitution": {
    "enforced": true,
    "path": "docs/isdlc/constitution.md",
    "validated_at": null
  },
  "autonomous_iteration": {
    "enabled": true,
    "max_iterations": $MAX_ITERATIONS,
    "timeout_per_iteration_minutes": $ITERATION_TIMEOUT,
    "circuit_breaker_threshold": 3
  },
  "skill_enforcement": {
    "enabled": true,
    "mode": "observe",
    "fail_behavior": "allow",
    "manifest_version": "2.0.0"
  },
  "cloud_configuration": {
    "provider": "undecided",
    "configured_at": null,
    "credentials_validated": false,
    "aws": null,
    "gcp": null,
    "azure": null,
    "deployment": {
      "staging_enabled": false,
      "production_enabled": false,
      "workflow_endpoint": "10-local-testing"
    }
  },
  "iteration_enforcement": {
    "enabled": true
  },
  "skill_usage_log": [],
  "active_workflow": null,
  "workflow_history": [],
  "counters": {
    "next_req_id": 1,
    "next_bug_id": 1
  },
  "current_phase": "01-requirements",
  "phases": {
    "01-requirements": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "02-architecture": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "03-design": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "04-test-strategy": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "05-implementation": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [], "iteration_tracking": { "current": 0, "max": null, "history": [], "final_status": null } },
    "06-testing": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [], "iteration_tracking": { "current": 0, "max": null, "history": [], "final_status": null } },
    "07-code-review": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "08-validation": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "09-cicd": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "10-local-testing": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "11-test-deploy": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "12-production": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] },
    "13-operations": { "status": "pending", "started": null, "completed": null, "gate_passed": null, "artifacts": [] }
  },
  "blockers": [],
  "active_agent": null,
  "history": [
    {
      "timestamp": "$TIMESTAMP",
      "agent": "init-script",
      "action": "Project initialized with iSDLC framework"
    }
  ]
}
EOF

echo -e "${GREEN}  ✓ Created state.json${NC}"

# Create provider.env for Ollama users
if [ "$PROVIDER_MODE" = "ollama" ]; then
    cat > "$PROJECT_ROOT/.isdlc/provider.env" << 'ENVEOF'
# iSDLC Ollama Provider Configuration
# Created by installer. Edit to change provider settings.
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
ENVEOF
    echo -e "${GREEN}  ✓ Created .isdlc/provider.env (Ollama configuration)${NC}"
fi

# ============================================================================
# Step 3b: Monorepo setup (if monorepo detected and confirmed)
# ============================================================================
if [ "$IS_MONOREPO" = true ]; then
    echo -e "${BLUE}[3b/6]${NC} Setting up monorepo structure..."

    # Determine default project (first detected project)
    DEFAULT_PROJECT=""
    if [ ${#DETECTED_PROJECTS[@]} -gt 0 ]; then
        DEFAULT_PROJECT="${DETECTED_PROJECTS[0]%%:*}"
    fi

    # Build scan_paths array from detected project paths
    SCAN_PATHS_JSON="["
    FIRST_SCAN=true
    declare -A SEEN_SCAN_PATHS=()
    for PROJ_ENTRY in "${DETECTED_PROJECTS[@]}"; do
        PROJ_PATH="${PROJ_ENTRY#*:}"
        # For nested paths like apps/web, use the parent dir (apps/)
        # For root-level paths like frontend, use the path directly
        if [[ "$PROJ_PATH" == */* ]]; then
            SCAN_PATH="${PROJ_PATH%%/*}/"
        else
            SCAN_PATH="$PROJ_PATH"
        fi
        if [ -z "${SEEN_SCAN_PATHS[$SCAN_PATH]+x}" ]; then
            SEEN_SCAN_PATHS["$SCAN_PATH"]=1
            if [ "$FIRST_SCAN" = false ]; then
                SCAN_PATHS_JSON+=", "
            fi
            SCAN_PATHS_JSON+="\"${SCAN_PATH}\""
            FIRST_SCAN=false
        fi
    done
    SCAN_PATHS_JSON+="]"

    # Build projects object
    PROJECTS_JSON="{"
    FIRST_PROJ=true
    for PROJ_ENTRY in "${DETECTED_PROJECTS[@]}"; do
        PROJ_NAME="${PROJ_ENTRY%%:*}"
        PROJ_PATH="${PROJ_ENTRY#*:}"
        if [ "$FIRST_PROJ" = false ]; then
            PROJECTS_JSON+=","
        fi
        PROJECTS_JSON+="
    \"$PROJ_NAME\": {
      \"name\": \"$PROJ_NAME\",
      \"path\": \"$PROJ_PATH\",
      \"registered_at\": \"$TIMESTAMP\",
      \"discovered\": true
    }"
        FIRST_PROJ=false
    done
    PROJECTS_JSON+="
  }"

    # Ask where project docs should live
    echo ""
    echo -e "${YELLOW}Where should project documentation live?${NC}"
    echo "  1) Root docs folder  — docs/{project-id}/  (shared-concern monorepos: FE/BE/shared)"
    echo "  2) Inside each project — {project-path}/docs/  (multi-app monorepos: app1/app2/app3)"
    read -p "Choice [1]: " DOCS_LOC_ANSWER
    DOCS_LOC_ANSWER=${DOCS_LOC_ANSWER:-1}
    if [ "$DOCS_LOC_ANSWER" = "2" ]; then
        DOCS_LOCATION="project"
    else
        DOCS_LOCATION="root"
    fi

    # Create monorepo.json
    cat > .isdlc/monorepo.json << MONOREPOEOF
{
  "version": "1.0.0",
  "default_project": "$DEFAULT_PROJECT",
  "docs_location": "$DOCS_LOCATION",
  "projects": $PROJECTS_JSON,
  "scan_paths": $SCAN_PATHS_JSON
}
MONOREPOEOF

    echo -e "${GREEN}  ✓ Created monorepo.json${NC}"

    # Create per-project directories and state files
    mkdir -p .isdlc/projects
    mkdir -p docs/isdlc/projects
    for PROJ_ENTRY in "${DETECTED_PROJECTS[@]}"; do
        PROJ_NAME="${PROJ_ENTRY%%:*}"
        PROJ_PATH="${PROJ_ENTRY#*:}"

        # Create project runtime directory (state, skills)
        mkdir -p ".isdlc/projects/$PROJ_NAME"
        mkdir -p ".isdlc/projects/$PROJ_NAME/skills/external"

        # Create project docs directory (user documents)
        mkdir -p "docs/isdlc/projects/$PROJ_NAME"

        # Check if the sub-project has existing code
        PROJ_IS_NEW=true
        if [ -f "$PROJECT_ROOT/$PROJ_PATH/package.json" ] || \
           [ -f "$PROJECT_ROOT/$PROJ_PATH/go.mod" ] || \
           [ -f "$PROJECT_ROOT/$PROJ_PATH/Cargo.toml" ] || \
           [ -d "$PROJECT_ROOT/$PROJ_PATH/src" ]; then
            PROJ_IS_NEW=false
        fi

        # Create per-project state.json
        cat > ".isdlc/projects/$PROJ_NAME/state.json" << PROJSTATEEOF
{
  "framework_version": "0.1.0-alpha",
  "project": {
    "name": "$PROJ_NAME",
    "path": "$PROJ_PATH",
    "created": "$TIMESTAMP",
    "description": "",
    "is_new_project": $( [ "$PROJ_IS_NEW" = true ] && echo "true" || echo "false" )
  },
  "constitution": {
    "enforced": true,
    "path": "docs/isdlc/constitution.md",
    "override_path": null,
    "validated_at": null
  },
  "skill_enforcement": {
    "enabled": true,
    "mode": "observe",
    "fail_behavior": "allow",
    "manifest_version": "2.0.0"
  },
  "cloud_configuration": {
    "provider": "undecided",
    "configured_at": null,
    "credentials_validated": false,
    "deployment": {
      "staging_enabled": false,
      "production_enabled": false,
      "workflow_endpoint": "10-local-testing"
    }
  },
  "skill_usage_log": [],
  "active_workflow": null,
  "workflow_history": [],
  "counters": {
    "next_req_id": 1,
    "next_bug_id": 1
  },
  "current_phase": null,
  "phases": {},
  "blockers": [],
  "active_agent": null,
  "history": [
    {
      "timestamp": "$TIMESTAMP",
      "agent": "init-script",
      "action": "Project registered in monorepo"
    }
  ]
}
PROJSTATEEOF

        echo -e "${GREEN}  ✓ Created state for project: $PROJ_NAME${NC}"

        # Create empty external skills manifest in docs/isdlc
        cat > "docs/isdlc/projects/$PROJ_NAME/external-skills-manifest.json" << EXTMANIFESTEOF
{
  "version": "1.0.0",
  "project_id": "$PROJ_NAME",
  "updated_at": "$TIMESTAMP",
  "skills": {}
}
EXTMANIFESTEOF
        echo -e "${GREEN}  ✓ Created external skills manifest for: $PROJ_NAME${NC}"

        # Create per-project docs directories
        if [ "$DOCS_LOCATION" = "project" ]; then
            mkdir -p "$PROJ_PATH/docs/requirements"
            mkdir -p "$PROJ_PATH/docs/architecture"
            mkdir -p "$PROJ_PATH/docs/design"
            echo -e "${GREEN}  ✓ Created $PROJ_PATH/docs/${NC}"
        else
            mkdir -p "docs/$PROJ_NAME/requirements"
            mkdir -p "docs/$PROJ_NAME/architecture"
            mkdir -p "docs/$PROJ_NAME/design"
            echo -e "${GREEN}  ✓ Created docs/$PROJ_NAME/${NC}"
        fi
    done

    echo -e "${GREEN}  ✓ Monorepo setup complete (${#DETECTED_PROJECTS[@]} projects)${NC}"
fi

# CLAUDE.md - seed from template if missing
if [ ! -f "CLAUDE.md" ]; then
    if [ -f ".claude/CLAUDE.md.template" ]; then
        cp ".claude/CLAUDE.md.template" "CLAUDE.md"
    else
        touch "CLAUDE.md"
    fi
    echo ""
    echo -e "${YELLOW}  ⚠ CLAUDE.md was missing - created from template in project root${NC}"
fi

# ============================================================================
# Step 5: Update constitution with project info and display for review
# ============================================================================
echo -e "${BLUE}[4/6]${NC} Configuring project constitution..."

# Update constitution with project name and track info
if [ -f "docs/isdlc/constitution.md" ]; then
    # Create a project-specific constitution based on the track
    cat > docs/isdlc/constitution.md << CONSTEOF
# Project Constitution - $PROJECT_NAME

<!-- CONSTITUTION_STATUS: STARTER_TEMPLATE -->
<!-- This marker indicates this constitution needs customization -->
<!-- Run /discover to customize -->

**Created**: $(date +"%Y-%m-%d")
**Status**: ⚠️ NEEDS CUSTOMIZATION

---

## ⚠️ CUSTOMIZATION REQUIRED

This is a **starter constitution** auto-generated during framework installation.
It contains generic articles that may not match your project's specific needs.

**To customize this constitution:**
Run \`/discover\` to analyze your project and generate tailored articles interactively.

**This constitution will be treated as a TEMPLATE until customized.**

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the **$PROJECT_NAME** project. These articles guide all SDLC phases and all agent interactions.

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
- Unit test coverage: ≥80%
- Integration test coverage: ≥70%

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
3. Gate fails twice → Escalate to human

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
CONSTEOF

    echo -e "${GREEN}  ✓ Created project constitution${NC}"
fi

# Note about constitution (both new and existing projects)
if [ "$IS_EXISTING_PROJECT" = true ]; then
    echo -e "${YELLOW}  Existing project - constitution template created at docs/isdlc/constitution.md${NC}"
else
    echo -e "${YELLOW}  Constitution template created at docs/isdlc/constitution.md${NC}"
fi
echo -e "${YELLOW}  Next step: Run /discover to customize your project constitution${NC}"

# ============================================================================
# Step 5b: Generate installation manifest for safe uninstall
# ============================================================================
echo -e "${BLUE}[5/6]${NC} Generating installation manifest..."

MANIFEST_FILE="$PROJECT_ROOT/.isdlc/installed-files.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Collect all installed framework files
declare -a INSTALLED_FILES=()

# Collect files from .claude directories
for DIR in agents skills commands hooks; do
    if [ -d "$PROJECT_ROOT/.claude/$DIR" ]; then
        while IFS= read -r file; do
            REL_PATH="${file#$PROJECT_ROOT/}"
            INSTALLED_FILES+=("$REL_PATH")
        done < <(find "$PROJECT_ROOT/.claude/$DIR" -type f 2>/dev/null)
    fi
done

# Add settings.json if it exists
if [ -f "$PROJECT_ROOT/.claude/settings.json" ]; then
    INSTALLED_FILES+=(".claude/settings.json")
fi

# Build JSON manifest
MANIFEST_JSON='{"version":"1.0.0","created":"'"$TIMESTAMP"'","framework_version":"0.1.0-alpha","files":['
FIRST_FILE=true
for file in "${INSTALLED_FILES[@]}"; do
    if [ "$FIRST_FILE" = false ]; then
        MANIFEST_JSON+=','
    fi
    MANIFEST_JSON+='"'"$file"'"'
    FIRST_FILE=false
done
MANIFEST_JSON+=']}'

# Write manifest (use jq to format if available, otherwise write raw)
if command -v jq &> /dev/null; then
    echo "$MANIFEST_JSON" | jq '.' > "$MANIFEST_FILE"
else
    echo "$MANIFEST_JSON" > "$MANIFEST_FILE"
fi

echo -e "${GREEN}  ✓ Created installation manifest (${#INSTALLED_FILES[@]} files tracked)${NC}"
echo -e "${YELLOW}    This manifest enables safe uninstall - user files will be preserved${NC}"

# ============================================================================
# Search Setup: Detect and configure search tools (fail-open)
# ============================================================================
ISDLC_BIN="$SCRIPT_DIR/bin/isdlc.js"
if command -v node &> /dev/null && [ -f "$ISDLC_BIN" ]; then
    echo -e "${BLUE}[*]${NC} Setting up search capabilities..."
    (cd "$PROJECT_ROOT" && node "$ISDLC_BIN" search-setup --force) 2>/dev/null || echo -e "${YELLOW}  Search setup skipped (non-fatal)${NC}"
else
    echo -e "${YELLOW}  Search setup skipped (Node.js not available). Run 'isdlc search-setup' later.${NC}"
fi

# ============================================================================
# Step 6: Cleanup - Remove isdlc-framework folder
# ============================================================================
echo -e "${BLUE}[6/6]${NC} Cleaning up installation files..."

# Copy uninstall and update scripts before removing the framework folder
if [ -f "$SCRIPT_DIR/uninstall.sh" ]; then
    cp "$SCRIPT_DIR/uninstall.sh" ".isdlc/scripts/"
    chmod +x ".isdlc/scripts/uninstall.sh"
    echo -e "${GREEN}  ✓ Copied uninstall.sh to .isdlc/scripts/${NC}"
fi
if [ -f "$SCRIPT_DIR/update.sh" ]; then
    cp "$SCRIPT_DIR/update.sh" ".isdlc/scripts/"
    chmod +x ".isdlc/scripts/update.sh"
    echo -e "${GREEN}  ✓ Copied update.sh to .isdlc/scripts/${NC}"
fi

# Store the script dir before we delete it
CLEANUP_DIR="$SCRIPT_DIR"

echo -e "${YELLOW}  Removing isdlc-framework/ folder...${NC}"

# We need to be careful here - delete the framework folder
cd "$PROJECT_ROOT"
rm -rf "$CLEANUP_DIR"

echo -e "${GREEN}  ✓ Removed isdlc-framework/${NC}"

# ============================================================================
# Done!
# ============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Installation Complete!                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}Project Structure:${NC}"
echo "  .claude/           - Agent definitions and skills"
echo "  .isdlc/            - Project state and framework resources"
echo "  docs/              - Documentation"
echo ""
echo -e "${CYAN}AI Assistant:${NC}"
echo -e "  Engine:   ${GREEN}Claude Code${NC}$( [ "$CLAUDE_CODE_FOUND" = true ] && echo " ($CLAUDE_CODE_VERSION)" )"
echo ""

# ============================================================================
# Tour: Optional onboarding overview
# ============================================================================

# Skip tour if stdin is not a terminal (non-interactive / piped)
if [ -t 0 ]; then

echo ""
read -p "Show a quick overview of the framework? [Y/n]: " TOUR_CHOICE
TOUR_CHOICE=${TOUR_CHOICE:-Y}

if [[ "$TOUR_CHOICE" =~ ^[Yy] ]]; then
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                   QUICK OVERVIEW                           ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}━━━ What is iSDLC? ━━━${NC}"
    echo ""
    echo "  iSDLC is a framework of 36 AI agents that guide development from"
    echo "  requirements through deployment. Quality gates enforce completion"
    echo "  between phases, and deterministic hooks enforce rules at runtime."
    echo ""
    echo -e "${CYAN}━━━ Core Commands ━━━${NC}"
    echo ""
    echo -e "  ${GREEN}/discover${NC}                — Analyze your project or set up a new one"
    echo -e "  ${GREEN}/isdlc feature \"desc\"${NC}    — Develop a feature end-to-end"
    echo -e "  ${GREEN}/isdlc fix \"desc\"${NC}        — Fix a bug with TDD and tracing agents"
    echo -e "  ${GREEN}/isdlc test generate${NC}     — Create tests for existing code"
    echo -e "  ${GREEN}/isdlc upgrade \"name\"${NC}    — Upgrade a dependency or runtime"
    echo -e "  ${GREEN}/provider${NC}               — Configure LLM model routing"
    echo ""
    echo -e "  For the full interactive guide, run ${GREEN}/tour${NC} in Claude Code."
    echo ""
else
    echo ""
    echo -e "${YELLOW}  Skipped. Run /tour in Claude Code for the interactive guide.${NC}"
    echo ""
fi

fi  # end interactive check

if [ "$PROVIDER_MODE" = "ollama" ]; then
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║               PROVIDER CONFIGURED                          ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  We created ${GREEN}.isdlc/provider.env${NC} with:"
    echo "    ANTHROPIC_BASE_URL=http://localhost:11434"
    echo "    ANTHROPIC_AUTH_TOKEN=ollama"
    echo "    ANTHROPIC_API_KEY=\"\""
    echo -e "  To change these settings, edit ${GREEN}.isdlc/provider.env${NC}"
    echo ""
fi

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    NEXT STEPS                              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

STEP=1
if [ "$CLAUDE_CODE_FOUND" = false ]; then
    echo -e "  ${STEP}. Install Claude Code: ${GREEN}npm install -g @anthropic-ai/claude-code${NC}"
    STEP=$((STEP + 1))
fi

if [ "$PROVIDER_MODE" = "ollama" ]; then
    echo -e "  ${STEP}. Install Ollama (if not already installed):"
    echo -e "     ${GREEN}https://ollama.com/download${NC}"
    STEP=$((STEP + 1))
    echo -e "  ${STEP}. Pull a recommended model: ${GREEN}ollama pull qwen3-coder${NC}"
    STEP=$((STEP + 1))
    echo -e "  ${STEP}. Start the Ollama server: ${GREEN}ollama serve${NC}"
    STEP=$((STEP + 1))
    echo -e "  ${STEP}. Launch Claude Code with Ollama:"
    echo -e "     ${GREEN}source .isdlc/provider.env && claude${NC}"
    STEP=$((STEP + 1))
else
    echo -e "  ${STEP}. Run ${GREEN}claude${NC} to launch Claude Code"
    STEP=$((STEP + 1))
    echo -e "  ${STEP}. Log in with your Anthropic account"
    STEP=$((STEP + 1))
fi

echo -e "  ${STEP}. Run ${GREEN}/discover${NC} to analyze your project and create a constitution"
STEP=$((STEP + 1))
echo -e "  ${STEP}. Run ${GREEN}/isdlc feature${NC} to begin your workflow"
STEP=$((STEP + 1))
echo -e "  ${STEP}. Run ${GREEN}/tour${NC} for the framework introduction"
echo ""
if [ "$IS_EXISTING_PROJECT" = true ]; then
    echo -e "${YELLOW}Note: Your existing project structure was not modified.${NC}"
fi

echo -e "${CYAN}Workflow:${NC} Orchestrator determines phases based on task complexity"
echo ""
