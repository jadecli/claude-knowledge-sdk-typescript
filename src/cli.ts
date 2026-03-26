#!/usr/bin/env node
/**
 * @module cli
 * CLI for the Claude Knowledge SDK.
 *
 * Commands:
 *   fetch-docs   — Fetch and index Anthropic documentation
 *   research     — Run the recursive research loop
 *   otel-setup   — Generate OTel configuration
 *   otel-compose — Generate Docker Compose for monitoring
 *   search       — Search the knowledge index
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  fetchAllKnowledge, saveKnowledgeIndex, loadKnowledgeIndex,
} from './knowledge/fetcher.js';
import { generateOtelShellScript, generateDockerCompose } from './monitoring/telemetry.js';
import type { OtelBackend, OtelConfig } from './monitoring/telemetry.js';

const KNOWLEDGE_DIR = join(homedir(), '.claude', 'knowledge');

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'fetch-docs':
      await cmdFetchDocs(args);
      break;

    case 'search':
      await cmdSearch(args);
      break;

    case 'otel-setup':
      await cmdOtelSetup(args);
      break;

    case 'otel-compose':
      await cmdOtelCompose(args);
      break;

    case 'research':
      await cmdResearch(args);
      break;

    default:
      printUsage();
  }
}

// ── fetch-docs ──────────────────────────────────────────────────

async function cmdFetchDocs(args: string[]): Promise<void> {
  const priorityFlag = args.find(a => a.startsWith('--priority='))?.split('=')[1]
    ?? args[args.indexOf('--priority') + 1];

  const priorityFilter = priorityFlag === 'critical' ? 'critical' as const
    : priorityFlag === 'high' ? 'high' as const
    : undefined;

  console.log(`Fetching docs${priorityFilter ? ` (${priorityFilter} priority)` : ' (all)'}...`);

  const result = await fetchAllKnowledge(
    (progress) => {
      process.stdout.write(`\r  [${progress.completed}/${progress.total}] ${progress.current}`.padEnd(80));
    },
    { priorityFilter },
  );

  if (!result.ok) {
    console.error('\nFetch failed:', result.error.message);
    process.exit(1);
  }

  const index = result.value;
  console.log(`\nFetched ${index.entries.length} entries (~${index.totalTokens.toLocaleString()} tokens)`);

  if (result.ok) {
    const saveResult = await saveKnowledgeIndex(index, KNOWLEDGE_DIR);
    if (saveResult.ok) {
      console.log(`Saved to ${saveResult.value}`);
    } else {
      console.error('Failed to save:', saveResult.error.message);
    }
  }
}

// ── search ──────────────────────────────────────────────────────

async function cmdSearch(args: string[]): Promise<void> {
  const query = args.join(' ');
  if (!query) {
    console.error('Usage: ck search <query>');
    process.exit(1);
  }

  const loadResult = await loadKnowledgeIndex(KNOWLEDGE_DIR);
  if (!loadResult.ok) {
    console.error('No knowledge index found. Run `ck fetch-docs` first.');
    process.exit(1);
  }

  const index = loadResult.value;
  const queryLower = query.toLowerCase();

  const matches = index.entries
    .filter(e =>
      e.title.toLowerCase().includes(queryLower) ||
      e.content.toLowerCase().includes(queryLower),
    )
    .slice(0, 5);

  if (matches.length === 0) {
    console.log('No matches found.');
    return;
  }

  for (const entry of matches) {
    console.log(`\n── ${entry.title} ──`);
    console.log(`   Source: ${entry.url}`);
    console.log(`   Tokens: ~${entry.tokenEstimate.toLocaleString()}`);
    // Show first 200 chars of content
    const preview = entry.content.slice(0, 200).replace(/\n/g, ' ');
    console.log(`   Preview: ${preview}...`);
  }
}

// ── otel-setup ──────────────────────────────────────────────────

async function cmdOtelSetup(args: string[]): Promise<void> {
  const backendFlag = args.find(a => a.startsWith('--backend='))?.split('=')[1]
    ?? args[args.indexOf('--backend') + 1]
    ?? 'prometheus';

  const endpointFlag = args.find(a => a.startsWith('--endpoint='))?.split('=')[1]
    ?? args[args.indexOf('--endpoint') + 1]
    ?? 'http://localhost:4317';

  const config: OtelConfig = {
    backend: backendFlag as OtelBackend,
    endpoint: endpointFlag,
    protocol: 'grpc',
    exportIntervalMs: 60_000,
    logPrompts: false,
    logToolDetails: true,
    includeSessionId: true,
  };

  const script = generateOtelShellScript(config);
  const outPath = './claude-otel-env.sh';
  await writeFile(outPath, script);
  console.log(`Generated ${outPath}`);
  console.log('Run: source ./claude-otel-env.sh');
}

// ── otel-compose ────────────────────────────────────────────────

async function cmdOtelCompose(args: string[]): Promise<void> {
  const backendFlag = args.find(a => a.startsWith('--backend='))?.split('=')[1]
    ?? args[args.indexOf('--backend') + 1]
    ?? 'prometheus';

  const compose = generateDockerCompose(backendFlag as OtelBackend);
  const outPath = './docker-compose.claude-otel.yml';
  await writeFile(outPath, compose);
  console.log(`Generated ${outPath}`);
  console.log(`Run: docker compose -f ${outPath} up -d`);
}

// ── research ────────────────────────────────────────────────────

async function cmdResearch(args: string[]): Promise<void> {
  const query = args.join(' ');
  if (!query) {
    console.error('Usage: ck research "<query>"');
    console.error('Example: ck research "how does Claude Code compaction work"');
    process.exit(1);
  }

  console.log('Starting recursive research loop...');
  console.log('(Requires @anthropic-ai/claude-agent-sdk and ANTHROPIC_API_KEY)\n');

  try {
    const { recursiveResearch } = await import('./agent/orchestrator.js');
    const result = await recursiveResearch(query, 3);

    if (!result.ok) {
      console.error('Research failed:', result.error.message);
      process.exit(1);
    }

    const { finalOutput, rounds } = result.value;
    console.log(`\nCompleted ${rounds.length} round(s):\n`);
    for (const round of rounds) {
      console.log(`  Round ${round.round}: ${round.gaps.length} gaps, ~$${round.usage.cost.toFixed(4)}`);
    }
    console.log('\n' + '='.repeat(60) + '\n');
    console.log(finalOutput);
  } catch (err) {
    console.error('Failed to import Agent SDK. Install it with:');
    console.error('  npm install @anthropic-ai/claude-agent-sdk');
    if (err instanceof Error) console.error(err.message);
  }
}

// ── usage ───────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
@jadecli/claude-knowledge-sdk — Distilled Claude Code + Agent SDK knowledge

Commands:
  fetch-docs [--priority critical|high]    Fetch & index Anthropic docs
  search <query>                           Search the knowledge index
  research "<query>"                       Run recursive research loop
  otel-setup [--backend prometheus] [--endpoint url]  Generate OTel env vars
  otel-compose [--backend prometheus]      Generate Docker Compose

Examples:
  ck fetch-docs --priority critical
  ck search "otel logs exporter"
  ck research "how does Claude Code handle context compaction"
  ck otel-setup --backend prometheus --endpoint http://localhost:4317
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
