---
name: doc-fetcher
description: >
  Fetch and index official Anthropic documentation for answering questions
  about Claude Code, the Agent SDK, MCP, skills, plugins, hooks, and
  monitoring. USE THIS SKILL whenever the user asks about Claude Code
  features, Agent SDK APIs, OTel configuration, cost tracking, secrets
  management, or any Anthropic platform documentation. Also trigger for
  "how does Claude Code...", "what's the SDK API for...", "check the docs",
  "latest changelog", or references to code.claude.com, platform.claude.com,
  or docs.anthropic.com. This skill acts as a local documentation oracle.
---

# Doc Fetcher Skill

Fetches and indexes official Anthropic documentation from three surfaces:
- **code.claude.com** — Claude Code CLI, skills, plugins, hooks, monitoring
- **platform.claude.com** — Agent SDK, custom tools, subagents, permissions
- **docs.anthropic.com** — Messages API, analytics API, usage & cost API

## Process

1. **Check local cache** at `~/.claude/knowledge/knowledge-index.json`
2. If stale (>24h) or missing, **fetch fresh docs** using the fetcher script
3. **Search** the index for entries matching the user's question
4. **Inject** relevant doc content into context for answering
5. **Cite** sources with URLs

## Usage

```bash
# Fetch/refresh all docs (critical + high priority)
npx tsx src/cli.ts fetch-docs --priority high

# Fetch only critical docs (fastest)
npx tsx src/cli.ts fetch-docs --priority critical

# Search the index
npx tsx src/cli.ts search "otel configuration"
```

## Key Sources by Topic

| Topic | Surface | Section |
|-------|---------|---------|
| OTel / Monitoring | code.claude.com | monitoring-usage |
| Cost Management | code.claude.com | costs, analytics |
| Agent SDK (TS) | platform.claude.com | agent-sdk/typescript |
| Subagents | platform.claude.com | agent-sdk/subagents |
| Skills in SDK | platform.claude.com | agent-sdk/skills |
| Hooks | platform.claude.com | agent-sdk/hooks |
| Auth / Secrets | code.claude.com | authentication |
| MCP Servers | code.claude.com | mcp |
| Changelog | code.claude.com | changelog |
| Analytics API | docs.anthropic.com | api/claude-code-analytics-api |

## Important Gotchas

- **OTel events use LOGS protocol, not metrics** — you need `OTEL_LOGS_EXPORTER=otlp`
- **DISABLE_TELEMETRY ≠ CLAUDE_CODE_ENABLE_TELEMETRY** — the former is Statsig internal, the latter is user OTel
- **Skills are filesystem-only** — the SDK has no programmatic API for registering skills, only `settingSources`
- **Agent tool was renamed from Task** — check both names for SDK compatibility
- **V2 SDK is unstable preview** — use `unstable_v2_createSession` prefix
