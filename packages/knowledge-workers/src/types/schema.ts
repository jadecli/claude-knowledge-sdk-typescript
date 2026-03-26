/**
 * @module types/schema
 * Neon Postgres 18 schema types — Amazon 12-level system with SCD Type 2 effective dating.
 *
 * Three invariants:
 *   1. Branded types prevent ID confusion at compile time
 *   2. Level 9 does not exist (intentional gap between Director and VP)
 *   3. SCD Type 2: never delete rows, only expire + insert
 */

// ── Branded Types (Nominal Typing) ──────────────────────────────
// Reuses Brand<K, T> pattern from @jadecli/claude-knowledge-sdk core.ts

type Brand<K, T> = K & { readonly __brand: T };

export type LevelId = Brand<number, 'LevelId'>;
export type DepartmentId = Brand<string, 'DepartmentId'>;
export type JobProfileId = Brand<string, 'JobProfileId'>;
export type SupOrgId = Brand<string, 'SupOrgId'>;
export type AgentFactId = Brand<string, 'AgentFactId'>;
export type RequisitionId = Brand<string, 'RequisitionId'>;
export type ConnectionString = Brand<string, 'ConnectionString'>;

// ── Smart Constructors ──────────────────────────────────────────

const VALID_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12] as const;

export const LevelId = (n: number): LevelId => {
  if (!VALID_LEVELS.includes(n as (typeof VALID_LEVELS)[number])) {
    throw new RangeError(`LevelId must be 1-8 or 10-12 (no L9), got ${n}`);
  }
  return n as LevelId;
};

export const DepartmentId = (raw: string): DepartmentId => {
  if (raw.length === 0) throw new TypeError('DepartmentId must be non-empty');
  return raw as DepartmentId;
};

export const JobProfileId = (raw: string): JobProfileId => {
  if (raw.length === 0) throw new TypeError('JobProfileId must be non-empty');
  return raw as JobProfileId;
};

export const SupOrgId = (raw: string): SupOrgId => {
  if (raw.length === 0) throw new TypeError('SupOrgId must be non-empty');
  return raw as SupOrgId;
};

export const AgentFactId = (raw: string): AgentFactId => {
  if (raw.length === 0) throw new TypeError('AgentFactId must be non-empty');
  return raw as AgentFactId;
};

export const RequisitionId = (raw: string): RequisitionId => {
  if (raw.length === 0) throw new TypeError('RequisitionId must be non-empty');
  return raw as RequisitionId;
};

export const ConnectionString = (raw: string): ConnectionString => {
  if (!raw.startsWith('postgres://') && !raw.startsWith('postgresql://')) {
    throw new TypeError(`ConnectionString must start with postgres:// or postgresql://, got ${raw.slice(0, 20)}...`);
  }
  return raw as ConnectionString;
};

// ── Discriminated Union Types ───────────────────────────────────

export type Track =
  | 'executive'
  | 'management'
  | 'ic_senior'
  | 'ic_principal'
  | 'ic_distinguished'
  | 'ic'
  | 'operations';

export type AgentStatus = 'active' | 'inactive' | 'terminated' | 'on_leave';

export type AgentType = 'named' | 'generic' | 'human';

export type ModelPreference = 'opus' | 'sonnet' | 'haiku' | 'inherit';

export type PipelineStage =
  | 'sourcing'
  | 'applied'
  | 'screen'
  | 'phone_interview'
  | 'onsite_interview'
  | 'scorecard_review'
  | 'offer'
  | 'offer_accepted'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export type RequisitionStatus = 'draft' | 'open' | 'closed' | 'filled' | 'cancelled';

// ── SCD Type 2 Base Fields ──────────────────────────────────────

export interface ScdFields {
  readonly eff_start: string; // ISO 8601 timestamptz
  readonly eff_end: string; // ISO 8601 timestamptz, '9999-12-31T00:00:00Z' for current
  readonly is_current: boolean;
}

// ── Dimension Tables ────────────────────────────────────────────

/** Immutable reference data — 12 levels (no L9) */
export interface DimLevel {
  readonly level_id: LevelId;
  readonly level_code: string; // 'L1'..'L12'
  readonly title_template: string; // '{role} I', 'Director, {function}'
  readonly track_options: readonly Track[];
  readonly min_direct_reports: number;
  readonly max_direct_reports: number | null; // null = unlimited
  readonly is_agent_eligible: boolean; // L4+ = true
  readonly comp_band_min: number | null;
  readonly comp_band_max: number | null;
}

/** SCD Type 2 — department definitions */
export interface DimDepartment extends ScdFields {
  readonly department_sk: number; // surrogate key
  readonly department_id: DepartmentId; // natural key: 'engineering'
  readonly department_name: string;
  readonly parent_dept_id: DepartmentId | null;
  readonly plugin_repo: string | null; // 'jadecli/jade-engineering'
  readonly cost_center: string | null;
}

/** SCD Type 2 — Workday-style job profile templates */
export interface DimJobProfile extends ScdFields {
  readonly job_profile_sk: number;
  readonly job_profile_id: JobProfileId; // 'sde-ii', 'pm-senior'
  readonly title: string;
  readonly level_id: LevelId;
  readonly track: Track;
  readonly department_id: DepartmentId;
  readonly job_family: string; // 'engineering', 'product', 'design'
  readonly requirements: Record<string, unknown>;
}

/** SCD Type 2 — Workday-style supervisory organizations */
export interface DimSupOrg extends ScdFields {
  readonly sup_org_sk: number;
  readonly sup_org_id: SupOrgId; // 'eng-platform', 'sales-enterprise'
  readonly org_name: string;
  readonly department_id: DepartmentId;
  readonly manager_agent_id: string | null; // FK to fact_agent.agent_id
  readonly parent_org_id: SupOrgId | null; // self-referencing
  readonly headcount_budget: number | null;
}

// ── Fact Tables ─────────────────────────────────────────────────

/** Agent Definition stored as JSONB — bridges HR data to Claude Agent SDK */
export interface AgentDefinition {
  readonly description: string;
  readonly prompt: string;
  readonly model?: ModelPreference;
  readonly tools?: readonly string[];
}

/** SCD Type 2 — the core agent registry entity */
export interface FactAgent extends ScdFields {
  readonly agent_sk: number; // surrogate key
  readonly agent_id: string; // 'eng-platform-lead', 'sales-director'
  readonly display_name: string;
  readonly agent_type: AgentType;
  readonly level_id: LevelId;
  readonly job_profile_id: string;
  readonly department_id: string;
  readonly sup_org_id: string;
  readonly reports_to: string | null; // agent_id of manager
  readonly plugin_repo: string | null;
  readonly agent_definition: AgentDefinition | null;
  // Claude Code specific
  readonly model_preference: ModelPreference;
  readonly allowed_tools: readonly string[] | null;
  readonly skills: readonly string[] | null;
  readonly mcp_servers: readonly string[] | null;
  readonly system_prompt: string | null;
  // PeopleSoft effective dating
  readonly hire_date: string | null; // ISO date
  readonly status: AgentStatus;
  // Metadata
  readonly created_at: string;
  readonly updated_at: string;
}

/** Recruiting pipeline — Greenhouse-style requisitions */
export interface FactRequisition {
  readonly req_sk: number;
  readonly req_id: string;
  readonly job_profile_id: string;
  readonly sup_org_id: string;
  readonly hiring_manager: string; // agent_id
  readonly status: RequisitionStatus;
  readonly pipeline_stage: PipelineStage;
  readonly headcount: number;
  readonly opened_date: string; // ISO date
  readonly target_fill_date: string | null;
  readonly filled_date: string | null;
  readonly created_at: string;
}

// ── Input Types (for CRUD operations) ───────────────────────────

export interface CreateAgentInput {
  readonly agent_id: string;
  readonly display_name: string;
  readonly agent_type?: AgentType;
  readonly level_id: LevelId;
  readonly job_profile_id: string;
  readonly department_id: string;
  readonly sup_org_id: string;
  readonly reports_to?: string | null;
  readonly plugin_repo?: string | null;
  readonly agent_definition?: AgentDefinition | null;
  readonly model_preference?: ModelPreference;
  readonly allowed_tools?: readonly string[] | null;
  readonly skills?: readonly string[] | null;
  readonly mcp_servers?: readonly string[] | null;
  readonly system_prompt?: string | null;
  readonly hire_date?: string | null;
}

export interface UpdateAgentInput {
  readonly display_name?: string;
  readonly level_id?: LevelId;
  readonly job_profile_id?: string;
  readonly department_id?: string;
  readonly sup_org_id?: string;
  readonly reports_to?: string | null;
  readonly plugin_repo?: string | null;
  readonly agent_definition?: AgentDefinition | null;
  readonly model_preference?: ModelPreference;
  readonly allowed_tools?: readonly string[] | null;
  readonly skills?: readonly string[] | null;
  readonly mcp_servers?: readonly string[] | null;
  readonly system_prompt?: string | null;
  readonly status?: AgentStatus;
}

export interface CreateRequisitionInput {
  readonly req_id: string;
  readonly job_profile_id: string;
  readonly sup_org_id: string;
  readonly hiring_manager: string;
  readonly headcount?: number;
  readonly target_fill_date?: string | null;
}

// ── Registry Types ──────────────────────────────────────────────

export interface AgentSummary {
  readonly agent_id: string;
  readonly display_name: string;
  readonly level_id: LevelId;
  readonly level_code: string;
  readonly department_id: string;
  readonly department_name: string;
  readonly track: Track;
  readonly status: AgentStatus;
}

export interface OrgNode {
  readonly agent_id: string;
  readonly display_name: string;
  readonly level_id: LevelId;
  readonly level_code: string;
  readonly department_id: string;
  readonly children: readonly OrgNode[];
}

// ── Migration Types ─────────────────────────────────────────────

export interface MigrationResult {
  readonly filename: string;
  readonly applied_at: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly id: number;
  readonly filename: string;
  readonly checksum: string;
  readonly applied_at: string;
}

// ── Error Types (Discriminated Unions) ──────────────────────────

export type ScdError =
  | { readonly type: 'not_found'; readonly entity: string; readonly id: string }
  | { readonly type: 'already_expired'; readonly entity: string; readonly id: string }
  | { readonly type: 'constraint_violation'; readonly detail: string }
  | { readonly type: 'db_error'; readonly cause: Error };

export type AgentCrudError =
  | ScdError
  | { readonly type: 'invalid_level'; readonly level: number }
  | { readonly type: 'duplicate_agent'; readonly agent_id: string }
  | { readonly type: 'invalid_reporting_chain'; readonly detail: string }
  | { readonly type: 'agent_not_found'; readonly agent_id: string };

export type RegistryError =
  | AgentCrudError
  | { readonly type: 'agent_not_found'; readonly agent_id: string }
  | { readonly type: 'resolution_failed'; readonly detail: string };

export type MigrationError =
  | { readonly type: 'checksum_mismatch'; readonly filename: string; readonly expected: string; readonly actual: string }
  | { readonly type: 'migration_failed'; readonly filename: string; readonly cause: Error }
  | { readonly type: 'db_error'; readonly cause: Error };
