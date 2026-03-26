/**
 * @jadecli/knowledge-workers
 * Shared CRUD manager, agent registry, SCD engine, and migration runner
 * for the jadecli ecosystem — backed by Neon Postgres 18.
 */

// ── Types & Smart Constructors ──────────────────────────────────
// Branded types export both the type and the smart constructor (same name)
export {
  LevelId,
  DepartmentId,
  JobProfileId,
  SupOrgId,
  AgentFactId,
  RequisitionId,
  ConnectionString,
} from './types/schema.js';

export type {
  // Branded type aliases (use typeof for the type form)
  LevelId as LevelIdType,
  DepartmentId as DepartmentIdType,
  JobProfileId as JobProfileIdType,
  SupOrgId as SupOrgIdType,
  AgentFactId as AgentFactIdType,
  RequisitionId as RequisitionIdType,
  ConnectionString as ConnectionStringType,
  // Discriminated unions
  Track,
  AgentStatus,
  AgentType,
  ModelPreference,
  PipelineStage,
  RequisitionStatus,
  // SCD base
  ScdFields,
  // Dimension tables
  DimLevel,
  DimDepartment,
  DimJobProfile,
  DimSupOrg,
  // Fact tables
  AgentDefinition,
  FactAgent,
  FactRequisition,
  // Input types
  CreateAgentInput,
  UpdateAgentInput,
  CreateRequisitionInput,
  // Registry types
  AgentSummary,
  OrgNode,
  // Migration types
  MigrationResult,
  AppliedMigration,
  // Error types
  ScdError,
  AgentCrudError,
  RegistryError,
  MigrationError,
} from './types/schema.js';

// ── Result Monad ────────────────────────────────────────────────
export { Ok, Err, mapResult, flatMapResult, tryCatch, assertNever } from './types/result.js';
export type { Result } from './types/result.js';

// ── Neon Client ─────────────────────────────────────────────────
export { connect } from './db/neon-client.js';
export type { NeonClient } from './db/neon-client.js';

// ── SCD Type 2 Engine ───────────────────────────────────────────
export {
  insertWithEffectiveDating,
  expireRow,
  getAsOf,
  getHistory,
} from './db/scd.js';

// ── Agent CRUD ──────────────────────────────────────────────────
export {
  createAgent,
  getAgent,
  updateAgent,
  deactivateAgent,
  listAgentsByDepartment,
  listAgentsByLevel,
  getReportingChain,
  getDirectReports,
} from './db/agent-crud.js';

// ── Agent Registry ──────────────────────────────────────────────
export {
  registerAgent,
  deregisterAgent,
  resolveAgent,
  listDepartmentAgents,
  getOrgChart,
} from './registry/agent-registry.js';
export type { ListAgentsOptions } from './registry/agent-registry.js';

// ── Migrations ──────────────────────────────────────────────────
export { runMigrations, getMigrationStatus } from './migrations/runner.js';
