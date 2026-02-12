# Quick Commands Reference

## ✅ All Tests Passed Locally!

Run anytime: `./test-locally.sh`

---

## 🚀 Complete CI/CD Workflow Commands

Copy and paste these commands in order:

### 1. Run Local Tests

```bash
cd /Users/hempun/Dohoro/copilot-challanges/devdaily-ai
./test-locally.sh
```

**Expected:** All 12 tests pass ✓

---

### 2. View Current CI Status

```bash
gh run list --workflow=ci.yml --limit 5
```

---

### 3. Verify Everything is Ready

```bash
# Check build
npm run build

# Check tests
npm test

# Check types
npm run typecheck

# Check lint
npm run lint
```

**Expected:** All should pass ✓

---

### 4. Bump Version (when ready to release)

```bash
# For patch version (0.1.1 -> 0.1.2)
npm version patch

# For minor version (0.1.1 -> 0.2.0)
# npm version minor

# For major version (0.1.1 -> 1.0.0)
# npm version major
```

This will:

- Update `package.json` version
- Create a git commit
- Create a git tag

---

### 5. Push Version Bump

```bash
git push
git push --tags
```

---

### 6. Create GitHub Release (triggers NPM publish)

```bash
# Get current version
VERSION=$(node -p "require('./package.json').version")

# Create release
gh release create v$VERSION \
  --title "v$VERSION - Git Integration Improvements" \
  --notes "## 🎉 What's New

### Improvements
- ✅ Fixed git commit fetching using raw commands
- ✅ Improved date filtering with --since and --until
- ✅ Removed unused code
- ✅ Added comprehensive test suite (\`./test-locally.sh\`)
- ✅ Enhanced documentation

### Testing
All 12 automated tests passing!

Run the test suite:
\`\`\`bash
npm install -g devdaily-ai@$VERSION
./test-locally.sh
\`\`\`

### Install
\`\`\`bash
npm install -g devdaily-ai@$VERSION
\`\`\`

### Try it
\`\`\`bash
devdaily standup --days=1
devdaily week
devdaily pr
\`\`\`

## Full Changelog
https://github.com/hempun10/devdaily/compare/v0.1.1...v$VERSION"
```

---

### 7. Watch NPM Publish Workflow

```bash
# Watch the publish workflow
gh run watch

# Or list recent runs
gh run list --workflow=publish.yml --limit 3
```

**Expected:** Workflow completes successfully ✓

---

### 8. Verify NPM Package Published

```bash
# Check version on NPM
npm view devdaily-ai version

# Check full package info
npm view devdaily-ai

# Check dist-tags
npm view devdaily-ai dist-tags
```

**Expected:** Shows new version (e.g., 0.1.2)

---

### 9. Test Production Package

```bash
# Uninstall local link
npm unlink -g

# Install from NPM
npm install -g devdaily-ai

# Verify version
devdaily --version

# Test it
devdaily standup --days=1 --no-copy
```

**Expected:** Works from NPM package ✓

---

### 10. Update Changelog

```bash
# Edit CHANGELOG.md
nano CHANGELOG.md

# Add new version section
# Commit
git add CHANGELOG.md
git commit -m "docs: update changelog for v$VERSION"
git push
```

---

## 🧪 Individual Command Testing

Test each command manually:

```bash
# Help
devdaily --help

# Version
devdaily --version

# Standup - various options
devdaily standup --days=1 --no-copy
devdaily standup --days=7 --no-copy
devdaily standup --format=slack --no-copy
devdaily standup --format=plain --no-copy

# Weekly
devdaily week --no-copy
devdaily week --last --no-copy

# Context (stub)
devdaily context

# PR (requires feature branch)
git checkout -b test/feature
git commit --allow-empty -m "test: test commit"
devdaily pr --no-copy
git checkout main
git branch -D test/feature
```

---

## 📊 CI/CD Debugging

If something fails:

```bash
# View latest CI run
gh run view

# View CI logs
gh run view --log

# Re-run failed jobs
gh run rerun <run-id>

# Cancel a run
gh run cancel <run-id>

# Download artifacts
gh run download <run-id>
```

---

## 🔍 NPM Package Verification

After publishing:

```bash
# Check package contents
npm pack --dry-run

# Download and inspect tarball
npm pack
tar -tzf devdaily-ai-*.tgz
rm devdaily-ai-*.tgz

# Check package size
npm view devdaily-ai dist.tarball
curl -s https://registry.npmjs.org/devdaily-ai | jq '.versions[].dist.unpackedSize'
```

---

## ⚡ Quick One-Liner Commands

```bash
# Full release pipeline
npm version patch && git push && git push --tags && gh release create v$(node -p "require('./package.json').version")

# Test everything
./test-locally.sh && npm test && npm run build

# Reinstall from NPM
npm uninstall -g devdaily-ai && npm install -g devdaily-ai && devdaily --version

# View all NPM versions
npm view devdaily-ai versions --json

# Check if NPM secret is set
gh secret list | grep NPM_TOKEN
```

---

## 🎯 Complete Release Checklist

- [ ] Run `./test-locally.sh` (all pass)
- [ ] Run `npm test` (all pass)
- [ ] Run `npm run build` (success)
- [ ] Run `npm run typecheck` (no errors)
- [ ] Run `npm run lint` (no errors)
- [ ] Update CHANGELOG.md
- [ ] Bump version with `npm version patch`
- [ ] Push commits `git push`
- [ ] Push tags `git push --tags`
- [ ] Create GitHub release
- [ ] Wait for publish workflow to complete
- [ ] Verify on NPM `npm view devdaily-ai version`
- [ ] Test install `npm install -g devdaily-ai@<version>`
- [ ] Test commands `devdaily standup --days=1`
- [ ] Announce on dev.to, Twitter, etc.

---

## 📝 Notes

- **NPM_TOKEN secret**: Make sure it's set in GitHub repo settings
- **Version format**: Use semver (major.minor.patch)
- **Deprecation warning**: GitHub Copilot CLI extension is deprecated (external issue)
- **Node version**: Requires Node >= 18.0.0
- **CI matrix**: Tests on Node 18.x, 20.x, 22.x

---

## 🆘 Troubleshooting

**Issue:** NPM publish fails with "authentication required"
**Fix:** Check NPM_TOKEN secret is set correctly

**Issue:** CI fails on Node 18
**Fix:** Check compatibility of dependencies

**Issue:** Tests fail locally but pass in CI
**Fix:** Check Node version, clean install `rm -rf node_modules && npm install`

**Issue:** Package not found after publish
**Fix:** Wait a few minutes for NPM CDN to propagate

---

## 📚 Resources

- [Package on NPM](https://www.npmjs.com/package/devdaily-ai)
- [GitHub Repository](https://github.com/hempun10/devdaily)
- [CI Workflow](https://github.com/hempun10/devdaily/actions/workflows/ci.yml)
- [Publish Workflow](https://github.com/hempun10/devdaily/actions/workflows/publish.yml)
- [Full Testing Guide](docs/TESTING.md)

---

**Last Updated:** 2026-02-12  
**Current Version:** 0.1.1  
**Next Version:** 0.1.2 (pending)
