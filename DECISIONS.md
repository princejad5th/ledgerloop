# DECISIONS

Every non-obvious technical decision for LedgerLoop, with rationale. Decisions are listed in roughly the order they would matter during the build. Where a decision diverges from the original build spec, the divergence is called out explicitly with the word **SPEC DIVERGENCE**.

---

## 1. Spec divergences uncovered during planning

These are factual corrections to the build spec, found while verifying rates and API behaviour. The build should follow the corrected values, not the spec.

### 1.1 Depop seller fee — SPEC DIVERGENCE

The spec defaults Depop selling fee to 10%. As of mid-2024, **Depop no longer charges a selling fee for UK or US sellers**. Only the Depop Payments processing fee remains.

**Use these defaults instead:**

- Depop selling fee: 0%
- Depop Payments fee: 2.9% + £0.30 per transaction (UK)
- Optional "Boost" fee: 12% (user-toggled, not applied by default)

These are stored under `Settings → Platforms` per user and are editable, so when Depop next changes their pricing the fix is a per-user override or a single config update — not a code change.

Source: [Depop seller fees and charges (Help Centre)](https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges).

### 1.2 SA103 short vs full — SPEC DIVERGENCE

The spec references SA103 box numbers (Box 9 turnover, Box 20 cost of goods, Box 30 other expenses, Box 31 net profit). Those are the **SA103F (full)** box numbers. Sellers with turnover under £90,000 — the overwhelming majority of the target users — file **SA103S (short)**, where the structure is simpler:

- SA103S Box 9 — Your turnover (total takings, fees, tips, before expenses)
- SA103S Box 20 — Total allowable expenses (or trading allowance)
- SA103S Box 21 — Net profit
- SA103S Box 31 — Total taxable profits

The engine generates **both** mappings and the exported CSV picks the right one based on whether the user's turnover is under or over the VAT registration threshold. Full mapping table is in `docs/tax-engine.md`.

### 1.3 Class 2 NIC small profits threshold — SPEC DIVERGENCE

The spec says "Class 2 NIC abolished for most self-employed from 2024/25; check status." The verified detail:

- Class 2 NIC liability was abolished for those whose profits exceed the **Small Profits Threshold** from April 2024.
- For 2024/25 the SPT was £6,725. For 2025/26 it is **£6,845**.
- Below SPT, Class 2 NIC is voluntary at £3.50/week (2025/26 rate). The engine offers it as a toggle in Tax Settings; default off.

Encoded in the per-tax-year rates config; never inlined in business logic.

Source: [Self-employed National Insurance rates — GOV.UK](https://www.gov.uk/self-employed-national-insurance-rates).

### 1.4 Scottish income tax bands — additional decision

The spec hard-codes the rest-of-UK income tax bands. Scottish residents have a different set (Starter, Basic, Intermediate, Higher, Advanced, Top — six bands). The engine supports this via a `taxJurisdiction` field on `User` (default `EW_NI`, alternative `SCOTLAND`). The Welsh rates currently mirror the rest-of-UK, so no separate jurisdiction is needed for Wales today; we will revisit if the Welsh Government devolves to different bands.

---

## 2. Stack decisions

### 2.1 Next.js App Router over Pages Router

App Router is the path forward and the spec explicitly calls for it. Server Actions in particular let us colocate mutations next to the components that trigger them, which keeps the inventory CRUD flow simple. We accept the trade-off that some libraries (notably some chart libraries) are still SSR-awkward; charts are rendered in client components inside `'use client'` boundaries.

### 2.2 pnpm workspaces over Turborepo or Nx

The spec demands a monorepo and pnpm workspaces are the minimum-viable choice. We deliberately do not introduce Turborepo or Nx at the start, because the build graph is small (two apps, six packages) and the cost of an extra tool is not justified yet. We add Turborepo at the point where `pnpm -r build` exceeds 30 seconds in CI.

### 2.3 Auth.js v5 over Clerk or Lucia

The spec names Auth.js. We confirm the choice: Auth.js v5 supports the three required login methods (email/password, Google, magic link) and integrates cleanly with Prisma. Clerk is faster to ship but adds a per-MAU cost and a vendor lock-in that conflicts with the "user trust, data safe" priority. Lucia is lighter but lacks the OAuth provider catalogue we need.

JWT session strategy with a 30-day rolling expiry. Database sessions were considered but rejected — the additional DB round-trip per request is not worth it for an app of this scale.

### 2.4 Prisma over Drizzle

Prisma's migration story and the generated client's ergonomics outweigh Drizzle's lower runtime overhead for this app's scale. We use `Decimal(12, 2)` for every money value (Postgres `numeric(12, 2)`); decimal.js on the read side. The decision to never use JS `number` for money is enforced by an eslint rule that bans `Number()` and arithmetic operators inside `packages/core` (see `packages/config/eslint.money.cjs`).

### 2.5 BullMQ on Redis over inline jobs or Vercel Cron

Inline jobs in serverless route handlers cannot meet the spec's "initial eBay import for 24 months of orders" requirement — that's a long-running job that needs retries, observability, and a place to live that isn't a request handler. BullMQ on Redis with a dedicated worker process is the standard answer. Vercel Cron is used only as a heartbeat (`/api/cron/heartbeat`) to ensure the worker is alive; actual scheduling is BullMQ repeatable jobs.

### 2.6 Stripe Billing over Paddle, Lemon Squeezy

Stripe is the spec choice and we confirm. Stripe Billing handles UK VAT cleanly via Stripe Tax (registered in the UK only — we do not enable EU OSS at launch to avoid the registration overhead; revisit when EU customers exceed 5% of revenue). Paddle would handle MoR-style tax compliance for us, but the per-transaction cut is higher and migrating later is painful.

### 2.7 Resend over Postmark for transactional email

Resend has first-class React Email integration and the inbound parsing required for the Pro tier's email-forwarding inbox. Postmark inbound is more mature but Resend is improving fast and the developer experience for our use case is better. Decision is revisitable if Resend inbound proves unreliable during the integration test phase.

### 2.8 Cloudflare R2 over AWS S3

R2 has zero egress fees, which matters because we will be serving receipt thumbnails and CSV exports back to users many times. API-compatible with S3, so the SDK is the same. We pay in £, not $, which simplifies invoicing for the UK-only target market.

### 2.9 Vercel + Railway over single-provider

Vercel for the Next.js app gets us the App Router caching primitives natively. Railway hosts the worker, Redis, and Postgres in a single project, which keeps the worker close to the database for low-latency queue polling. We considered Fly.io for everything but the Vercel preview-deploy story is a productivity win that outweighs the operational complexity of two providers.

---

## 3. Data model decisions

### 3.1 Soft deletes via `deletedAt` and a 30-day grace period

GDPR requires hard deletion on request, but accidental deletion is also a problem. The `deletedAt` column on `User`, `Item`, and `Expense` plus a daily `cleanup:soft-deletes` worker job that hard-deletes records soft-deleted for 30 days gives us both. Users requesting GDPR deletion explicitly get hard deletion immediately after the 30-day grace, with a JSON export download offered first.

### 3.2 UUID primary keys

UUIDs everywhere, generated by Prisma's `@default(uuid())`. The cost is index bloat versus auto-incrementing integers; the benefit is that we never leak record counts in URLs or accidentally allow IDOR by sequential-ID guessing. For a multi-tenant SaaS this is the right trade-off.

### 3.3 Encrypted token columns

`PlatformConnection.accessToken` and `refreshToken` are stored encrypted at the application layer using AES-256-GCM. The key lives in `ENCRYPTION_KEY` (env). Postgres-level encryption is not enough — a compromised application user must not be able to read tokens by SELECT-ing the table.

The encrypted blob is stored in a single `text` column as `<iv>:<authtag>:<ciphertext>` base64-encoded. Helpers in `packages/db/src/crypto.ts`. **Rotating the encryption key requires re-encrypting every row** — there is a `pnpm tokens:rotate-key` script in the worker app for this.

### 3.4 No multi-tenancy via separate schemas

The spec mentions "Multiple shops/workspaces" as a Business tier feature. We implement this as a `Workspace` model with users belonging to workspaces (many-to-many via `WorkspaceMembership`), not as schema-per-tenant Postgres or DB-per-tenant. The latter does not scale operationally for a SaaS aimed at individual resellers. Workspace isolation is enforced in every server action and route handler by `whereWorkspace(ctx.workspaceId)` helpers.

For Starter and Pro tiers, each user has exactly one workspace auto-created at signup. The Business tier exposes the workspace switcher in the top bar.

---

## 4. Calculation engine decisions

### 4.1 decimal.js, never floats

The single most important rule in `packages/core`: no JavaScript `number` type for money. All values are `decimal.js` `Decimal` instances. The Prisma client returns `Decimal` directly (Prisma's own type, which delegates to decimal.js compatible internals). The eslint rule mentioned in §2.4 enforces this.

Division uses `Decimal.div(...)` with `ROUND_HALF_EVEN` (banker's rounding) — the same rule HMRC uses for calculating tax.

### 4.2 Aggregates cached in Redis for 60 seconds

The dashboard hits portfolio-level aggregates on every page load. With a few thousand items per user, recomputing on every load is wasteful. The cache key is `agg:${userId}:${dateRangeHash}` with TTL 60s, invalidated on any item write via a `prisma.$extends` middleware that publishes to a Redis pubsub channel.

The 60-second window is short enough that users effectively never see stale data after a mutation (the invalidation is faster than that), but long enough to absorb the typical "open three tabs of the dashboard" pattern.

### 4.3 Tax engine is a pure function tree, no I/O

Every function in `packages/core/src/tax` takes inputs and returns outputs; no DB access, no logging, no clock. This makes golden-file testing trivial — the same inputs always produce the same outputs. The web app and worker compose database reads above the engine, then call the engine, then write results.

---

## 5. Platform integration decisions

### 5.1 eBay: refresh tokens stored encrypted, rotated automatically

Access tokens are short-lived (~2 hours). Refresh tokens are long-lived (~18 months) but can be revoked at any time by the user from their eBay account. The `sync:token-refresh` BullMQ job runs every 30 minutes and refreshes any token within 5 minutes of expiry. On refresh failure (HTTP 401 from eBay), we mark the connection `lastSyncStatus = FAILED` and surface a "reconnect eBay" banner in the dashboard. We never delete imported items on disconnect.

### 5.2 eBay fee extraction with deterministic fallback

eBay's `pricingSummary.totalFeeBasePrice` is usually present but not guaranteed. When missing, we estimate at 12.8% + £0.30 (current eBay UK final value fee for most categories) and store `feeEstimated: true` on the item so the UI can flag it with a warning badge. The user can override to the actual fee from their eBay statement.

### 5.3 Depop and Vinted: no scraping, ever

Both platforms forbid scraping in their ToS, and neither has a public seller-read API. We deliberately do not scrape under any circumstances — not even with user credentials and consent — because the legal exposure for a tax product is too high. The three supported workflows are CSV upload, manual quick-add/bulk-add, and email forwarding (Pro tier).

### 5.4 Email forwarding via Resend inbound

Each user on Pro and Business gets a unique inbound address `u_<uuid>@inbox.ledgerloop.app`. Resend inbound webhooks POST to `/api/webhooks/inbox` with the parsed email. We do a sender-domain match (`@depop.com`, `@vinted.com`) to route to the right parser, then run a deterministic regex extractor against the body. The result lands in an "Inbox" view requiring one-click confirmation before becoming an `Item` — this avoids parser drift silently corrupting data when Depop/Vinted change their email format.

---

## 6. Auth and security decisions

### 6.1 Argon2id over bcrypt

Argon2id is the OWASP-recommended password hash as of 2024. Parameters: 64 MiB memory, 3 iterations, 1 parallelism. We benchmark on the deploy target to keep verification under 250ms per attempt.

### 6.2 TOTP 2FA with otplib + 8 backup codes

QR code provisioning at setup. Backup codes are 8 single-use codes, displayed once at generation, hashed with Argon2id at rest (same parameters as passwords). Recovery flow: enter backup code → 2FA disabled → user must re-enroll.

### 6.3 Rate limits

Upstash Ratelimit (Redis-backed) on:

- Auth endpoints: 5 attempts per 10 minutes per IP+email tuple.
- Mutation endpoints: 60 requests per minute per user.
- CSV upload: 5 uploads per hour per user.
- Webhook endpoints: no user-level limit; instead a global IP allowlist for Stripe and Resend.

### 6.4 CSP and security headers

Strict CSP via `next.config.mjs` headers function, with `nonce`-based script-src. We accept that this requires nonce-passing through Server Components. HSTS preload is enabled, X-Frame-Options is DENY (we never embed our own app), X-Content-Type-Options is nosniff, Referrer-Policy is `strict-origin-when-cross-origin`.

### 6.5 GDPR data export is generated async

Hitting "export my data" enqueues a `gdpr:export` job that produces a zip of JSON files (one per model) and uploads it to R2 with a signed URL valid for 24 hours. The email contains the URL. We do not block the request on the export because larger accounts can have thousands of items and the export should not timeout.

---

## 7. Billing decisions

### 7.1 Tier limits enforced at write time, not read time

When a Starter user tries to create their 201st item, the server action returns an error that the client surfaces as an upgrade modal. We never delete or hide existing items if a user downgrades — the limit applies only to additions. This means a Starter user with 500 items (because they were on Pro and downgraded) can read all 500 but cannot add a 501st. Communicated clearly in the upgrade modal copy.

### 7.2 Past-due grace of 14 days

`invoice.payment_failed` → `Subscription.status = PAST_DUE`. The user gets read-only access. A `payment_failed_grace_check` cron job locks accounts whose `currentPeriodEnd` is more than 14 days in the past. Reactivation is a single Stripe Customer Portal click.

### 7.3 Webhook idempotency via event ID

`/api/webhooks/stripe` upserts into a `StripeEventLog` table keyed by `event.id` before processing. If the row already exists with `status = PROCESSED`, we 200-OK without re-processing. This makes Stripe's at-least-once delivery safe.

### 7.4 Stripe Tax for VAT only

Stripe Tax is enabled for UK VAT collection on subscriptions. We do not enable EU OSS at launch — the target market is UK-only and the registration overhead of EU OSS is not justified. We display prices as "£X/mo + VAT" on the marketing site to make this explicit.

---

## 8. Testing decisions

### 8.1 100% test coverage on packages/core, not enforced elsewhere

Coverage as a metric is gameable, but the calculation and tax engines are the one place where a regression silently produces wrong numbers that someone files with HMRC. So `packages/core` is the one package where coverage is gated at 100% in CI. Everywhere else, we trust E2E tests to catch regressions.

### 8.2 Golden-file tests for each tax year

Every tax year supported by the engine has a fixture file under `packages/core/tests/golden/uk-tax-YYYY-YY.json` containing a representative set of inputs and the expected outputs (computed by hand and signed off). Adding a tax year is a two-file PR: the rate config and the golden fixture. This makes "did we accidentally break 2024/25 while adding 2025/26?" impossible to miss.

### 8.3 Visual regression in Playwright

The spec calls for visual regression on the dashboard, inventory page, and tax page in both light and dark mode. We use Playwright's built-in screenshot diffing with a 0.1% pixel tolerance. Screenshots are committed to the repo under `tests/e2e/__screenshots__/`. Updating them requires explicit `pnpm test:e2e --update-snapshots` and a code review of the diff.

---

## 9. Observability decisions

### 9.1 Sentry for errors, PostHog for product, Pino for logs

Three tools, three jobs. Sentry catches exceptions and surfaces stack traces; PostHog records the funnel from signup → first item → first sale → first tax run; Pino emits structured JSON logs that ship to Better Stack (Logtail). No overlap, no consolidation tool at the start.

### 9.2 Structured log fields are mandatory

Every log line includes `userId`, `workspaceId`, `requestId`, and `route` at minimum. The Pino logger is initialized in `packages/core/src/log.ts` with these as base fields. There is an eslint rule that bans `console.log` outside of test files.

---

## 10. Documentation decisions

### 10.1 Mermaid diagrams over PNGs

Architecture diagrams are written in Mermaid and rendered by GitHub natively. PNG diagrams rot the moment the architecture changes; Mermaid diffs cleanly in code review and can be updated in the same PR as the code change that necessitated them.

### 10.2 Tax rate sources cited inline

Every numeric value in `packages/core/src/tax/uk-rates.ts` carries a comment with the source URL and the date it was verified. The next person updating rates needs a one-click path to confirm the current value.

### 10.3 No README in subdirectories

Subdirectory READMEs drift. Instead, every package has a top-of-file JSDoc on its main entry (`packages/core/src/index.ts`, etc.) summarising what the package contains. The `docs/` directory holds cross-cutting documentation.
