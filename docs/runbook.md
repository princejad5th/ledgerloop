# Runbook

The operational playbook for LedgerLoop on production. Each section follows the same structure: the symptom you see, what is likely wrong, how to diagnose, how to fix, and how to prevent recurrence.

Page priorities reflect impact:

- **P1** — paying users cannot use the product or their data is wrong.
- **P2** — a significant feature is degraded.
- **P3** — internal monitoring concern.

---

## 1. eBay sync stalled

**Symptom.** Multiple users on the dashboard show "Last synced > 2 hours ago" on their eBay connection card. The BullMQ admin shows the `sync:ebay:incremental` queue with growing depth. Sentry has no recent errors from the worker.

**Likely causes.**

1. eBay API outage or partial degradation (most common).
2. Worker process is alive but its eBay rate-limit token bucket is exhausted (less common but recoverable without ops action — just wait).
3. Worker is wedged on a long-running job that needs killing (rare).

**Diagnose.**

```bash
# Worker status
railway logs --service worker --tail 100

# Queue depth
redis-cli -u $REDIS_URL XLEN bull:sync:ebay:incremental:wait

# eBay status
curl -s https://api.ebay.com/sell/inventory/v1/inventory_item?limit=1 \
  -H "Authorization: Bearer <test-token>"
# Look for 5xx or unusual response times
```

Check [eBay developer status page](https://developer.ebay.com/support/system-status) for active incidents.

**Fix.**

- If eBay is down: do nothing. The worker retries with exponential backoff. Post a status update on `status.ledgerloop.app` if downtime exceeds 30 minutes.
- If a job is wedged: drain the worker by SIGTERM, let in-flight jobs cancel, then redeploy. BullMQ will re-pick the work.
- If a single user's sync is failing repeatedly (Sentry shows the same `userId` in errors), check whether their refresh token was revoked. See §2.

**Prevent.**

- The `eBay sync queue depth > 100 for > 5 min` alert in Better Stack catches this early.
- Quarterly drill: pause the worker for 10 minutes, verify recovery is automatic.

---

## 2. User's eBay connection silently broken

**Symptom.** A user reports that their eBay items aren't updating, but no error banner is showing. Or: support ticket says "I disconnected and reconnected and now my history shows duplicates / is missing."

**Likely causes.**

1. Refresh token was revoked from the eBay side (user changed eBay password, eBay terminated the OAuth grant, eBay account changes).
2. The `lastSyncStatus = FAILED` did not surface in the UI banner (banner logic bug).
3. The reconnect flow created a second `PlatformConnection` row instead of updating the existing one.

**Diagnose.**

```sql
SELECT id, platform, mode, last_synced_at, last_sync_status, token_expires_at, scopes
FROM "PlatformConnection"
WHERE "userId" = '<uuid>';
```

If `last_sync_status = FAILED`: the worker tried and failed. Check Sentry for the original error.

If `token_expires_at` is in the past and there is no recent `sync:token-refresh` log line for this user: the refresh worker missed them. Re-enqueue:

```bash
pnpm run -w worker tokens:refresh-user --userId=<uuid>
```

If the user has *two* `PlatformConnection` rows for `EBAY`: the unique constraint on `(userId, platform)` should have prevented this. Investigate how it was bypassed (most likely a soft-delete-then-recreate code path) and write a migration to merge them.

**Fix.**

- Send the user a "reconnect eBay" prompt via the in-app banner and email. Reconnect *updates* the existing row; never creates a new one. This is enforced by `upsertConnection` in `packages/platforms/src/ebay/oauth.ts`.
- If history shows duplicates after reconnect, run the dedupe utility: `pnpm run -w worker items:dedupe --userId=<uuid> --platform=EBAY` (groups by `externalListingId`, merges, keeps the most recent).

**Prevent.**

- The banner-suppressed bug class is covered by a Playwright test that simulates a 401 from eBay and asserts the banner is visible.
- The duplicate-connection class is covered by an integration test that disconnects + reconnects and asserts only one `PlatformConnection` row exists.

---

## 3. Stripe webhook missed

**Symptom.** A user reports their subscription tier in the app doesn't match what they upgraded to in the Customer Portal. Or: a payment failed but the user still has full access.

**Likely causes.**

1. Webhook signature verification rejected the event (wrong secret in env).
2. Webhook handler 500'd and Stripe gave up retrying (this *should not happen* — Stripe retries for 3 days).
3. Idempotency key was already marked PROCESSED but the actual subscription update failed (handler bug).

**Diagnose.**

In the Stripe dashboard → Developers → Webhooks → click the endpoint → check the event log. Look for the user's customer ID. Status column shows delivery result.

```sql
SELECT * FROM "StripeEventLog"
WHERE metadata->>'customer' = '<cus_xxxx>'
ORDER BY created_at DESC LIMIT 20;
```

If there is a recent event with `status = PROCESSING` and no `processed_at`: the handler hung mid-update.

**Fix.**

- Replay the event from the Stripe dashboard ("Send test webhook" → use the original event ID).
- The handler is idempotent (by `event.id`); re-sending is safe.
- If repeated replay fails for a non-transient reason, run the manual reconciliation:

```bash
pnpm run -w web stripe:reconcile-subscription --customerId=<cus_xxxx>
```

This script fetches the latest subscription state from Stripe and writes it to our DB authoritatively. Use sparingly.

**Prevent.**

- The `Stripe webhook 5xx rate > 1% over 1 hour` alert in Sentry.
- Webhook handler is the place we are *most* paranoid about idempotency. Read `apps/web/app/api/webhooks/stripe/route.ts` carefully when modifying — there are tests asserting that replaying every event type leaves state unchanged.

---

## 4. CSV upload "stuck"

**Symptom.** User uploaded a large CSV (5,000+ rows). The "Processing" spinner has been spinning for 10 minutes. Eventually they reload and the items aren't there.

**Likely causes.**

1. The synchronous-commit threshold was set too high — the request hit the Vercel function timeout of 60 seconds.
2. The async-commit path (worker job) failed silently.
3. The browser tab was closed while the upload was still serialising.

**Diagnose.**

```sql
SELECT * FROM "SyncJob"
WHERE "userId" = '<uuid>' AND type = 'MANUAL_CSV'
ORDER BY created_at DESC LIMIT 5;
```

Status `RUNNING` for > 5 minutes is suspicious. `FAILED` shows the error in the `errors` JSON column.

The raw CSV was archived to R2 at `uploads/csv/{userId}/{jobId}.csv` — fetch and inspect it for malformed rows.

**Fix.**

- Re-enqueue the job: `pnpm run -w worker csv:retry --jobId=<uuid>`.
- For genuinely broken data: download the archived CSV, manually fix, re-upload.

**Prevent.**

- The sync/async threshold is configurable in `apps/web/lib/csv-config.ts`. Set it conservatively: anything over 500 rows goes async.
- The async path emits a notification to the user when complete; the user does not need to keep the tab open.

---

## 5. Tax page returning unexpected numbers

**Symptom.** A user emails saying "my estimated tax this year is X but my accountant says Y."

This is the most serious class of issue because it directly impacts user trust in the product. Handle it with care.

**Likely causes.**

1. **User error.** Most common. The user has miscategorised an expense, missed an item, or has PAYE income they haven't entered.
2. **Engine misuse.** The user has interpreted "estimated tax due" differently from what the engine outputs (e.g. they thought the number includes their PAYE tax already paid).
3. **Engine bug.** Rare; would be caught by golden-file tests unless the bug is in the input mapping.

**Diagnose.**

Step 1: open the user's `/app/tax` page (via support impersonation if necessary — audit-logged) and the breakdown table. Walk through the workings with the user. The breakdown table shows each component with the formula on hover.

Step 2: pull the underlying data:

```sql
-- Items sold in the year in question
SELECT id, title, sold_price, shipping_charged, platform_fees, payment_fees,
       shipping_out_cost, refund_amount, cost_price, shipping_in_cost, other_costs
FROM "Item"
WHERE "userId" = '<uuid>'
  AND sold_at >= '2025-04-06' AND sold_at < '2026-04-06'
  AND deleted_at IS NULL;

-- Expenses in the year
SELECT * FROM "Expense"
WHERE "userId" = '<uuid>'
  AND date >= '2025-04-06' AND date < '2026-04-06';
```

Step 3: re-run the engine with the user's exact inputs against the worked example in `docs/tax-engine.md` §6. Match each line.

**Fix.**

- If user error: explain via the breakdown table; usually the conversation ends here.
- If engine misuse: improve the UI wording so the next user doesn't hit the same misunderstanding. Open a docs PR.
- If engine bug: stop, write a failing golden-file test that reproduces, fix, re-verify with the user. Communicate the fix and any other users affected (PostHog cohort: users who computed tax in the affected year between the bug's introduction and the fix).

**Prevent.**

- The golden-file test suite is the primary defence. Every UK tax year's reference scenario is locked in.
- The "Sources" panel on `/app/tax` lists every item and expense feeding the calculation, with a search and CSV export. This is the user's own audit trail and reduces "where is this number coming from" support load.

---

## 6. Database connection pool exhaustion

**Symptom.** Vercel function logs show `prisma: Too many connections` errors. Users see intermittent 500s.

**Likely causes.**

1. Vercel scaled up under load and exceeded the Postgres connection limit even with PgBouncer.
2. A long-running transaction is holding connections open.
3. PgBouncer is in session mode instead of transaction mode.

**Diagnose.**

```sql
-- Active connections by source
SELECT application_name, state, COUNT(*)
FROM pg_stat_activity
GROUP BY application_name, state
ORDER BY count DESC;

-- Long-running transactions
SELECT pid, usename, query, state, age(now(), xact_start) AS txn_age
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start ASC;
```

**Fix.**

- Kill the long-running transaction with `SELECT pg_terminate_backend(<pid>);` — only after confirming what it's doing.
- Confirm PgBouncer is in transaction mode (Railway env var: `POOL_MODE=transaction`).
- Drop the Prisma `pool_size` if it's set too high. For Vercel, 5 connections per function instance is usually the right number.

**Prevent.**

- The Better Stack alert "Postgres active connections > 80% of limit for > 5 min" catches the lead-up.
- Code review checklist: any Prisma transaction must complete in < 1 second or be moved to the worker.

---

## 7. eBay token mass-invalidation after key rotation

**Symptom.** All eBay connections show "needs reconnection" simultaneously. Sentry has hundreds of decryption errors.

**Cause.** The `ENCRYPTION_KEY` env var was rotated without re-encrypting existing tokens. This is a near-fatal operational mistake; recovery is forcing every user to reconnect.

**Fix.**

This is the documented procedure for an intentional key rotation:

1. Set both `ENCRYPTION_KEY` (new) and `ENCRYPTION_KEY_OLD` (previous) in the environment.
2. The decryption helper tries the new key first, falls back to the old key.
3. Run `pnpm run -w worker tokens:rotate-key` which re-encrypts every row to the new key.
4. After the script reports 100% complete, remove `ENCRYPTION_KEY_OLD`.

If the rotation happened without `ENCRYPTION_KEY_OLD`: there is no recovery. Email every affected user, lock connections, and have them reconnect. Add this story to onboarding for new engineers.

**Prevent.**

- The CI pipeline checks that `ENCRYPTION_KEY_OLD` is unset on production deploys (caught in `.github/workflows/deploy.yml`).
- The key rotation runbook is the only documented path for changing this var.

---

## 8. Soft-delete hard-delete went wrong

**Symptom.** The `cleanup:soft-deletes` daily job hard-deleted more rows than expected. A user reports their data is gone.

**Likely cause.** A bug in the cleanup query — most likely the `WHERE deleted_at < NOW() - INTERVAL '30 days'` was misread as `>` somewhere.

**Fix.**

- The cleanup job writes a manifest before deleting: a JSON file at `cleanup-manifests/{date}.json` on R2 listing every row about to be hard-deleted with its full content.
- Restore from the manifest: `pnpm run -w worker cleanup:restore --date=<YYYY-MM-DD>`.
- For data not covered by manifests (older than 30 days): restore from Railway's Postgres snapshot.

**Prevent.**

- The manifest write is a hard prerequisite — the cleanup job refuses to delete if the manifest cannot be persisted to R2.
- Integration test: run the cleanup job on a seeded DB, assert only rows older than 30 days are removed.

---

## 9. Resend inbound webhook signature rejected

**Symptom.** Pro-tier users forwarding sale emails report items aren't appearing in `/app/inbox`. Sentry shows `signature mismatch` errors from `/api/webhooks/inbox`.

**Likely causes.**

1. `RESEND_INBOUND_SECRET` env var is wrong or missing.
2. Resend has rotated their signing secret without us updating ours.

**Fix.**

- In Resend dashboard → Webhooks, copy the current signing secret, update the env var, redeploy.
- Resend retries inbound webhooks for 24 hours; missed events should re-deliver after the fix.

**Prevent.**

- Quarterly env-var audit: confirm every external service's signing secret matches what's deployed.

---

## 10. Synthetic monitoring alert escalation

The Better Stack uptime monitors run every 60 seconds. Alert routing:

- `/api/health` (web) — Slack `#alerts` channel; auto-pages on-call after 5 consecutive failures.
- `:9091/health` (worker) — Slack `#alerts` only; no auto-page (the worker can be down for short periods without user-visible impact).
- Stripe webhook 5xx rate — Slack `#alerts`; auto-pages.
- eBay sync queue depth — Slack `#alerts` only.
- Postgres connection count — Slack `#alerts`; auto-pages over 90% utilisation.

If an alert auto-pages outside of business hours, the runbook section above is the first stop. If the symptom matches none of the above, file an incident and document a new runbook entry within 7 days of resolution.
