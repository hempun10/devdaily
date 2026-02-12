# DevDaily AI - Quick Reference

## 🚀 Commands Reference

### Setup

```bash
cd devdaily-ai
npm install
npm link
```

### Development

```bash
npm run dev          # Watch mode
npm run build        # Build production
npm run typecheck    # Check TypeScript
npm run lint         # Check linting
npm run lint:fix     # Fix lint issues
npm run format       # Format code
npm run test         # Run tests
npm run test:watch   # Test watch mode
```

### Usage (After npm link)

```bash
# Standup
devdaily standup              # Yesterday's work
devdaily standup --days=3     # Last 3 days
devdaily standup --no-copy    # Don't copy to clipboard

# PR
devdaily pr                   # Generate + interactive menu
devdaily pr --create          # Create immediately
devdaily pr --draft           # Create as draft
devdaily pr --base=develop    # Custom base branch

# Weekly
devdaily week                 # Current week
devdaily week --last          # Last week
```

## 📁 Project Structure

```
devdaily-ai/
├── src/
│   ├── commands/          # CLI commands
│   │   ├── standup.ts     # Standup generator
│   │   ├── pr.ts          # PR with preview/draft
│   │   ├── week.ts        # Weekly summary
│   │   └── context.ts     # Context recovery (stub)
│   ├── core/
│   │   ├── git-analyzer.ts    # Git operations
│   │   └── copilot.ts         # Copilot CLI integration
│   ├── utils/
│   │   ├── ui.ts              # Terminal UI (no emojis)
│   │   ├── helpers.ts         # Date/clipboard utils
│   │   └── commitlint.ts      # Conventional commit parser
│   └── types/
│       └── index.ts           # TypeScript types
├── tests/                 # Vitest tests (9 passing)
├── dist/                  # Built output (18.97 KB)
└── .github/workflows/     # CI/CD pipelines
```

## ✅ Quality Checklist

**Before Committing:**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

**Commit Message:**

```bash
# Valid formats:
feat: add new feature
fix(auth): resolve login bug
docs: update README
refactor: extract logic
test: add parser tests
chore: update deps
```

## 🔧 Key Files

- `package.json` - Dependencies & scripts
- `tsconfig.json` - TypeScript config (strict mode)
- `tsup.config.ts` - Build config
- `eslint.config.js` - Linter rules
- `.prettierrc` - Code formatting
- `commitlint.config.js` - Commit message rules
- `vitest.config.ts` - Test configuration

## 🎯 Current Status

**Progress:** 50% Complete
**Build:** ✅ 18.97 KB
**Tests:** ✅ 9/9 passing
**TypeScript:** ✅ 0 errors
**Linter:** ✅ 0 errors (2 warnings)
**Quality:** Production-ready

## 📝 Documentation

- `README.md` - User-facing docs
- `PROJECT_SETUP.md` - Setup guide
- `DEV_TOOLING_SETUP.md` - Tooling reference
- `QUICK_REFERENCE.md` - This file

## 🏆 Next Steps

1. Test commands locally
2. Refine features
3. Build demo
4. Win! 🚀
