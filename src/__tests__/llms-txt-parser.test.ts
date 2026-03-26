import { describe, it, expect } from 'vitest';
import { parseLlmsTxt, llmsTxtJsonSchema } from '../knowledge/llms-txt-parser.js';

describe('parseLlmsTxt', () => {
  it('parses well-formed input with multiple sections', () => {
    const input = `# Anthropic Docs
> Documentation for Claude

## Getting Started
- [Quick Start](https://docs.anthropic.com/quick-start): Get up and running
- [Installation](https://docs.anthropic.com/install): Install the SDK

## API Reference
- [Messages API](https://docs.anthropic.com/api/messages): Create messages
- [Models](https://docs.anthropic.com/api/models): Available models
- [Streaming](https://docs.anthropic.com/api/streaming): Stream responses
`;

    const result = parseLlmsTxt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.siteName).toBe('Anthropic Docs');
    expect(result.value.siteDescription).toBe('Documentation for Claude');
    expect(result.value.sections).toHaveLength(2);

    const [gs, api] = result.value.sections;
    expect(gs?.name).toBe('Getting Started');
    expect(gs?.links).toHaveLength(2);
    expect(gs?.links[0]?.title).toBe('Quick Start');
    expect(gs?.links[0]?.url).toBe('https://docs.anthropic.com/quick-start');
    expect(gs?.links[0]?.description).toBe('Get up and running');

    expect(api?.name).toBe('API Reference');
    expect(api?.links).toHaveLength(3);
    expect(api?.links[0]?.title).toBe('Messages API');
  });

  it('returns Ok with empty sections for empty input', () => {
    const result = parseLlmsTxt('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.siteName).toBe('');
    expect(result.value.siteDescription).toBe('');
    expect(result.value.sections).toHaveLength(0);
  });

  it('puts links without ## headers into an implicit General section', () => {
    const input = `# My Site
- [Page One](https://example.com/one): First page
- [Page Two](https://example.com/two): Second page
`;

    const result = parseLlmsTxt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sections).toHaveLength(1);
    expect(result.value.sections[0]?.name).toBe('General');
    expect(result.value.sections[0]?.links).toHaveLength(2);
  });

  it('skips malformed URLs gracefully', () => {
    const input = `## Docs
- [Good](https://example.com/good): Works
- [Bad](not-a-url): Should be skipped
- [Also Good](https://example.com/also): Also works
`;

    const result = parseLlmsTxt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sections[0]?.links).toHaveLength(2);
    expect(result.value.sections[0]?.links[0]?.title).toBe('Good');
    expect(result.value.sections[0]?.links[1]?.title).toBe('Also Good');
  });

  it('defaults missing descriptions to empty string', () => {
    const input = `## Section
- [No Description](https://example.com/page)
`;

    const result = parseLlmsTxt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sections[0]?.links[0]?.description).toBe('');
  });

  it('handles Anthropic-style llms.txt format', () => {
    const input = `# Claude Code Documentation
> Official documentation for Claude Code CLI

## Core Concepts
- [CLI Usage](https://code.claude.com/docs/en/cli-usage): Command-line interface reference
- [Settings](https://code.claude.com/docs/en/settings): Configuration and settings

## Advanced
- [Hooks](https://code.claude.com/docs/en/hooks): Custom hook scripts
- [MCP](https://code.claude.com/docs/en/mcp): Model Context Protocol servers
- [Sub-agents](https://code.claude.com/docs/en/sub-agents): Multi-agent patterns
`;

    const result = parseLlmsTxt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.siteName).toBe('Claude Code Documentation');
    expect(result.value.sections).toHaveLength(2);

    const advanced = result.value.sections[1];
    expect(advanced?.name).toBe('Advanced');
    expect(advanced?.links).toHaveLength(3);

    // Verify URLs are branded DocUrl type (string value starting with https://)
    for (const section of result.value.sections) {
      for (const link of section.links) {
        expect(typeof link.url).toBe('string');
        expect(link.url.startsWith('https://')).toBe(true);
      }
    }
  });
});

describe('llmsTxtJsonSchema', () => {
  it('returns a valid JSON Schema object with correct top-level structure', () => {
    const schema = llmsTxtJsonSchema() as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['siteName', 'siteDescription', 'sections']);
  });

  it('has additionalProperties: false at every object level', () => {
    const schema = llmsTxtJsonSchema() as Record<string, unknown>;
    // Top level
    expect(schema.additionalProperties).toBe(false);

    // Section level
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const sections = props.sections as Record<string, unknown>;
    const sectionItems = sections.items as Record<string, unknown>;
    expect(sectionItems.additionalProperties).toBe(false);
    expect(sectionItems.required).toEqual(['name', 'links']);

    // Link level
    const sectionProps = sectionItems.properties as Record<string, Record<string, unknown>>;
    const links = sectionProps.links as Record<string, unknown>;
    const linkItems = links.items as Record<string, unknown>;
    expect(linkItems.additionalProperties).toBe(false);
    expect(linkItems.required).toEqual(['title', 'url', 'description']);
  });

  it('defines all expected fields at each level', () => {
    const schema = llmsTxtJsonSchema() as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;

    // Top-level fields
    expect(props).toHaveProperty('siteName');
    expect(props).toHaveProperty('siteDescription');
    expect(props).toHaveProperty('sections');

    // Section fields
    const sections = props.sections as Record<string, unknown>;
    const sectionItems = sections.items as Record<string, unknown>;
    const sectionProps = sectionItems.properties as Record<string, unknown>;
    expect(sectionProps).toHaveProperty('name');
    expect(sectionProps).toHaveProperty('links');

    // Link fields
    const links = (sectionProps as Record<string, Record<string, unknown>>).links;
    const linkItems = links.items as Record<string, unknown>;
    const linkProps = linkItems.properties as Record<string, unknown>;
    expect(linkProps).toHaveProperty('title');
    expect(linkProps).toHaveProperty('url');
    expect(linkProps).toHaveProperty('description');
  });
});
