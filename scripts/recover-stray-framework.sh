#!/bin/bash
# isdlc-recover-stray-framework.sh
#
# Cleans up stray iSDLC framework files that leaked into a project
# directory from a botched install. SAFE: content-aware — only removes
# files that are bit-for-bit identical to the framework's shipped version.
# Files with the same name but different content (your own LICENSE with
# a different year, your own README.md, your own bin/build.js, your own
# src/*) are LEFT ALONE.
#
# Three-bucket classification to protect against false positives:
#
#   1. COLLISIONS  — framework name, different content → always KEPT
#   2. IDENTITY    — common-across-projects files (LICENSE, README.md,
#                    .gitignore, .editorconfig, etc.) that match by
#                    content → REVIEW bucket, not removed automatically
#                    even on --apply; user must pass --remove-identity
#   3. STRAY       — framework-unique names that match by content →
#                    removed on --apply
#
# The full stray + identity lists are always written to a sidecar file
# in the project root so users can review all entries (even 1000+).
#
# Usage:
#   cd /path/to/your/project
#   /path/to/recover-stray-framework.sh                    # dry-run
#   /path/to/recover-stray-framework.sh --apply            # remove STRAY only
#   /path/to/recover-stray-framework.sh --apply --remove-identity
#       also remove IDENTITY files (LICENSE/README.md/etc that match upstream)

set -e

PROJECT_DIR="$(pwd)"
SCRIPT_PATH_RESOLVED="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
MODE="dry-run"
REMOVE_IDENTITY=false
FORCE=false
REMOVE_SELF=false
FRAMEWORK_REPO="https://dev.enactor.co.uk/gitea/DevOpsInfra/isdlc-framework.git"

for arg in "$@"; do
    case "$arg" in
        --apply)
            MODE="apply"
            ;;
        --remove-identity)
            REMOVE_IDENTITY=true
            ;;
        --force)
            FORCE=true
            ;;
        --remove-self)
            REMOVE_SELF=true
            ;;
        -h|--help)
            cat <<'HELP'
Usage: recover-stray-framework.sh [FLAGS]

FLAGS:
  (none)              dry-run — classify files, write sidecar lists, show plan
  --apply             remove STRAY files (framework-unique name + identical content)
  --remove-identity   ALSO remove IDENTITY files (LICENSE, README.md, .gitignore,
                      etc. whose content matches framework byte-for-byte — these
                      might be your own boilerplate, review before using)
  --force             ALSO remove COLLISIONS (same framework path but different
                      content — normally kept for safety). USE WHEN you are sure
                      the files under framework paths in your project are all
                      residue from a botched framework extraction (e.g. older
                      install.sh that differs from current upstream because the
                      framework has since been updated).
  --remove-self       remove the recovery script itself from the project dir at
                      the end of a successful --apply run. Skip if running from
                      .isdlc/scripts/ (the installed copy, which you want to
                      keep for future use).
  -h, --help          show this message

EXAMPLES:
  # Dry run — safe, writes sidecar files, shows plan:
  ./recover-stray-framework.sh

  # Conservative cleanup — remove only definite strays:
  ./recover-stray-framework.sh --apply

  # Full cleanup when you know the directory has only framework residue
  # plus your own project files outside the framework path list:
  ./recover-stray-framework.sh --apply --remove-identity --force --remove-self
HELP
            exit 0
            ;;
        *)
            echo "Unknown arg: $arg" >&2
            echo "See: $0 --help" >&2
            exit 2
            ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}iSDLC stray-framework recovery${NC}"
echo "Project:         $PROJECT_DIR"
echo "Mode:            $MODE"
echo "Identity files:  $( [ "$REMOVE_IDENTITY" = true ] && echo 'will remove' || echo 'KEPT (use --remove-identity to change)')"
echo "Collisions:      $( [ "$FORCE" = true ] && echo 'will remove (--force)' || echo 'KEPT (use --force to remove)')"
echo "Self-removal:    $( [ "$REMOVE_SELF" = true ] && echo 'will remove script after --apply' || echo 'keep (use --remove-self to change)')"
echo ""

# Undo accidental `git init` if .git exists but was just created empty.
if [ -d .git ]; then
    if git rev-parse --verify HEAD >/dev/null 2>&1; then
        echo -e "${YELLOW}Warning: existing .git has real commits. Leaving it alone.${NC}"
        echo "If this .git was from a botched 'git init && git pull isdlc-framework',"
        echo "manually run 'rm -rf .git' after confirming."
        echo ""
    else
        echo -e "${YELLOW}.git has no commits — assuming botched git-init.${NC}"
        if [ "$MODE" = "apply" ]; then
            rm -rf .git
            echo -e "${GREEN}  ✓ Removed empty .git${NC}"
        else
            echo "  (dry-run: would remove .git)"
        fi
        echo ""
    fi
fi

# Fetch the framework to a temp dir so we can compare files.
TMPFW="$(mktemp -d -t isdlc-recover.XXXXXX)"
trap 'rm -rf "$TMPFW"' EXIT

echo "Cloning framework to temp location for comparison..."
if ! git clone --quiet --depth 1 "$FRAMEWORK_REPO" "$TMPFW/framework" 2>&1; then
    echo -e "${RED}Error: failed to clone $FRAMEWORK_REPO${NC}" >&2
    exit 1
fi
echo -e "${GREEN}  ✓ Cloned${NC}"
echo ""

# Walk the framework file list and classify each path that exists locally.
cd "$TMPFW/framework"
FW_FILES="$(git ls-files)"
cd "$PROJECT_DIR"

# Identity files: commonly shared across projects (MIT license, default
# gitignore, generated README templates, etc). If the user's copy matches
# the framework byte-for-byte it MIGHT be the user's own boilerplate or the
# framework's leaked copy. Default: keep, report for review.
#
# Heuristic: basename matches one of these sentinels. (Extend the list if
# you hit more false-positive patterns.)
is_identity_file() {
    case "$(basename "$1")" in
        LICENSE|LICENSE.md|LICENSE.txt|COPYING|COPYING.md|\
        README|README.md|README.txt|README.rst|\
        .gitignore|.gitattributes|.editorconfig|\
        CHANGELOG.md|CONTRIBUTING.md|CODE_OF_CONDUCT.md|\
        .npmignore|.prettierrc|.prettierrc.json|\
        .eslintrc|.eslintrc.json|.eslintrc.js)
            return 0
            ;;
    esac
    return 1
}

STRAY_LIST_FILE="$PROJECT_DIR/.isdlc-stray-files.txt"
IDENT_LIST_FILE="$PROJECT_DIR/.isdlc-identity-files.txt"
COLLISION_LIST_FILE="$PROJECT_DIR/.isdlc-collisions.txt"
: > "$STRAY_LIST_FILE"
: > "$IDENT_LIST_FILE"
: > "$COLLISION_LIST_FILE"

STRAY_COUNT=0
IDENT_COUNT=0
COLLISION_COUNT=0
STRAY_SYMLINK_COUNT=0
STRAY_DIR_COUNT=0

# Classify each path the framework ships. The tests must be in this order:
#   1. [ -L "$f" ] — symlink: test FIRST because [ -f ] follows symlinks and
#      would mask them. User has a symlink at a framework path → treat as
#      framework artifact unconditionally (no content comparison possible
#      in the general case, and symlinks to framework paths are unambiguous).
#   2. [ -d "$f" ] — directory: user has a directory at a path the framework
#      tracks as a (symlink) entry. Happens when the user extracted the
#      framework archive via a method that dereferenced symlinks. Enumerate
#      all files under the directory and treat each as a stray without
#      content comparison — the directory shouldn't exist at this path.
#   3. [ -f "$f" ] — regular file: the standard content-compare path.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ -L "$f" ]; then
        # Symlink at a framework path → unambiguous framework artifact.
        printf '%s\n' "$f" >> "$STRAY_LIST_FILE"
        STRAY_COUNT=$((STRAY_COUNT + 1))
        STRAY_SYMLINK_COUNT=$((STRAY_SYMLINK_COUNT + 1))
    elif [ -d "$f" ]; then
        # Directory at a path the framework tracks as a single entry (symlink).
        # Enumerate all files inside and flag them all as strays.
        while IFS= read -r inner; do
            [ -z "$inner" ] && continue
            rel="${inner#./}"
            printf '%s\n' "$rel" >> "$STRAY_LIST_FILE"
            STRAY_COUNT=$((STRAY_COUNT + 1))
            STRAY_DIR_COUNT=$((STRAY_DIR_COUNT + 1))
        done < <(find "$f" -type f 2>/dev/null)
        # Remember the dir itself so we can rm -rf it during apply.
        printf '%s\n' "$f" >> "$STRAY_LIST_FILE.dirs"
    elif [ -f "$f" ]; then
        if cmp -s "$f" "$TMPFW/framework/$f" 2>/dev/null; then
            if is_identity_file "$f"; then
                printf '%s\n' "$f" >> "$IDENT_LIST_FILE"
                IDENT_COUNT=$((IDENT_COUNT + 1))
            else
                printf '%s\n' "$f" >> "$STRAY_LIST_FILE"
                STRAY_COUNT=$((STRAY_COUNT + 1))
            fi
        else
            printf '%s\n' "$f" >> "$COLLISION_LIST_FILE"
            COLLISION_COUNT=$((COLLISION_COUNT + 1))
        fi
    fi
done <<< "$FW_FILES"

# The stray list may contain duplicates when a user-extracted directory at a
# symlink-aliased path AND a file at a canonical path both point to the same
# underlying content. De-dupe while preserving order.
if [ -f "$STRAY_LIST_FILE" ] && [ -s "$STRAY_LIST_FILE" ]; then
    awk '!seen[$0]++' "$STRAY_LIST_FILE" > "$STRAY_LIST_FILE.tmp" && \
        mv "$STRAY_LIST_FILE.tmp" "$STRAY_LIST_FILE"
    STRAY_COUNT=$(wc -l < "$STRAY_LIST_FILE" | tr -d ' ')
fi

echo -e "${CYAN}Scan complete:${NC}"
echo "  Stray framework-unique files (identical to upstream):    $STRAY_COUNT"
echo "  Identity files (LICENSE/README.md/etc., review-required): $IDENT_COUNT"
echo "  Name collisions (different content, KEPT):               $COLLISION_COUNT"
echo ""
echo -e "${CYAN}Full lists written to:${NC}"
echo "  $STRAY_LIST_FILE"
echo "  $IDENT_LIST_FILE"
echo "  $COLLISION_LIST_FILE"
echo ""
echo "Review with:"
echo "  less '$STRAY_LIST_FILE'"
echo "  less '$IDENT_LIST_FILE'"
echo "  less '$COLLISION_LIST_FILE'"
echo ""

# Show collisions inline (usually a small set — always KEPT).
if [ $COLLISION_COUNT -gt 0 ]; then
    echo -e "${YELLOW}COLLISIONS (different content, always KEPT):${NC}"
    sed 's/^/  /' "$COLLISION_LIST_FILE"
    echo ""
fi

# Show identity files inline (usually small — flagged for review).
if [ $IDENT_COUNT -gt 0 ]; then
    echo -e "${YELLOW}IDENTITY FILES (common-across-projects, match framework byte-for-byte):${NC}"
    sed 's/^/  /' "$IDENT_LIST_FILE"
    echo ""
    echo -e "${YELLOW}These might be YOUR OWN boilerplate (MIT LICENSE, generated README,${NC}"
    echo -e "${YELLOW}standard .gitignore) that happens to match the framework byte-for-byte.${NC}"
    echo -e "${YELLOW}They are NOT removed by default, even on --apply. Review each one:${NC}"
    echo "  cat $IDENT_LIST_FILE | xargs -I{} sh -c 'echo ===== {} =====; head -5 {}'"
    echo ""
    echo "If you've reviewed and they ARE the framework's (not yours), re-run with:"
    echo "  $0 --apply --remove-identity"
    echo ""
fi

# Show a sample of strays inline — user can see the full list in the
# sidecar file. For small sets (<=100) print all inline; otherwise first
# 20 + last 10 so the user can sanity-check head and tail.
if [ $STRAY_COUNT -gt 0 ]; then
    echo -e "${CYAN}STRAY FILES (framework-unique, will be removed on --apply):${NC}"
    if [ $STRAY_COUNT -le 100 ]; then
        sed 's/^/  /' "$STRAY_LIST_FILE"
    else
        head -20 "$STRAY_LIST_FILE" | sed 's/^/  /'
        echo "  ... [$((STRAY_COUNT - 30)) more omitted — see $STRAY_LIST_FILE for full list]"
        tail -10 "$STRAY_LIST_FILE" | sed 's/^/  /'
    fi
    echo ""
fi

if [ $STRAY_COUNT -eq 0 ] && [ $IDENT_COUNT -eq 0 ]; then
    echo -e "${GREEN}Nothing to clean up.${NC}"
    echo ""
    echo "Next step: install the framework the proper way:"
    echo "  git clone $FRAMEWORK_REPO isdlc-framework"
    echo "  ./isdlc-framework/install.sh"
    exit 0
fi

if [ "$MODE" != "apply" ]; then
    echo -e "${YELLOW}DRY RUN — no changes made.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1) Review the sidecar files above (especially $IDENT_LIST_FILE)"
    echo "  2) Re-run with --apply to remove the $STRAY_COUNT stray files:"
    echo "       $0 --apply"
    if [ $IDENT_COUNT -gt 0 ]; then
        echo "  3) If the $IDENT_COUNT identity files are framework-owned, add --remove-identity:"
        echo "       $0 --apply --remove-identity"
    fi
    exit 0
fi

# ---- APPLY MODE ----

if [ $STRAY_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Removing $STRAY_COUNT stray files...${NC}"
    REMOVED=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        if [ -L "$f" ]; then
            rm -f "$f"
            REMOVED=$((REMOVED + 1))
        elif [ -f "$f" ]; then
            rm -f "$f"
            REMOVED=$((REMOVED + 1))
        fi
    done < "$STRAY_LIST_FILE"
    echo -e "${GREEN}  ✓ Removed $REMOVED stray files${NC}"

    # Also rm -rf any directories that stood at a framework symlink path.
    # These were enumerated and their contents added to the stray list; the
    # directory itself needs an rm -rf to clear any stragglers (hidden files,
    # .DS_Store, etc.) that weren't tracked by git ls-files.
    if [ -f "$STRAY_LIST_FILE.dirs" ]; then
        DIR_REMOVED=0
        while IFS= read -r d; do
            [ -z "$d" ] && continue
            if [ -d "$d" ]; then
                rm -rf "$d"
                DIR_REMOVED=$((DIR_REMOVED + 1))
            fi
        done < "$STRAY_LIST_FILE.dirs"
        if [ $DIR_REMOVED -gt 0 ]; then
            echo -e "${GREEN}  ✓ Removed $DIR_REMOVED framework dirs (symlink-aliased)${NC}"
        fi
        rm -f "$STRAY_LIST_FILE.dirs"
    fi
fi

if [ $IDENT_COUNT -gt 0 ] && [ "$REMOVE_IDENTITY" = true ]; then
    echo -e "${YELLOW}Removing $IDENT_COUNT identity files (--remove-identity)...${NC}"
    IREMOVED=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        if [ -f "$f" ]; then
            rm -f "$f"
            IREMOVED=$((IREMOVED + 1))
        fi
    done < "$IDENT_LIST_FILE"
    echo -e "${GREEN}  ✓ Removed $IREMOVED identity files${NC}"
elif [ $IDENT_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Kept $IDENT_COUNT identity files (use --remove-identity to remove).${NC}"
fi

if [ $COLLISION_COUNT -gt 0 ] && [ "$FORCE" = true ]; then
    echo -e "${YELLOW}Removing $COLLISION_COUNT collision files (--force)...${NC}"
    echo -e "${YELLOW}  Note: these had different content from current upstream but share${NC}"
    echo -e "${YELLOW}  framework paths. Usually old framework files from a prior version.${NC}"
    CREMOVED=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        if [ -f "$f" ]; then
            rm -f "$f"
            CREMOVED=$((CREMOVED + 1))
        fi
    done < "$COLLISION_LIST_FILE"
    echo -e "${GREEN}  ✓ Removed $CREMOVED collision files${NC}"
elif [ $COLLISION_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Kept $COLLISION_COUNT collision files (use --force to remove).${NC}"
fi

# ---- Empty-directory + residue pruning ----
# After removing files, any framework-unique top-level directory that is now
# empty (or only contains empty subdirs, .DS_Store, etc.) gets pruned. We ONLY
# touch a known allow-list of framework-shipped paths so we never clobber
# user directories with the same name by accident.
#
# --force escalates this: under --force we `rm -rf` framework-UNIQUE paths
# (.antigravity/, research-docs/, .validations/) outright, since the user
# has explicitly told us the directory is framework residue. For paths that
# CAN exist in user projects (bin/, docs/, src/, lib/, tests/) we stick to
# the conservative find-delete-empty approach even under --force.
echo ""
echo -e "${YELLOW}Pruning empty framework subtrees...${NC}"
PRUNED_DIRS=""

# Sub-helper: remove any .DS_Store files inside a given tree before checking
# if the tree is empty. These files are macOS Finder metadata and are not
# tracked by git ls-files, so they wouldn't be in our stray list but they
# do prevent `rmdir` from succeeding.
strip_ds_store() {
    find "$1" -name ".DS_Store" -type f -delete 2>/dev/null || true
}

# Framework-unique top-level paths — safe to nuke under --force
FW_UNIQUE_PATHS=".antigravity .validations research-docs"
# Ambiguous paths — always use conservative empty-prune
FW_AMBIGUOUS_PATHS="docs/articles docs/designs docs/diagrams docs/quality docs/isdlc \
         src/claude src/core src/isdlc src/providers \
         .github packages coverage \
         bin lib src tests docs"

for d in $FW_UNIQUE_PATHS; do
    if [ -d "$d" ] || [ -L "$d" ]; then
        if [ "$FORCE" = true ]; then
            rm -rf "$d"
            PRUNED_DIRS="${PRUNED_DIRS}${d} "
        else
            strip_ds_store "$d"
            find "$d" -type d -empty -delete 2>/dev/null || true
            if [ -d "$d" ] && [ -z "$(ls -A "$d" 2>/dev/null)" ]; then
                rmdir "$d" 2>/dev/null && PRUNED_DIRS="${PRUNED_DIRS}${d} " || true
            fi
        fi
    fi
done

for d in $FW_AMBIGUOUS_PATHS; do
    if [ -d "$d" ]; then
        strip_ds_store "$d"
        find "$d" -type d -empty -delete 2>/dev/null || true
        if [ -d "$d" ] && [ -z "$(ls -A "$d" 2>/dev/null)" ]; then
            rmdir "$d" 2>/dev/null && PRUNED_DIRS="${PRUNED_DIRS}${d} " || true
        fi
    fi
done

if [ -n "$PRUNED_DIRS" ]; then
    echo -e "${GREEN}  ✓ Pruned: $PRUNED_DIRS${NC}"
else
    echo "  (no empty framework subtrees to prune)"
fi

# ---- Self-removal (optional) ----
if [ "$REMOVE_SELF" = true ]; then
    # Only remove ourselves if we're NOT running from .isdlc/scripts/ (the
    # installed copy). Removing the installed copy would be user-hostile.
    case "$SCRIPT_PATH_RESOLVED" in
        */.isdlc/scripts/*)
            echo -e "${YELLOW}  --remove-self ignored: script is inside .isdlc/scripts/ (installed copy)${NC}"
            ;;
        *)
            if [ -f "$SCRIPT_PATH_RESOLVED" ]; then
                rm -f "$SCRIPT_PATH_RESOLVED"
                echo -e "${GREEN}  ✓ Removed self: $SCRIPT_PATH_RESOLVED${NC}"
            fi
            ;;
    esac
fi

echo ""
echo -e "${GREEN}Cleanup complete.${NC}"
echo ""
echo "Sidecar lists are left in place for your reference:"
echo "  $STRAY_LIST_FILE"
echo "  $IDENT_LIST_FILE"
echo "  $COLLISION_LIST_FILE"
echo ""
echo "You can remove them with:"
echo "  rm -f '$STRAY_LIST_FILE' '$IDENT_LIST_FILE' '$COLLISION_LIST_FILE'"
echo ""
echo "Next step: install the framework the proper way:"
echo "  git clone $FRAMEWORK_REPO isdlc-framework"
echo "  ./isdlc-framework/install.sh"
