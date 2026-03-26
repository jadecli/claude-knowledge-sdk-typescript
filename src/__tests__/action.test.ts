import { describe, it, expect } from 'vitest';
import {
  buildClaudeArgs,
  expandToolSet,
  mcpServer,
  mcpServerPython,
  promptContext,
  jsonSchema,
  generateWorkflow,
  generatePresetWorkflow,
  generateSecurityReviewWorkflow,
  buildSystemPromptArgs,
  buildBaseActionInputs,
  isValidPluginName,
  isValidMarketplaceUrl,
  PROVIDER_REQUIREMENTS,
} from '../index.js';

describe('buildClaudeArgs', () => {
  it('produces empty string for empty args', () => {
    expect(buildClaudeArgs({})).toBe('');
  });

  it('handles maxTurns', () => {
    expect(buildClaudeArgs({ maxTurns: 10 })).toBe('--max-turns 10');
  });

  it('handles model', () => {
    expect(buildClaudeArgs({ model: 'claude-sonnet-4-6' })).toContain('--model claude-sonnet-4-6');
  });

  it('handles allowedTools as comma-separated quoted string', () => {
    const result = buildClaudeArgs({ allowedTools: ['Edit', 'Read', 'Bash(npm run *)'] });
    expect(result).toBe('--allowedTools "Edit,Read,Bash(npm run *)"');
  });

  it('handles disallowedTools', () => {
    const result = buildClaudeArgs({ disallowedTools: ['WebSearch', 'WebFetch'] });
    expect(result).toBe('--disallowedTools "WebSearch,WebFetch"');
  });

  it('handles systemPrompt with escaping', () => {
    const result = buildClaudeArgs({ systemPrompt: 'Focus on "security"' });
    expect(result).toContain('--system-prompt');
    expect(result).toContain('\\"security\\"');
  });

  it('handles jsonSchema', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const result = buildClaudeArgs({ jsonSchema: schema });
    expect(result).toContain("--json-schema '");
    expect(result).toContain('"type":"object"');
  });

  it('handles mcpConfigs with file paths and inline', () => {
    const result = buildClaudeArgs({
      mcpConfigs: ['/tmp/config.json', { mcpServers: { test: { command: 'npx', args: ['-y', '@example/server'] } } }],
    });
    expect(result).toContain('--mcp-config /tmp/config.json');
    expect(result).toContain("--mcp-config '{");
  });

  it('combines multiple flags with newlines', () => {
    const result = buildClaudeArgs({
      maxTurns: 5,
      model: 'claude-sonnet-4-6',
      allowedTools: ['Edit', 'Read'],
    });
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('--max-turns 5');
    expect(lines[1]).toBe('--model claude-sonnet-4-6');
  });
});

describe('expandToolSet', () => {
  it('expands review-only preset', () => {
    const tools = expandToolSet('review-only');
    expect(tools).toContain('mcp__github_inline_comment__create_inline_comment');
    expect(tools).toContain('Bash(gh pr comment:*)');
  });

  it('expands full-dev preset', () => {
    const tools = expandToolSet('full-dev');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Bash(npm run *)');
    expect(tools).toContain('Bash(git *)');
  });

  it('expands read-only preset', () => {
    const tools = expandToolSet('read-only');
    expect(tools).toEqual(['Read', 'Glob', 'Grep']);
  });

  it('returns custom tools for custom preset', () => {
    const tools = expandToolSet('custom', ['MyTool', 'OtherTool']);
    expect(tools).toEqual(['MyTool', 'OtherTool']);
  });
});

describe('mcpServer', () => {
  it('builds npx-based MCP config', () => {
    const config = mcpServer('thinking', '@modelcontextprotocol/server-sequential-thinking');
    expect(config.mcpServers.thinking.command).toBe('npx');
    expect(config.mcpServers.thinking.args).toEqual(['-y', '@modelcontextprotocol/server-sequential-thinking']);
  });

  it('includes env when provided', () => {
    const config = mcpServer('api', '@example/server', { API_KEY: 'secret' });
    expect(config.mcpServers.api.env).toEqual({ API_KEY: 'secret' });
  });
});

describe('mcpServerPython', () => {
  it('builds uv-based MCP config', () => {
    const config = mcpServerPython('weather', '/path/to/server', 'main.py');
    expect(config.mcpServers.weather.command).toBe('uv');
    expect(config.mcpServers.weather.args).toEqual(['--directory', '/path/to/server', 'run', 'main.py']);
  });
});

describe('promptContext', () => {
  it('builds minimal context', () => {
    const ctx = promptContext({ repo: 'owner/repo' });
    expect(ctx).toBe('REPO: owner/repo');
  });

  it('builds full context', () => {
    const ctx = promptContext({ repo: 'owner/repo', prNumber: 42, title: 'Fix bug', author: 'dev' });
    expect(ctx).toContain('REPO: owner/repo');
    expect(ctx).toContain('PR NUMBER: 42');
    expect(ctx).toContain('TITLE: Fix bug');
    expect(ctx).toContain('AUTHOR: dev');
  });
});

describe('jsonSchema', () => {
  it('builds object schema', () => {
    const schema = jsonSchema({ is_flaky: { type: 'boolean' }, confidence: { type: 'number' } }, ['is_flaky']);
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['is_flaky']);
    expect((schema.properties as Record<string, unknown>).confidence).toEqual({ type: 'number' });
  });
});

describe('generateWorkflow', () => {
  it('generates valid YAML structure for PR review', () => {
    const yaml = generateWorkflow({
      name: 'Test Review',
      triggers: [{ type: 'pull_request' }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
        track_progress: 'true',
      },
    });

    expect(yaml).toContain('name: Test Review');
    expect(yaml).toContain('pull_request:');
    expect(yaml).toContain('types: [opened, synchronize, ready_for_review, reopened]');
    expect(yaml).toContain('contents: read');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('anthropics/claude-code-action@v1');
    expect(yaml).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(yaml).toContain('track_progress: true');
  });

  it('generates tag mode triggers', () => {
    const yaml = generateWorkflow({
      name: 'Claude',
      triggers: [{ type: 'tag' }],
      permissions: { contents: 'write', 'pull-requests': 'write', issues: 'write', 'id-token': 'write' },
      inputs: { claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}' },
    });

    expect(yaml).toContain('issue_comment:');
    expect(yaml).toContain('pull_request_review_comment:');
    expect(yaml).toContain('pull_request_review:');
    expect(yaml).toContain('issues:');
  });

  it('generates schedule triggers', () => {
    const yaml = generateWorkflow({
      name: 'Cron',
      triggers: [{ type: 'schedule', cron: '0 0 * * 0' }, { type: 'workflow_dispatch' }],
      permissions: { contents: 'write' },
      inputs: { claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}' },
    });

    expect(yaml).toContain('schedule:');
    expect(yaml).toContain('"0 0 * * 0"');
    expect(yaml).toContain('workflow_dispatch:');
  });

  it('includes path filters', () => {
    const yaml = generateWorkflow({
      name: 'Paths',
      triggers: [{ type: 'pull_request', paths: ['src/api/**'] }],
      permissions: { contents: 'read' },
      inputs: { claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}' },
    });

    expect(yaml).toContain('paths:');
    expect(yaml).toContain('"src/api/**"');
  });
});

describe('generatePresetWorkflow', () => {
  it('generates tag-interactive preset', () => {
    const yaml = generatePresetWorkflow('tag-interactive');
    expect(yaml).toContain('name: Claude Code');
    expect(yaml).toContain('issue_comment:');
    expect(yaml).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(yaml).toContain('contents: write');
  });

  it('generates pr-review-tracked preset', () => {
    const yaml = generatePresetWorkflow('pr-review-tracked');
    expect(yaml).toContain('track_progress: true');
    expect(yaml).toContain('pull_request:');
  });

  it('generates code-review-plugin preset', () => {
    const yaml = generatePresetWorkflow('code-review-plugin');
    expect(yaml).toContain('code-review@claude-code-plugins');
    expect(yaml).toContain('anthropics/claude-code.git');
    expect(yaml).toContain('/code-review:code-review');
  });

  it('generates scheduled-maintenance preset', () => {
    const yaml = generatePresetWorkflow('scheduled-maintenance');
    expect(yaml).toContain('schedule:');
    expect(yaml).toContain('workflow_dispatch:');
    expect(yaml).toContain('fetch-depth: 0');
  });

  it('allows overriding preset inputs', () => {
    const yaml = generatePresetWorkflow('pr-review', {
      inputs: {
        claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
        track_progress: 'true',
      },
    });
    expect(yaml).toContain('track_progress: true');
  });
});

describe('generateSecurityReviewWorkflow', () => {
  it('generates security review with CLAUDE_CODE_OAUTH_TOKEN', () => {
    const yaml = generateSecurityReviewWorkflow();
    expect(yaml).toContain('claude-code-security-review@main');
    expect(yaml).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(yaml).not.toContain('ANTHROPIC_API_KEY');
    expect(yaml).not.toContain('CLAUDE_API_KEY');
    expect(yaml).toContain('comment-pr');
    expect(yaml).toContain('WARNING: Not hardened');
  });

  it('accepts overrides', () => {
    const yaml = generateSecurityReviewWorkflow({
      'claude-model': 'claude-sonnet-4-6',
      'exclude-directories': 'vendor,dist',
    });
    expect(yaml).toContain('claude-sonnet-4-6');
    expect(yaml).toContain('vendor,dist');
  });
});

describe('buildClaudeArgs extended fields', () => {
  it('handles appendSystemPrompt', () => {
    const result = buildClaudeArgs({ appendSystemPrompt: 'Focus on security' });
    expect(result).toContain('--append-system-prompt');
    expect(result).toContain('Focus on security');
  });

  it('handles fallbackModel', () => {
    const result = buildClaudeArgs({ fallbackModel: 'claude-haiku-4-5' });
    expect(result).toBe('--fallback-model claude-haiku-4-5');
  });

  it('handles resume', () => {
    const result = buildClaudeArgs({ resume: 'session-abc-123' });
    expect(result).toBe('--resume session-abc-123');
  });
});

describe('buildSystemPromptArgs', () => {
  it('returns systemPrompt for override mode', () => {
    const args = buildSystemPromptArgs({ mode: 'override', prompt: 'Custom prompt' });
    expect(args.systemPrompt).toBe('Custom prompt');
    expect(args.appendSystemPrompt).toBeUndefined();
  });

  it('returns appendSystemPrompt for append mode', () => {
    const args = buildSystemPromptArgs({ mode: 'append', appendText: 'Extra instructions' });
    expect(args.appendSystemPrompt).toBe('Extra instructions');
    expect(args.systemPrompt).toBeUndefined();
  });

  it('returns empty object for default mode', () => {
    const args = buildSystemPromptArgs({ mode: 'default' });
    expect(args.systemPrompt).toBeUndefined();
    expect(args.appendSystemPrompt).toBeUndefined();
  });
});

describe('buildBaseActionInputs', () => {
  it('builds minimal base action inputs', () => {
    const inputs = buildBaseActionInputs({
      prompt: 'Do something',
      oauthToken: '${{ secrets.TOKEN }}',
    });
    expect(inputs.claude_code_oauth_token).toBe('${{ secrets.TOKEN }}');
    expect(inputs.prompt).toBe('Do something');
  });

  it('builds with plugins', () => {
    const inputs = buildBaseActionInputs({
      oauthToken: '${{ secrets.TOKEN }}',
      promptFile: '/tmp/prompt.txt',
      plugins: ['code-review@claude-code-plugins', 'security@custom'],
      pluginMarketplaces: ['https://github.com/anthropics/claude-code.git'],
    });
    expect(inputs.prompt_file).toBe('/tmp/prompt.txt');
    expect(inputs.plugins).toBe('code-review@claude-code-plugins\nsecurity@custom');
    expect(inputs.plugin_marketplaces).toBe('https://github.com/anthropics/claude-code.git');
  });
});

describe('isValidPluginName', () => {
  it('accepts valid plugin names', () => {
    expect(isValidPluginName('code-review@claude-code-plugins')).toBe(true);
    expect(isValidPluginName('@anthropic/plugin')).toBe(true);
    expect(isValidPluginName('simple_plugin')).toBe(true);
  });

  it('rejects invalid plugin names', () => {
    expect(isValidPluginName('plugin with spaces')).toBe(false);
    expect(isValidPluginName('../path-traversal')).toBe(false);
    expect(isValidPluginName('')).toBe(false);
  });
});

describe('isValidMarketplaceUrl', () => {
  it('accepts valid marketplace URLs', () => {
    expect(isValidMarketplaceUrl('https://github.com/anthropics/claude-code.git')).toBe(true);
  });

  it('rejects non-HTTPS URLs', () => {
    expect(isValidMarketplaceUrl('http://github.com/repo.git')).toBe(false);
  });

  it('rejects URLs not ending in .git', () => {
    expect(isValidMarketplaceUrl('https://github.com/repo')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isValidMarketplaceUrl('not a url')).toBe(false);
  });
});

describe('PROVIDER_REQUIREMENTS', () => {
  it('has 4 providers', () => {
    expect(PROVIDER_REQUIREMENTS).toHaveLength(4);
    const names = PROVIDER_REQUIREMENTS.map((p) => p.provider);
    expect(names).toContain('anthropic');
    expect(names).toContain('bedrock');
    expect(names).toContain('vertex');
    expect(names).toContain('foundry');
  });

  it('bedrock requires AWS_REGION', () => {
    const bedrock = PROVIDER_REQUIREMENTS.find((p) => p.provider === 'bedrock');
    expect(bedrock?.requiredEnvVars).toContain('AWS_REGION');
  });
});

describe('base-action preset', () => {
  it('generates base-action workflow with correct action ref', () => {
    const yaml = generatePresetWorkflow('base-action');
    expect(yaml).toContain('claude-code-base-action@beta');
    expect(yaml).toContain('workflow_dispatch:');
    expect(yaml).toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });
});
