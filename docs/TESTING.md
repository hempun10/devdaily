# Testing Guide

This guide explains how to test DevDaily AI locally and verify CI/CD workflows.

## Quick Test

Run the automated test suite:

```bash
./test-locally.sh
```

This will test all commands in the current repository.

## Manual Testing

### Prerequisites

1. **Install locally:**

   ```bash
   npm install
   npm run build
   npm link
   ```

2. **Install GitHub Copilot CLI:**

   ```bash
   gh extension install github/gh-copilot
   gh auth login
   ```

3. **Navigate to a git repository:**
   ```bash
   cd /path/to/your/git/repo
   ```

### Test Commands

#### 1. Standup Command

```bash
# Test with 1 day
devdaily standup --days=1 --no-copy

# Test with 7 days
devdaily standup --days=7 --no-copy

# Test with different formats
devdaily standup --format=slack --no-copy
devdaily standup --format=plain --no-copy
devdaily standup --format=markdown --no-copy

# Test with copy (default)
devdaily standup --days=1
# Check clipboard: pbpaste (macOS) or xclip -o (Linux)
```

#### 2. Weekly Command

```bash
# Current week
devdaily week --no-copy

# Last week
devdaily week --last --no-copy

# With copy (default)
devdaily week
# Check clipboard
```

#### 3. PR Command

**Note:** Must be on a feature branch (not main)

```bash
# Create a test branch
git checkout -b test/devdaily-pr
git commit --allow-empty -m "test: testing PR generation"

# Generate PR description
devdaily pr --no-copy

# Generate and preview
devdaily pr
# Select "Preview in terminal" from menu

# Generate as draft
devdaily pr --draft --no-copy

# Custom base branch
devdaily pr --base=develop --no-copy
```

#### 4. Context Command (Stub)

```bash
devdaily context
# Should show "coming soon" message
```

## Testing CI/CD Workflows

### Test CI Workflow

The CI workflow runs on every push and PR to `main` or `develop`:

```bash
# Create a feature branch
git checkout -b fix/some-feature

# Make changes and commit
git add .
git commit -m "fix: some improvement"

# Push to trigger CI
git push -u origin fix/some-feature

# Check CI status
gh pr create --base main --title "Test CI" --body "Testing CI workflow"
gh pr checks
```

CI will run:

- TypeScript type checking
- ESLint validation
- Prettier format check
- All tests (Vitest)
- Build verification
- Matrix testing (Node 18, 20, 22)

### Test NPM Publish Workflow

The publish workflow runs when you create a GitHub Release:

```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Commit and push
git add package.json package-lock.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
git push

# 3. Create a git tag
git tag v$(node -p "require('./package.json').version")
git push --tags

# 4. Create GitHub Release (triggers publish)
gh release create v$(node -p "require('./package.json').version") \
  --title "v$(node -p "require('./package.json').version")" \
  --notes "Release notes here"

# 5. Verify publish
gh run watch  # Watch the workflow
npm view devdaily-ai version  # Check published version
```

**Important:** Make sure you have `NPM_TOKEN` secret set in GitHub repository settings.

## Edge Cases to Test

### 1. Empty Repository

```bash
# Create empty repo
mkdir test-empty && cd test-empty
git init

# Test commands (should handle gracefully)
devdaily standup --no-copy
```

### 2. Repository with 1 Commit

```bash
git commit --allow-empty -m "Initial commit"
devdaily standup --no-copy
```

### 3. Repository with Merge Commits

```bash
# Create and merge a branch
git checkout -b feature/test
git commit --allow-empty -m "feat: test feature"
git checkout main
git merge feature/test --no-ff

# Test
devdaily standup --days=1 --no-copy
```

### 4. Repository with Conventional Commits

```bash
# Make various commit types
git commit --allow-empty -m "feat: add new feature"
git commit --allow-empty -m "fix: resolve bug"
git commit --allow-empty -m "docs: update readme"
git commit --allow-empty -m "chore: update dependencies"

# Test PR generation (should extract types)
git checkout -b test/conventional
git commit --allow-empty -m "feat: test conventional commits"
devdaily pr --no-copy
```

### 5. Non-Git Directory

```bash
cd /tmp
devdaily standup --no-copy
# Should show error: "Not in a git repository"
```

## Performance Testing

Test with large repositories:

```bash
# Clone a large repo
git clone https://github.com/facebook/react.git
cd react

# Test standup (should handle thousands of commits)
time devdaily standup --days=30 --no-copy

# Test weekly summary
time devdaily week --no-copy
```

## Error Scenarios

### 1. Copilot CLI Not Installed

```bash
# Uninstall temporarily
gh extension remove copilot

# Test (should show clear error message)
devdaily standup --no-copy

# Reinstall
gh extension install github/gh-copilot
```

### 2. GitHub CLI Not Installed

```bash
# Rename gh temporarily
sudo mv /usr/local/bin/gh /usr/local/bin/gh.bak

# Test (should show error)
devdaily standup --no-copy

# Restore
sudo mv /usr/local/bin/gh.bak /usr/local/bin/gh
```

### 3. Invalid Options

```bash
# Invalid days
devdaily standup --days=0 --no-copy
devdaily standup --days=-1 --no-copy

# Invalid format
devdaily standup --format=invalid --no-copy

# Invalid base branch
devdaily pr --base=nonexistent --no-copy
```

## Regression Testing

After making changes, always test:

```bash
# 1. Type checking
npm run typecheck

# 2. Linting
npm run lint

# 3. Tests
npm test

# 4. Build
npm run build

# 5. Local testing
./test-locally.sh

# 6. Manual smoke test
devdaily --help
devdaily standup --days=1 --no-copy
devdaily week --no-copy
```

## CI/CD Debugging

### View CI Logs

```bash
# List recent workflow runs
gh run list --workflow=ci.yml --limit 5

# View logs for latest run
gh run view --log

# Download artifacts
gh run download <run-id>
```

### Test Locally with Act

Install [act](https://github.com/nektos/act) to run GitHub Actions locally:

```bash
# Install act
brew install act  # macOS

# Run CI workflow locally
act -j test
```

## Coverage Report

Generate test coverage:

```bash
npm run test:coverage

# View coverage report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
```

## Troubleshooting

### Tests Failing

1. **Check Node version:**

   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **Clean install:**

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Rebuild:**

   ```bash
   npm run build
   ```

4. **Relink:**
   ```bash
   npm unlink -g
   npm link
   ```

### CI Failing

1. **Check workflow file syntax:**

   ```bash
   yamllint .github/workflows/ci.yml
   ```

2. **Test locally with act:**

   ```bash
   act -j test --verbose
   ```

3. **Check secrets:**
   ```bash
   gh secret list
   ```

## Automated Testing in CI

The CI workflow automatically runs on:

- Push to `main` or `develop`
- Pull requests to `main` or `develop`

It runs:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`

All on Node 18.x, 20.x, and 22.x.
