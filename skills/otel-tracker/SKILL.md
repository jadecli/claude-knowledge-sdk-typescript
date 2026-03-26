---
name: otel-tracker
description: >
  Set up and manage OpenTelemetry monitoring for Claude Code sessions.
  USE THIS SKILL whenever the user asks about monitoring, telemetry,
  cost tracking, token usage, OTel configuration, Prometheus setup,
  or session analytics. Also trigger for "how much did that cost",
  "track my usage", "set up monitoring", "configure telemetry", or
  any reference to OTEL, Prometheus, Grafana, or the monitoring guide.
---

# OTel Tracker Skill

## Quick Setup

Generate the OTel environment variables:
```bash
npx tsx src/cli.ts otel-setup --backend prometheus --endpoint http://localhost:4317
```

This generates a shell script you can source:
```bash
source ./claude-otel-env.sh
```

## Critical Configuration Notes

### Both METRICS and LOGS exporters required
Rich telemetry (tokens, costs, tool usage) flows through the **logs/events protocol**.
Setting only `OTEL_METRICS_EXPORTER` misses most data.

```bash
export OTEL_METRICS_EXPORTER=otlp   # counters, histograms
export OTEL_LOGS_EXPORTER=otlp      # events with token/cost details
```

### Two different telemetry systems
| Variable | Controls | Purpose |
|----------|----------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY=1` | User-managed OTel | YOUR monitoring |
| `DISABLE_TELEMETRY=1` | Anthropic's Statsig | Internal metrics |

**WARNING**: Setting `DISABLE_TELEMETRY=1` can disable paid features like
Opus 1M context and Channels. Only disable it if you understand the consequences.

### Key Metrics
- `claude_code_cost_usage_USD_total` — cumulative cost
- `claude_code_token_usage_tokens_total` — token counters by type
- `claude_code_api_request_duration_ms` — API latency
- `claude_code_session_count_total` — session counter

### Privacy Controls
- `OTEL_LOG_USER_PROMPTS=1` — include prompt content (off by default)
- `OTEL_LOG_TOOL_DETAILS=1` — include MCP/tool server names
- `OTEL_METRICS_INCLUDE_SESSION_ID=1` — per-session cardinality

## Docker Compose Stack

Use `npx tsx src/cli.ts otel-compose --backend prometheus` to generate
a Docker Compose file matching the official monitoring guide.

## Cost Tracking for CI/CD

In GitHub Actions with claude-code-action:
```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_args: "--output-format json --max-turns 10"
```

Parse `total_cost_usd` and `session_id` from the JSON output.
