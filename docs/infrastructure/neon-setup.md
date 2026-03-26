# Neon Postgres Setup

## Project: jadecli-production

Neon provides branching Postgres 18 with copy-on-write database forks per PR.

### Initial Setup

1. Create project at [neon.tech](https://neon.tech) (alex@jadecli.com)
2. Project name: `jadecli-production`, region: us-east-2
3. Primary branch: `main` (Postgres 18)

### GitHub App Integration

1. Install [Neon Database GitHub App](https://github.com/apps/neon-database) on jadecli org
2. Enable auto-branching: PR opened -> create Neon branch `preview/{branch_name}`
3. PR merged -> delete preview branch (or promote for schema migrations)

### Connection Strings

```
# Primary (production)
postgres://alex@{project-id}.{region}.neon.tech/jadecli

# Preview branch
postgres://alex@{branch-id}.{region}.neon.tech/jadecli
```

### Claude Code Integration

```bash
claude mcp add --transport http neon https://mcp.neon.tech/mcp
```

MCP tools: `create_branch`, `delete_branch`, `list_branches`, `run_sql`, `get_connection_string`

### Setup Script

```bash
# Authenticate Neon CLI
npx neonctl auth

# Create project
npx neonctl projects create --name jadecli-production

# List branches
npx neonctl branches list --project-id <project-id>
```
