export type { NeonClient, QueryResult, Row } from './db/neon-client.js';
export type {
  SurrogateKey,
  NaturalKey,
  AgentId,
  DepartmentId,
  Result,
  SCDRow,
  AgentLevel,
  AgentRecord,
  AgentDefinition,
  OrgChartNode,
} from './db/types.js';
export { Ok, Err, validateAgentLevel } from './db/types.js';
export {
  insertWithEffectiveDating,
  expireRow,
  getAsOf,
  getHistory,
} from './db/scd.js';
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
export {
  resolveAgent,
  listDepartmentAgents,
  getOrgChart,
} from './db/agent-registry.js';
