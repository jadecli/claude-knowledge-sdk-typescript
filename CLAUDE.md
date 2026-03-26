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
  sprint-planning/ — Linear sprint planning from task lists
agents/        → Plugin agents dir (future)
docs/          → Infrastructure and project docs
  infrastructure/  — Neon, Cloudflare, Netlify setup guides
  linear-projects.md — Linear project/sprint structure
scripts/       → Setup scripts
  setup-branch-protection.sh — GitHub branch protection
  setup-infrastructure.sh    — Guided infra setup
.claude-plugin/ → Plugin manifest (plugin.json)
.lsp.json      → TypeScript LSP config (see .lsp.README.md)
.github/workflows/ → CI, Claude Review, Security, Release, Release Doctor
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

Six GitHub Actions workflows enforce code quality. **ALL must pass to merge.**

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

### 5. release.yml — Release Please
- Auto-creates Release PRs on push to main via googleapis/release-please-action@v4
- Groups CHANGELOG entries by conventional commit type

### 6. release-doctor.yml — Secret Validation
- Validates required secrets exist on push to main

### Required Secrets
- `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` (Claude Pro Max subscription)
- `CLAUDE_API_KEY` — Anthropic API key (used by security.yml)

## DevOps Setup (First-Time)

1. Push to GitHub: `git push -u origin main`
2. Configure branch protection: `bash scripts/setup-branch-protection.sh`
3. Install Claude GitHub App: `/install-github-app` in Claude Code
4. Add GitHub Secrets (Settings → Secrets → Actions)
5. Verify: create a test PR to trigger all workflows

## Commit Convention

Conventional commits enforced by commitlint + husky:
- Format: `type(scope): description`
- Types: feat, fix, chore, docs, refactor, test, ci, build, perf
- Scopes: init, types, agent, knowledge, context, monitoring, plugin, crawler, cli, eval, deps, ci, release, security, docs, infra

## Linear Integration

- Workspace: jadecli, Team: Jadecli, Prefix: JAD
- Project: [Claude Knowledge SDK](https://linear.app/jadecli/project/claude-knowledge-sdk-9b3118b93129)
- Reference issues in commit footers: `Closes JAD-175`

## Tool Systems

Two separate task-tracking systems exist (do not confuse them):

1. **TodoWrite** — non-interactive/headless/SDK mode only. Complete replacement semantics:
   every call overwrites the entire list. Used by Agent SDK and background agents.
2. **TaskCreate/TaskGet/TaskList/TaskUpdate** — interactive CLI sessions. Individual CRUD
   operations on tasks. Used when a human is at the terminal.

Other tool systems:

- **LSP tool** — built-in tool that auto-reports type errors after `Edit`/`Write` operations
  when a code intelligence plugin is loaded. Also provides jump-to-def, find-refs, type-info,
  symbols, implementations, and call hierarchy. Requires `typescript-language-server` installed
  and `.lsp.json` config. See `.lsp.README.md` for details.
- **CronCreate/CronDelete/CronList** — session-scoped scheduled tasks. Prompts fire on a cron
  schedule while the REPL is idle. Gone when Claude exits (not persisted to disk).
- **EnterWorktree/ExitWorktree** — parallel git worktree sessions for isolated work.
- **ToolSearch** — deferred tool loading. Searches for and loads tools on demand when
  tool search is enabled, keeping the initial tool set small.

Complete tool inventory: 30 built-in tools typed in `src/types/agent.ts` as `BuiltInToolName`.

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
