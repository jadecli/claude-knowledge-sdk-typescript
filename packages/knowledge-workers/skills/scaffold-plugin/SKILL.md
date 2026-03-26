---
name: scaffold-plugin
description: >
  Use when creating a new jade-{dept} department plugin repo from the scaffold template.
  Generates a complete Claude Code plugin directory with DevOps foundation, named agent
  personas, department-specific skills, and MCP connector configs. Trigger when the user
  asks to create a new department plugin, scaffold a repo, or bootstrap a jade-* project.
---

# Scaffold Department Plugin

Generate a new `jade-{department}` Claude Code plugin repo from the jadecli scaffold template.

## How It Works

1. Reads the department configuration (name, agents, skills, connectors)
2. Queries the agent registry for named agents at the department's levels
3. Generates the complete directory tree with all required files
4. Validates that the generated output typechecks and has valid plugin.json

## Usage

```bash
npx jade-workers scaffold --department engineering --repo jade-engineering
```

## What Gets Generated

- `.claude-plugin/plugin.json` — plugin manifest
- `.lsp.json` — TypeScript LSP config
- `package.json` — with `@jadecli/knowledge-workers` dependency
- `tsconfig.json` — Boris Cherny strict settings
- `CLAUDE.md` — department-specific project instructions
- `skills/` — department-specific SKILL.md files
- `agents/` — one `.md` per named agent with system prompt
- `.github/workflows/ci.yml` — references shared CI workflow
- DevOps foundation: commitlint, husky, release-please, CONTRIBUTING.md, SECURITY.md

## References

See the agent registry for available agents per department:
`npx jade-workers list-agents --department {name}`
