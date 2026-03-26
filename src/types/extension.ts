/**
 * @module types/extension
 * Types for MCPB Desktop Extensions (.mcpb files).
 *
 * Source of truth: anthropic.com/engineering/desktop-extensions
 * Spec: github.com/anthropics/mcpb/blob/main/MANIFEST.md
 *
 * Desktop Extensions package MCP servers as single-file installable bundles
 * for Claude Desktop. The .mcpb file is a ZIP archive containing manifest.json,
 * server code, bundled dependencies, and optional icon/screenshots.
 */

// ── Manifest (Required) ────────────────────────────────────────

/** The manifest.json at the root of a .mcpb archive */
export type McpbManifest = {
  /** MCPB spec version (currently "0.1") */
  readonly mcpb_version: string;
  /** Machine-readable extension name (used for CLI, APIs) */
  readonly name: string;
  /** Semantic version */
  readonly version: string;
  /** Brief description */
  readonly description: string;
  /** Author info (required) */
  readonly author: McpbAuthor;
  /** Server configuration (required) */
  readonly server: McpbServerConfig;

  // ── Optional fields ─────────────────────────────────────────
  /** Human-readable display name */
  readonly display_name?: string;
  /** Detailed description with markdown support */
  readonly long_description?: string;
  /** Source repo */
  readonly repository?: McpbRepository;
  /** Homepage URL */
  readonly homepage?: string;
  /** Docs URL */
  readonly documentation?: string;
  /** Support/issues URL */
  readonly support?: string;
  /** Path to icon file within the archive */
  readonly icon?: string;
  /** Paths to screenshot files within the archive */
  readonly screenshots?: ReadonlyArray<string>;
  /** Tool declarations for discovery */
  readonly tools?: ReadonlyArray<McpbToolDeclaration>;
  /** Prompt declarations */
  readonly prompts?: ReadonlyArray<McpbPromptDeclaration>;
  /** Whether tools are dynamically generated at runtime */
  readonly tools_generated?: boolean;
  /** Searchable keywords */
  readonly keywords?: ReadonlyArray<string>;
  /** SPDX license identifier */
  readonly license?: string;
  /** Compatibility constraints */
  readonly compatibility?: McpbCompatibility;
  /** User configuration schema */
  readonly user_config?: Record<string, McpbUserConfigField>;
};

// ── Author ─────────────────────────────────────────────────────

export type McpbAuthor = {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
};

// ── Repository ─────────────────────────────────────────────────

export type McpbRepository = {
  readonly type: 'git';
  readonly url: string;
};

// ── Server Configuration ───────────────────────────────────────

/** Server runtime type */
export type McpbServerType = 'node' | 'python' | 'binary';

export type McpbServerConfig = {
  /** Runtime type */
  readonly type: McpbServerType;
  /** Path to main server file within the archive */
  readonly entry_point: string;
  /** MCP server launch configuration */
  readonly mcp_config: McpbMcpConfig;
};

/**
 * MCP launch config with template literal support.
 * Template variables:
 *   ${__dirname} — extension's unpacked directory
 *   ${user_config.key} — user-provided config value
 *   ${HOME}, ${TEMP}, ${TMPDIR} — system env vars
 */
export type McpbMcpConfig = {
  /** Command to run the server */
  readonly command: string;
  /** Arguments passed to the command */
  readonly args?: ReadonlyArray<string>;
  /** Environment variables for the server process */
  readonly env?: Record<string, string>;
  /** Platform-specific overrides */
  readonly platforms?: Partial<Record<McpbPlatform, McpbPlatformOverride>>;
};

export type McpbPlatform = 'darwin' | 'win32' | 'linux';

export type McpbPlatformOverride = {
  readonly command?: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Record<string, string>;
};

// ── Tool & Prompt Declarations ─────────────────────────────────

export type McpbToolDeclaration = {
  readonly name: string;
  readonly description: string;
};

export type McpbPromptDeclaration = {
  readonly name: string;
  readonly description: string;
  readonly arguments?: ReadonlyArray<string>;
  /** Prompt template with ${arguments.name} interpolation */
  readonly text?: string;
};

// ── Compatibility ──────────────────────────────────────────────

export type McpbCompatibility = {
  /** Minimum Claude Desktop version */
  readonly claude_desktop?: string;
  /** Supported platforms */
  readonly platforms?: ReadonlyArray<McpbPlatform>;
  /** Required runtime versions */
  readonly runtimes?: Partial<Record<'node' | 'python', string>>;
};

// ── User Configuration Schema ──────────────────────────────────

/** Base config field shared by all types */
type McpbConfigFieldBase = {
  readonly title: string;
  readonly description: string;
  readonly required?: boolean;
};

/** All user config field types (discriminated by `type`) */
export type McpbUserConfigField =
  | (McpbConfigFieldBase & {
      readonly type: 'string';
      /** Whether the value should be stored in OS keychain */
      readonly sensitive?: boolean;
      readonly default?: string;
    })
  | (McpbConfigFieldBase & {
      readonly type: 'number';
      readonly default?: number;
      readonly min?: number;
      readonly max?: number;
    })
  | (McpbConfigFieldBase & {
      readonly type: 'boolean';
      readonly default?: boolean;
    })
  | (McpbConfigFieldBase & {
      readonly type: 'directory';
      /** Allow multiple directory selection */
      readonly multiple?: boolean;
      readonly default?: ReadonlyArray<string>;
    });

// ── Archive Structure ──────────────────────────────────────────

/**
 * Represents the expected file layout inside a .mcpb archive.
 * Not enforced at runtime — for documentation and tooling.
 *
 * extension.mcpb (ZIP)
 * ├── manifest.json        (required)
 * ├── server/              (server implementation)
 * │   └── index.js|main.py (entry point)
 * ├── node_modules/|lib/   (bundled dependencies)
 * ├── icon.png             (optional)
 * └── assets/              (optional screenshots, etc.)
 */
export type McpbArchiveLayout = {
  readonly manifest: 'manifest.json';
  readonly serverDir: 'server';
  readonly entryPoint: string;
  readonly dependenciesDir: 'node_modules' | 'lib';
  readonly icon?: string;
};
