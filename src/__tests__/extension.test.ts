import { describe, it, expect } from 'vitest';
import {
  buildManifest,
  ManifestBuilder,
  DEFAULT_HARNESS_CONFIG,
  RESEARCH_SCALING_TIERS,
  MEASURED_TOKEN_REDUCTIONS,
} from '../index.js';

describe('buildManifest', () => {
  it('builds a minimal Node.js manifest', () => {
    const manifest = buildManifest({
      name: 'test-ext',
      version: '1.0.0',
      description: 'Test extension',
      authorName: 'Dev',
      serverType: 'node',
      entryPoint: 'server/index.js',
    });

    expect(manifest.mcpb_version).toBe('0.1');
    expect(manifest.name).toBe('test-ext');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.author.name).toBe('Dev');
    expect(manifest.server.type).toBe('node');
    expect(manifest.server.entry_point).toBe('server/index.js');
    expect(manifest.server.mcp_config.command).toBe('node');
    expect(manifest.server.mcp_config.args).toEqual(['${__dirname}/server/index.js']);
  });

  it('builds a Python manifest', () => {
    const manifest = buildManifest({
      name: 'py-ext',
      version: '0.1.0',
      description: 'Python extension',
      authorName: 'Dev',
      serverType: 'python',
      entryPoint: 'server/main.py',
    });

    expect(manifest.server.type).toBe('python');
    expect(manifest.server.mcp_config.command).toBe('python');
  });

  it('includes env when provided', () => {
    const manifest = buildManifest({
      name: 'env-ext',
      version: '1.0.0',
      description: 'With env',
      authorName: 'Dev',
      serverType: 'node',
      entryPoint: 'server/index.js',
      env: { API_KEY: '${user_config.api_key}' },
    });

    expect(manifest.server.mcp_config.env).toEqual({ API_KEY: '${user_config.api_key}' });
  });
});

describe('ManifestBuilder', () => {
  it('builds a complex manifest with fluent API', () => {
    const manifest = new ManifestBuilder({
      name: 'complex-ext',
      version: '2.0.0',
      description: 'Complex extension',
      authorName: 'Author',
      authorEmail: 'author@example.com',
      serverType: 'node',
      entryPoint: 'server/index.js',
    })
      .displayName('Complex Extension')
      .repository('https://github.com/example/complex-ext')
      .license('MIT')
      .keywords('api', 'automation')
      .tool('search', 'Search for items')
      .tool('create', 'Create a new item')
      .prompt('analyze', 'Analyze data', ['file_path'], 'Analyze: ${arguments.file_path}')
      .apiKeyConfig('api_key', 'API Key', 'Your API key')
      .directoryConfig('dirs', 'Directories', 'Allowed dirs', ['${HOME}/Documents'])
      .compatibility({ claude_desktop: '>=1.0.0', platforms: ['darwin', 'win32'] })
      .platformOverride('win32', { command: 'node.exe' })
      .build();

    expect(manifest.display_name).toBe('Complex Extension');
    expect(manifest.repository?.url).toBe('https://github.com/example/complex-ext');
    expect(manifest.license).toBe('MIT');
    expect(manifest.keywords).toEqual(['api', 'automation']);
    expect(manifest.tools).toHaveLength(2);
    expect(manifest.tools?.[0]?.name).toBe('search');
    expect(manifest.prompts).toHaveLength(1);
    expect(manifest.prompts?.[0]?.text).toContain('${arguments.file_path}');
    expect(manifest.user_config?.api_key).toBeDefined();
    expect((manifest.user_config?.api_key as { sensitive?: boolean })?.sensitive).toBe(true);
    expect(manifest.user_config?.dirs).toBeDefined();
    expect(manifest.compatibility?.platforms).toContain('darwin');
    expect(manifest.server.mcp_config.platforms?.win32?.command).toBe('node.exe');
  });

  it('serializes to valid JSON', () => {
    const builder = new ManifestBuilder({
      name: 'json-test',
      version: '1.0.0',
      description: 'JSON test',
      authorName: 'Dev',
      serverType: 'node',
      entryPoint: 'server/index.js',
    });

    const json = builder.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.mcpb_version).toBe('0.1');
    expect(parsed.name).toBe('json-test');
  });
});

describe('harness constants', () => {
  it('DEFAULT_HARNESS_CONFIG has sane defaults', () => {
    expect(DEFAULT_HARNESS_CONFIG.timeoutMinutes).toBe(20);
    expect(DEFAULT_HARNESS_CONFIG.errorStrategy).toBe('retry_then_fail');
    expect(DEFAULT_HARNESS_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_HARNESS_CONFIG.preserveSession).toBe(true);
  });

  it('RESEARCH_SCALING_TIERS has 4 tiers', () => {
    expect(RESEARCH_SCALING_TIERS).toHaveLength(4);
    expect(RESEARCH_SCALING_TIERS[0]?.name).toBe('simple_lookup');
    expect(RESEARCH_SCALING_TIERS[3]?.name).toBe('comprehensive_survey');
    // Deep research uses 5 agents
    const deepResearch = RESEARCH_SCALING_TIERS.find((t) => t.name === 'deep_research');
    expect(deepResearch?.agentCount).toBe(5);
    expect(deepResearch?.subagentModel).toBe('sonnet');
  });

  it('MEASURED_TOKEN_REDUCTIONS documents actual measurements', () => {
    expect(MEASURED_TOKEN_REDUCTIONS).toHaveLength(3);
    const toolSearch = MEASURED_TOKEN_REDUCTIONS.find((m) => m.technique === 'tool_token_efficiency');
    expect(toolSearch?.reductionPercent).toBe(85);
  });
});
