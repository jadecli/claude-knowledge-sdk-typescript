/**
 * @module types/core
 * Foundation types following Boris Cherny's strict TypeScript patterns.
 *
 * Three invariants:
 *   1. Branded types prevent ID confusion at compile time
 *   2. Result<T, E> replaces try/catch with exhaustive handling
 *   3. Discriminated unions model every state transition
 */

// ── Branded Types (Nominal Typing) ──────────────────────────────
// Boris Cherny, "Programming TypeScript" ch.6: simulate nominal types
// with intersection + phantom property.

type Brand<K, T> = K & { readonly __brand: T };

export type AgentId = Brand<string, 'AgentId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ToolCallId = Brand<string, 'ToolCallId'>;
export type TokenCount = Brand<number, 'TokenCount'>;
export type USD = Brand<number, 'USD'>;
export type DocUrl = Brand<string, 'DocUrl'>;

// Smart constructors — validate at the boundary, trust inside
export const AgentId = (raw: string): AgentId => raw as AgentId;
export const SessionId = (raw: string): SessionId => raw as SessionId;
export const ToolCallId = (raw: string): ToolCallId => raw as ToolCallId;
export const TokenCount = (n: number): TokenCount => {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError(`TokenCount must be non-negative integer, got ${n}`);
  return n as TokenCount;
};
export const USD = (n: number): USD => {
  if (n < 0) throw new RangeError(`USD must be non-negative, got ${n}`);
  return n as USD;
};
export const DocUrl = (raw: string): DocUrl => {
  if (!raw.startsWith('https://')) throw new TypeError(`DocUrl must be https://, got ${raw}`);
  return raw as DocUrl;
};

// ── Result<T, E> ────────────────────────────────────────────────
// Boris Cherny: "Exceptions are side effects. Prefer Result types."

export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (result.ok ? Ok(fn(result.value)) : result);

export const flatMapResult = <T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);

/** Wrap an async fn that might throw into Result */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await fn());
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
}

// ── Exhaustive Pattern Matching ─────────────────────────────────

export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(value)}`);
}
