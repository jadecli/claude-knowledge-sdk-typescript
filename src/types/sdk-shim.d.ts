/**
 * Type shim for @anthropic-ai/claude-agent-sdk (peer dependency).
 * When the SDK is installed, its own types take precedence.
 * When not installed, this prevents compilation errors from the dynamic import in loop.ts.
 */
declare module '@anthropic-ai/claude-agent-sdk' {
  export function query(options: {
    prompt: string;
    options?: Record<string, unknown>;
  }): AsyncIterable<{ type: string; [key: string]: unknown }>;
}
