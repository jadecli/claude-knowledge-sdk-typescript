---
name: sprint-planning
description: >
  Convert structured task lists into Linear issues, cycles, and projects. Use when planning
  sprints, importing task lists, syncing progress to Linear, creating sprint cycles, or
  converting XML/markdown task lists into tracked issues.
---

# Sprint Planning

Converts structured task lists (XML, markdown, or conversation) into Linear issues
organized by project, cycle, and priority.

## Process

### Step 1: Parse the task list

Accept tasks in any format:
- XML `<task>` elements with id, priority, content, activeForm attributes
- Markdown checklists with priority annotations
- Conversational descriptions of work to be done

### Step 2: Map to Linear structure

| Task Field | Linear Field |
|-----------|-------------|
| Phase/group | Project |
| Task content | Issue title + description |
| Priority critical | Urgent |
| Priority high | High |
| Priority medium | Medium |
| Priority low | Low |
| Phase number | Cycle (Sprint N) |
| Commit scope | Label |

### Step 3: Create issues via Linear MCP

Use the Linear MCP (connected at https://mcp.linear.app/mcp) to create:
1. **Project** for each phase/milestone
2. **Cycle** for each sprint
3. **Labels** matching commit scopes (types, agent, knowledge, etc.)
4. **Issues** for each task with priority, project, cycle, and labels

### Step 4: Track progress

As work proceeds, update Linear issues:
- Move to "In Progress" when starting a task
- Move to "Done" when the corresponding commit lands
- Link commits via footer: `Closes JADE-123`

## Linear Integration

The jadecli Linear workspace uses GitHub integration for auto-close on merge.
Include the Linear issue ID in commit footers to auto-transition issues:

```
feat(types): add LSP tool types

Closes JAD-38
```

## Team and Workspace

- Workspace: jadecli
- Team: Jadecli
- Issue prefix: JAD
