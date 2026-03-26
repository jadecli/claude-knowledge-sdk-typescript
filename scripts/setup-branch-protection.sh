#!/bin/bash
# Setup branch protection for main branch
# Requires: gh cli authenticated with admin access
# Run: bash scripts/setup-branch-protection.sh

set -e

REPO="jadecli/claude-knowledge-sdk-typescript"

echo "Setting up branch protection for main..."

gh api "repos/$REPO/branches/main/protection" \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["typecheck","test","lint"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false

echo ""
echo "Branch protection configured:"
echo "  - Require PR with 1 approval"
echo "  - Dismiss stale reviews on new pushes"
echo "  - Require status checks: typecheck, test, lint"
echo "  - Require linear history (no merge commits)"
echo "  - Block force pushes and branch deletion"
echo ""
echo "Required GitHub Secrets (set via Settings > Secrets > Actions):"
echo "  CLAUDE_CODE_OAUTH_TOKEN — from 'claude setup-token' (Pro/Max)"
echo "  CLAUDE_API_KEY — Anthropic API key with Claude Code enabled"
echo ""
echo "Install Claude GitHub App: run /install-github-app in Claude Code"
