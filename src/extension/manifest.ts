/**
 * @module extension/manifest
 * MCPB Desktop Extension manifest builder.
 *
 * Generates manifest.json for .mcpb archives following the spec at
 * github.com/anthropics/mcpb/blob/main/MANIFEST.md
 */

import type {
  McpbManifest,
  McpbMcpConfig,
  McpbServerType,
  McpbToolDeclaration,
  McpbPromptDeclaration,
  McpbUserConfigField,
  McpbPlatform,
  McpbCompatibility,
} from '../types/extension.js';

// ── Builder types ──────────────────────────────────────────────

export type ManifestBuilderOptions = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly authorName: string;
  readonly authorEmail?: string;
  readonly authorUrl?: string;
  readonly serverType: McpbServerType;
  readonly entryPoint: string;
  readonly command?: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Record<string, string>;
};

// ── Manifest builder ───────────────────────────────────────────

/**
 * Build a minimal MCPB manifest from required fields.
 * Returns a complete McpbManifest that can be serialized to JSON.
 *
 * @example
 * buildManifest({
 *   name: 'my-extension',
 *   version: '1.0.0',
 *   description: 'My MCP server',
 *   authorName: 'Dev',
 *   serverType: 'node',
 *   entryPoint: 'server/index.js',
 * })
 */
export function buildManifest(opts: ManifestBuilderOptions): McpbManifest {
  const command =
    opts.command ?? (opts.serverType === 'node' ? 'node' : opts.serverType === 'python' ? 'python' : opts.entryPoint);
  const args = opts.args ?? [`\${__dirname}/${opts.entryPoint}`];

  return {
    mcpb_version: '0.1',
    name: opts.name,
    version: opts.version,
    description: opts.description,
    author: {
      name: opts.authorName,
      ...(opts.authorEmail !== undefined ? { email: opts.authorEmail } : {}),
      ...(opts.authorUrl !== undefined ? { url: opts.authorUrl } : {}),
    },
    server: {
      type: opts.serverType,
      entry_point: opts.entryPoint,
      mcp_config: {
        command,
        args: [...args],
        ...(opts.env !== undefined ? { env: opts.env } : {}),
      },
    },
  };
}

// ── Fluent builder for complex manifests ───────────────────────

// Mutable internal type — the builder mutates in place for O(1) per call.
// build() returns the readonly McpbManifest type.
type MutableManifest = { -readonly [K in keyof McpbManifest]: McpbManifest[K] };

export class ManifestBuilder {
  private m: MutableManifest;

  constructor(opts: ManifestBuilderOptions) {
    this.m = buildManifest(opts) as MutableManifest;
  }

  displayName(name: string): this {
    this.m.display_name = name;
    return this;
  }

  longDescription(desc: string): this {
    this.m.long_description = desc;
    return this;
  }

  repository(url: string): this {
    this.m.repository = { type: 'git', url };
    return this;
  }

  homepage(url: string): this {
    this.m.homepage = url;
    return this;
  }

  icon(path: string): this {
    this.m.icon = path;
    return this;
  }

  license(spdx: string): this {
    this.m.license = spdx;
    return this;
  }

  keywords(...kw: string[]): this {
    this.m.keywords = kw;
    return this;
  }

  tool(name: string, description: string): this {
    const existing = (this.m.tools as McpbToolDeclaration[] | undefined) ?? [];
    existing.push({ name, description });
    this.m.tools = existing;
    return this;
  }

  prompt(name: string, description: string, args?: ReadonlyArray<string>, text?: string): this {
    const existing = (this.m.prompts as McpbPromptDeclaration[] | undefined) ?? [];
    existing.push({
      name,
      description,
      ...(args !== undefined ? { arguments: args } : {}),
      ...(text !== undefined ? { text } : {}),
    });
    this.m.prompts = existing;
    return this;
  }

  userConfig(key: string, field: McpbUserConfigField): this {
    if (this.m.user_config === undefined) this.m.user_config = {};
    (this.m.user_config as Record<string, McpbUserConfigField>)[key] = field;
    return this;
  }

  /** Add a sensitive string config (stored in OS keychain) */
  apiKeyConfig(key: string, title: string, description: string): this {
    return this.userConfig(key, {
      type: 'string',
      title,
      description,
      sensitive: true,
      required: true,
    });
  }

  /** Add a directory picker config */
  directoryConfig(key: string, title: string, description: string, defaults?: ReadonlyArray<string>): this {
    return this.userConfig(key, {
      type: 'directory',
      title,
      description,
      multiple: true,
      required: true,
      ...(defaults !== undefined ? { default: defaults } : {}),
    });
  }

  compatibility(compat: McpbCompatibility): this {
    this.m.compatibility = compat;
    return this;
  }

  /** Add platform-specific overrides to the server config */
  platformOverride(platform: McpbPlatform, overrides: { command?: string; env?: Record<string, string> }): this {
    const mcpConfig = this.m.server.mcp_config as { platforms?: Record<string, unknown> } & McpbMcpConfig;
    if (mcpConfig.platforms === undefined) mcpConfig.platforms = {};
    (mcpConfig.platforms as Record<string, unknown>)[platform] = overrides;
    return this;
  }

  build(): McpbManifest {
    return this.m as McpbManifest;
  }

  /** Serialize to JSON string (pretty-printed) */
  toJSON(): string {
    return JSON.stringify(this.m, null, 2);
  }
}
