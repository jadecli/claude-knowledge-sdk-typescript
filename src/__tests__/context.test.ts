import { describe, it, expect } from 'vitest';
import {
  calculateBudget,
  selectCompactionStrategy,
  createToolManifest,
  formatMemoryForContext,
  CONTEXT_PRESETS,
} from '../index.js';

describe('calculateBudget', () => {
  it('computes remaining tokens correctly', () => {
    const budget = calculateBudget(200_000, 5_000, 10_000, 50_000);
    expect(budget.remainingTokens).toBe(135_000);
    expect(budget.maxTokens).toBe(200_000);
    expect(budget.systemPromptTokens).toBe(5_000);
    expect(budget.toolDefinitionTokens).toBe(10_000);
    expect(budget.conversationTokens).toBe(50_000);
  });

  it('clamps remaining to zero when over budget', () => {
    const budget = calculateBudget(100, 50, 30, 30);
    expect(budget.remainingTokens).toBe(0);
  });

  it('computes usageRatio correctly', () => {
    const budget = calculateBudget(100_000, 10_000, 10_000, 50_000);
    // remaining = 30_000, ratio = 1 - 30_000/100_000 = 0.7
    expect(budget.usageRatio).toBeCloseTo(0.7, 5);
  });

  it('handles zero maxTokens', () => {
    const budget = calculateBudget(0, 0, 0, 0);
    expect(budget.remainingTokens).toBe(0);
    // 0/0 = NaN, so usageRatio is NaN — this is an edge case
    expect(budget.usageRatio).toBeNaN();
  });

  it('handles all tokens consumed', () => {
    const budget = calculateBudget(1000, 500, 300, 200);
    expect(budget.remainingTokens).toBe(0);
    expect(budget.usageRatio).toBeCloseTo(1.0, 5);
  });
});

describe('selectCompactionStrategy', () => {
  it('returns tool_result_clearing below 0.7 usage', () => {
    const budget = calculateBudget(100_000, 5_000, 5_000, 20_000); // ratio = 0.3
    const strategy = selectCompactionStrategy(budget);
    expect(strategy.type).toBe('tool_result_clearing');
    if (strategy.type === 'tool_result_clearing') {
      expect(strategy.keepRecent).toBe(5);
    }
  });

  it('returns conversation_summary between 0.7 and 0.9', () => {
    const budget = calculateBudget(100_000, 10_000, 10_000, 60_000); // ratio = 0.8
    const strategy = selectCompactionStrategy(budget);
    expect(strategy.type).toBe('conversation_summary');
    if (strategy.type === 'conversation_summary') {
      expect(strategy.preservePatterns).toContain('architectural_decision');
      expect(strategy.preservePatterns).toContain('unresolved_bug');
    }
  });

  it('returns sub_agent_delegation at 0.9+', () => {
    const budget = calculateBudget(100_000, 10_000, 10_000, 75_000); // ratio = 0.95
    const strategy = selectCompactionStrategy(budget);
    expect(strategy.type).toBe('sub_agent_delegation');
  });

  it('returns tool_result_clearing at exactly 0.7 boundary', () => {
    // ratio = 1 - 30000/100000 = 0.7 — NOT less than 0.7, so should be conversation_summary
    const budget = calculateBudget(100_000, 10_000, 10_000, 50_000);
    expect(budget.usageRatio).toBeCloseTo(0.7, 5);
    const strategy = selectCompactionStrategy(budget);
    expect(strategy.type).toBe('conversation_summary');
  });

  it('returns sub_agent_delegation at exactly 0.9 boundary', () => {
    const budget = calculateBudget(100_000, 10_000, 10_000, 70_000); // ratio = 0.9
    const strategy = selectCompactionStrategy(budget);
    expect(strategy.type).toBe('sub_agent_delegation');
  });
});

describe('createToolManifest', () => {
  const tools = [
    {
      name: 'Read',
      briefDescription: 'Read files',
      fullSchema: { type: 'object', properties: { file_path: { type: 'string' } } },
      alwaysLoad: true,
    },
    {
      name: 'WebSearch',
      briefDescription: 'Search the web',
      fullSchema: { type: 'object', properties: { query: { type: 'string' }, domains: { type: 'array' } } },
      alwaysLoad: false,
    },
    {
      name: 'WebFetch',
      briefDescription: 'Fetch a URL',
      fullSchema: { type: 'object', properties: { url: { type: 'string' }, raw: { type: 'boolean' } } },
      alwaysLoad: false,
    },
  ];

  it('separates always-loaded from deferred tools', () => {
    const manifest = createToolManifest(tools);
    expect(manifest.alwaysLoaded).toHaveLength(1);
    expect(manifest.deferred).toHaveLength(2);
  });

  it('deferred entries have name and description only', () => {
    const manifest = createToolManifest(tools);
    const webSearch = manifest.deferred.find((d) => d.name === 'WebSearch');
    expect(webSearch).toBeDefined();
    expect(webSearch?.description).toBe('Search the web');
    expect(Object.keys(webSearch!)).toEqual(['name', 'description']);
  });

  it('computes positive token savings', () => {
    const manifest = createToolManifest(tools);
    expect(manifest.tokenSavings).toBeGreaterThan(0);
  });

  it('returns zero savings when all tools are always-loaded', () => {
    const allLoaded = tools.map((t) => ({ ...t, alwaysLoad: true }));
    const manifest = createToolManifest(allLoaded);
    expect(manifest.deferred).toHaveLength(0);
    expect(manifest.tokenSavings).toBe(0);
  });

  it('handles empty tools array', () => {
    const manifest = createToolManifest([]);
    expect(manifest.alwaysLoaded).toHaveLength(0);
    expect(manifest.deferred).toHaveLength(0);
    expect(manifest.tokenSavings).toBe(0);
  });
});

describe('formatMemoryForContext', () => {
  const entries = [
    {
      timestamp: '2026-03-26T10:00:00Z',
      category: 'todo' as const,
      content: 'Fix the auth bug',
      source: 'PR #42',
      confidence: 0.8,
    },
    {
      timestamp: '2026-03-26T09:00:00Z',
      category: 'key_finding' as const,
      content: 'API rate limit is 100/min',
      source: 'docs',
      confidence: 0.95,
    },
    {
      timestamp: '2026-03-26T08:00:00Z',
      category: 'unresolved_bug' as const,
      content: 'Memory leak in agent loop',
      source: 'profiler',
      confidence: 0.7,
    },
    {
      timestamp: '2026-03-26T07:00:00Z',
      category: 'architectural_decision' as const,
      content: 'Use Result<T,E> everywhere',
      source: 'design doc',
      confidence: 1.0,
    },
  ];

  it('sorts by priority — key_finding first, todo last', () => {
    const output = formatMemoryForContext(entries, 10000);
    const keyFindingIdx = output.indexOf('key_finding');
    const todoIdx = output.indexOf('todo');
    expect(keyFindingIdx).toBeLessThan(todoIdx);
  });

  it('includes category, content, source, and confidence', () => {
    const output = formatMemoryForContext(entries, 10000);
    expect(output).toContain('key_finding');
    expect(output).toContain('API rate limit is 100/min');
    expect(output).toContain('docs');
    expect(output).toContain('0.95');
  });

  it('starts with Agent Memory header', () => {
    const output = formatMemoryForContext(entries, 10000);
    expect(output.startsWith('## Agent Memory')).toBe(true);
  });

  it('respects maxTokens budget — truncates entries', () => {
    // Very low budget — should only include header + maybe 1 entry
    const output = formatMemoryForContext(entries, 30);
    const entryCount = (output.match(/\*\*\[/g) ?? []).length;
    expect(entryCount).toBeLessThan(entries.length);
  });

  it('handles empty entries array', () => {
    const output = formatMemoryForContext([], 10000);
    expect(output).toBe('## Agent Memory\n\n');
  });

  it('handles zero maxTokens', () => {
    const output = formatMemoryForContext(entries, 0);
    // Only header, no entries (header takes ~10 tokens which exceeds 0)
    expect(output).toBe('## Agent Memory\n\n');
  });
});

describe('CONTEXT_PRESETS', () => {
  it('has standard, extended, and conservative presets', () => {
    expect(CONTEXT_PRESETS.standard.maxTokens).toBe(200_000);
    expect(CONTEXT_PRESETS.extended.maxTokens).toBe(1_000_000);
    expect(CONTEXT_PRESETS.conservative.maxTokens).toBe(200_000);
  });

  it('extended has larger output reserve than standard', () => {
    expect(CONTEXT_PRESETS.extended.outputReserve).toBeGreaterThan(CONTEXT_PRESETS.standard.outputReserve);
  });
});
