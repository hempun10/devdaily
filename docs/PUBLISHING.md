# Publishing DevDaily AI to NPM

## Step 1: NPM Account Setup

### If you don't have an NPM account:

1. Go to https://www.npmjs.com/signup
2. Create account
3. Verify email

### Login to NPM:

```bash
npm login
# Enter username
# Enter password
# Enter email
# Enter OTP (if 2FA enabled)
```

### Check login:

```bash
npm whoami
# Should show your username
```

---

## Step 2: Check Package Name Availability

```bash
npm view devdaily-ai
# If shows 404, name is available ✅
# If shows package details, name is taken ❌
```

### If name is taken, update package.json:

```json
{
  "name": "@yourusername/devdaily-ai" // Scoped package
}
```

---

## Step 3: Pre-publish Checklist

```bash
cd /Users/hempun/Dohoro/copilot-challanges/devdaily-ai

# 1. Run all checks
npm run typecheck
npm run lint
npm test
npm run build

# 2. Test package locally
npm pack --dry-run

# 3. Check what will be published
# Should see:
# - LICENSE
# - README.md
# - dist/index.js
# - dist/index.d.ts
# - dist/index.js.map
# - package.json
```

---

## Step 4: Publish

### First time publish:

```bash
npm publish --access public
```

### If using scoped package (@username/devdaily-ai):

```bash
npm publish --access public
```

### Expected output:

```
+ devdaily-ai@0.1.0
```

---

## Step 5: Verify Publication

```bash
# Check on NPM
npm view devdaily-ai

# Install globally to test
npm install -g devdaily-ai

# Test it works
devdaily --version  # Should show 0.1.0
devdaily --help

# Test in real repo
cd /path/to/test/repo
devdaily standup
```

---

## Step 6: Test on Real Repos

### Test Repo 1: copilot-challenges (parent repo)

```bash
cd /Users/hempun/Dohoro/copilot-challanges
devdaily standup
devdaily standup --days=7
```

### Test Repo 2: Any other repo

```bash
cd /path/to/your/project
devdaily pr
devdaily week
```

---

## Troubleshooting

### 403 Error - Package name taken

```bash
# Option 1: Use scoped package
# Update package.json name to: "@yourusername/devdaily-ai"

# Option 2: Choose different name
# Update package.json name to: "devdaily-cli" or similar
```

### 401 Error - Not logged in

```bash
npm login
```

### ENEEDAUTH Error

```bash
npm logout
npm login
```

### 2FA Issues

```bash
# Make sure you have OTP ready
npm publish --otp=123456
```

---

## Post-Publish

### Update README badges:

```markdown
[![npm version](https://badge.fury.io/js/devdaily-ai.svg)](https://www.npmjs.com/package/devdaily-ai)
[![npm downloads](https://img.shields.io/npm/dm/devdaily-ai.svg)](https://www.npmjs.com/package/devdaily-ai)
```

### Share the package:

- Twitter
- Dev.to (for hackathon)
- LinkedIn
- Reddit r/javascript

---

## Version Updates

### Patch (0.1.0 → 0.1.1)

```bash
npm version patch
npm publish
```

### Minor (0.1.0 → 0.2.0)

```bash
npm version minor
npm publish
```

### Major (0.1.0 → 1.0.0)

```bash
npm version major
npm publish
```

---

## Quick Reference

```bash
# Login
npm login

# Publish
npm publish --access public

# Install globally
npm install -g devdaily-ai

# Test
devdaily --version
devdaily standup

# Update version
npm version patch
npm publish
```

---

## Next Steps After Publishing

1. ✅ Test installation: `npm install -g devdaily-ai`
2. ✅ Test all commands in real repos
3. ✅ Note any bugs or improvements
4. ✅ Fix and publish patch version
5. ✅ Continue with demo video and docs

---

## Current Package Info

- **Name:** devdaily-ai
- **Version:** 0.1.0
- **Size:** 15.2 KB (gzipped)
- **License:** MIT
- **Node:** >=18.0.0

Ready to publish! 🚀
