---
name: research-loop
description: >
  Orchestrate multi-agent research with recursive self-improvement.
  USE THIS SKILL whenever the user asks for comprehensive research,
  deep analysis, multi-source comparison, or investigation across
  documentation, codebases, and web sources. Trigger for: "research",
  "deep dive", "investigate", "compare", "survey", "comprehensive
  analysis", "find out everything about", or any question that needs
  multiple sources to answer well. This skill spawns parallel subagents,
  synthesizes findings, evaluates gaps, and recursively improves.
context: fork
agent: Explore
allowed-tools: "Read, Grep, Glob, WebSearch, WebFetch, Agent"
model: inherit
---

# Multi-Agent Research Loop

## Architecture (from anthropic.com/engineering/multi-agent-research-system)

```
Lead Agent (Opus) ─── classifies query
    │
    ├── Subagent 1 (Sonnet) ── explores subtopic A
    ├── Subagent 2 (Sonnet) ── explores subtopic B
    └── Subagent N (Sonnet) ── explores subtopic N
    │
    └── Lead synthesizes ── evaluates gaps ── spawns follow-ups
```

## Process

### Phase 1: Classify
Determine query complexity:
- **Simple**: 0 subagents, direct answer (1-3 tool calls)
- **Lookup**: 1 subagent, single-source (3-10 tool calls)
- **Comparison**: N subagents per entity (10-15 calls each)
- **Deep dive**: N subagents per facet (10-15 calls each)
- **Survey**: N subagents per subtopic (10-15 calls each, up to 10)

### Phase 2: Plan
For each subagent, define:
1. **Specific objective** (one core question)
2. **Output format** (summary, JSON, code, or comparison table)
3. **Tools** to use (Read, Grep, WebSearch, WebFetch)
4. **Scope boundaries** (what NOT to research)

### Phase 3: Execute
Fan out all subagents in parallel using the Agent tool.
Each subagent:
- Gets a clean context window
- Explores with 10-15 tool calls
- Returns compressed findings (10K→1K tokens)

### Phase 4: Synthesize
The lead agent merges all subagent findings into:
- **BLUF** (Bottom Line Up Front) — direct answer in first paragraph
- **Evidence sections** — 3-5 focused sections with bold key facts
- **Confidence** — explicit confidence level and limitations

### Phase 5: Evaluate & Improve (Recursive)
Use Haiku to evaluate the synthesis for gaps:
- If gaps found → spawn targeted follow-up agents
- Merge follow-up findings → re-synthesize
- Repeat up to 3 rounds maximum

## Scaling Rules

| Query Type | Agents | Tool Calls/Agent | Model |
|------------|--------|------------------|-------|
| Simple | 0 | 0 | haiku |
| Lookup | 1 | 3-10 | sonnet |
| Comparison | 2-5 | 10-15 | sonnet |
| Deep Dive | 2-4 | 10-15 | sonnet |
| Survey | 5-10 | 10-15 | sonnet |

## Output Format

Always use BLUF (Smart Brevity):
- First paragraph answers the question directly
- Bold **key facts and figures**
- Narrative prose, not bullet lists
- Source attribution inline
- Final paragraph: confidence level and known limitations
