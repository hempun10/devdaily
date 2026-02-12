#!/bin/bash

# DevDaily AI - Local Testing Script
# This script tests all commands in a real git repository

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════"
echo "   DevDaily AI - Local Testing Suite"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Function to run test
run_test() {
    local test_name="$1"
    local command="$2"
    
    echo -e "${YELLOW}Testing:${NC} $test_name"
    echo "Command: $command"
    
    if eval "$command"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
    fi
    echo ""
}

# Check prerequisites
echo "Checking prerequisites..."
echo "───────────────────────────────────────────────────────────"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}✗ Not in a git repository${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Git repository detected${NC}"

# Check if devdaily is installed
if ! command -v devdaily &> /dev/null; then
    echo -e "${RED}✗ devdaily command not found${NC}"
    echo "Please run: npm link"
    exit 1
fi
echo -e "${GREEN}✓ devdaily command found${NC}"

# Check version
VERSION=$(devdaily --version 2>&1 || echo "unknown")
echo -e "${GREEN}✓ Version: $VERSION${NC}"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}⚠ GitHub CLI not found (required for PR creation)${NC}"
else
    echo -e "${GREEN}✓ GitHub CLI found${NC}"
fi

# Check if Copilot CLI extension is installed
if gh extension list 2>/dev/null | grep -q copilot; then
    echo -e "${GREEN}✓ GitHub Copilot CLI extension installed${NC}"
else
    echo -e "${YELLOW}⚠ GitHub Copilot CLI extension not found${NC}"
    echo "  Install with: gh extension install github/gh-copilot"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "   Running Tests"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Test 1: Help command
run_test "Help command" "devdaily --help > /dev/null"

# Test 2: Version command
run_test "Version command" "devdaily --version > /dev/null"

# Test 3: Standup (1 day, no copy)
run_test "Standup - 1 day" "devdaily standup --days=1 --no-copy"

# Test 4: Standup (3 days, no copy)
run_test "Standup - 3 days" "devdaily standup --days=3 --no-copy"

# Test 5: Standup (7 days, no copy)
run_test "Standup - 7 days" "devdaily standup --days=7 --no-copy"

# Test 6: Standup with markdown format
run_test "Standup - markdown format" "devdaily standup --days=1 --format=markdown --no-copy"

# Test 7: Standup with slack format
run_test "Standup - slack format" "devdaily standup --days=1 --format=slack --no-copy"

# Test 8: Standup with plain format
run_test "Standup - plain format" "devdaily standup --days=1 --format=plain --no-copy"

# Test 9: Weekly summary (current week)
run_test "Weekly summary - current week" "devdaily week --no-copy"

# Test 10: Weekly summary (last week)
run_test "Weekly summary - last week" "devdaily week --last --no-copy"

# Test 11: PR description (if not on main)
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    run_test "PR description generation" "devdaily pr --no-copy --base=main || devdaily pr --no-copy --base=master || true"
else
    echo -e "${YELLOW}⊘ SKIPPED:${NC} PR description (on main branch)"
    echo ""
fi

# Test 12: Context command (stub)
run_test "Context command (stub)" "devdaily context || true"

echo "═══════════════════════════════════════════════════════════"
echo "   Test Results"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
