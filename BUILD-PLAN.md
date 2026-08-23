# BUILD-PLAN — LedgerLoop Lean MVP (30 days)

This plan replaces the earlier 52-day build. The product still serves UK eBay resellers and still produces an SA103-mapped tax estimate. What changes is the path to a paying user: ship something they can use this month rather than something that takes a quarter to finish.

## 1. Strategic premise — why CSV first, not API first

The earlier plan started with eBay OAuth because the spec did. That order has a hidden cost: eBay's production API access requires application review, which can take days to weeks. Building against the sandbox first hides this delay, but the launch is gated on production approval landing.

A CSV-first launch flips this. eBay sellers can already download a **Transaction Report** from their Seller Hub. If LedgerLoop accepts that CSV and produces an SA103 mapping out of it, the entire tax-calculation value proposition is deliverable without any eBay API integration at all. The API becomes a "make it automatic" upgrade later, by which point we have paying users telling us whether the rest of the product is worth their time.

The dashboard is shaped like the SA103 form itself. A reseller looking at the dashboard sees the form they will eventually have to fill in for HMRC, with every box already populated from their data. That visual is the single most persuasive piece of product copy we can ship.

## 2. Stack — chosen for speed

The stack is deliberately conventional and as small as it can be while still being honest about what a tax product needs to do.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 14+ App Router (single app, no monorepo) | The monorepo was overhead before there were two apps to share between. We don't have a worker yet. |
| Auth | Supabase Auth | Email/password, magic link, Google — all in one. Free tier is plenty for an MVP. We get TOTP 2FA when we want it without writing it. |
| Database | Supabase Postgres | Same provider as Auth, RLS available for tenant isolation, point-in-time recovery on paid tier. |
| ORM | Drizzle (lighter than Prisma) or Prisma | Either is fine. Prisma's generated types are nicer; Drizzle's edge-runtime story is cleaner. Pick one in day 1; do not bikeshed. |
| Storage | Supabase Storage | Bucket for receipt images and raw CSV archives. |
| Background jobs | Inngest | Used in step 3 (eBay sync). Step 1 and step 2 do not need it. Inngest's step functions handle pagination and retries without us writing queue code. |
| Email | Resend | Transactional only — magic links, billing receipts. |
| Hosting | Vercel | Free for solo developer until we cross hobby-tier limits. |
| Payments | Stripe Checkout (single product, single price) | No Customer Portal in v1. Cancellation via support email is fine at 10–50 users. |
| AI | Anthropic Claude API | Used in step 4 only. |
| UI | shadcn/ui + Tailwind + Recharts + Lucide | Same as before. |
| Tests | Vitest only | Unit tests on the tax engine. No Playwright, no golden files. |
| Errors | Sentry | One project; free tier. |
| Analytics | PostHog | Free tier. |

Notable subtractions versus the earlier plan: no BullMQ, no Redis, no Auth.js, no Argon2id setup, no 2FA, no separate worker process, no monorepo, no eslint boundary rules, no Playwright, no visual regression, no golden-file framework.

## 3. The 30-day calendar at a glance

| Days | Step | Headline outcome |
|---|---|---|
| 1–3 | Foundation | Auth, deploy pipeline, empty app shell at `app.ledgerloop.app` |
| 4–11 | **Step 1 — CSV upload + SA103 mapping** | A user pastes an eBay Transaction Report and sees an SA103-shaped tax estimate |
| 12–17 | **Step 2 — ROI + hold time dashboard** | The dashboard shows per-item economics, the SA103 layout becomes the home page |
| 18–23 | **Step 3 — eBay API integration** | Connect eBay; nightly sync via Inngest fills in new sales without a CSV |
| 24–26 | **Step 4 — AI listing suggestions** | Pick an item; get a Claude-generated title, description, and price range |
| 27–30 | Launch | Stripe billing, privacy/terms, beta onboarding emails, public launch |

The plan deliberately back-loads paid eBay infra and AI calls until after the tax engine is working. The free Anthropic and Stripe quotas during the build week are easily enough; the only ongoing cost during weeks 1–2 is Supabase and Vercel free tiers.

## 4. Step 0 — Foundation (Days 1–3)

**Scope.** Stand up the Next.js project. Wire Supabase Auth with email/password and Google OAuth. Build the authenticated app shell — sidebar with `Dashboard / Inventory / Settings`, a top bar, theme toggle, sonner toasts. Configure the Vercel deploy from `main` with preview deploys per PR. Set up Sentry. Write the minimal Drizzle/Prisma schema for `users` (auto-managed by Supabase), `items`, `transactions`, `tax_years`, `expenses`.

**Definition of done.**

A new user can sign up, log in, see an empty dashboard with a "Connect data" CTA, and log out. `pnpm dev` boots in under 5 seconds. The Vercel preview URL works on a fresh PR. Sentry catches a deliberate test exception. The schema is migrated against Supabase.

**Gotchas.**

Supabase Auth's session handling in App Router needs `@supabase/ssr` and the right cookie strategy; follow the official Next.js example, do not improvise. The schema should encode money as `numeric(12,2)` not `float`. Do not add Row-Level Security policies yet — they slow down iteration. Add them in step 5 before the beta opens.

## 5. Step 1 — CSV upload + SA103 mapping (Days 4–11)

This is the feature that makes the product worth using. Eight days is enough if the scope stays disciplined.

**Scope.**

A user lands on `/import`, drags an eBay Transaction Report CSV onto a drop zone. The file is parsed client-side with PapaParse. Each row is mapped to an internal `Transaction` shape (sale, refund, fee, shipping label purchase, etc.). The parser handles eBay's actual column layout for the 2024+ Transaction Report. Rows that don't map cleanly are surfaced in a "Needs review" list with the raw text and a manual category picker.

Once imported, the user is taken to `/tax` — a one-page view shaped like SA103S. The boxes show their values, derived from the imported transactions. A toggle picks the tax year. A second toggle picks "trading allowance vs actual expenses" with the side-by-side comparison. An "Export SA103 CSV" button produces the file an accountant can plug in.

The tax engine itself is the one from `docs/tax-engine.md` § 4. The earlier 52-day plan put the engine in `packages/core`; the MVP puts it in `lib/tax/` inside the single Next.js app. Same code, same formulas, same disclaimer banner.

**Definition of done.**

- A real eBay Transaction Report (200+ rows) imports cleanly in under 10 seconds.
- The SA103 page shows a number that matches a hand-calculated value for at least one realistic scenario (the worked example in `docs/tax-engine.md` § 6 is the reference).
- Vitest unit tests cover every function in `lib/tax/`, with assertions against the worked example as a fixture.
- The "Export SA103 CSV" file opens cleanly in Excel and Google Sheets.
- A disclaimer banner is present on every render of `/tax` and on the exported CSV's first row.

**Gotchas.**

The eBay Transaction Report's column names have changed three times since 2020 (Seller Hub, the legacy CSV, and the API-derived report all have different shapes). Support **only** the current Seller Hub format at launch and add others when users actually request them. Save the raw CSV to Supabase Storage at `imports/{userId}/{importId}.csv` so a future parser change can re-process old uploads.

The tax engine ingests `Item` records, not raw transactions. The CSV parser needs to group transactions by item — sale row + corresponding fee rows + refund row → one `Item`. eBay's `order_id` is the join key; if it is absent on a row, the row is "unmatched" and lands in Needs Review.

Decimal math: use `decimal.js` for every calculation. Banker's rounding (HALF_EVEN). One eslint rule banning `Number()` and `parseFloat()` in `lib/tax/` is enough to enforce this.

## 6. Step 2 — ROI and hold time dashboard, SA103-shaped (Days 12–17)

The home page after login. The visual hook is the SA103 form: a clean, government-form-style layout where every box has its number, but underneath each box is a "drill down" that opens the underlying items.

**Scope.**

`/` (the authenticated home) is the SA103 dashboard. Four headline cards at the top: Turnover, Allowable Expenses, Trading Profit, Estimated Tax. Below that, a grid of SA103-shaped boxes — labelled with their box numbers and HMRC wording, populated from data. Clicking a box opens a slide-over with the items and transactions feeding that number.

A second page, `/inventory`, is the conventional table view: per-item rows with cost, sold price, fees, profit, ROI, hold time. TanStack Table with sorting and filters. This is the operator's-eye view; the SA103 dashboard is the user-thinking-about-their-return view.

**Definition of done.**

- The SA103 dashboard loads under 1.5s on a fresh visit with 500 imported items.
- Every box on the dashboard cites the formula on hover, in a tooltip.
- Clicking a box opens a list of contributing items, scrollable, with the option to export those items to CSV.
- The inventory table handles 2,000 rows without virtualisation jank.
- ROI and hold time are computed via the engine from step 1; no calculation logic lives in components.

**Gotchas.**

Resist the urge to add charts everywhere. The dashboard's job is to look like the SA103 form. One profit-over-time sparkline at the top, one platform breakdown donut, that is it. The home for charts is `/reports` and that page is post-MVP.

Hold time needs `purchaseDate` and `soldAt`. The eBay CSV does not have `purchaseDate`. Users must add it manually for items they care about, or the dashboard falls back to `listedAt → soldAt` for hold time and marks the value with a footnote.

## 7. Step 3 — eBay API integration (Days 18–23)

By this point the product works without eBay. This step is the "make it automatic" upgrade.

**Scope.**

Settings → Connections → "Connect eBay" button opens the eBay OAuth flow. On approval, we store the encrypted refresh token in Supabase. An Inngest scheduled function runs every six hours and pulls orders modified since the last sync. New orders create `Transaction` and `Item` records via the same code path the CSV parser uses. The encryption key lives in `ENCRYPTION_KEY` env var, AES-256-GCM at the application layer.

Token refresh is its own Inngest function, triggered when a refresh is needed (cheaper than scheduled refresh for a small user base).

**Definition of done.**

- A user connects eBay (sandbox is fine for testing) and sees orders from the last 90 days within 5 minutes.
- The Inngest dashboard shows scheduled syncs running successfully.
- Disconnecting eBay does not delete imported data, only the connection.
- A failed refresh surfaces a "Reconnect eBay" banner inside the app.
- Token storage in the database is encrypted; the encryption helper has a unit test.

**Gotchas.**

eBay production API approval. Apply for production keys on day 1 of the plan, not day 18 — the review can take 5–10 working days. Until production keys arrive, develop against the sandbox; the dataset is meaningfully different (timestamps, fee shapes) so the parser needs care.

Inngest local dev: run the Inngest dev server alongside `pnpm dev`. The setup is one command but it is surprising the first time you hit it.

Rate limits: eBay sends `X-RateLimit-Remaining`. Inngest step functions can `step.sleep` on the rate-limit-reset window; do not paper over 429s with naïve retries.

The eBay sync writes the same `Transaction` shape as the CSV parser. This is the cheapest way to keep the tax engine indifferent to data origin. If sync and CSV produce overlapping rows for the same `order_id`, the most recent write wins, but a `source: 'API' | 'CSV'` field is tracked so we can audit later.

## 8. Step 4 — AI listing suggestions (Days 24–26)

The delight feature. Short scope; finish in three days or cut it.

**Scope.**

On the inventory detail view of an item with `status = IN_STOCK`, a "Suggest a listing" button calls our `/api/ai/suggest-listing` route. The route assembles a prompt: the item's metadata (brand, category, condition, cost), the user's three most successful comparable sales (top profit, same category) as few-shot examples, and a request for a suggested title, description, price range, and a "what to photograph" checklist. The route calls Claude with `anthropic-version` pinned, max 500 output tokens, returns structured JSON, renders it into a side panel the user can copy from.

We do not auto-list anything. We do not write back to eBay. The output is suggestions the user can review and take, fully manually.

**Definition of done.**

- For a seeded item, the suggestion endpoint returns sensible output within 5 seconds.
- The prompt is stored in `lib/ai/prompts/suggest-listing.ts` with comments explaining each section.
- A rate limit caps suggestions at 20 per user per day (free Anthropic credits are real but finite).
- The UI shows a "Powered by Claude" badge and a disclaimer that suggestions are starting points, not guarantees.

**Gotchas.**

Prompt the model to refuse if the item data is incomplete or if the comparables are not actually comparable. Ship the prompt with explicit rules: "If you don't have enough information to write a confident title, say so."

Cost discipline: Claude Sonnet pricing is fine at MVP scale but watch the output token count. Set `max_tokens: 500` and reject any prompt that would exceed an input budget you set explicitly.

This is the feature most likely to slip. If on day 25 the suggestion quality is mediocre, cut to a "Listing checklist" non-AI feature instead — it is better to ship a smaller working thing than a half-baked AI demo.

## 9. Launch (Days 27–30)

**Scope.**

Stripe Checkout single product, single price, £9/month with 14-day free trial. Webhook handler for `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`. Trial gating: after 14 days without a subscription, the app moves to read-only.

Privacy policy, terms of service, cookie policy — short, honest, written in plain English. Vercel custom domain pointed at `app.ledgerloop.app`, marketing pointed at `ledgerloop.app` (a one-page Next.js page; full marketing site is post-MVP).

Beta cohort: 20 users you have personally identified as fitting the target profile. Manual email onboarding. Set up Crisp or Intercom for in-app support; even a `mailto:` link is acceptable at this scale.

**Definition of done.**

- A user can sign up, hit the trial limit, subscribe, and continue using the product without you touching the database.
- The webhook handler has been replay-tested manually (send the same `checkout.session.completed` twice).
- The privacy policy mentions every actually-collected piece of data.
- Sentry, PostHog, and Resend dashboards are all green.
- The beta cohort has working accounts and a feedback channel.

## 10. What is deferred until after launch

Things the original spec required that this plan deliberately does not ship in 30 days. They are deferred, not abandoned.

- Depop and Vinted integrations.
- TOTP 2FA (Supabase supports it; turn on when there are paying customers).
- Backup codes for 2FA recovery.
- Multiple workspaces / multi-shop.
- Three-tier pricing (Starter / Pro / Business).
- Email-forwarding inbox for parsing sale notification emails.
- Stripe Customer Portal (handled via support email at launch).
- PDF tax reports (CSV export covers the same use case at first).
- Weekly digest email.
- Cmd+K palette.
- Visual regression tests.
- Lighthouse performance budgets in CI.
- Multi-workspace switcher in the UI.
- A `worker` process; everything runs in-app or via Inngest.
- Golden-file tests as a formal framework.
- Audit log table for sensitive actions.
- GDPR data export tool (manual SQL is fine for the first 100 users; build the tool when the first request lands).
- The full marketing site at `/`, `/pricing`, `/features`, `/help`.

A clean way to track these: open one GitHub Issue per item, labelled `post-mvp`, with a one-paragraph note on what would trigger us to build it.

## 11. Risk register

These are the four risks most likely to derail the 30-day target. Each has an explicit response.

**Risk: eBay production API approval delays past day 23.** Mitigation: apply for production keys on day 1. If approval has not arrived by day 18, start step 3 against the sandbox and document a "use the CSV path until your API access is live" message for any beta user whose own eBay integration is gated by approval timing on eBay's side (eBay sometimes throttles new connections).

**Risk: tax engine produces a wrong number that a beta user files with HMRC.** Mitigation: the disclaimer banner is non-negotiable, the worked example tests are non-negotiable, and the beta cohort is told explicitly "verify before submitting." Beyond that, we accept that the engine without golden-file tests is less defended than the earlier plan called for. The tradeoff is deliberate; if a user reports a discrepancy, fix it inside 48 hours and notify everyone whose computation depends on the buggy code path. Watch this risk closely; if the engine touches anything material in step 4 or beyond, reintroduce golden-file tests.

**Risk: CSV parser breaks on a Transaction Report layout we did not test against.** Mitigation: archive every raw CSV to Supabase Storage so re-parsing is always possible. Surface unmatched rows clearly. Ship the first parser supporting only the current Seller Hub layout and refuse uploads of older or different formats with a clear error message rather than silently producing wrong numbers.

**Risk: AI suggestions feature is mediocre and embarrassing.** Mitigation: the step-4 spec includes an explicit cut option — drop to a non-AI "Listing checklist" if quality is poor by day 25. There is nothing wrong with launching without an AI feature; there is something very wrong with launching a bad one.

## 12. A note on the rest of the documentation

The other documents in this repo — `DECISIONS.md`, `docs/architecture.md`, `docs/platforms.md`, `docs/runbook.md`, `.env.example` — were written for the earlier 52-day plan. They reference a monorepo, BullMQ, Auth.js, Depop, Vinted, and a separate worker process. **They are stale as of this rewrite.** They still contain useful material — the tax engine doc in particular is unaffected and remains the canonical reference for `lib/tax/`.

A clean sweep of the other docs takes about a day of focused work. The recommended order:

1. Rewrite `docs/architecture.md` for the single-app + Supabase + Inngest topology.
2. Rewrite `docs/platforms.md` to focus on eBay only; move Depop/Vinted to a "Future platforms" appendix.
3. Update `.env.example` to drop Redis, BullMQ, and Auth.js variables; add `SUPABASE_*`, `INNGEST_*`, `ANTHROPIC_API_KEY`.
4. Trim `docs/runbook.md` of any sections referring to BullMQ queue depth, the worker process, or Resend inbound webhooks.
5. Rewrite `DECISIONS.md` § 1 to reflect the new stack choices, mark the previous decisions as superseded, and add new decisions for Supabase, Inngest, the CSV-first strategy, the relaxed testing posture, and the AI feature.

`docs/tax-engine.md` does not need to change. The tax calculations are stack-independent.

Until that sweep happens, when reading the other documents, mentally substitute: `Next.js single app` for "monorepo," `Inngest` for "BullMQ + Redis," `Supabase Auth` for "Auth.js v5," `lib/tax/` for "`packages/core/src/tax`," and ignore any reference to Depop, Vinted, or a separate worker process.
