/**
 * @module types/action
 * Types for anthropics/claude-code-action@v1 GitHub Action.
 *
 * Source of truth: action.yml at github.com/anthropics/claude-code-action
 * Docs: github.com/anthropics/claude-code-action/tree/main/docs
 *
 * Two modes:
 *   - tag mode: triggered by @claude mentions in comments/issues/reviews
 *   - agent mode: triggered by explicit `prompt` input (automation workflows)
 *   Mode is auto-detected; no manual `mode` input needed.
 */

// ── Action Inputs ──────────────────────────────────────────────

/** Auth configuration — provide one of these (unless using Bedrock/Vertex/Foundry OIDC) */
export type ActionAuth = {
  readonly claude_code_oauth_token?: string;
  readonly anthropic_api_key?: string;
};

/** Cloud provider flags — set one to 'true' if using that provider */
export type CloudProvider = {
  readonly use_bedrock?: string;
  readonly use_vertex?: string;
  readonly use_foundry?: string;
};

/** All inputs accepted by anthropics/claude-code-action@v1 */
export type ActionInputs = ActionAuth &
  CloudProvider & {
    // ── Core ──────────────────────────────────────────────────
    /** Instructions for Claude. Agent mode if provided; tag mode if omitted. */
    readonly prompt?: string;
    /** Claude Code settings as JSON string or path to settings JSON file */
    readonly settings?: string;
    /** Additional CLI arguments passed directly to Claude Code */
    readonly claude_args?: string;

    // ── Trigger Configuration ─────────────────────────────────
    /** Trigger phrase in comments (default: "@claude") */
    readonly trigger_phrase?: string;
    /** Assignee username that triggers on issue assignment */
    readonly assignee_trigger?: string;
    /** Label name that triggers on issue labeling (default: "claude") */
    readonly label_trigger?: string;

    // ── Branch Configuration ──────────────────────────────────
    /** Base branch for new branches (defaults to repo default) */
    readonly base_branch?: string;
    /** Prefix for Claude branches (default: "claude/") */
    readonly branch_prefix?: string;
    /** Template: {{prefix}}, {{entityType}}, {{entityNumber}}, {{timestamp}}, {{sha}}, {{label}}, {{description}} */
    readonly branch_name_template?: string;

    // ── Access Control ────────────────────────────────────────
    /** Comma-separated bot usernames or "*" for all. WARNING: "*" on public repos is risky. */
    readonly allowed_bots?: string;
    /** Comma-separated usernames without write perms, or "*". Only with github_token. RISKY. */
    readonly allowed_non_write_users?: string;
    /** Comma-separated actor usernames to include. Supports wildcards: "*[bot]" */
    readonly include_comments_by_actor?: string;
    /** Comma-separated actor usernames to exclude. Supports wildcards. Exclusion wins ties. */
    readonly exclude_comments_by_actor?: string;

    // ── GitHub Token ──────────────────────────────────────────
    /** Custom GitHub token. Only if connecting your own GitHub App. */
    readonly github_token?: string;

    // ── Comment Behavior ──────────────────────────────────────
    /** Single sticky comment for PR responses (default: false) */
    readonly use_sticky_comment?: string;
    /** Buffer and classify inline comments via Haiku (default: true). "false" to post immediately. */
    readonly classify_inline_comments?: string;
    /** Force tag mode with tracking comments for PR/issue events (default: false) */
    readonly track_progress?: string;
    /** Include "Fix this" links in review feedback (default: true) */
    readonly include_fix_links?: string;

    // ── Commit Signing ────────────────────────────────────────
    /** Enable commit signing via GitHub API (default: false) */
    readonly use_commit_signing?: string;
    /** SSH private key for signing. Takes precedence over use_commit_signing. */
    readonly ssh_signing_key?: string;
    /** GitHub user ID for git operations (default: "41898282" — Claude bot) */
    readonly bot_id?: string;
    /** GitHub username for git operations (default: "claude[bot]") */
    readonly bot_name?: string;

    // ── Plugins ───────────────────────────────────────────────
    /** Newline-separated plugin marketplace Git URLs */
    readonly plugin_marketplaces?: string;
    /** Newline-separated plugin names (e.g., "code-review@claude-code-plugins") */
    readonly plugins?: string;

    // ── Permissions ───────────────────────────────────────────
    /** Additional GitHub permissions (e.g., "actions: read") */
    readonly additional_permissions?: string;

    // ── Advanced ──────────────────────────────────────────────
    /** Path to custom Claude Code executable */
    readonly path_to_claude_code_executable?: string;
    /** Path to custom Bun executable */
    readonly path_to_bun_executable?: string;
    /** Show Claude Code Report in GitHub Step Summary (default: false). WARNING: outputs Claude-authored content. */
    readonly display_report?: string;
    /** Show full JSON output (default: false). WARNING: may expose secrets in logs. */
    readonly show_full_output?: string;
  };

// ── Action Outputs ─────────────────────────────────────────────

/** Outputs from anthropics/claude-code-action@v1 */
export type ActionOutputs = {
  /** Path to Claude Code execution output file */
  readonly execution_file: string;
  /** Branch created by Claude for this execution */
  readonly branch_name: string;
  /** GitHub token used by the action */
  readonly github_token: string;
  /** JSON string of structured output fields (when --json-schema is provided) */
  readonly structured_output: string;
  /** Session ID for --resume continuation */
  readonly session_id: string;
};

// ── GitHub Workflow Types ──────────────────────────────────────

/** GitHub event types that can trigger the action */
export type ActionTriggerEvent =
  | 'issue_comment'
  | 'pull_request_review_comment'
  | 'pull_request_review'
  | 'pull_request'
  | 'issues'
  | 'workflow_dispatch'
  | 'schedule';

/** Pull request event activity types */
export type PullRequestActivityType = 'opened' | 'synchronize' | 'ready_for_review' | 'reopened';

/** Issue event activity types */
export type IssueActivityType = 'opened' | 'assigned' | 'labeled' | 'edited';

/** GitHub workflow permissions */
export type WorkflowPermission = 'read' | 'write';

export type WorkflowPermissions = {
  readonly contents?: WorkflowPermission;
  readonly 'pull-requests'?: WorkflowPermission;
  readonly issues?: WorkflowPermission;
  readonly 'id-token'?: WorkflowPermission;
  readonly actions?: WorkflowPermission;
  readonly checks?: WorkflowPermission;
  readonly discussions?: WorkflowPermission;
  readonly workflows?: WorkflowPermission;
  readonly 'security-events'?: WorkflowPermission;
};

// ── Claude Args Builder Types ──────────────────────────────────

/** Structured representation of claude_args CLI flags */
export type ClaudeArgs = {
  /** --max-turns N */
  readonly maxTurns?: number;
  /** --model <model-id> */
  readonly model?: string;
  /** --allowedTools Tool1,Tool2,Bash(cmd:*) */
  readonly allowedTools?: ReadonlyArray<string>;
  /** --disallowedTools Tool1,Tool2 */
  readonly disallowedTools?: ReadonlyArray<string>;
  /** --system-prompt "..." */
  readonly systemPrompt?: string;
  /** --json-schema '{...}' for structured output */
  readonly jsonSchema?: Record<string, unknown>;
  /** --mcp-config (inline JSON or file path) — can be repeated */
  readonly mcpConfigs?: ReadonlyArray<string | McpConfigInline>;
};

/** Inline MCP config passed to --mcp-config as JSON */
export type McpConfigInline = {
  readonly mcpServers: Record<
    string,
    {
      readonly command: string;
      readonly args?: ReadonlyArray<string>;
      readonly env?: Record<string, string>;
      readonly type?: 'stdio';
    }
  >;
};

// ── Settings Input Types ───────────────────────────────────────

/** Claude Code settings JSON (passed via `settings` input) */
export type ActionSettings = {
  readonly model?: string;
  readonly env?: Record<string, string>;
  readonly permissions?: {
    readonly allow?: ReadonlyArray<string>;
    readonly deny?: ReadonlyArray<string>;
  };
  readonly hooks?: Record<
    string,
    ReadonlyArray<{
      readonly matcher: string;
      readonly hooks: ReadonlyArray<{
        readonly type: 'command';
        readonly command: string;
      }>;
    }>
  >;
};

// ── Workflow Preset Types ──────────────────────────────────────

/** Named presets for common workflow patterns (from solutions.md) */
export type WorkflowPreset =
  | 'tag-interactive' // @claude mention handler
  | 'pr-review' // auto PR review
  | 'pr-review-tracked' // auto PR review with progress tracking
  | 'security-review' // OWASP-focused security review
  | 'path-review' // review only specific file paths
  | 'external-contributor' // review PRs from first-time contributors
  | 'checklist-review' // custom PR review checklist
  | 'scheduled-maintenance' // cron-based maintenance tasks
  | 'issue-triage' // auto-label and categorize issues
  | 'doc-sync' // update docs when API files change
  | 'code-review-plugin'; // uses code-review@claude-code-plugins

/** Common tool permission sets used in solutions */
export type ToolPermissionSet =
  | 'review-only' // inline comments + gh pr comment/diff/view
  | 'review-and-edit' // above + Read, Write, Edit
  | 'full-dev' // above + Bash(npm:*), Bash(git:*), Bash(gh:*)
  | 'read-only' // Read, Glob, Grep only
  | 'custom';

// ── Security Review Action Types ───────────────────────────────

/** Inputs for anthropics/claude-code-security-review@main */
export type SecurityReviewInputs = {
  /** Whether to comment on PRs with findings (default: true) */
  readonly 'comment-pr'?: string;
  /** Whether to upload results as artifacts (default: true) */
  readonly 'upload-results'?: string;
  /** Comma-separated directories to exclude from scanning */
  readonly 'exclude-directories'?: string;
  /** Timeout for analysis in minutes (default: 20) */
  readonly 'claudecode-timeout'?: string;
  /**
   * Authentication token for security analysis.
   * Input name is "claude-api-key" per action.yml, but we pass CLAUDE_CODE_OAUTH_TOKEN.
   */
  readonly 'claude-api-key': string;
  /** Claude model for analysis (e.g., "claude-sonnet-4-20250514") */
  readonly 'claude-model'?: string;
  /** Run on every commit — may increase false positives (default: false) */
  readonly 'run-every-commit'?: string;
  /** Path to custom false positive filtering instructions */
  readonly 'false-positive-filtering-instructions'?: string;
  /** Path to custom security scan instructions to append */
  readonly 'custom-security-scan-instructions'?: string;
};

/** Outputs from security review */
export type SecurityReviewOutputs = {
  readonly 'findings-count': string;
  readonly 'results-file': string;
};

// ── MCP Tools Available in CI ──────────────────────────────────

/** MCP tools auto-provisioned when additional_permissions: "actions: read" */
export type GitHubCIMcpTool =
  | 'mcp__github_ci__get_ci_status'
  | 'mcp__github_ci__get_workflow_run_details'
  | 'mcp__github_ci__download_job_log';

/** MCP tool for inline PR comments */
export type GitHubInlineCommentTool = 'mcp__github_inline_comment__create_inline_comment';
