import { describe, it, expect } from 'vitest';
import {
  getWorkerConfig,
  getWorkerConfigByChannel,
  listWorkerConfigs,
  buildContextString,
  WorkerConfigError,
  SlackChannel,
  GitHubRepo,
} from '../db/worker-config.js';
import type { FactAgent } from '../types/schema.js';

function mockFactAgent(overrides: Partial<FactAgent> = {}): FactAgent {
  return {
    agent_sk: 1,
    agent_id: 'product-pm',
    display_name: 'Senior PM',
    agent_type: 'named',
    level_id: 6 as FactAgent['level_id'],
    job_profile_id: 'pm-senior',
    department_id: 'product-management',
    sup_org_id: 'product',
    reports_to: null,
    plugin_repo: 'jadecli/jade-product-management',
    agent_definition: { description: 'PM worker', prompt: 'You are the PM.', tools: ['specs', 'user-stories', 'roadmap'] },
    model_preference: 'sonnet',
    allowed_tools: null,
    skills: null,
    mcp_servers: null,
    system_prompt: 'You are the product management knowledge worker.',
    hire_date: null,
    status: 'active',
    eff_start: '2026-01-01T00:00:00Z',
    eff_end: '9999-12-31T00:00:00Z',
    is_current: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('worker-config', () => {
  describe('getWorkerConfig', () => {
    it('returns Ok for known department', () => {
      const r = getWorkerConfig('product-management');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.department).toBe('product-management');
      expect(String(r.value.slack_channel)).toBe('#jade-product-management');
      expect(r.value.default_agent_id).toBe('product-pm');
    });

    it('returns Err for unknown department', () => {
      const r = getWorkerConfig('nonexistent');
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toBeInstanceOf(WorkerConfigError);
      expect(r.error.type).toBe('department_not_found');
    });
  });

  describe('getWorkerConfigByChannel', () => {
    it('returns Ok for known channel', () => {
      const r = getWorkerConfigByChannel('#jade-sales');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.department).toBe('sales');
    });

    it('returns Err for unknown channel', () => {
      const r = getWorkerConfigByChannel('#random');
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.type).toBe('channel_not_found');
    });
  });

  describe('listWorkerConfigs', () => {
    it('returns all 12 departments', () => {
      expect(listWorkerConfigs().length).toBe(12);
    });

    it('departments and channels are unique', () => {
      const configs = listWorkerConfigs();
      expect(new Set(configs.map((c) => c.department)).size).toBe(12);
      expect(new Set(configs.map((c) => c.slack_channel)).size).toBe(12);
    });
  });

  describe('buildContextString', () => {
    const agent = mockFactAgent();
    const team = [
      mockFactAgent({ agent_id: 'product-vp', display_name: 'VP Product', level_id: 10 as FactAgent['level_id'] }),
      mockFactAgent(),
    ];

    function cfg() {
      const r = getWorkerConfig('product-management');
      if (!r.ok) throw new Error('setup');
      return r.value;
    }

    it('includes heading, agent, repo, slack', () => {
      const s = buildContextString(cfg(), agent, team);
      expect(s).toContain('# product-management Knowledge Worker');
      expect(s).toContain('**Agent**: Senior PM (L6)');
      expect(s).toContain('jadecli/jade-product-management');
      expect(s).toContain('#jade-product-management');
    });

    it('includes system prompt and capabilities', () => {
      const s = buildContextString(cfg(), agent, team);
      expect(s).toContain('You are the product management knowledge worker.');
      expect(s).toContain('- specs');
      expect(s).toContain('- roadmap');
    });

    it('falls back to allowed_tools', () => {
      const a = mockFactAgent({ agent_definition: { description: 'x', prompt: 'y' }, allowed_tools: ['linear'] });
      expect(buildContextString(cfg(), a, [])).toContain('- linear');
    });

    it('lists team roster', () => {
      const s = buildContextString(cfg(), agent, team);
      expect(s).toContain('VP Product (L10, active)');
    });

    it('shows placeholder for empty team', () => {
      expect(buildContextString(cfg(), agent, [])).toContain('(no team members registered)');
    });
  });

  describe('branded types', () => {
    it('SlackChannel validates # prefix', () => {
      expect(() => SlackChannel('#ok')).not.toThrow();
      expect(() => SlackChannel('bad')).toThrow(TypeError);
    });

    it('GitHubRepo validates owner/repo', () => {
      expect(() => GitHubRepo('a/b')).not.toThrow();
      expect(() => GitHubRepo('bad')).toThrow(TypeError);
    });
  });
});
