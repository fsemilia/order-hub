# Changelog

All notable changes to Order Hub are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- **Retention agent — bring your own key** (#26): each user saves their own Anthropic API key on
  the agent page, stored AES-256-GCM encrypted in the new `agent_credentials` table, never
  returned or logged (the UI shows only the last 4 characters). The server key
  `ANTHROPIC_API_KEY` is used only by the emails in the new `AGENT_OWNER_EMAILS`, and only when
  they have no key of their own. The shared demo account's key is bound to its session and
  deleted at sign-out; the demo account never gets the server key.

### Changed

- The daily agent quota counts only runs made with the server key (new `agent_runs.keySource`).
- A malformed `ANTHROPIC_API_KEY` disables the agent for owners only; login and webhooks keep
  working.

### Fixed

- The language switcher, store switcher, login data-source toggle and login buttons are
  disabled until the page hydrates, so a choice made on a slow connection is no longer lost
  (#27).
- Local Playwright runs are stable: no `networkidle` waits, sign-in retries while `next dev`
  compiles, routes warmed before the parallel tests (#27).

### Security

- `minimatch` forced to `^11.0.1` under `@typescript-eslint/typescript-estree` with an npm
  override (GHSA-g3hv-75wg-m249, DoS via glob pattern amplification). Development-only
  dependency used by the linter; the vulnerable code path was not reachable.

## [1.0.0] — 2026-11-11

First stable release, live at <https://order-hub-lime.vercel.app>.

### Shopify ingestion

- Signed Shopify webhooks (`orders/*`, `customers/*`, `checkouts/*` and the `customers/redact`
  compliance topic) verified with HMAC over the raw body, per-store secrets encrypted at rest
  (AES-256-GCM).
- One transaction per delivery: idempotency log + upserts; duplicates acknowledged, invalid
  payloads rejected with 422 and rolled back so Shopify's retries can be replayed.
- Stale-update guard on `updated_at`; payloads validated with Zod against API version 2026-10
  (checkouts keyed by `token`, orders linked to their checkout by `checkout_token`).

### CRM

- Customer LTV, average order value and order counts recomputed from orders inside the same
  transaction; money stored as `Decimal(12,2)` and handled as integer cents.
- Segments derived at query time: new, returning, at risk, no purchases.
- Pages: overview dashboard (revenue, average order value, segments, best sellers, recent
  orders), **Orders** (status filter, search, pagination), **Customers** (segment filter,
  search, sort) with customer detail, **Abandoned carts** with recovery links.
- Live refresh every 15 s on the dashboard and the Orders page.

### Retention agent

- Read-only Claude agent with four tools (store overview, customer search, customer profile,
  abandoned checkouts); it only sees first names and internal ids (LGPD) and returns drafts.
- Per-user rolling 24-hour quota and an audit log with tokens and latency.

### Platform

- Multiple stores per installation plus a demo store with 160 seeded customers; login lets you
  choose demo or real data.
- UI in English, Brazilian Portuguese and Italian with locale-aware money and dates.
- Better Auth (email/password, optional GitHub), authorization next to the data, every query
  scoped by store.
- Scripts to populate a real development store (products, customers, orders, abandoned
  checkouts).

### Quality

- Unit, integration (real Postgres) and Playwright E2E suites; GitHub Actions on every PR;
  protected `main` that requires all checks.
- Trilingual documentation (en, pt-BR, it): architecture, ADRs, Shopify setup, deploy, agent and
  a list of known limitations.

[Unreleased]: https://github.com/fsemilia/order-hub/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fsemilia/order-hub/releases/tag/v1.0.0
