# Platform Integrations

This document describes how LedgerLoop connects to each of the three target platforms, what data we pull or accept, and where in the codebase to update fee rates and parser rules when platform pricing or behaviour changes.

## 1. Common adapter shape

Every platform adapter lives under `packages/platforms/src/<platform>` and exports an object conforming to `PlatformAdapter`:

```ts
interface PlatformAdapter {
  platform: Platform;
  mode: 'API' | 'MANUAL';

  // Connection lifecycle
  buildAuthUrl?(state: string, redirectUri: string): string;          // API only
  exchangeCode?(code: string, redirectUri: string): Promise<TokenSet>; // API only
  refreshToken?(refreshToken: string): Promise<TokenSet>;              // API only

  // Sync
  importInitial?(ctx: SyncContext): AsyncIterable<ImportedItem>;       // API only
  syncIncremental?(ctx: SyncContext): AsyncIterable<ImportedItem>;     // API only

  // Manual / CSV paths
  csvTemplate?(): { headers: string[]; example: string[] };            // MANUAL
  parseCsvRow?(row: Record<string, string>): ImportedItem | ImportError;// MANUAL
  parseInboundEmail?(parsed: ParsedEmail): ImportedItem | null;        // MANUAL (Pro)

  // Defaults
  defaultFees(): FeeStructure;
}
```

`ImportedItem` is the wire format between adapters and the rest of the system — it carries all the fields needed to upsert an `Item` row plus `externalListingId` for dedupe. Adapters are responsible for fee extraction; if a fee is unavailable they emit the item with `feeEstimated: true` so the worker can fill in the default and the UI can flag it.

## 2. eBay — API mode

### 2.1 OAuth flow

eBay uses OAuth 2.0 authorization code grant. The flow:

1. User clicks "Connect eBay" on `/app/connections`.
2. Web app generates a CSRF `state` value and stores it in a 5-minute Redis key.
3. Browser is redirected to `https://auth.ebay.com/oauth2/authorize` with the client ID, scopes, redirect URI, and state.
4. User signs in and authorises on eBay.
5. eBay redirects back to `/api/auth/ebay/callback` with `?code=...&state=...`.
6. Web app validates state, exchanges code for tokens against `https://api.ebay.com/identity/v1/oauth2/token`, encrypts and stores the refresh token, then enqueues a `sync:ebay:initial` job.

### 2.2 Scopes

```
https://api.ebay.com/oauth/api_scope/sell.inventory.readonly
https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly
https://api.ebay.com/oauth/api_scope/commerce.identity.readonly
```

`sell.inventory.readonly` for active listings, `sell.fulfillment.readonly` for completed orders, `commerce.identity.readonly` for the seller's eBay user ID (stored on `PlatformConnection.ebayUserId` so we can correlate later).

Source: [Using OAuth to access eBay APIs — eBay Developers Program](https://developer.ebay.com/api-docs/static/oauth-scopes.html).

### 2.3 Initial import

Triggered by the BullMQ `sync:ebay:initial` queue. Two passes:

**Active listings** via `GET /sell/inventory/v1/inventory_item`:

- Paginate with `limit=100&offset=N`.
- For each inventory item, look up its offer to get the listing price (`/sell/inventory/v1/offer?sku=...`).
- Map to an `Item` with `status = LISTED`, `externalListingId = inventoryItem.sku`, `listedPlatform = EBAY`.

**Completed orders** via `GET /sell/fulfillment/v1/order`:

- Paginate with `limit=200&offset=N` (200 is the maximum per [eBay docs](https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders)).
- Filter `filter=creationdate:[2024-04-06T00:00:00.000Z..]` to capture the last 24 months.
- For each order, extract:
  - `orderId` → `externalListingId` (suffix `-order-{orderId}` if also a listing record)
  - `lineItems[].lineItemCost.value` → `soldPrice` (sum across line items in a single order)
  - `pricingSummary.deliveryCost.value` → `shippingCharged`
  - `pricingSummary.totalFeeBasePrice.value` → `platformFees`
  - `buyer.taxAddress.country` → `buyerCountry`
  - `creationDate` → `soldAt`

### 2.4 Incremental sync

`sync:ebay:incremental` runs every 60 minutes per connected user. Same endpoints, but filtered:

- Orders: `filter=lastmodifieddate:[<lastSyncedAt>..]`
- Inventory: walk all (the API has no modified-since filter at the inventory level) but skip records whose hash hasn't changed since last sync.

The worker writes `PlatformConnection.lastSyncedAt = now()` only after a successful pass. On failure, the timestamp is unchanged so the next run retries the same window.

### 2.5 Fee extraction

`pricingSummary.totalFeeBasePrice` is usually populated for orders but not always (notably: some category-specific promotional orders, and very recent orders where eBay has not yet posted fees). When missing, fall back to the **default rate** stored on the user's `PlatformConnection.feeOverrides` (or the global default if unset):

```
default eBay UK final value fee:  12.8% of (soldPrice + shippingCharged)
fixed order fee:                  £0.30
```

The item is created with `feeEstimated: true`. The UI shows a warning badge on the item card and prompts the user to confirm or override from their eBay seller statement.

The default rate is configured in `packages/platforms/src/ebay/defaults.ts`. **Updating eBay's UK fee schedule is a one-line change there** plus a database migration to update any user-level overrides that match the old default (see §6 below for the rate-update procedure).

### 2.6 Rate limiting

eBay sends `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. The adapter wraps each request in a token-bucket limiter that pauses when remaining drops below 10 and resumes after the reset timestamp. On 429, exponential backoff: 1s, 2s, 4s, 8s, 16s, fail.

### 2.7 Auth failure handling

If a token refresh returns HTTP 401 (refresh token revoked, user disconnected on eBay's side, account changes), the adapter:

1. Updates `PlatformConnection.lastSyncStatus = FAILED`.
2. Inserts an `AuditLog` entry `action = "platform.disconnected.auth_failure"`.
3. Sends a transactional email "Your eBay connection needs attention".
4. The next request to `/app` returns a top-of-page banner with a one-click "Reconnect eBay" CTA.

We never delete imported items on auth failure. Reconnection restores syncing; the items that were imported remain.

## 3. Depop — manual mode

Depop has no public seller-read API for individuals in 2026. Three supported workflows:

### 3.1 CSV upload

The template at `apps/web/public/templates/depop-template.csv` has these columns:

```
external_id,title,listed_date,listed_price_gbp,status,sold_date,sold_price_gbp,buyer_country,platform_fee_gbp,shipping_charged_gbp,shipping_cost_gbp,condition,size,brand,category,notes
```

`status` accepts: `LISTED`, `SOLD`, `RETURNED`, `DELISTED`. The upload UI also handles non-template CSVs via a column-mapping step where the user matches their CSV's headers to the template's columns.

Validation rules (per row, in `packages/platforms/src/depop/parseCsvRow.ts`):

- `external_id` required (used for dedupe). If absent, generate `manual-${rowHash}` so re-uploads idempotently update.
- `title` required, max 200 chars.
- `listed_price_gbp` required if status is LISTED or SOLD, must parse as a positive Decimal.
- `sold_price_gbp` required if status is SOLD.
- `listed_date` / `sold_date` accept `YYYY-MM-DD` or ISO 8601; rejection comes with a clear message naming the column and row.

### 3.2 Quick-add and bulk-add UI

Per spec §6.2 Option B. The bulk-add grid uses TanStack Table with inline editing; rows are validated as they leave focus and the "Commit" button is disabled until all rows are valid. Same `parseCsvRow` validator runs against each grid row.

### 3.3 Email forwarding (Pro tier and above)

Each user with a Pro or Business subscription is assigned an inbound address `u_<userUuid>@inbox.reselltrackr.app`. Resend's inbound webhooks POST parsed emails to `/api/webhooks/inbox`. The handler:

1. Verifies the webhook signature against `RESEND_INBOUND_SECRET`.
2. Extracts the user by parsing the recipient local-part.
3. Routes to the platform parser based on sender domain:
   - `*@depop.com` → `parseDepopEmail`
   - `*@vinted.com` → `parseVintedEmail`
4. Parser returns either a partial `ImportedItem` or a parse error.
5. Result is written to an `Inbox` table with status `PENDING_REVIEW`.
6. The `/app/inbox` view shows the parsed result side-by-side with the raw email and a "Confirm" button.

### 3.4 Default fees

```
Depop selling fee:    0%  (Depop dropped the 10% UK fee in mid-2024)
Depop Payments fee:   2.9% + £0.30 per transaction
Boost fee (optional):  12%, applied only if the user toggles it per-item
```

Configured in `packages/platforms/src/depop/defaults.ts`. Per-user overrides live on `PlatformConnection.feeOverrides`.

Source: [Depop seller fees and charges — Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges).

> Note: this differs from the original build spec, which still listed Depop's old 10% UK selling fee. See `DECISIONS.md` §1.1 for context.

## 4. Vinted — manual mode

Same overall pattern as Depop: CSV template + quick-add + email forwarding.

CSV template at `apps/web/public/templates/vinted-template.csv` mirrors the Depop columns (the shared format is deliberate — users with both platforms can copy-paste between templates).

### 4.1 Default fees

```
Vinted seller fee:    0%   — Vinted charges sellers nothing.
Buyer Protection fee: ~5% + £0.70, paid by the buyer, not the seller.
```

The Buyer Protection fee never hits the seller's payout and is not modelled in `Item.platformFees`. The engine treats Vinted sales as fee-free unless the user manually overrides.

Configured in `packages/platforms/src/vinted/defaults.ts`.

Sources: [Vinted Fees 2026 — Voolist](https://www.voolist.com/blog/vinted-fees-2026); [Vinted fact sheet for consumers — City of London Trading Standards](https://www.cityoflondon.gov.uk/assets/Business/fact-sheet-2026-vinted.pdf).

## 5. Email parser drift — handling Depop/Vinted format changes

The email parsers in `packages/platforms/src/{depop,vinted}/parseEmail.ts` are regex-based against the specific layout of those platforms' sale-confirmation emails. Both platforms occasionally redesign these emails, which would silently break parsing.

Two defences:

- **One-click confirmation gate.** Parsed emails never become items automatically; they land in `/app/inbox` with status `PENDING_REVIEW`. If a parser misreads a field, the user catches it before any data is corrupted.
- **Parser version is logged.** Each parser exports a `parserVersion` string. The `Inbox` row stores the version used. When a parser is updated, a worker job re-attempts parsing for any rows still in `PENDING_REVIEW` from the old version.

When a Depop or Vinted email format change is detected (typically: an inbox row with status `PENDING_REVIEW` and obviously-wrong parsed values), the fix workflow is:

1. Open the raw `.eml` source from the inbox row (preserved on R2 under `uploads/inbound/{userId}/{messageId}.eml`).
2. Diff the old and new template by eye.
3. Update the parser, bumping `parserVersion`.
4. Add a fixture under `packages/platforms/tests/fixtures/{platform}/{version}.eml` and a test asserting the new parser handles both old and new versions.
5. Deploy. The repair worker picks up unprocessed inbox rows automatically.

## 6. Updating fee rates

Two paths:

### 6.1 Global default change

Platform fee schedules change occasionally. To update a default:

1. Edit the value in `packages/platforms/src/<platform>/defaults.ts`.
2. Add a comment with the date and a source URL.
3. Write a Prisma migration that updates any `PlatformConnection.feeOverrides` row whose value still matches the *previous* default — this lets users who never manually overrode their rates pick up the change. Users with explicit overrides keep their overrides.
4. Add a one-time `email:rate-change-notice` job that emails affected users explaining the change.

### 6.2 Per-user override

Settings → Platforms exposes editable fee fields per connection. Saving writes to `PlatformConnection.feeOverrides` (JSON column shaped as `{ sellingFeePercent, paymentFeePercent, paymentFeeFixed, boostFeePercent }`). The adapter reads this with a `defaults()` fallback chain: per-user override → global default for that platform.

## 7. Adding a new platform

When a fourth platform becomes worth supporting (Mercari UK, eBid, Amazon Handmade):

1. Add a new directory under `packages/platforms/src/<platform>` implementing the `PlatformAdapter` interface.
2. Add the platform to the `Platform` enum in `packages/db/prisma/schema.prisma` and write a migration.
3. Register the adapter in `packages/platforms/src/registry.ts`.
4. If API mode: register OAuth client, add env vars (`<PLATFORM>_CLIENT_ID`, etc.), implement OAuth flow in `apps/web/app/api/auth/<platform>/route.ts`.
5. If manual mode: create the CSV template under `apps/web/public/templates/` and the parser in the adapter.
6. Add a "Connect <Platform>" card to `/app/connections`.
7. Update the marketing site's logo strip and `docs/platforms.md` (this file).

No core business logic should need changes — the adapter pattern is the only intended extension surface.
