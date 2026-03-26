#!/usr/bin/env python3
"""
Generate a Scrapy project for crawling documentation URLs from parsed llms.txt output.

Usage:
    python3 generate-spider.py <output-dir> [urls-json-file]

If urls-json-file is provided, the spider's start_urls are read from it
(expected format: the JSON output of parse-llms-txt.ts).
"""

import json
import os
import sys
from pathlib import Path


def generate_spider(output_dir: str, urls_file: str | None = None) -> None:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    # Read URLs from parsed llms.txt JSON if provided
    start_urls: list[str] = []
    if urls_file:
        with open(urls_file) as f:
            data = json.load(f)
        for section in data.get("sections", []):
            for link in section.get("links", []):
                if url := link.get("url"):
                    start_urls.append(url)

    # Create directory structure
    spider_dir = output / "scrapy_crawler" / "spiders"
    spider_dir.mkdir(parents=True, exist_ok=True)
    (output / "data").mkdir(exist_ok=True)

    # __init__.py files
    (output / "scrapy_crawler" / "__init__.py").write_text("")
    (spider_dir / "__init__.py").write_text("")

    # Spider
    urls_literal = json.dumps(start_urls, indent=8)
    (spider_dir / "docs_spider.py").write_text(f'''"""Documentation spider for crawling llms.txt-discovered URLs."""

import json
from pathlib import Path

import scrapy


class DocsSpider(scrapy.Spider):
    name = "docs"

    # Load start_urls from urls.json if it exists, otherwise use embedded list
    _urls_file = Path(__file__).parent.parent.parent / "data" / "urls.json"
    if _urls_file.exists():
        start_urls = json.loads(_urls_file.read_text())
    else:
        start_urls = {urls_literal}

    def parse(self, response):
        title = response.css("title::text").get(default="")
        # Extract main content, stripping nav/footer
        body = response.css("main, article, .content, #content, body")
        text = " ".join(body.css("::text").getall()).strip() if body else ""

        yield {{
            "url": response.url,
            "title": title.strip(),
            "content": text[:32000],  # Cap at ~8K tokens
            "status": response.status,
            "fetched_at": self.crawler.stats.get_value("start_time", "").isoformat()
            if hasattr(self.crawler.stats.get_value("start_time", ""), "isoformat")
            else "",
        }}
''')

    # Settings
    (output / "scrapy_crawler" / "settings.py").write_text('''"""Scrapy settings for ClaudeBot-compliant documentation crawling."""

BOT_NAME = "scrapy_crawler"
SPIDER_MODULES = ["scrapy_crawler.spiders"]
NEWSPIDER_MODULE = "scrapy_crawler.spiders"

# ClaudeBot user-agent — identifies crawler to site operators
USER_AGENT = "ClaudeBot/1.0 (+https://claude.ai/bot; Anthropic)"

# Always respect robots.txt
ROBOTSTXT_OBEY = True

# Rate limiting — minimum 2 second delay, max 4 concurrent
DOWNLOAD_DELAY = 2
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2

# Output to JSONL
FEEDS = {
    "data/crawled.jsonl": {
        "format": "jsonlines",
        "encoding": "utf-8",
        "overwrite": True,
    },
}

# Retry with backoff
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Timeout
DOWNLOAD_TIMEOUT = 30

# Respect server load
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2
AUTOTHROTTLE_MAX_DELAY = 10

# Request fingerprinting
REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
FEED_EXPORT_ENCODING = "utf-8"
''')

    # scrapy.cfg
    (output / "scrapy.cfg").write_text('''[settings]
default = scrapy_crawler.settings

[deploy]
project = scrapy_crawler
''')

    # pyproject.toml
    (output / "pyproject.toml").write_text('''[project]
name = "scrapy-docs-crawler"
version = "0.1.0"
description = "Scrapy spider for crawling llms.txt-discovered documentation"
requires-python = ">=3.11"
dependencies = [
    "scrapy>=2.11",
]

[tool.ruff]
select = ["E", "F", "I"]

[tool.mypy]
strict = true
''')

    # Save URLs for the spider to load
    if start_urls:
        (output / "data" / "urls.json").write_text(json.dumps(start_urls, indent=2))

    print(f"Generated Scrapy project in {output}")
    print(f"  {len(start_urls)} URLs configured")
    print(f"  Run: cd {output} && uv pip install -e . && scrapy crawl docs")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 generate-spider.py <output-dir> [urls-json-file]", file=sys.stderr)
        sys.exit(1)

    out_dir = sys.argv[1]
    urls = sys.argv[2] if len(sys.argv) > 2 else None
    generate_spider(out_dir, urls)
