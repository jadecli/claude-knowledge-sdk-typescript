/**
 * @module extension/manifest
 * MCPB Desktop Extension manifest builder.
 *
 * Generates manifest.json for .mcpb archives following the spec at
 * github.com/anthropics/mcpb/blob/main/MANIFEST.md
 */

import type {
  McpbManifest,
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

export class ManifestBuilder {
  private manifest: McpbManifest;

  constructor(opts: ManifestBuilderOptions) {
    this.manifest = buildManifest(opts);
  }

  displayName(name: string): this {
    this.manifest = { ...this.manifest, display_name: name };
    return this;
  }

  longDescription(desc: string): this {
    this.manifest = { ...this.manifest, long_description: desc };
    return this;
  }

  repository(url: string): this {
    this.manifest = { ...this.manifest, repository: { type: 'git', url } };
    return this;
  }

  homepage(url: string): this {
    this.manifest = { ...this.manifest, homepage: url };
    return this;
  }

  icon(path: string): this {
    this.manifest = { ...this.manifest, icon: path };
    return this;
  }

  license(spdx: string): this {
    this.manifest = { ...this.manifest, license: spdx };
    return this;
  }

  keywords(...kw: string[]): this {
    this.manifest = { ...this.manifest, keywords: kw };
    return this;
  }

  tool(name: string, description: string): this {
    const existing = this.manifest.tools ?? [];
    const tool: McpbToolDeclaration = { name, description };
    this.manifest = { ...this.manifest, tools: [...existing, tool] };
    return this;
  }

  prompt(name: string, description: string, args?: ReadonlyArray<string>, text?: string): this {
    const existing = this.manifest.prompts ?? [];
    const prompt: McpbPromptDeclaration = {
      name,
      description,
      ...(args !== undefined ? { arguments: args } : {}),
      ...(text !== undefined ? { text } : {}),
    };
    this.manifest = { ...this.manifest, prompts: [...existing, prompt] };
    return this;
  }

  userConfig(key: string, field: McpbUserConfigField): this {
    const existing = this.manifest.user_config ?? {};
    this.manifest = { ...this.manifest, user_config: { ...existing, [key]: field } };
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
    this.manifest = { ...this.manifest, compatibility: compat };
    return this;
  }

  /** Add platform-specific overrides to the server config */
  platformOverride(platform: McpbPlatform, overrides: { command?: string; env?: Record<string, string> }): this {
    const existing = this.manifest.server.mcp_config.platforms ?? {};
    this.manifest = {
      ...this.manifest,
      server: {
        ...this.manifest.server,
        mcp_config: {
          ...this.manifest.server.mcp_config,
          platforms: { ...existing, [platform]: overrides },
        },
      },
    };
    return this;
  }

  build(): McpbManifest {
    return this.manifest;
  }

  /** Serialize to JSON string (pretty-printed) */
  toJSON(): string {
    return JSON.stringify(this.manifest, null, 2);
  }
}
