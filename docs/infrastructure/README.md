# Infrastructure

jadecli ecosystem infrastructure documentation.

| Service    | Purpose                           | Account           |
|------------|-----------------------------------|--------------------|
| Neon       | Postgres 18 with branch-per-PR    | alex@jadecli.com   |
| Cloudflare | DNS + Workers (webhook handler)   | alex@jadecli.com   |
| Netlify    | jadecli.app hosting               | alex@jadecli.com   |
| Linear     | Project management (sprints)      | alex@jadecli.com   |

## Setup Order

1. [Neon Postgres](./neon-setup.md) — database with auto-branching
2. [Cloudflare DNS](./cloudflare-dns.md) — DNS zone for jadecli.app
3. [Netlify](./netlify-setup.md) — hosting for jadecli.app

## Unified Setup Script

Run `bash scripts/setup-infrastructure.sh` for a guided walkthrough of all services.
