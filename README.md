# LedgerLoop

Inventory and tax SaaS for UK eBay resellers. Drop in an eBay Transaction Report CSV and get an HMRC SA103-shaped tax estimate, per-item profit, ROI and hold time.

This repo contains the **lean MVP** described in `BUILD-PLAN.md` — a single Next.js 14+ App Router project, Supabase for auth and database, Inngest (later, for step 3) for background jobs. No monorepo, no separate worker process.

## What works right now

- The full tax engine for UK 2024/25 and 2025/26, with verified HMRC rates and source URLs (`lib/tax/`).
- Per-item profit, ROI, margin and hold time calculations (`lib/calc/`).
- eBay Transaction Report CSV parser (`lib/csv/ebay-parser.ts`).
- Vitest unit tests covering the worked example from `docs/tax-engine.md` § 6.
- App shell with sidebar, top bar, theme toggle.
- SA103-shaped dashboard at `/app`.
- Inventory page with sortable table.
- Import page with drag-and-drop CSV + preview + commit.
- Tax page with year selector, allowance-vs-actual toggle, SA103 CSV export.
- Login / signup pages wired to Supabase Auth.
- Drizzle schema for items, transactions, expenses, tax years, audit log.
- A demo-data fallback so the prototype renders the moment you run `pnpm dev`, before Supabase is configured.

## What is intentionally not in this iteration

Per the 30-day plan, deferred to v1.1+: eBay API OAuth + Inngest sync (step 3), AI listing suggestions (step 4), Stripe billing, multi-workspace, 2FA, marketing site beyond the landing page, weekly digest email, audit-log UI.

The previous build doc set (`docs/architecture.md`, `docs/platforms.md`, `docs/runbook.md`, `DECISIONS.md`) describes the larger 52-day plan and is **partly stale**. `docs/tax-engine.md` is the only document fully aligned with this iteration. See § 12 of `BUILD-PLAN.md` for the doc-sweep order.

## Quick start

```bash
pnpm install
pnpm test                        # runs Vitest — should pass green out of the box
pnpm dev                         # http://localhost:3000
```

The first `pnpm dev` works without any environment variables — the app boots into **demo mode** using `lib/data/demo-items.ts` (24 items spanning two UK tax years and a profile with £32,000 PAYE). Sign in / sign up will not work in demo mode; navigate directly to `/app` to see the dashboard.

To wire up real auth and persistence, fill in `.env.local` (see `.env.example`) and run the database migrations:

```bash
cp .env.example .env.local        # then edit
pnpm db:generate                  # build migration SQL from the Drizzle schema
pnpm db:migrate                   # apply against Supabase / Postgres
pnpm dev
```

## Project layout

```
app/
├── (auth)/login/page.tsx         Supabase email + password + magic link
├── (auth)/signup/page.tsx
├── (app)/                        Authenticated layout — sidebar + topbar
│   ├── page.tsx                  SA103-shaped dashboard
│   ├── inventory/page.tsx        Per-item table with profit / ROI / hold time
│   ├── import/page.tsx           CSV upload + preview + commit
│   ├── import/actions.ts         Server action that persists parsed items
│   ├── tax/page.tsx              Year picker, allowance toggle, SA103 export
│   └── settings/page.tsx
├── api/tax/export/route.ts       Streams SA103 CSV for download
├── auth/callback/route.ts        Supabase OAuth / magic-link callback
└── layout.tsx, page.tsx          Root + landing
components/
├── ui/                           shadcn primitives (button, card, input, …)
├── sa103-form.tsx                The SA103-shaped tax form component
├── kpi-card.tsx                  Headline figure card
├── csv-dropzone.tsx              Drag-drop + PapaParse + preview
├── theme-provider.tsx
├── theme-toggle.tsx
└── sign-out-button.tsx
lib/
├── tax/                          UK HMRC tax engine — pure functions
│   ├── uk-rates.ts                 Rates per tax year, with source URLs
│   ├── compute.ts                  computeTaxYear, applyBands, NIC, etc.
│   ├── sa103.ts                    SA103S + SA103F mappings + CSV export
│   ├── types.ts
│   └── index.ts
├── calc/                         Per-item profit / portfolio aggregates
├── csv/ebay-parser.ts            Transaction Report parser
├── data/                         Repository — DB or demo fallback
├── db/                           Drizzle schema + client
├── supabase/                     Browser + server clients + middleware
└── utils.ts                      cn, formatGBP, formatDate
tests/
├── tax.test.ts                   Worked example + edge cases
├── calc.test.ts                  Per-item math + portfolio aggregates
├── csv.test.ts                   Parser end-to-end
└── fixtures/worked-example.json
middleware.ts                     Refreshes Supabase session on each request
```

## The tax engine

Every numeric rate lives in `lib/tax/uk-rates.ts` with a source URL and verification date. Never inline HMRC numbers in business logic. To add a new tax year:

1. Verify rates from primary GOV.UK sources.
2. Add an entry to `RATES_BY_YEAR` in `lib/tax/uk-rates.ts`.
3. Add a corresponding test case to `tests/tax.test.ts` — at minimum, assert the headline tax figure for one representative scenario, computed by hand.
4. Update `docs/tax-engine.md` § 3 if the canonical reference year changes.

The worked example in `docs/tax-engine.md` § 6 is the auditable record of "the engine produces the right number for a known scenario." If you change anything in `lib/tax/`, that test must still pass.

## CSV import

`lib/csv/ebay-parser.ts` accepts the current eBay Seller Hub Transaction Report layout. Each row is one financial event (sale, fee, refund, shipping label). The parser groups by Order Number and aggregates: SALE → soldPrice, FEE → platformFees, REFUND → refundAmount, SHIPPING_LABEL → shippingOutCost.

Older / legacy export layouts are deliberately not supported in this iteration — we'd rather reject the file with a clear message than silently produce wrong numbers. The header synonyms list in `HEADER_SYNONYMS` is the first thing to update if eBay changes column names.

The browser parses the CSV with PapaParse (client-side), shows a preview with first 5 items + any unmatched rows, and only on confirm calls `commitImportAction` to persist via Drizzle. In demo mode the action is a no-op that returns success so the UX still flows.

## Running tests

```bash
pnpm test                        # one-shot
pnpm test:watch                  # watch mode
```

Tests are Vitest, configured in `vitest.config.ts`. There's deliberately no Playwright / E2E in this iteration — per BUILD-PLAN.md § 1, the trade-off is speed-to-market against weaker regression coverage on UI flows.

## Disclaimer

The tax figures LedgerLoop produces are estimates, not advice. The product is built so a UK reseller making £40,000 a year of side income could rely on it to file their return — but they should always verify with HMRC or a qualified accountant first. The disclaimer banner on `/app/tax` and in the SA103 CSV export is non-negotiable.
