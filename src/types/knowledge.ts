/**
 * @module types/knowledge
 * Models the documentation topology across Anthropic's surfaces.
 *
 * Three doc surfaces:
 *   code.claude.com   → Claude Code CLI, skills, plugins, hooks
 *   platform.claude.com → Agent SDK, API, MCP, admin
 *   docs.anthropic.com  → Messages API, prompt engineering, models
 *
 * Each surface has an llms.txt entry point (when available) and
 * a known set of documentation sections.
 */

import type { DocUrl } from './core.js';

// ── Documentation Surface ───────────────────────────────────────

export type DocSurface = 'code' | 'platform' | 'docs';

export type DocSource = {
  readonly surface: DocSurface;
  readonly baseUrl: DocUrl;
  readonly llmsTxtUrl: DocUrl | null;
  readonly sections: ReadonlyArray<DocSection>;
};

export type DocSection = {
  readonly slug: string;
  readonly title: string;
  readonly url: DocUrl;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
};

// ── The canonical source registry ───────────────────────────────

export const DOC_SOURCES: ReadonlyArray<DocSource> = [
  {
    surface: 'code',
    baseUrl: 'https://code.claude.com/docs/en' as DocUrl,
    llmsTxtUrl: 'https://code.claude.com/docs/llms.txt' as DocUrl,
    sections: [
      { slug: 'monitoring-usage', title: 'Monitoring & OTel', url: 'https://code.claude.com/docs/en/monitoring-usage' as DocUrl, priority: 'critical' },
      { slug: 'cli-usage', title: 'CLI Reference', url: 'https://code.claude.com/docs/en/cli-usage' as DocUrl, priority: 'high' },
      { slug: 'headless', title: 'Headless / Programmatic', url: 'https://code.claude.com/docs/en/headless' as DocUrl, priority: 'critical' },
      { slug: 'authentication', title: 'Authentication & Secrets', url: 'https://code.claude.com/docs/en/authentication' as DocUrl, priority: 'critical' },
      { slug: 'settings', title: 'Settings & Config', url: 'https://code.claude.com/docs/en/settings' as DocUrl, priority: 'high' },
      { slug: 'mcp', title: 'MCP Servers', url: 'https://code.claude.com/docs/en/mcp' as DocUrl, priority: 'high' },
      { slug: 'sub-agents', title: 'Subagents', url: 'https://code.claude.com/docs/en/sub-agents' as DocUrl, priority: 'high' },
      { slug: 'costs', title: 'Cost Management', url: 'https://code.claude.com/docs/en/costs' as DocUrl, priority: 'high' },
      { slug: 'analytics', title: 'Analytics', url: 'https://code.claude.com/docs/en/analytics' as DocUrl, priority: 'high' },
      { slug: 'changelog', title: 'Changelog', url: 'https://code.claude.com/docs/en/changelog' as DocUrl, priority: 'medium' },
      { slug: 'common-workflows', title: 'Common Workflows', url: 'https://code.claude.com/docs/en/common-workflows' as DocUrl, priority: 'medium' },
      { slug: 'best-practices', title: 'Best Practices', url: 'https://code.claude.com/docs/en/best-practices' as DocUrl, priority: 'high' },
      { slug: 'hooks', title: 'Hooks', url: 'https://code.claude.com/docs/en/hooks' as DocUrl, priority: 'high' },
      { slug: 'server-managed-settings', title: 'Server-Managed Settings', url: 'https://code.claude.com/docs/en/server-managed-settings' as DocUrl, priority: 'medium' },
      { slug: 'statusline', title: 'Status Line', url: 'https://code.claude.com/docs/en/statusline' as DocUrl, priority: 'medium' },
    ],
  },
  {
    surface: 'platform',
    baseUrl: 'https://platform.claude.com/docs/en' as DocUrl,
    llmsTxtUrl: 'https://platform.claude.com/llms.txt' as DocUrl,
    sections: [
      { slug: 'agent-sdk/overview', title: 'Agent SDK Overview', url: 'https://platform.claude.com/docs/en/agent-sdk/overview' as DocUrl, priority: 'critical' },
      { slug: 'agent-sdk/typescript', title: 'TS SDK Reference', url: 'https://platform.claude.com/docs/en/agent-sdk/typescript' as DocUrl, priority: 'critical' },
      { slug: 'agent-sdk/typescript-v2-preview', title: 'TS SDK V2 Preview', url: 'https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview' as DocUrl, priority: 'high' },
      { slug: 'agent-sdk/agent-loop', title: 'Agent Loop', url: 'https://platform.claude.com/docs/en/agent-sdk/agent-loop' as DocUrl, priority: 'critical' },
      { slug: 'agent-sdk/subagents', title: 'Subagents', url: 'https://platform.claude.com/docs/en/agent-sdk/subagents' as DocUrl, priority: 'critical' },
      { slug: 'agent-sdk/skills', title: 'Skills in SDK', url: 'https://platform.claude.com/docs/en/agent-sdk/skills' as DocUrl, priority: 'high' },
      { slug: 'agent-sdk/custom-tools', title: 'Custom Tools', url: 'https://platform.claude.com/docs/en/agent-sdk/custom-tools' as DocUrl, priority: 'high' },
      { slug: 'agent-sdk/hooks', title: 'Hooks in SDK', url: 'https://platform.claude.com/docs/en/agent-sdk/hooks' as DocUrl, priority: 'high' },
      { slug: 'agent-sdk/claude-code-features', title: 'CC Features in SDK', url: 'https://platform.claude.com/docs/en/agent-sdk/claude-code-features' as DocUrl, priority: 'high' },
      { slug: 'agent-sdk/migration-guide', title: 'Migration Guide', url: 'https://platform.claude.com/docs/en/agent-sdk/migration-guide' as DocUrl, priority: 'medium' },
    ],
  },
  {
    surface: 'docs',
    baseUrl: 'https://docs.anthropic.com/en' as DocUrl,
    llmsTxtUrl: null,
    sections: [
      { slug: 'api/claude-code-analytics-api', title: 'Analytics API', url: 'https://docs.anthropic.com/en/api/claude-code-analytics-api' as DocUrl, priority: 'high' },
      { slug: 'api/usage-cost-api', title: 'Usage & Cost API', url: 'https://docs.anthropic.com/en/api/usage-cost-api' as DocUrl, priority: 'high' },
      { slug: 'release-notes/claude-code', title: 'CC Release Notes', url: 'https://docs.anthropic.com/en/release-notes/claude-code' as DocUrl, priority: 'medium' },
    ],
  },
] as const;

// ── GitHub Source Registry ───────────────────────────────────────

export type GitHubRepo = {
  readonly org: string;
  readonly repo: string;
  readonly description: string;
  readonly keyFiles: ReadonlyArray<string>;
};

export const GITHUB_REPOS: ReadonlyArray<GitHubRepo> = [
  {
    org: 'anthropics',
    repo: 'claude-code',
    description: 'Claude Code CLI — the agent loop, tools, hooks, skills, plugins',
    keyFiles: ['CHANGELOG.md', 'README.md', 'package.json'],
  },
  {
    org: 'anthropics',
    repo: 'claude-code-action',
    description: 'GitHub Action for Claude Code in CI/CD',
    keyFiles: ['README.md', 'docs/setup.md', 'action.yml'],
  },
  {
    org: 'anthropics',
    repo: 'claude-code-base-action',
    description: 'Base action mirror for claude-code-action',
    keyFiles: ['README.md'],
  },
  {
    org: 'anthropics',
    repo: 'claude-code-monitoring-guide',
    description: 'OTel + Prometheus monitoring stack for Claude Code',
    keyFiles: ['README.md', 'docker-compose.yml'],
  },
] as const;

// ── Engineering Blog Posts ───────────────────────────────────────

export type EngineeringPost = {
  readonly slug: string;
  readonly title: string;
  readonly url: string;
  readonly patterns: ReadonlyArray<string>;
};

export const ENGINEERING_POSTS: ReadonlyArray<EngineeringPost> = [
  { slug: 'building-effective-agents', title: 'Building Effective Agents', url: 'https://www.anthropic.com/engineering/building-effective-agents', patterns: ['agent-loop', 'orchestrator-workers', 'prompt-chaining'] },
  { slug: 'multi-agent-research-system', title: 'Multi-Agent Research System', url: 'https://www.anthropic.com/engineering/multi-agent-research-system', patterns: ['lead-subagent', 'parallel-search', 'compression'] },
  { slug: 'effective-context-engineering', title: 'Context Engineering for Agents', url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents', patterns: ['compaction', 'progressive-disclosure', 'tool-search'] },
  { slug: 'writing-tools-for-agents', title: 'Writing Tools for Agents', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents', patterns: ['tool-design', 'error-handling', 'response-format'] },
  { slug: 'code-execution-with-mcp', title: 'Code Execution with MCP', url: 'https://www.anthropic.com/engineering/code-execution-with-mcp', patterns: ['typed-tools', 'token-reduction', 'mcp-code-exec'] },
  { slug: 'agent-skills', title: 'Agent Skills', url: 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills', patterns: ['skill-md', 'progressive-loading', 'bundled-resources'] },
  { slug: 'advanced-tool-use', title: 'Advanced Tool Use', url: 'https://www.anthropic.com/engineering/advanced-tool-use', patterns: ['tool-search-tool', 'deferred-loading'] },
  { slug: 'agent-sdk-blog', title: 'Building with Agent SDK', url: 'https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk', patterns: ['query-function', 'v2-sessions', 'subagents'] },
] as const;
