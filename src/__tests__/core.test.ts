import { describe, it, expect } from 'vitest';
import {
  AgentId,
  SessionId,
  TokenCount,
  USD,
  DocUrl,
  Ok,
  Err,
  mapResult,
  flatMapResult,
  tryCatch,
  assertNever,
} from '../types/core.js';
import { estimateCost } from '../agent/loop.js';

// ── Branded Type Smart Constructors ──────────────────────────

describe('TokenCount', () => {
  it('accepts non-negative integers', () => {
    expect(TokenCount(0)).toBe(0);
    expect(TokenCount(100)).toBe(100);
    expect(TokenCount(1_000_000)).toBe(1_000_000);
  });

  it('rejects negative numbers', () => {
    expect(() => TokenCount(-1)).toThrow(RangeError);
    expect(() => TokenCount(-100)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => TokenCount(1.5)).toThrow(RangeError);
    expect(() => TokenCount(0.1)).toThrow(RangeError);
  });
});

describe('USD', () => {
  it('accepts non-negative numbers', () => {
    expect(USD(0)).toBe(0);
    expect(USD(1.5)).toBe(1.5);
    expect(USD(0.001)).toBe(0.001);
  });

  it('rejects negative numbers', () => {
    expect(() => USD(-0.01)).toThrow(RangeError);
    expect(() => USD(-100)).toThrow(RangeError);
  });
});

describe('DocUrl', () => {
  it('accepts https:// URLs', () => {
    expect(DocUrl('https://code.claude.com/docs')).toBe('https://code.claude.com/docs');
  });

  it('rejects non-https URLs', () => {
    expect(() => DocUrl('http://example.com')).toThrow(TypeError);
    expect(() => DocUrl('ftp://example.com')).toThrow(TypeError);
    expect(() => DocUrl('not-a-url')).toThrow(TypeError);
  });
});

describe('AgentId / SessionId', () => {
  it('accepts any string', () => {
    expect(AgentId('agent-1')).toBe('agent-1');
    expect(SessionId('session-abc')).toBe('session-abc');
  });
});

// ── Result<T, E> ────────────────────────────────────────────────

describe('Result', () => {
  it('Ok wraps a value', () => {
    const result = Ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('Err wraps an error', () => {
    const result = Err(new Error('oops'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('oops');
  });

  it('mapResult transforms Ok values', () => {
    const result = mapResult(Ok(10), (x) => x * 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(20);
  });

  it('mapResult passes through Err', () => {
    const err = Err(new Error('fail'));
    const result = mapResult(err, () => 'never reached');
    expect(result.ok).toBe(false);
  });

  it('flatMapResult chains Results', () => {
    const result = flatMapResult(Ok(5), (x) => Ok(x + 1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(6);
  });

  it('flatMapResult short-circuits on Err', () => {
    const err = Err(new Error('stop'));
    const result = flatMapResult(err, () => Ok('never'));
    expect(result.ok).toBe(false);
  });

  it('tryCatch catches async throws', async () => {
    const result = await tryCatch(async () => {
      throw new Error('async failure');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('async failure');
  });

  it('tryCatch wraps async success', async () => {
    const result = await tryCatch(async () => 42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });
});

// ── assertNever ─────────────────────────────────────────────────

describe('assertNever', () => {
  it('throws on any value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow('Unhandled discriminant');
  });
});

// ── estimateCost ────────────────────────────────────────────────

describe('estimateCost', () => {
  it('calculates Sonnet cost for 1M input + 1M output', () => {
    // Sonnet: $3/M input + $15/M output = $18
    const cost = estimateCost('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18, 2);
  });

  it('calculates Opus cost', () => {
    // Opus: $15/M input + $75/M output
    const cost = estimateCost('opus', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90, 2);
  });

  it('calculates Haiku cost', () => {
    // Haiku: $0.80/M input + $4/M output
    const cost = estimateCost('haiku', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(4.8, 2);
  });

  it('defaults unknown models to Sonnet pricing', () => {
    const cost = estimateCost('unknown-model', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18, 2);
  });
});
