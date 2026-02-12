# Contributing to DevDaily AI

Thank you for your interest in contributing to DevDaily AI!

## Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/hempun10/devdaily.git
   cd devdaily
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

## Development Workflow

### Making Changes

1. Create a new branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Run tests and linting

   ```bash
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   ```

4. Commit your changes (follows conventional commits)
   ```bash
   git commit -m "feat: add new feature"
   ```

### Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:

```
feat: add weekly summary export to JSON
fix: handle git repositories with no commits
docs: update installation instructions
test: add tests for PR description generation
```

### Code Style

- TypeScript strict mode enabled
- 2 spaces indentation
- Single quotes
- 100 character line width
- No emojis in terminal output (professional style)

We use ESLint and Prettier for automatic formatting. Run:

```bash
npm run lint:fix
npm run format
```

### Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Aim for good test coverage

```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode
npm run test:coverage    # Coverage report
```

### Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all checks pass (lint, tests, build)
4. Update CHANGELOG.md with your changes
5. Submit PR with clear description

## Project Structure

```
devdaily-ai/
├── src/
│   ├── commands/        # CLI commands
│   ├── core/           # Core functionality
│   ├── utils/          # Utilities
│   └── types/          # TypeScript types
├── tests/              # Test files
├── docs/               # Documentation
├── examples/           # Usage examples
└── dist/               # Build output
```

## Need Help?

- Check existing issues and discussions
- Read the documentation in `/docs`
- Ask questions in GitHub Discussions

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow

Thank you for contributing! 🚀
