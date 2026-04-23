#!/bin/bash

# AI Knowledge Base Initializer (Optimized)
# Features: retry mechanism, parallel cloning, progress tracking, network error detection

set -e

# ============================================
# Configuration
# ============================================

# Default knowledge base directory
KB_DIR="${GITHUB_KB_DIR:-$HOME/github}"

# Clone settings
MAX_PARALLEL=3           # Maximum parallel clones
MAX_ATTEMPTS=3           # Retry attempts per repo
CLONE_TIMEOUT=300        # Timeout per clone (seconds)
RETRY_DELAY=5            # Delay between retries (seconds)

# Git clone options
GIT_DEPTH="--depth 1"    # Shallow clone (latest commit only)
GIT_SINGLE_BRANCH="--single-branch"  # Clone single branch

# ============================================
# Colors and UI
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Spinner characters
SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# ============================================
# Global Variables
# ============================================

declare -A REPO_STATUS  # Track status: pending, cloning, success, failed
declare -a FAILED_REPOS  # List of failed repos
declare -a SUCCESS_REPOS # List of successful repos
START_TIME=$(date +%s)
PARALLEL_COUNT=0        # Current parallel operations

# ============================================
# Repository List
# ============================================

declare -A REPOS=(
    ["AI & Assistants/clawdbot"]="clawdbot/clawdbot"
    ["AI & Assistants/open-interpreter"]="OpenInterpreter/open-interpreter"
    ["AI Coding Agents/oh-my-opencode"]="code-yeongyu/oh-my-opencode"
    ["LLM Frameworks/langchain"]="langchain-ai/langchain"
    ["LLM Frameworks/transformers"]="huggingface/transformers"
    ["Development Tools/llama.cpp"]="ggerganov/llama.cpp"
)

# ============================================
# Utility Functions
# ============================================

# Print section header
print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

# Print info message
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Print success message
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Print error message
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Show spinner
show_spinner() {
    local pid=$1
    local message=$2
    local delay=0.1

    while kill -0 $pid 2>/dev/null; do
        for i in "${SPINNER[@]}"; do
            echo -ne "\r${CYAN}$i${NC} $message   "
            sleep $delay
        done
    done
    echo -ne "\r$(printf ' %.0s' {1..100})\r"  # Clear line
}

# Format duration
format_duration() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local secs=$((seconds % 60))
    printf "%dm %ds" $minutes $secs
}

# Check network connectivity
check_network() {
    print_info "Checking network connectivity to GitHub..."

    if ping -c 1 -W 2 github.com >/dev/null 2>&1; then
        print_success "GitHub is reachable"
        return 0
    else
        print_error "Cannot reach GitHub. Please check your network connection."
        return 1
    fi
}

# Check if git is installed
check_git() {
    if ! command -v git >/dev/null 2>&1; then
        print_error "git is not installed. Please install git first."
        return 1
    fi
    print_success "git is available: $(git --version | head -1)"
    return 0
}

# ============================================
# Clone Functions
# ============================================

# Clone with retry mechanism
clone_with_retry() {
    local repo=$1
    local repo_name=$(basename "$repo")
    local attempt=1
    local success=0

    while [ $attempt -le $MAX_ATTEMPTS ]; do
        REPO_STATUS[$repo_name]="cloning"

        if [ $attempt -gt 1 ]; then
            print_warning "Retrying $repo_name (attempt $attempt/$MAX_ATTEMPTS)..."
        fi

        # Perform clone with timeout
        if timeout $CLONE_TIMEOUT git clone $GIT_DEPTH $GIT_SINGLE_BRANCH \
            --quiet "https://github.com/$repo" "$repo_name" 2>/dev/null; then

            REPO_STATUS[$repo_name]="success"
            SUCCESS_REPOS+=("$repo")
            success=1

            # Get repo size
            local size=$(du -sh "$repo_name" 2>/dev/null | cut -f1)
            print_success "$repo_name cloned successfully ($size)"
            break
        else
            local exit_code=$?

            # Analyze error type
            if [ $exit_code -eq 124 ]; then
                print_error "$repo_name: Clone timeout (${CLONE_TIMEOUT}s)"
            elif [ $exit_code -eq 128 ]; then
                print_error "$repo_name: Repository not found or access denied"
                # Don't retry if repo doesn't exist
                break
            else
                print_error "$repo_name: Network error or connection interrupted"
            fi

            # Clean up failed clone
            rm -rf "$repo_name" 2>/dev/null

            if [ $attempt -lt $MAX_ATTEMPTS ]; then
                print_info "Waiting ${RETRY_DELAY}s before retry..."
                sleep $RETRY_DELAY
            fi
        fi

        ((attempt++))
    done

    if [ $success -eq 0 ]; then
        REPO_STATUS[$repo_name]="failed"
        FAILED_REPOS+=("$repo")
    fi

    return $success
}

# Clone repositories with parallel control
clone_repos() {
    local total=${#REPOS[@]}
    local completed=0

    print_header "Cloning Repositories ($total total, max $MAX_PARALLEL parallel)"

    for category_path in "${!REPOS[@]}"; do
        repo="${REPOS[$category_path]}"
        repo_name=$(basename "$repo")

        # Check if already exists
        if [ -d "$KB_DIR/$repo_name/.git" ]; then
            local size=$(du -sh "$repo_name" 2>/dev/null | cut -f1)
            print_warning "$repo_name already exists ($size) - skipping"
            ((completed++))
            continue
        fi

        # Wait if max parallel reached
        while [ $PARALLEL_COUNT -ge $MAX_PARALLEL ]; do
            sleep 1
        done

        # Start clone in background
        {
            clone_with_retry "$repo"
        } &

        ((PARALLEL_COUNT++))

        # Small delay to avoid overwhelming network
        sleep 0.5
    done

    # Wait for all background jobs to complete
    wait
}

# ============================================
# Summary Functions
# ============================================

# Print final summary
print_summary() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))

    print_header "Initialization Summary"

    echo -e "${BOLD}Duration:${NC} $(format_duration $duration)"
    echo ""

    # Success stats
    if [ ${#SUCCESS_REPOS[@]} -gt 0 ]; then
        echo -e "${GREEN}${BOLD}Successfully cloned (${#SUCCESS_REPOS[@]}):${NC}"
        for repo in "${SUCCESS_REPOS[@]}"; do
            local repo_name=$(basename "$repo")
            local size=$(du -sh "$repo_name" 2>/dev/null | cut -f1)
            echo -e "  ${GREEN}✓${NC} ${CYAN}$repo_name${NC} ($size)"
        done
        echo ""
    fi

    # Failure stats
    if [ ${#FAILED_REPOS[@]} -gt 0 ]; then
        echo -e "${RED}${BOLD}Failed to clone (${#FAILED_REPOS[@]}):${NC}"
        for repo in "${FAILED_REPOS[@]}"; do
            local repo_name=$(basename "$repo")
            echo -e "  ${RED}✗${NC} ${CYAN}$repo_name${NC} - $repo"
        done
        echo ""
        print_info "You can try cloning these repositories manually later:"
        for repo in "${FAILED_REPOS[@]}"; do
            echo "  cd $KB_DIR"
            echo "  git clone $GIT_DEPTH $GIT_SINGLE_BRANCH https://github.com/$repo"
        done
        echo ""
    fi

    # Total size
    local total_size=$(du -sh . 2>/dev/null | cut -f1)
    echo -e "${BOLD}Total size:${NC} $total_size"
    echo ""

    # Next steps
    print_header "Next Steps"
    echo "1. Review the cloned repositories in: ${BOLD}$KB_DIR${NC}"
    echo "2. Update CLAUDE.md to reflect your knowledge base"
    echo "3. Start asking Claude questions about AI tools!"
    echo ""
    echo -e "${CYAN}Example questions:${NC}"
    echo "  - 'Analyze the architecture of clawdbot and open-interpreter'"
    echo "  - 'I want to build an AI code reviewer, what do you recommend?'"
    echo "  - 'Compare langchain and direct API usage for my use case'"
    echo ""
}

# ============================================
# Main Execution
# ============================================

main() {
    print_header "AI Knowledge Base Initializer"
    echo -e "${BOLD}Knowledge Base Directory:${NC} $KB_DIR"
    echo ""

    # Pre-flight checks
    check_git || exit 1
    check_network || exit 1

    # Create directory if needed
    if [ ! -d "$KB_DIR" ]; then
        print_info "Creating knowledge base directory..."
        mkdir -p "$KB_DIR"
    fi

    # Change to knowledge base directory
    cd "$KB_DIR" || exit 1

    echo ""

    # Clone repositories
    clone_repos

    # Print summary
    print_summary

    # Exit with appropriate code
    if [ ${#FAILED_REPOS[@]} -gt 0 ]; then
        exit 1
    else
        print_success "All repositories cloned successfully!"
        exit 0
    fi
}

# Run main function
main "$@"
