import { describe, it, expect } from 'vitest';
import {
  todo,
  buildTodoList,
  markInProgress,
  markCompleted,
  quickTodoList,
  buildAgentInput,
  buildResearchAgent,
  buildImplementationAgent,
  todoFilePath,
  subagentTodoFilePath,
  SessionId,
  AgentId,
} from '../index.js';

describe('todo', () => {
  it('creates a pending todo with defaults', () => {
    const t = todo('Fix the auth bug');
    expect(t.content).toBe('Fix the auth bug');
    expect(t.status).toBe('pending');
    expect(t.priority).toBe('medium');
    expect(t.id).toBeDefined();
    expect(t.activeForm).toBe('Fix the auth bug');
  });

  it('creates an in_progress todo with auto-generated activeForm', () => {
    const t = todo('Write unit tests', { status: 'in_progress' });
    expect(t.status).toBe('in_progress');
    expect(t.activeForm).toBe('Writing unit tests');
  });

  it('handles verbs ending in e', () => {
    const t = todo('Create the module', { status: 'in_progress' });
    expect(t.activeForm).toBe('Creating the module');
  });

  it('handles consonant doubling for CVC verbs', () => {
    const run = todo('Run the tests', { status: 'in_progress' });
    expect(run.activeForm).toBe('Running the tests');
    const set = todo('Set the config', { status: 'in_progress' });
    expect(set.activeForm).toBe('Setting the config');
  });

  it('respects explicit activeForm override', () => {
    const t = todo('Run CI', { status: 'in_progress', activeForm: 'Running CI pipeline' });
    expect(t.activeForm).toBe('Running CI pipeline');
  });

  it('respects explicit id and priority', () => {
    const t = todo('Deploy', { id: 'deploy-1', priority: 'high' });
    expect(t.id).toBe('deploy-1');
    expect(t.priority).toBe('high');
  });
});

describe('buildTodoList', () => {
  it('produces TodoWriteInput with SDK 3-field schema', () => {
    const items = [
      todo('Task A', { status: 'completed', id: '1' }),
      todo('Task B', { status: 'in_progress', id: '2' }),
    ];
    const input = buildTodoList(items);
    expect(input.todos).toHaveLength(2);
    // SDK schema: content, status, activeForm only (no id, no priority)
    const first = input.todos[0]!;
    expect(first.content).toBe('Task A');
    expect(first.status).toBe('completed');
    expect(first.activeForm).toBeDefined();
    expect((first as Record<string, unknown>)['id']).toBeUndefined();
    expect((first as Record<string, unknown>)['priority']).toBeUndefined();
  });
});

describe('markInProgress', () => {
  it('marks the target todo as in_progress', () => {
    const items = quickTodoList('Task A', 'Task B', 'Task C');
    const updated = markInProgress(items, '2');
    expect(updated.find((t) => t.id === '2')?.status).toBe('in_progress');
  });

  it('reverts any other in_progress item to pending', () => {
    const items = quickTodoList('Task A', 'Task B');
    const step1 = markInProgress(items, '1');
    const step2 = markInProgress(step1, '2');
    expect(step2.find((t) => t.id === '1')?.status).toBe('pending');
    expect(step2.find((t) => t.id === '2')?.status).toBe('in_progress');
  });

  it('sets activeForm to present continuous', () => {
    const items = [todo('Fix the tests', { id: 'fix' })];
    const updated = markInProgress(items, 'fix');
    expect(updated[0]?.activeForm).toBe('Fixing the tests');
  });
});

describe('markCompleted', () => {
  it('marks the target todo as completed', () => {
    const items = quickTodoList('Task A', 'Task B');
    const updated = markCompleted(items, '1');
    expect(updated.find((t) => t.id === '1')?.status).toBe('completed');
    expect(updated.find((t) => t.id === '2')?.status).toBe('pending');
  });
});

describe('quickTodoList', () => {
  it('creates numbered pending items', () => {
    const items = quickTodoList('First', 'Second', 'Third');
    expect(items).toHaveLength(3);
    expect(items[0]?.id).toBe('1');
    expect(items[1]?.id).toBe('2');
    expect(items[2]?.id).toBe('3');
    expect(items.every((t) => t.status === 'pending')).toBe(true);
  });
});

describe('buildAgentInput', () => {
  it('builds minimal agent input', () => {
    const input = buildAgentInput({ description: 'Test', prompt: 'Do something' });
    expect(input.description).toBe('Test');
    expect(input.prompt).toBe('Do something');
    expect(input.subagent_type).toBe('general-purpose');
  });

  it('includes optional fields when provided', () => {
    const input = buildAgentInput({
      description: 'Research',
      prompt: 'Find docs',
      type: 'Explore',
      model: 'sonnet',
      background: true,
      maxTurns: 15,
      isolation: 'worktree',
    });
    expect(input.subagent_type).toBe('Explore');
    expect(input.model).toBe('sonnet');
    expect(input.run_in_background).toBe(true);
    expect(input.max_turns).toBe(15);
    expect(input.isolation).toBe('worktree');
  });

  it('omits optional fields when not provided', () => {
    const input = buildAgentInput({ description: 'Test', prompt: 'Test' });
    expect(input.model).toBeUndefined();
    expect(input.run_in_background).toBeUndefined();
    expect(input.max_turns).toBeUndefined();
    expect(input.isolation).toBeUndefined();
  });
});

describe('buildResearchAgent', () => {
  it('builds a Sonnet background Explore agent', () => {
    const input = buildResearchAgent('TypeScript patterns', 'Research strict TypeScript patterns');
    expect(input.subagent_type).toBe('Explore');
    expect(input.model).toBe('sonnet');
    expect(input.run_in_background).toBe(true);
    expect(input.description).toContain('Research');
  });

  it('truncates long topic in description', () => {
    const longTopic = 'A'.repeat(100);
    const input = buildResearchAgent(longTopic, 'instructions');
    expect(input.description.length).toBeLessThanOrEqual(60); // "Research: " + 50 chars
  });
});

describe('buildImplementationAgent', () => {
  it('builds a general-purpose foreground agent', () => {
    const input = buildImplementationAgent('Add tests', 'Write unit tests for module X');
    expect(input.subagent_type).toBe('general-purpose');
    expect(input.run_in_background).toBeUndefined();
    expect(input.prompt).toBe('Write unit tests for module X');
  });
});

describe('todoFilePath / subagentTodoFilePath', () => {
  it('returns session todo path with branded SessionId', () => {
    expect(todoFilePath(SessionId('sess-123'))).toBe('~/.claude/todos/sess-123.json');
  });

  it('returns subagent todo path with branded types', () => {
    expect(subagentTodoFilePath(SessionId('sess-123'), AgentId('agent-456'))).toBe(
      '~/.claude/todos/sess-123-agent-agent-456.json',
    );
  });
});
