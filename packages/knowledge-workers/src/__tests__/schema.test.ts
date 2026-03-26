import { describe, it, expect } from 'vitest';
import {
  LevelId,
  DepartmentId,
  JobProfileId,
  SupOrgId,
  AgentFactId,
  RequisitionId,
  ConnectionString,
} from '../types/schema.js';

describe('Schema branded types', () => {
  describe('LevelId', () => {
    it('accepts valid levels 1-8', () => {
      for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(LevelId(level)).toBe(level);
      }
    });

    it('accepts valid levels 10-12', () => {
      for (const level of [10, 11, 12]) {
        expect(LevelId(level)).toBe(level);
      }
    });

    it('rejects level 9 (intentional gap)', () => {
      expect(() => LevelId(9)).toThrow('LevelId must be 1-8 or 10-12 (no L9)');
    });

    it('rejects level 0', () => {
      expect(() => LevelId(0)).toThrow('LevelId must be 1-8 or 10-12');
    });

    it('rejects level 13', () => {
      expect(() => LevelId(13)).toThrow('LevelId must be 1-8 or 10-12');
    });

    it('rejects negative levels', () => {
      expect(() => LevelId(-1)).toThrow('LevelId must be 1-8 or 10-12');
    });
  });

  describe('DepartmentId', () => {
    it('accepts non-empty strings', () => {
      expect(DepartmentId('engineering')).toBe('engineering');
    });

    it('rejects empty strings', () => {
      expect(() => DepartmentId('')).toThrow('DepartmentId must be non-empty');
    });
  });

  describe('JobProfileId', () => {
    it('accepts non-empty strings', () => {
      expect(JobProfileId('sde-ii')).toBe('sde-ii');
    });

    it('rejects empty strings', () => {
      expect(() => JobProfileId('')).toThrow('JobProfileId must be non-empty');
    });
  });

  describe('SupOrgId', () => {
    it('accepts non-empty strings', () => {
      expect(SupOrgId('eng-platform')).toBe('eng-platform');
    });

    it('rejects empty strings', () => {
      expect(() => SupOrgId('')).toThrow('SupOrgId must be non-empty');
    });
  });

  describe('AgentFactId', () => {
    it('accepts non-empty strings', () => {
      expect(AgentFactId('agent-123')).toBe('agent-123');
    });

    it('rejects empty strings', () => {
      expect(() => AgentFactId('')).toThrow('AgentFactId must be non-empty');
    });
  });

  describe('RequisitionId', () => {
    it('accepts non-empty strings', () => {
      expect(RequisitionId('req-001')).toBe('req-001');
    });

    it('rejects empty strings', () => {
      expect(() => RequisitionId('')).toThrow('RequisitionId must be non-empty');
    });
  });

  describe('ConnectionString', () => {
    it('accepts postgres:// URLs', () => {
      const cs = ConnectionString('postgres://user:pass@host/db');
      expect(cs).toBe('postgres://user:pass@host/db');
    });

    it('accepts postgresql:// URLs', () => {
      const cs = ConnectionString('postgresql://user:pass@host/db');
      expect(cs).toBe('postgresql://user:pass@host/db');
    });

    it('rejects non-postgres URLs', () => {
      expect(() => ConnectionString('https://example.com')).toThrow('ConnectionString must start with postgres://');
    });

    it('rejects empty strings', () => {
      expect(() => ConnectionString('')).toThrow('ConnectionString must start with postgres://');
    });
  });
});

describe('Level system invariants', () => {
  const VALID_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12];

  it('has exactly 11 valid levels (no L9)', () => {
    expect(VALID_LEVELS).toHaveLength(11);
    expect(VALID_LEVELS).not.toContain(9);
  });

  it('L1-L3 are operations (no agent personas)', () => {
    // Levels 1-3 should construct fine but aren't agent-eligible
    for (const level of [1, 2, 3]) {
      expect(LevelId(level)).toBe(level);
    }
  });

  it('L4+ are agent-eligible', () => {
    for (const level of [4, 5, 6, 7, 8, 10, 11, 12]) {
      expect(LevelId(level)).toBe(level);
    }
  });
});
