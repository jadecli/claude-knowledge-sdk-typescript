---
name: llms-txt-crawler
description: >
  Parse and crawl llms.txt documentation indexes. Use this when you need to crawl docs,
  parse llms.txt, index documentation, fetch doc URLs, scrape docs, build a knowledge index,
  find what pages are in the docs, or work with llms.txt files from any site.
---

# llms.txt Documentation Crawler

Parses llms.txt files (the LLM-friendly documentation standard from llmstxt.org) and crawls
the discovered documentation URLs to build a local knowledge index.

## Known llms.txt Endpoints

- `https://code.claude.com/docs/llms.txt` — Claude Code docs (updates daily)
- `https://platform.claude.com/llms.txt` — Platform/API docs
- Any site following the llms.txt standard at `{domain}/llms.txt`

## Process

### Step 1: Fetch the llms.txt file

```
Use WebFetch to retrieve the llms.txt URL.
Example: WebFetch https://code.claude.com/docs/llms.txt
```

### Step 2: Parse the llms.txt content

The llms.txt format is markdown with:
- `# Site Name` — top-level heading
- `> Description` — site description
- `## Section` — doc sections
- `- [Title](url): Description` — doc page links

Parse using the bundled parser:
```bash
npx tsx skills/llms-txt-crawler/scripts/parse-llms-txt.ts https://code.claude.com/docs/llms.txt
```

This outputs structured JSON with all sections and links.

### Step 3: Filter by section or priority

Select which sections/URLs to crawl based on the user's request.
For targeted crawling, pick specific sections. For full indexing, crawl all.

### Step 4: Crawl URLs

**For quick single-page fetches** (inside agent loop):
Use WebFetch on each URL. Good for up to ~20 pages.

**For bulk multi-page crawling** (outside agent loop):
Generate a Scrapy spider project:
```bash
python3 skills/llms-txt-crawler/scripts/generate-spider.py ./scrapy-output urls.json
```

The spider uses ClaudeBot user-agent, respects robots.txt, and rate-limits to 2s between requests.

### Step 5: Store in knowledge index

Save crawled content to `~/.claude/knowledge/` using the SDK's knowledge index format.
The `ck fetch-docs` CLI command handles this automatically for known Anthropic doc sources.

## Scrapy Spider Generation

For deeper crawling beyond what WebFetch handles, generate a full Scrapy project:

1. Parse llms.txt to get URLs (Step 2)
2. Run the spider generator (Step 4)
3. Install and run: `cd scrapy-output && uv pip install -e . && scrapy crawl docs`
4. Results in `data/crawled.jsonl`

See `references/scrapy-config.md` for ClaudeBot web scraping best practices.

## Important Notes

- Always check robots.txt before bulk crawling
- Use ClaudeBot user-agent: `ClaudeBot/1.0 (+https://claude.ai/bot; Anthropic)`
- Rate limit: minimum 2 second delay between requests
- Maximum 4 concurrent requests for bulk crawling
- WebFetch is preferred for small-scale fetching (< 20 pages)
- Scrapy is preferred for bulk crawling (> 20 pages)

## Evaluation

This skill includes an evaluation suite in `evals/evals.json` following the
[agentskills.io](https://agentskills.io/skill-creation/evaluating-skills) format.

### Running Evals

1. Spawn a clean subagent per test case (no shared context between runs)
2. Run each prompt with the skill loaded and without for comparison
3. Grade assertions against output — require concrete evidence for PASS
4. Aggregate results into `benchmark.json` with pass_rate and token deltas

### Workspace Structure

```
llms-txt-crawler-workspace/iteration-N/
  eval-name/{with_skill,without_skill}/
    outputs/      — files produced by the run
    timing.json   — {total_tokens, duration_ms}
    grading.json  — assertion results
  benchmark.json  — aggregated comparison
```

Use the `skill-creator` skill to automate evaluation runs. See `evals/README.md` for details.
