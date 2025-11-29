# Contributing Guide

Thank you for your interest in contributing to the Operaton Screenshot Automation toolkit!

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd operaton-screenshot-automation

# Install dependencies
npm install

# Set up git hooks
npm run prepare

# Copy environment file
cp .env.example .env
# Edit .env with your Operaton instance details
```

### Verify Setup

```bash
# Check code quality tools are working
make validate

# Check connection to Operaton (optional)
make check
```

## Development Workflow

### Before Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. Make sure you're starting with clean code:
   ```bash
   make validate
   ```

### Making Changes

1. Write your code following the existing style
2. The pre-commit hook will automatically:
   - Run ESLint and fix auto-fixable issues
   - Format code with Prettier
   - Validate the changes

3. If you want to check manually before committing:
   ```bash
   make lint        # Check for linting issues
   make format      # Format all files
   make validate    # Run all checks
   ```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The commit-msg hook will validate your messages.

Format: `type(scope): description`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `build`: Build system changes
- `ci`: CI/CD changes
- `perf`: Performance improvements
- `revert`: Reverting changes

**Examples:**
```bash
git commit -m "feat(capture): add support for custom viewport sizes"
git commit -m "fix(deploy): handle timeout errors gracefully"
git commit -m "docs: update README with new commands"
git commit -m "chore(deps): update puppeteer to v24"
```

### Submitting Changes

1. Push your branch:
   ```bash
   git push origin feat/your-feature-name
   ```

2. Create a Pull Request on GitHub

3. Wait for CI checks to pass

4. Request a review

## Code Style

### JavaScript

- ES Modules (`import`/`export`)
- Use `const` by default, `let` when reassignment is needed
- Prefer arrow functions for callbacks
- Use template literals for string interpolation
- Add JSDoc comments for functions

### File Organization

```
scripts/
├── check-connection.js    # Utility scripts
├── deploy-processes.js    # Core functionality
└── ...

config/
└── screenshots.json       # Configuration files

processes/
├── bpmn/                  # BPMN process files
├── dmn/                   # DMN decision files
└── cmmn/                  # CMMN case files
```

## Dependency Management

### Checking for Updates

```bash
make deps-check           # See what's outdated
make deps-update-minor    # Safe update (minor/patch only)
make deps-update          # Update everything (review changes!)
```

### Adding Dependencies

```bash
# Production dependency
npm install <package>

# Dev dependency
npm install -D <package>
```

### Security

```bash
make deps-audit           # Check for vulnerabilities
make deps-audit-fix       # Auto-fix where possible
```

## Testing

Currently, the project doesn't have automated tests. Contributions to add testing are welcome!

Manual testing checklist:
- [ ] `make check` - Connection works
- [ ] `make deploy` - Processes deploy successfully
- [ ] `make data` - Data generates correctly
- [ ] `make simulate` - Scenarios run without errors
- [ ] `make incidents` - Incidents are created
- [ ] `make capture` - Screenshots are captured
- [ ] `make reset` - Environment resets cleanly

## Documentation

- Update README.md for new features
- Add JSDoc comments to new functions
- Update this CONTRIBUTING.md if process changes

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the codebase
