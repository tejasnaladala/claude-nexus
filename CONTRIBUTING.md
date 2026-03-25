# Contributing to Claude Nexus

Thanks for your interest in contributing to Claude Nexus! This guide covers everything you need to get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-nexus.git
   cd claude-nexus
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```
5. Run the tests:
   ```bash
   npm test
   ```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes
3. Write or update tests for your changes
4. Ensure all tests pass:
   ```bash
   npm test
   ```
5. Build to check for type errors:
   ```bash
   npm run build
   ```
6. Commit with a descriptive message (see commit format below)
7. Push your branch and open a Pull Request

## Commit Message Format

Follow conventional commits:

```
<type>: <description>

<optional body>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code restructuring without behavior change
- `docs` - Documentation only
- `test` - Adding or updating tests
- `chore` - Build config, dependencies, tooling
- `perf` - Performance improvement
- `ci` - CI/CD changes

**Examples:**
```
feat: add skill-weighted task routing
fix: prevent duplicate agent registration on reconnect
docs: update CLI usage examples
test: add integration tests for debate engine
```

## Project Structure

The project is a monorepo managed by Turborepo:

- `packages/core` - Shared types, utilities, constants
- `packages/protocol` - Zod schemas and message serialization
- `packages/nexus-server` - WebSocket server, task engine, debate, memory
- `packages/agent-runtime` - Client connection, heartbeat, tunnel
- `packages/mcp-server` - MCP tools for Claude Code
- `apps/cli` - CLI entry point
- `tests/` - Unit and integration tests

## Code Style

- **Immutability** - Create new objects instead of mutating existing ones
- **Small files** - Keep files under 400 lines; extract when they grow
- **Small functions** - Keep functions under 50 lines
- **Error handling** - Handle errors explicitly at every level; never swallow them
- **Input validation** - Validate at system boundaries using Zod schemas
- **No hardcoded values** - Use constants or config

## Testing

All contributions should include tests. Target 80%+ code coverage.

```bash
npx vitest run                    # All tests
npx vitest run tests/unit/        # Unit tests only
npx vitest run tests/integration/ # Integration tests only
```

When adding a new MCP tool, include:
- Unit test for the tool handler
- Integration test showing the tool in a multi-agent scenario

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Include a clear description of what changed and why
- Reference any related issues
- Make sure CI passes before requesting review
- Be responsive to review feedback

## Reporting Issues

When filing an issue, include:
- Node.js version (`node --version`)
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or error messages

## Questions?

Open a Discussion on GitHub if you have questions that are not bug reports or feature requests.
