# CLAUDE.md

## Project: @jadecli/claude-knowledge-sdk

Distilled knowledge SDK for Claude Code (v2.1.83), Agent SDK, and multi-agent research.
Code-first TypeScript, recursively self-improving, designed for both Claude.ai and Claude Code.

This repo doubles as a **Claude Code plugin** — load with `claude --plugin-dir .`

## Architecture

```
src/
  types/       → Branded types, Result monad, Agent SDK types, Knowledge types
  agent/       → Agent loop (wraps SDK query()), Orchestrator (lead + subagents)
  context/     → Compaction, progressive disclosure, agent memory
  knowledge/   → Doc fetcher, knowledge index, llms.txt parser
  monitoring/  → OTel config gen, cost tracking, Docker Compose gen
  __tests__/   → vitest test suite
skills/        → Claude Code skills (SKILL.md format)
  doc-fetcher/     — Local documentation oracle
  research-loop/   — Multi-agent recursive research
  otel-tracker/    — OTel monitoring setup
  llms-txt-crawler/ — llms.txt parser + Scrapy spider generator
agents/        → Plugin agents dir (future)
.claude-plugin/ → Plugin manifest (plugin.json)
.lsp.json      → TypeScript LSP config for the plugin
.github/workflows/ → CI, Claude PR Review, Security Review
```

## Code Standards

- **TypeScript**: Boris Cherny "Programming TypeScript" strict patterns
  - Branded types for all IDs (`AgentId`, `SessionId`, `USD`, etc.)
  - `Result<T, E>` instead of try/catch
  - Discriminated unions for all state machines
  - `assertNever()` for exhaustive matching
  - `noUncheckedIndexedAccess: true`
- **Readonly by default**: All types use `readonly` properties
- **No exceptions across boundaries**: Agent → orchestrator → caller all use Result

## Key Dependencies

- `@anthropic-ai/claude-agent-sdk` — the actual Agent SDK (peer dep, optional)
- `@anthropic-ai/sdk` — Anthropic API client (peer dep, optional)
- `@modelcontextprotocol/sdk` — MCP server/client (peer dep, optional)
- `zod` — runtime schema validation

## Build & Test

```bash
npm run typecheck   # Verify types (tsc --noEmit)
npm run build       # Compile to dist/
npm test            # Run vitest
npm run lint        # Prettier check
npm run format      # Prettier write
```

## Plugin Testing

```bash
claude --plugin-dir ~/repos/claude-knowledge-sdk-typescript
# Then: /reload-plugins to refresh
# Test skill: /claude-knowledge-sdk:llms-txt-crawler
```

## CI/CD — Opinionated Merge Gate

Four GitHub Actions workflows enforce code quality. **ALL must pass to merge.**

### 1. ci.yml — Merge Gate (4 parallel jobs)
- **typecheck**: `tsc --noEmit` — zero type errors
- **build**: `tsc` + verify dist outputs (index.js, index.d.ts, cli.js)
- **test**: `vitest run` + verify minimum 80 tests passing
- **lint**: `prettier --check` + type-only export verification

### 2. claude-code-review.yml — AI Code Review (BLOCKING)
- Runs on every PR (opened, synchronize, ready_for_review, reopened)
- Enforces Boris Cherny TypeScript patterns via structured review checklist:
  - Branded types, Result<T,E>, discriminated unions, readonly, assertNever()
  - No `any` without justification, no exceptions across boundaries
  - Tests required for new functions, edge cases covered
- Posts APPROVE / REQUEST_CHANGES with specific file:line references
- Uses `track_progress: true` for visual progress indicators
- Runs typecheck + tests before reviewing code

### 3. security.yml — Security Review (BLOCKING)
- Scans for command injection, path traversal, YAML injection, secret exposure
- Custom scan instructions targeting SDK-specific risks (workflow generation, plugin validation, MCPB templates)
- Excludes: node_modules, dist, coverage, .claude
- Rates findings: CRITICAL, HIGH, MEDIUM, LOW

### 4. claude.yml — Interactive @claude Assistant
- Responds to `@claude` mentions in issues, PR comments, and reviews
- Has full dev tools: Edit, Write, Read, Glob, Grep, npm, git, gh
- Enforces Boris Cherny standards via system prompt
- Must run typecheck + test + prettier before committing

### Required Secret
- `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` (Claude Pro Max subscription)
- Used by ALL workflows. Never use ANTHROPIC_API_KEY.

## Important Context

- Agent SDK query() returns an async generator of SDKMessage
- Subagents are defined via `agents` param on query options
- Skills are filesystem-only — SDK has no programmatic skill registration
- OTel events flow through LOGS protocol, not just metrics
- DISABLE_TELEMETRY ≠ CLAUDE_CODE_ENABLE_TELEMETRY
- Task→Agent rename in v2.1.63 — SDK emits "Task" in system:init, "Agent" in tool_use blocks
- TodoWrite uses COMPLETE REPLACEMENT — every call overwrites entire list
- TaskOutput deprecated v2.1.83; TodoRead removed
- SendMessage({to:agentId}) replaced Agent resume param
