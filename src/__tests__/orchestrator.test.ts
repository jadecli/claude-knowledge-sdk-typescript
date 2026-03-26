import { describe, it, expect } from 'vitest';
import { planScale, generateTasks, taskToAgentDef } from '../index.js';
import type { QueryClassification, ResearchTask } from '../index.js';

describe('planScale', () => {
  it('returns 0 agents for simple queries', () => {
    const result = planScale({ type: 'simple', directAnswer: true });
    expect(result.agentCount).toBe(0);
    expect(result.model).toBe('haiku');
  });

  it('returns 1 agent for lookup queries', () => {
    const result = planScale({ type: 'lookup', sources: ['docs', 'api'] });
    expect(result.agentCount).toBe(1);
    expect(result.toolCallsPerAgent).toBe(10);
    expect(result.model).toBe('sonnet');
  });

  it('scales comparison agents to entity count, capped at 5', () => {
    const result = planScale({ type: 'comparison', entities: ['A', 'B', 'C'] });
    expect(result.agentCount).toBe(3);

    const capped = planScale({ type: 'comparison', entities: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] });
    expect(capped.agentCount).toBe(5);
  });

  it('scales deep_dive agents to facet count, capped at 4', () => {
    const result = planScale({ type: 'deep_dive', facets: ['perf', 'security'] });
    expect(result.agentCount).toBe(2);

    const capped = planScale({ type: 'deep_dive', facets: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(capped.agentCount).toBe(4);
  });

  it('scales survey agents to subtopic count, capped at 10', () => {
    const result = planScale({ type: 'survey', subtopics: ['t1', 't2', 't3'], breadth: 3 });
    expect(result.agentCount).toBe(3);
    expect(result.toolCallsPerAgent).toBe(15);

    const many = Array.from({ length: 20 }, (_, i) => `topic-${i}`);
    const capped = planScale({ type: 'survey', subtopics: many, breadth: 20 });
    expect(capped.agentCount).toBe(10);
  });
});

describe('generateTasks', () => {
  it('returns empty array for simple queries', () => {
    const tasks = generateTasks('What is 2+2?', { type: 'simple', directAnswer: true });
    expect(tasks).toHaveLength(0);
  });

  it('generates 1 task for lookup queries', () => {
    const tasks = generateTasks('Find the API docs', { type: 'lookup', sources: ['api-reference'] });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.objective).toContain('api-reference');
    expect(tasks[0]!.objective).toContain('Find the API docs');
    expect(tasks[0]!.model).toBe('sonnet');
    expect(tasks[0]!.tools).toContain('WebSearch');
  });

  it('generates tasks per entity for comparisons', () => {
    const tasks = generateTasks('Compare React vs Vue', { type: 'comparison', entities: ['React', 'Vue'] });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.objective).toContain('React');
    expect(tasks[1]!.objective).toContain('Vue');
  });

  it('caps tasks to agent count limit', () => {
    const entities = Array.from({ length: 10 }, (_, i) => `Entity${i}`);
    const tasks = generateTasks('Compare all', { type: 'comparison', entities });
    expect(tasks).toHaveLength(5); // capped at 5 by planScale
  });

  it('assigns unique branded AgentIds', () => {
    const tasks = generateTasks('Survey topics', { type: 'survey', subtopics: ['a', 'b', 'c'], breadth: 3 });
    const ids = tasks.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it('sets maxTurns from planScale', () => {
    const tasks = generateTasks('Deep dive into X', { type: 'deep_dive', facets: ['performance'] });
    expect(tasks[0]!.maxTurns).toBe(15);
  });
});

describe('taskToAgentDef', () => {
  const task: ResearchTask = {
    id: 'research-0' as ResearchTask['id'],
    objective: 'Research caching strategies',
    outputFormat: 'summary',
    tools: ['Read', 'WebSearch'],
    model: 'sonnet',
    maxTurns: 10,
    sources: ['caching', 'redis'],
  };

  it('converts task to AgentDefinition', () => {
    const def = taskToAgentDef(task);
    expect(def.description).toContain('caching');
    expect(def.description).toContain('redis');
    expect(def.prompt).toBe('Research caching strategies');
    expect(def.model).toBe('sonnet');
    expect(def.maxTurns).toBe(10);
  });

  it('copies tools array (not reference)', () => {
    const def = taskToAgentDef(task);
    expect(def.tools).toEqual(['Read', 'WebSearch']);
    expect(def.tools).not.toBe(task.tools); // different reference
  });
});
