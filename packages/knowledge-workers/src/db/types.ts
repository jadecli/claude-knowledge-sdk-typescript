/**
 * @module db/types
 * Branded types and domain models for the knowledge-workers DB layer.
 * Follows Boris Cherny's strict TypeScript patterns.
 */

// ── Branded Types ──────────────────────────────────────────
type Brand<K, T> = K & { readonly __brand: T };

export type SurrogateKey = Brand<string, 'SurrogateKey'>;
export type NaturalKey = Brand<string, 'NaturalKey'>;
export type AgentId = Brand<string, 'AgentId'>;
export type DepartmentId = Brand<string, 'DepartmentId'>;

export const SurrogateKey = (raw: string): SurrogateKey => raw as SurrogateKey;
export const NaturalKey = (raw: string): NaturalKey => raw as NaturalKey;
export const AgentId = (raw: string): AgentId => raw as AgentId;
export const DepartmentId = (raw: string): DepartmentId => raw as DepartmentId;

// ── Result<T, E> ──────────────────────────────────────────
export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error });

// ── SCD Type 2 Row ────────────────────────────────────────
export interface SCDRow {
  readonly surrogate_key: string;
  readonly natural_key: string;
  readonly eff_start: string; // ISO date
  readonly eff_end: string | null; // null = current
  readonly is_current: boolean;
  readonly [key: string]: unknown;
}

// ── Agent Level ────────────────────────────────────────────
/** Valid agent levels: L1 through L12 */
export type AgentLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export function validateAgentLevel(level: number): Result<AgentLevel> {
  if (!Number.isInteger(level) || level < 1 || level > 12) {
    return Err(new Error(`Invalid agent level: ${level}. Must be 1-12.`));
  }
  return Ok(level as AgentLevel);
}

// ── Agent Record ───────────────────────────────────────────
export interface AgentRecord extends SCDRow {
  readonly agent_id: string;
  readonly name: string;
  readonly department: string;
  readonly level: number;
  readonly status: 'active' | 'inactive';
  readonly reports_to: string | null;
  readonly capabilities: string; // JSON string
}

// ── Agent Definition (from JSONB registry) ─────────────────
export interface AgentDefinition {
  readonly agent_id: string;
  readonly name: string;
  readonly department: string;
  readonly level: number;
  readonly capabilities: readonly string[];
  readonly model: string;
  readonly system_prompt: string;
}

// ── Org Chart Node ─────────────────────────────────────────
export interface OrgChartNode {
  readonly agent_id: string;
  readonly name: string;
  readonly department: string;
  readonly level: number;
  readonly children: readonly OrgChartNode[];
}
