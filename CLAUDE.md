# CLAUDE.md

## Project: @jadecli/claude-knowledge-sdk

Distilled knowledge SDK for Claude Code (v2.1.83), Agent SDK, and multi-agent research.
Code-first TypeScript, recursively self-improving, designed for both Claude.ai and Claude Code.

## Architecture

```
src/
  types/       → Branded types, Result monad, Agent SDK types, Knowledge types
  agent/       → Agent loop (wraps SDK query()), Orchestrator (lead + subagents)
  context/     → Compaction, progressive disclosure, agent memory
  knowledge/   → Doc fetcher, knowledge index, llms.txt support
  monitoring/  → OTel config gen, cost tracking, Docker Compose gen
skills/        → Claude Code skills (SKILL.md format)
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

- `@anthropic-ai/claude-agent-sdk` — the actual Agent SDK (peer dep)
- `@anthropic-ai/sdk` — Anthropic API client
- `@modelcontextprotocol/sdk` — MCP server/client
- `zod` — runtime schema validation

## Build & Test

```bash
npm run typecheck   # Verify types
npm run build       # Compile to dist/
npm test            # Run vitest
```

## Important Context

- Agent SDK query() returns an async generator of SDKMessage
- Subagents are defined via `agents` param on query options
- Skills are filesystem-only — SDK has no programmatic skill registration
- OTel events flow through LOGS protocol, not just metrics
- DISABLE_TELEMETRY ≠ CLAUDE_CODE_ENABLE_TELEMETRY
