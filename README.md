# @jadecli/claude-knowledge-sdk

<!-- CI badge placeholder: [![CI](https://github.com/YOUR_ORG/claude-knowledge-sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/claude-knowledge-sdk-typescript/actions/workflows/ci.yml) -->

**Distilled knowledge from Anthropic's Claude ecosystem — as code, not docs.**

A TypeScript SDK + Claude Code plugin that captures the patterns, types, and tooling from Claude Code v2.1.83, the Claude Agent SDK, claude-code-actions, and 8 Anthropic engineering blog posts. Includes 4 Claude Code skills, TypeScript LSP support, CI/CD workflows, and an llms.txt documentation crawler.

## What This Is

Instead of reading docs, you `import` them:

```typescript
import {
  runLoop,              // Agent loop wrapping SDK query()
  orchestrateResearch,  // Lead + parallel subagent fan-out/fan-in
  recursiveResearch,    // Research → evaluate → improve loop
  parseLlmsTxt,         // Parse llms.txt documentation indexes
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

## Claude Code Plugin

This repo is also a Claude Code plugin with 4 skills and TypeScript LSP:

```bash
# Load as plugin (dev)
claude --plugin-dir ~/repos/claude-knowledge-sdk-typescript

# Reload after changes
/reload-plugins

# Use skills
/claude-knowledge-sdk:doc-fetcher
/claude-knowledge-sdk:research-loop
/claude-knowledge-sdk:otel-tracker
/claude-knowledge-sdk:llms-txt-crawler
```

### Skills

| Skill | Description |
|-------|-------------|
| **doc-fetcher** | Local documentation oracle — fetches and caches Anthropic docs |
| **research-loop** | Multi-agent recursive research with lead + subagent pattern |
| **otel-tracker** | OTel monitoring setup generator for Prometheus/SigNoz/Grafana |
| **llms-txt-crawler** | Parses llms.txt files, crawls doc URLs, generates Scrapy spiders |

### llms.txt Crawler

The llms-txt-crawler skill can:
1. Parse any site's llms.txt file (the LLM-friendly doc index standard)
2. Crawl discovered documentation URLs via WebFetch
3. Generate a full Scrapy spider project for bulk crawling with ClaudeBot user-agent
4. Build a local knowledge index at `~/.claude/knowledge/`

Known endpoints: `code.claude.com/docs/llms.txt`, `platform.claude.com/llms.txt`

## Architecture

Built from 5 distilled sources:

| Source | What It Provides |
|--------|-----------------|
| `anthropics/claude-code` v2.1.83 | CLI surface, hooks, skills, plugins, monitoring |
| `@anthropic-ai/claude-agent-sdk` v0.2.33 | `query()`, `AgentDefinition`, subagents, V2 sessions |
| `anthropics/claude-code-action` | CI/CD integration, GitHub Actions patterns |
| `anthropics/claude-code-monitoring-guide` | OTel + Prometheus stack |
| `anthropic.com/engineering` (8 posts) | Multi-agent patterns, context engineering, tool design |

## CI/CD

Three GitHub Actions workflows are included:

### 1. CI Gate (`ci.yml`)
Runs on push to main and PRs: typecheck → build → test → lint. All must pass.

### 2. Claude PR Review (`claude-review.yml`)
Uses `anthropics/claude-code-action@v1` for automated PR review.

### 3. Security Review (`security.yml`)
Uses `anthropics/claude-code-security-review@main` for AI security scanning.

### Required GitHub Secrets

| Secret | Source | Used By |
|--------|--------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Run `claude setup-token` locally | claude-review.yml |
| `CLAUDE_API_KEY` | Anthropic API key with Claude Code usage enabled | security.yml |

**Prerequisites:**
- Install the Claude GitHub App on your repo (run `/install-github-app` in Claude Code)
- Security review is not hardened against prompt injection — only review trusted PRs

## Code Standards

Follows Boris Cherny's "Programming TypeScript" discipline:

- **Branded types** prevent mixing `AgentId` with `SessionId`
- **`Result<T, E>`** replaces try/catch — no exceptions cross boundaries
- **Discriminated unions** model every state transition with `assertNever()`
- **`noUncheckedIndexedAccess`** catches undefined array/object access
- **Readonly by default** — all types use `readonly` properties

## Key Patterns Implemented

1. **Agent Loop** — `while` + tool execution + result feeding (from Agent SDK)
2. **Lead-Subagent** — Opus plans, Sonnet workers explore in parallel
3. **Recursive Research** — research → evaluate gaps → follow up → merge
4. **Progressive Disclosure** — defer tool loading for 85% token reduction
5. **Context Compaction** — three-tier: clear results → summarize → delegate
6. **Structured Memory** — agent notes persisted outside context window
7. **OTel Pipeline** — events via LOGS protocol, not just metrics
8. **llms.txt Crawling** — parse doc indexes, crawl URLs, generate Scrapy spiders

## License

MIT
