# Cloudflare DNS — jadecli.app

Account: alex@jadecli.com
Zone: jadecli.app

## DNS Records

| Type  | Name          | Target                        | Proxy |
|-------|---------------|-------------------------------|-------|
| CNAME | jadecli.app   | jadecli-app.netlify.app       | OFF   |
| CNAME | www           | jadecli.app                   | ON    |
| CNAME | docs          | jadecli.github.io             | OFF   |

## Worker Routes

| Pattern                  | Worker               |
|--------------------------|----------------------|
| api.jadecli.app/webhook/* | jade-github-webhook |

Workers subdomain: jade.jadecli.workers.dev (auto-assigned)

## Notes

- jadecli.app CNAME to Netlify must be DNS-only (orange cloud OFF) so Netlify can terminate SSL
- www redirect to apex handled by Cloudflare Page Rule
- api.jadecli.app is proxied through Cloudflare for Worker routing
- docs subdomain points to GitHub Pages (future)
