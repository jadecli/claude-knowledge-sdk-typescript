# Netlify Setup — jadecli.app

Account: alex@jadecli.com
Site name: jadecli-app
Custom domain: jadecli.app

## Configuration (netlify.toml)

```toml
[build]
command = "npm run build"
publish = "dist"

[build.environment]
NODE_VERSION = "20"

[[redirects]]
from = "/api/*"
to = "https://api.jadecli.app/:splat"
status = 200
force = true
```

## DNS (in Cloudflare)

1. jadecli.app -> CNAME -> jadecli-app.netlify.app (DNS only, NOT proxied)
2. www.jadecli.app -> CNAME -> jadecli.app (page rule redirect)

Netlify needs DNS-only (no Cloudflare proxy) to manage its own SSL certificates.

## Setup

```bash
netlify login
netlify deploy --prod
```
