/**
 * @module action/workflow
 * GitHub Actions workflow YAML generator for claude-code-action@v1.
 *
 * Generates complete workflow files from structured config, following
 * the patterns documented in claude-code-action/docs/solutions.md.
 */

import type {
  ActionInputs,
  WorkflowPermissions,
  WorkflowPreset,
  PullRequestActivityType,
  IssueActivityType,
  SecurityReviewInputs,
} from '../types/action.js';
import { buildClaudeArgs, expandToolSet } from './directives.js';

// ── Workflow config types ──────────────────────────────────────

export type WorkflowTrigger =
  | { readonly type: 'tag'; readonly triggerPhrase?: string }
  | {
      readonly type: 'pull_request';
      readonly activityTypes?: ReadonlyArray<PullRequestActivityType>;
      readonly paths?: ReadonlyArray<string>;
    }
  | { readonly type: 'issues'; readonly activityTypes?: ReadonlyArray<IssueActivityType> }
  | { readonly type: 'schedule'; readonly cron: string }
  | { readonly type: 'workflow_dispatch' };

export type WorkflowConfig = {
  readonly name: string;
  readonly triggers: ReadonlyArray<WorkflowTrigger>;
  readonly permissions: WorkflowPermissions;
  readonly inputs: ActionInputs;
  readonly jobName?: string;
  readonly ifCondition?: string;
  readonly fetchDepth?: number;
  readonly checkoutRef?: string;
  /** Action reference (default: "anthropics/claude-code-action@v1") */
  readonly actionRef?: string;
};

// ── YAML builder (no deps, just strings) ───────────────────────

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${prefix}${line}`))
    .join('\n');
}

function yamlString(value: string): string {
  if (value.includes('\n') || value.includes("'") || value.includes('"')) {
    return `|\n${indent(value, 2)}`;
  }
  if (value.includes(':') || value.includes('#') || value.includes('{')) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

// ── Trigger YAML ───────────────────────────────────────────────

function renderTriggers(triggers: ReadonlyArray<WorkflowTrigger>): string {
  const lines: string[] = ['on:'];

  for (const trigger of triggers) {
    switch (trigger.type) {
      case 'tag':
        lines.push('  issue_comment:');
        lines.push('    types: [created]');
        lines.push('  pull_request_review_comment:');
        lines.push('    types: [created]');
        lines.push('  pull_request_review:');
        lines.push('    types: [submitted]');
        lines.push('  issues:');
        lines.push('    types: [opened, assigned]');
        break;
      case 'pull_request': {
        lines.push('  pull_request:');
        const types = trigger.activityTypes ?? ['opened', 'synchronize', 'ready_for_review', 'reopened'];
        lines.push(`    types: [${types.join(', ')}]`);
        if (trigger.paths !== undefined && trigger.paths.length > 0) {
          lines.push('    paths:');
          for (const p of trigger.paths) {
            lines.push(`      - "${p}"`);
          }
        }
        break;
      }
      case 'issues': {
        lines.push('  issues:');
        const types = trigger.activityTypes ?? ['opened'];
        lines.push(`    types: [${types.join(', ')}]`);
        break;
      }
      case 'schedule':
        lines.push('  schedule:');
        lines.push(`    - cron: "${trigger.cron}"`);
        break;
      case 'workflow_dispatch':
        lines.push('  workflow_dispatch:');
        break;
    }
  }

  return lines.join('\n');
}

// ── Permissions YAML ───────────────────────────────────────────

function renderPermissions(perms: WorkflowPermissions, indentLevel: number): string {
  const lines: string[] = [];
  const entries = Object.entries(perms) as Array<[string, string]>;
  for (const [key, value] of entries) {
    lines.push(`${' '.repeat(indentLevel)}${key}: ${value}`);
  }
  return lines.join('\n');
}

// ── Action step YAML ───────────────────────────────────────────

function renderActionInputs(inputs: ActionInputs, indentLevel: number): string {
  const lines: string[] = [];
  const prefix = ' '.repeat(indentLevel);

  // Auth — always first
  if ('claude_code_oauth_token' in inputs && inputs.claude_code_oauth_token) {
    lines.push(`${prefix}claude_code_oauth_token: ${inputs.claude_code_oauth_token}`);
  }
  if ('anthropic_api_key' in inputs && inputs.anthropic_api_key) {
    lines.push(`${prefix}anthropic_api_key: ${inputs.anthropic_api_key}`);
  }

  // Core inputs in order of importance
  const stringFields: Array<[keyof ActionInputs, string]> = [
    ['prompt', 'prompt'],
    ['claude_args', 'claude_args'],
    ['settings', 'settings'],
    ['track_progress', 'track_progress'],
    ['trigger_phrase', 'trigger_phrase'],
    ['assignee_trigger', 'assignee_trigger'],
    ['label_trigger', 'label_trigger'],
    ['additional_permissions', 'additional_permissions'],
    ['allowed_bots', 'allowed_bots'],
    ['plugin_marketplaces', 'plugin_marketplaces'],
    ['plugins', 'plugins'],
    ['use_sticky_comment', 'use_sticky_comment'],
    ['classify_inline_comments', 'classify_inline_comments'],
    ['include_fix_links', 'include_fix_links'],
    ['use_commit_signing', 'use_commit_signing'],
    ['branch_prefix', 'branch_prefix'],
    ['base_branch', 'base_branch'],
    ['use_bedrock', 'use_bedrock'],
    ['use_vertex', 'use_vertex'],
    ['use_foundry', 'use_foundry'],
    ['github_token', 'github_token'],
  ];

  for (const [key, yamlKey] of stringFields) {
    const value = (inputs as Record<string, unknown>)[key];
    if (value !== undefined && value !== '' && value !== 'false') {
      lines.push(`${prefix}${yamlKey}: ${yamlString(String(value))}`);
    }
  }

  return lines.join('\n');
}

// ── Full workflow renderer ─────────────────────────────────────

/**
 * Generate a complete GitHub Actions workflow YAML string.
 *
 * @example
 * generateWorkflow({
 *   name: 'Claude PR Review',
 *   triggers: [{ type: 'pull_request' }],
 *   permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
 *   inputs: {
 *     claude_code_oauth_token: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
 *     track_progress: 'true',
 *     claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
 *   },
 * })
 */
export function generateWorkflow(config: WorkflowConfig): string {
  const lines: string[] = [];

  lines.push(`name: ${config.name}`);
  lines.push('');
  lines.push(renderTriggers(config.triggers));
  lines.push('');

  const jobName = config.jobName ?? 'claude';

  lines.push('jobs:');
  lines.push(`  ${jobName}:`);

  if (config.ifCondition !== undefined) {
    lines.push(`    if: ${yamlString(config.ifCondition)}`);
  }

  lines.push('    runs-on: ubuntu-latest');
  lines.push('    permissions:');
  lines.push(renderPermissions(config.permissions, 6));

  lines.push('    steps:');
  lines.push('      - name: Checkout repository');
  lines.push('        uses: actions/checkout@v4');
  lines.push('        with:');
  lines.push(`          fetch-depth: ${config.fetchDepth ?? 1}`);
  if (config.checkoutRef !== undefined) {
    lines.push(`          ref: ${config.checkoutRef}`);
  }

  lines.push('');
  lines.push('      - name: Run Claude Code');
  lines.push('        id: claude');
  lines.push(`        uses: ${config.actionRef ?? 'anthropics/claude-code-action@v1'}`);
  lines.push('        with:');
  lines.push(renderActionInputs(config.inputs, 10));

  lines.push('');

  return lines.join('\n');
}

// ── Preset workflows ───────────────────────────────────────────

/** Default tag-mode condition for @claude mentions */
const TAG_CONDITION = [
  "(github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude'))",
  "(github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude'))",
  "(github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude'))",
  "(github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))",
].join(' ||\n      ');

/**
 * Generate a workflow from a named preset.
 * Auth defaults to CLAUDE_CODE_OAUTH_TOKEN.
 */
export function generatePresetWorkflow(preset: WorkflowPreset, overrides?: Partial<WorkflowConfig>): string {
  const authToken = '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}';

  const configs: Record<WorkflowPreset, WorkflowConfig> = {
    'tag-interactive': {
      name: 'Claude Code',
      triggers: [{ type: 'tag' }],
      permissions: {
        contents: 'write',
        'pull-requests': 'write',
        issues: 'write',
        'id-token': 'write',
        actions: 'read',
      },
      ifCondition: TAG_CONDITION,
      inputs: {
        claude_code_oauth_token: authToken,
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('full-dev') }),
      },
    },
    'pr-review': {
      name: 'Claude Auto Review',
      triggers: [{ type: 'pull_request', activityTypes: ['opened', 'synchronize'] }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'Review this pull request for code quality, bugs, security, and performance.',
          'Use inline comments for specific issues and a summary comment for overall feedback.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'pr-review-tracked': {
      name: 'Claude Auto Review (Tracked)',
      triggers: [{ type: 'pull_request' }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        track_progress: 'true',
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'Review this pull request for code quality, bugs, security, and performance.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'security-review': {
      name: 'Security Review',
      triggers: [{ type: 'pull_request', activityTypes: ['opened', 'synchronize'] }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'security-events': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'Perform a comprehensive OWASP Top 10 security review.',
          'Rate severity as: CRITICAL, HIGH, MEDIUM, LOW, or NONE.',
          'Post detailed findings with recommendations.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'path-review': {
      name: 'Review Critical Files',
      triggers: [
        { type: 'pull_request', activityTypes: ['opened', 'synchronize'], paths: ['src/auth/**', 'src/api/**'] },
      ],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'This PR modifies critical files. Provide a security-focused review.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'external-contributor': {
      name: 'External Contributor Review',
      triggers: [{ type: 'pull_request', activityTypes: ['opened', 'synchronize'] }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      ifCondition: "github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'",
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          'CONTRIBUTOR: ${{ github.event.pull_request.user.login }}',
          '',
          'First-time contribution. Review for coding standards, test coverage, docs, and breaking changes.',
          'Be welcoming but thorough.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'checklist-review': {
      name: 'PR Review Checklist',
      triggers: [{ type: 'pull_request', activityTypes: ['opened', 'synchronize'] }],
      permissions: { contents: 'read', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'Review against checklist: code quality, testing, documentation, security.',
          'Post a summary comment with checklist results.',
        ].join('\n'),
        claude_args: buildClaudeArgs({ allowedTools: expandToolSet('review-only') }),
      },
    },
    'scheduled-maintenance': {
      name: 'Weekly Maintenance',
      triggers: [{ type: 'schedule', cron: '0 0 * * 0' }, { type: 'workflow_dispatch' }],
      permissions: { contents: 'write', issues: 'write', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          '',
          'Perform weekly maintenance: check outdated deps, npm audit, review stale issues, find TODOs.',
          'Create a summary issue with findings.',
        ].join('\n'),
        claude_args: buildClaudeArgs({
          allowedTools: ['Read', 'Bash(npm:*)', 'Bash(gh issue:*)', 'Bash(git:*)'],
        }),
      },
      fetchDepth: 0,
    },
    'issue-triage': {
      name: 'Issue Triage',
      triggers: [{ type: 'issues', activityTypes: ['opened'] }],
      permissions: { issues: 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'ISSUE NUMBER: ${{ github.event.issue.number }}',
          'TITLE: ${{ github.event.issue.title }}',
          'AUTHOR: ${{ github.event.issue.user.login }}',
          '',
          'Analyze this issue: classify (bug/feature/question), assess priority, suggest labels.',
          'Check for duplicates. Add labels and comment with analysis.',
        ].join('\n'),
        claude_args: buildClaudeArgs({
          allowedTools: ['Bash(gh issue:*)', 'Bash(gh label:*)', 'Read'],
        }),
      },
    },
    'doc-sync': {
      name: 'Sync API Documentation',
      triggers: [
        {
          type: 'pull_request',
          activityTypes: ['opened', 'synchronize'],
          paths: ['src/api/**/*.ts', 'src/routes/**/*.ts'],
        },
      ],
      permissions: { contents: 'write', 'pull-requests': 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: [
          'REPO: ${{ github.repository }}',
          'PR NUMBER: ${{ github.event.pull_request.number }}',
          '',
          'This PR modifies API endpoints. Update API.md and commit documentation changes.',
        ].join('\n'),
        claude_args: buildClaudeArgs({
          allowedTools: ['Read', 'Write', 'Edit', 'Bash(git:*)'],
        }),
      },
      checkoutRef: '${{ github.event.pull_request.head.ref }}',
      fetchDepth: 0,
    },
    'code-review-plugin': {
      name: 'Claude Code Review',
      triggers: [{ type: 'pull_request' }],
      permissions: { contents: 'read', 'pull-requests': 'write', issues: 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        plugin_marketplaces: 'https://github.com/anthropics/claude-code.git',
        plugins: 'code-review@claude-code-plugins',
        prompt: '/code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}',
      },
      fetchDepth: 0,
    },
    'base-action': {
      name: 'Claude Code (Base Action)',
      triggers: [{ type: 'workflow_dispatch' }],
      permissions: { contents: 'write', 'id-token': 'write' },
      inputs: {
        claude_code_oauth_token: authToken,
        prompt: 'Analyze this repository and generate a summary of the codebase.',
      },
      jobName: 'claude',
      actionRef: 'anthropics/claude-code-base-action@beta',
    },
  };

  const base = configs[preset];
  const merged =
    overrides !== undefined ? { ...base, ...overrides, inputs: { ...base.inputs, ...overrides.inputs } } : base;
  return generateWorkflow(merged);
}

// ── Security review workflow ───────────────────────────────────

/**
 * Generate a security review workflow using anthropics/claude-code-security-review@main.
 * Always uses CLAUDE_CODE_OAUTH_TOKEN.
 */
export function generateSecurityReviewWorkflow(overrides?: Partial<SecurityReviewInputs>): string {
  const lines = [
    'name: Security Review',
    '',
    '# WARNING: Not hardened against prompt injection. Only review trusted PRs.',
    "# Recommend: enable 'Require approval for all external contributors' in repo settings",
    '',
    'on:',
    '  pull_request:',
    '',
    'permissions:',
    '  pull-requests: write',
    '  contents: read',
    '',
    'jobs:',
    '  security:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          ref: ${{ github.event.pull_request.head.sha || github.sha }}',
    '          fetch-depth: 2',
    '',
    '      - uses: anthropics/claude-code-security-review@main',
    '        with:',
    '          claude-api-key: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
  ];

  if (overrides?.['comment-pr'] !== undefined) {
    lines.push(`          comment-pr: '${overrides['comment-pr']}'`);
  } else {
    lines.push("          comment-pr: 'true'");
  }

  if (overrides?.['claude-model'] !== undefined) {
    lines.push(`          claude-model: '${overrides['claude-model']}'`);
  }

  if (overrides?.['exclude-directories'] !== undefined) {
    lines.push(`          exclude-directories: '${overrides['exclude-directories']}'`);
  }

  lines.push('');

  return lines.join('\n');
}
