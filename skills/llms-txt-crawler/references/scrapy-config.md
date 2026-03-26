# ClaudeBot Web Scraping Best Practices

Reference for building Scrapy spiders that comply with Anthropic's ClaudeBot crawling guidelines.

## ClaudeBot User-Agent

```
ClaudeBot/1.0 (+https://claude.ai/bot; Anthropic)
```

Always identify your crawler. Site operators use this to:
- Distinguish bot traffic from human traffic
- Apply specific rate limits or access rules for AI crawlers
- Contact Anthropic if they have concerns

## robots.txt Compliance

**ROBOTSTXT_OBEY = True** — always, no exceptions.

Scrapy checks robots.txt automatically when this is enabled. If a site blocks ClaudeBot
or all bots, respect that immediately. Do not attempt to work around it.

## Rate Limiting

| Setting | Value | Reason |
|---------|-------|--------|
| DOWNLOAD_DELAY | 2 (seconds) | Minimum courtesy delay between requests |
| CONCURRENT_REQUESTS | 4 | Maximum parallel connections total |
| CONCURRENT_REQUESTS_PER_DOMAIN | 2 | Maximum parallel connections per domain |
| AUTOTHROTTLE_ENABLED | True | Dynamically adjusts delay based on server response time |

These are **minimums**. If a server responds slowly, increase delays.

## Error Handling

```python
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]
```

- Retry transient errors up to 3 times with exponential backoff
- On 429 (Too Many Requests): back off aggressively, consider doubling DOWNLOAD_DELAY
- On persistent 403/404: skip the URL, log it, move on

## Output Format

Use JSONL (JSON Lines) — one JSON object per line:

```json
{"url": "https://...", "title": "...", "content": "...", "status": 200, "fetched_at": "..."}
```

JSONL advantages:
- Streamable — can process while crawling
- Append-friendly — safe for interrupted crawls
- Line-oriented — easy to grep/filter/count

## When to Use WebFetch vs Scrapy

| Scenario | Tool | Reason |
|----------|------|--------|
| Quick single-page fetch | WebFetch | Fast, in agent loop, no setup |
| < 20 pages, ad-hoc | WebFetch | Lower overhead than Scrapy project |
| > 20 pages, bulk indexing | Scrapy | Proper rate limiting, retry, output |
| Recurring crawl job | Scrapy | Persistent config, resumable |
| Need to follow links | Scrapy | Built-in link extraction |

## The llms.txt → Scrapy Pipeline

1. **Fetch llms.txt** via WebFetch or the parse script
2. **Parse** to extract sections and URLs
3. **Filter** by section/priority as needed
4. **Generate** Scrapy project with `generate-spider.py`
5. **Run** spider: `scrapy crawl docs`
6. **Index** results into knowledge store

## Content Extraction

Strip navigation, headers, footers — keep main content only:

```python
body = response.css("main, article, .content, #content, body")
text = " ".join(body.css("::text").getall()).strip()
```

Truncate to ~32K chars (~8K tokens) per page to keep the knowledge index manageable.
