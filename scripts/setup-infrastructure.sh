#!/bin/bash
# Unified infrastructure setup for jadecli ecosystem
# Run: bash scripts/setup-infrastructure.sh

set -e

echo "=== jadecli Infrastructure Setup ==="
echo ""

# Step 1: GitHub CLI
echo "Step 1: Verify GitHub CLI..."
if gh auth status 2>/dev/null; then
  echo "  GitHub CLI authenticated."
else
  echo "  Please run: gh auth login"
  exit 1
fi
echo ""

# Step 2: Branch protection
read -p "Step 2: Configure branch protection on main? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  bash scripts/setup-branch-protection.sh
fi
echo ""

# Step 3: Neon
read -p "Step 3: Set up Neon Postgres? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  Authenticating Neon CLI..."
  npx neonctl auth
  echo "  Creating project..."
  npx neonctl projects create --name jadecli-production || echo "  Project may already exist."
  echo "  See docs/infrastructure/neon-setup.md for GitHub App installation."
fi
echo ""

# Step 4: Cloudflare Workers
read -p "Step 4: Deploy Cloudflare Worker? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  Authenticating Cloudflare..."
  npx wrangler login
  echo "  See docs/infrastructure/cloudflare-dns.md for DNS configuration."
fi
echo ""

# Step 5: Netlify
read -p "Step 5: Set up Netlify? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  Authenticating Netlify..."
  npx netlify-cli login
  echo "  See docs/infrastructure/netlify-setup.md for deployment."
fi
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Service URLs:"
echo "  Site:    https://jadecli.app"
echo "  API:     https://api.jadecli.app"
echo "  Docs:    https://docs.jadecli.app"
echo ""
echo "Next steps:"
echo "  1. Add GitHub Secrets (CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_API_KEY)"
echo "  2. Install Neon GitHub App: github.com/apps/neon-database"
echo "  3. Configure Cloudflare DNS records (see docs/infrastructure/cloudflare-dns.md)"
echo "  4. Run /install-github-app in Claude Code"
