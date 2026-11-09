---
name: ship-feature
description: Take an Order Hub change from a clean branch to a reviewed pull request (branch naming, checks, conventional commits, PR description). Use when the user says "ship it", "open a PR", "commit this", or finishes a feature.
---

# Ship a feature

1. **Branch** from up-to-date `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
2. **Self-review the diff** (`git diff main...`) as if someone else wrote it — especially AI-generated
   code. Use the `code-reviewer` subagent for anything touching webhooks, auth, money or the agent.
3. **Checks** (all must pass):
   - `npm run check` — lint, types, unit tests
   - `npm run format:check`
   - `npm run test:integration` — if DB, webhooks or queries changed (needs `npm run db:test:start`)
   - `npm run test:e2e` — if UI or auth changed (needs a seeded DB and `npm run dev`)
4. **Docs**: README / `docs/` / ADR updated when behavior, setup or a decision changed.
5. **Commit** with Conventional Commits, imperative, scope optional:
   `feat(webhooks): handle refunds/create`, `fix(crm): exclude voided orders from LTV`.
   One logical change per commit. Never commit `.env*` (except `.env.example`).
6. **PR** with `gh pr create`, filling `.github/pull_request_template.md`: what/why, how to test,
   checklist. Keep PRs small (< ~400 lines of non-generated diff).
7. Wait for CI (quality, integration, e2e). Vercel posts a preview URL on the PR.
