#!/usr/bin/env npx tsx
/**
 * Standalone llms.txt parser script.
 * Usage: npx tsx parse-llms-txt.ts <url-or-file-path>
 *
 * Outputs structured JSON to stdout.
 */

import { readFile } from 'node:fs/promises';
import { parseLlmsTxt } from '../../../src/knowledge/llms-txt-parser.js';

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    process.stderr.write('Usage: npx tsx parse-llms-txt.ts <url-or-file-path>\n');
    process.exit(1);
  }

  let raw: string;

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const response = await fetch(input, {
      headers: {
        'User-Agent': 'ClaudeBot/1.0 (+https://claude.ai/bot; Anthropic)',
        Accept: 'text/plain, text/markdown',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      process.stderr.write(`HTTP ${response.status}: ${response.statusText}\n`);
      process.exit(1);
    }
    raw = await response.text();
  } else {
    raw = await readFile(input, 'utf-8');
  }

  const result = parseLlmsTxt(raw);
  if (!result.ok) {
    process.stderr.write(`Parse error: ${result.error.message}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result.value, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
