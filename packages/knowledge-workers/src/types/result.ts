/**
 * @module types/result
 * Result<T, E> monad — mirrors @jadecli/claude-knowledge-sdk core.ts pattern.
 * No exceptions cross module boundaries.
 */

export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U, E extends Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.ok ? Ok(fn(result.value)) : result;

export const flatMapResult = <T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);

export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await fn());
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(value)}`);
}
