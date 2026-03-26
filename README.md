# @jadecli/claude-knowledge-sdk

**Distilled knowledge from Anthropic's Claude ecosystem — as code, not docs.**

A TypeScript SDK that captures the patterns, types, and tooling from Claude Code v2.1.83, the Claude Agent SDK, claude-code-actions, and 8 Anthropic engineering blog posts. Designed for multi-agent research on both Claude.ai and Claude Code.

## What This Is

Instead of reading docs, you `import` them:

```typescript
import {
  runLoop,              // Agent loop wrapping SDK query()
  orchestrateResearch,  // Lead + parallel subagent fan-out/fan-in
  recursiveResearch,    // Research → evaluate → improve loop
  fetchAllKnowledge,    // Fetch docs from 3 Anthropic surfaces
  calculateBudget,      // Context window management
  generateOtelEnvVars,  // OTel configuration generator
  MODEL_PRICING,        // Current model pricing table
} from '@jadecli/claude-knowledge-sdk';
```

## Quick Start

```bash
# Install
npm install @jadecli/claude-knowledge-sdk

# Fetch documentation index
npx ck fetch-docs --priority critical

# Run a recursive research query
npx ck research "how does Claude Code handle context compaction"

# Generate OTel monitoring config
npx ck otel-setup --backend prometheus
```

## Architecture

Built from 5 distilled sources:

| Source | What It Provides |
|--------|-----------------|
| `anthropics/claude-code` v2.1.83 | CLI surface, hooks, skills, plugins, monitoring |
| `@anthropic-ai/claude-agent-sdk` v0.2.33 | `query()`, `AgentDefinition`, subagents, V2 sessions |
| `anthropics/claude-code-action` | CI/CD integration, GitHub Actions patterns |
| `anthropics/claude-code-monitoring-guide` | OTel + Prometheus stack |
| `anthropic.com/engineering` (8 posts) | Multi-agent patterns, context engineering, tool design |

## Code Standards

Follows Boris Cherny's "Programming TypeScript" discipline:

- **Branded types** prevent mixing `AgentId` with `SessionId`
- **`Result<T, E>`** replaces try/catch — no exceptions cross boundaries
- **Discriminated unions** model every state transition with `assertNever()`
- **`noUncheckedIndexedAccess`** catches undefined array/object access
- **Readonly by default** — all types use `readonly` properties

## Skills (for Claude Code)

Install as Claude Code skills for in-session use:

```
skills/
  doc-fetcher/SKILL.md      — Local documentation oracle
  research-loop/SKILL.md     — Multi-agent recursive research
  otel-tracker/SKILL.md      — OTel monitoring setup
```

Copy to `.claude/skills/` or install via the plugin system.

## Key Patterns Implemented

1. **Agent Loop** — `while` + tool execution + result feeding (from Agent SDK)
2. **Lead-Subagent** — Opus plans, Sonnet workers explore in parallel
3. **Recursive Research** — research → evaluate gaps → follow up → merge
4. **Progressive Disclosure** — defer tool loading for 85% token reduction
5. **Context Compaction** — three-tier: clear results → summarize → delegate
6. **Structured Memory** — agent notes persisted outside context window
7. **OTel Pipeline** — events via LOGS protocol, not just metrics

## License

MIT
