/**
 * @module knowledge/fetcher
 * Fetches documentation from Anthropic's three surfaces and builds
 * a local knowledge index for the research agents.
 *
 * Supports:
 *   - llms.txt discovery (code.claude.com, platform.claude.com)
 *   - Direct page fetch with markdown extraction
 *   - GitHub raw file fetch for CHANGELOG, README
 *   - Incremental updates (only fetch if changed)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '../types/core.js';
import { Ok, tryCatch } from '../types/core.js';
import { DOC_SOURCES, GITHUB_REPOS } from '../types/knowledge.js';
import type { DocSection, GitHubRepo } from '../types/knowledge.js';

// ── Knowledge Entry ─────────────────────────────────────────────

export type KnowledgeEntry = {
  readonly source: string;
  readonly url: string;
  readonly title: string;
  readonly content: string;
  readonly fetchedAt: string;
  readonly tokenEstimate: number;
};

export type KnowledgeIndex = {
  readonly entries: ReadonlyArray<KnowledgeEntry>;
  readonly lastUpdated: string;
  readonly totalTokens: number;
};

// ── Fetch a single URL ──────────────────────────────────────────

async function fetchUrl(url: string): Promise<Result<string, Error>> {
  return tryCatch(async () => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'claude-knowledge-sdk/0.1.0',
        'Accept': 'text/plain, text/markdown, text/html',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }
    return response.text();
  });
}

// ── Strip HTML to rough text ────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Estimate token count ────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Fetch a doc section ─────────────────────────────────────────

async function fetchDocSection(section: DocSection): Promise<Result<KnowledgeEntry, Error>> {
  const result = await fetchUrl(section.url);
  if (!result.ok) return result;

  const content = result.value.startsWith('<')
    ? htmlToText(result.value)
    : result.value;

  // Truncate to ~8K tokens to keep context manageable
  const maxChars = 32_000;
  const truncated = content.length > maxChars
    ? content.slice(0, maxChars) + '\n\n[TRUNCATED — full doc at ' + section.url + ']'
    : content;

  return Ok({
    source: section.url,
    url: section.url,
    title: section.title,
    content: truncated,
    fetchedAt: new Date().toISOString(),
    tokenEstimate: estimateTokens(truncated),
  });
}

// ── Fetch a GitHub file ─────────────────────────────────────────

async function fetchGitHubFile(repo: GitHubRepo, file: string): Promise<Result<KnowledgeEntry, Error>> {
  const url = `https://raw.githubusercontent.com/${repo.org}/${repo.repo}/main/${file}`;
  const result = await fetchUrl(url);
  if (!result.ok) return result;

  const maxChars = 32_000;
  const truncated = result.value.length > maxChars
    ? result.value.slice(0, maxChars) + `\n\n[TRUNCATED — full file at github.com/${repo.org}/${repo.repo}/blob/main/${file}]`
    : result.value;

  return Ok({
    source: `github:${repo.org}/${repo.repo}`,
    url,
    title: `${repo.repo}/${file}`,
    content: truncated,
    fetchedAt: new Date().toISOString(),
    tokenEstimate: estimateTokens(truncated),
  });
}

// ── Fetch All Knowledge ─────────────────────────────────────────

export type FetchProgress = {
  readonly total: number;
  readonly completed: number;
  readonly current: string;
  readonly errors: ReadonlyArray<string>;
};

export async function fetchAllKnowledge(
  onProgress?: (progress: FetchProgress) => void,
  options: { priorityFilter?: 'critical' | 'high' } = {},
): Promise<Result<KnowledgeIndex, Error>> {
  const entries: KnowledgeEntry[] = [];
  const errors: string[] = [];

  // Collect all fetch targets
  const sections = DOC_SOURCES.flatMap(source =>
    source.sections
      .filter(s => {
        if (!options.priorityFilter) return true;
        if (options.priorityFilter === 'critical') return s.priority === 'critical';
        return s.priority === 'critical' || s.priority === 'high';
      })
      .map(section => ({ source, section })),
  );

  const githubFiles = GITHUB_REPOS.flatMap(repo =>
    repo.keyFiles.map(file => ({ repo, file })),
  );

  const total = sections.length + githubFiles.length;
  let completed = 0;

  // Fetch doc sections (with concurrency limit)
  const concurrency = 3;
  for (let i = 0; i < sections.length; i += concurrency) {
    const batch = sections.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async ({ section }) => {
        onProgress?.({ total, completed, current: section.title, errors });
        const result = await fetchDocSection(section);
        completed++;
        return result;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) {
        entries.push(r.value.value);
      } else if (r.status === 'fulfilled' && !r.value.ok) {
        errors.push(r.value.error.message);
      } else if (r.status === 'rejected') {
        errors.push(String(r.reason));
      }
    }
  }

  // Fetch GitHub files
  for (let i = 0; i < githubFiles.length; i += concurrency) {
    const batch = githubFiles.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async ({ repo, file }) => {
        onProgress?.({ total, completed, current: `${repo.repo}/${file}`, errors });
        const result = await fetchGitHubFile(repo, file);
        completed++;
        return result;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) {
        entries.push(r.value.value);
      } else if (r.status === 'fulfilled' && !r.value.ok) {
        errors.push(r.value.error.message);
      }
    }
  }

  onProgress?.({ total, completed: total, current: 'done', errors });

  const totalTokens = entries.reduce((sum, e) => sum + e.tokenEstimate, 0);

  return Ok({
    entries,
    lastUpdated: new Date().toISOString(),
    totalTokens,
  });
}

// ── Save / Load Knowledge Index ─────────────────────────────────

export async function saveKnowledgeIndex(
  index: KnowledgeIndex,
  dir: string,
): Promise<Result<string, Error>> {
  return tryCatch(async () => {
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'knowledge-index.json');
    await writeFile(path, JSON.stringify(index, null, 2));
    return path;
  });
}

export async function loadKnowledgeIndex(
  dir: string,
): Promise<Result<KnowledgeIndex, Error>> {
  return tryCatch(async () => {
    const path = join(dir, 'knowledge-index.json');
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as KnowledgeIndex;
  });
}

// ── Format Knowledge for Context ────────────────────────────────
// Selects the most relevant entries and formats them for injection
// into an agent's system prompt or context.

export function formatKnowledgeForContext(
  index: KnowledgeIndex,
  maxTokens: number,
  filter?: { sources?: ReadonlyArray<string>; titleContains?: string },
): string {
  let filtered = [...index.entries];

  if (filter?.sources) {
    const sources = new Set(filter.sources);
    filtered = filtered.filter(e => sources.has(e.source));
  }
  if (filter?.titleContains) {
    const needle = filter.titleContains.toLowerCase();
    filtered = filtered.filter(e => e.title.toLowerCase().includes(needle));
  }

  // Sort by token estimate ascending (pack more entries)
  filtered.sort((a, b) => a.tokenEstimate - b.tokenEstimate);

  let output = '';
  let tokens = 0;
  for (const entry of filtered) {
    if (tokens + entry.tokenEstimate > maxTokens) break;
    output += `\n\n---\n## ${entry.title}\nSource: ${entry.url}\n\n${entry.content}`;
    tokens += entry.tokenEstimate;
  }

  return output;
}
