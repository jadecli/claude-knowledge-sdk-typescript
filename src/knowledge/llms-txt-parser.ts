/**
 * @module knowledge/llms-txt-parser
 * Pure TypeScript parser for the llms.txt standard (llmstxt.org).
 *
 * llms.txt is a markdown file at /llms.txt that provides LLM-friendly
 * documentation indexes. Format:
 *
 *   # Site Name
 *   > Brief description
 *
 *   ## Section Name
 *   - [Page Title](https://url): Description
 */

import type { Result } from '../types/core.js';
import { Ok, DocUrl } from '../types/core.js';

// ── Types ────────────────────────────────────────────────────

export type LlmsTxtLink = {
  readonly title: string;
  readonly url: ReturnType<typeof DocUrl>;
  readonly description: string;
};

export type LlmsTxtSection = {
  readonly name: string;
  readonly links: ReadonlyArray<LlmsTxtLink>;
};

export type LlmsTxtIndex = {
  readonly siteName: string;
  readonly siteDescription: string;
  readonly sections: ReadonlyArray<LlmsTxtSection>;
};

// ── Parser ───────────────────────────────────────────────────

const LINK_RE = /^[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*:\s*(.*))?$/;

export function parseLlmsTxt(raw: string): Result<LlmsTxtIndex, Error> {
  const lines = raw.split('\n');
  let siteName = '';
  let siteDescription = '';

  const sections: LlmsTxtSection[] = [];
  let currentSection: { name: string; links: LlmsTxtLink[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // # Site Name (h1)
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      siteName = trimmed.slice(2).trim();
      continue;
    }

    // > Description
    if (trimmed.startsWith('> ') && !currentSection) {
      siteDescription = trimmed.slice(2).trim();
      continue;
    }

    // ## Section Name
    if (trimmed.startsWith('## ')) {
      if (currentSection) {
        sections.push({ name: currentSection.name, links: currentSection.links });
      }
      currentSection = { name: trimmed.slice(3).trim(), links: [] };
      continue;
    }

    // - [Title](url): Description
    const match = LINK_RE.exec(trimmed);
    if (match) {
      const [, title, url, description] = match;
      if (!title || !url) continue;

      // Skip malformed URLs
      try {
        if (!url.startsWith('https://') && !url.startsWith('http://')) continue;
        const docUrl = DocUrl(url.startsWith('http://') ? url.replace('http://', 'https://') : url);

        if (!currentSection) {
          // Links before any ## header go into an implicit section
          currentSection = { name: 'General', links: [] };
        }

        currentSection.links.push({
          title: title.trim(),
          url: docUrl,
          description: (description ?? '').trim(),
        });
      } catch {
        // Skip URLs that fail DocUrl validation
        continue;
      }
    }
  }

  // Push final section
  if (currentSection) {
    sections.push({ name: currentSection.name, links: currentSection.links });
  }

  return Ok({ siteName, siteDescription, sections });
}
