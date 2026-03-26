import { describe, it, expect } from 'vitest';
import { Ok, Err, mapResult, flatMapResult, tryCatch, assertNever } from '../types/result.js';

describe('Result monad', () => {
  describe('Ok', () => {
    it('creates a successful result', () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('works with complex types', () => {
      const result = Ok({ name: 'test', level: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test');
      }
    });
  });

  describe('Err', () => {
    it('creates a failure result', () => {
      const result = Err(new Error('fail'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('fail');
      }
    });

    it('preserves error type', () => {
      const result = Err(new RangeError('out of range'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RangeError);
      }
    });
  });

  describe('mapResult', () => {
    it('maps over Ok values', () => {
      const result = mapResult(Ok(5), (n) => n * 2);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(10);
    });

    it('passes through Err values', () => {
      const err = Err(new Error('nope'));
      const result = mapResult(err, () => 42);
      expect(result.ok).toBe(false);
    });
  });

  describe('flatMapResult', () => {
    it('chains Ok results', () => {
      const result = flatMapResult(Ok(5), (n) => Ok(n * 2));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(10);
    });

    it('short-circuits on Err', () => {
      const result = flatMapResult(Err(new Error('fail')), () => Ok(42));
      expect(result.ok).toBe(false);
    });

    it('propagates inner Err', () => {
      const result = flatMapResult(Ok(5), () => Err(new Error('inner fail')));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('inner fail');
    });
  });

  describe('tryCatch', () => {
    it('wraps successful async operations', async () => {
      const result = await tryCatch(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('wraps thrown errors', async () => {
      const result = await tryCatch(async () => {
        throw new Error('async fail');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('async fail');
    });

    it('wraps non-Error throws', async () => {
      const result = await tryCatch(async () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('string error');
    });
  });

  describe('assertNever', () => {
    it('throws on any value', () => {
      expect(() => assertNever('unexpected' as never)).toThrow('Unhandled discriminant');
    });
  });
});
