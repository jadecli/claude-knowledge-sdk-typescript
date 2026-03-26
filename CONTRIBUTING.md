# Contributing

## Development Setup

```bash
git clone https://github.com/jadecli/claude-knowledge-sdk-typescript.git
cd claude-knowledge-sdk-typescript
npm install
npm run typecheck  # Type check
npm run build      # Compile
npm test           # Run tests
```

## Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + husky.

Format: `type(scope): description`

**Types**: feat, fix, chore, docs, refactor, test, ci, build, perf

**Scopes**: init, types, agent, knowledge, context, monitoring, plugin, crawler, cli, eval, deps, ci, release, security, docs, infra

Examples:
```
feat(types): add LSP tool types
fix(knowledge): handle empty llms.txt sections
docs(security): update supported versions
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes with conventional commits
3. Push and create PR — CI (typecheck, test, lint) must pass
4. Claude reviews PR automatically via claude-code-action
5. Security review runs on all PRs
6. Get approval, squash-merge to main

## Release Process

Releases are automated via [release-please](https://github.com/googleapis/release-please). Merging conventional commits to main triggers version analysis and creates a Release PR with changelog updates.
