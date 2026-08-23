# LedgerLoop Sync — Chrome Extension Build Plan
# Last updated: 2026-05-22
# Status: Ready to build

---

## Overview

A Chrome extension that automatically syncs Vinted and Depop sold items into
LedgerLoop with zero manual steps. When the user visits their selling page on
either platform, the extension captures the sale data silently and pushes it
directly into LedgerLoop the moment a LedgerLoop tab is open. No CSV downloads,
no drag-and-drop — it just appears.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  VINTED.CO.UK / DEPOP.COM (user's browser tab)          │
│                                                         │
│  Page JS makes API calls → fetch interceptor captures   │
│  responses → postMessage to content script              │
│                                  ↓                      │
│  Content script normalises data → chrome.runtime.send   │
└─────────────────────────┬───────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  background.js (service worker)                         │
│                                                         │
│  Receives messages → deduplicates → writes to           │
│  chrome.storage.local → checks for open LedgerLoop tab  │
│                                                         │
│  If LedgerLoop tab open → push items immediately        │
│  If not open → queue in storage, update badge count     │
└─────────────────────────┬───────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  content/ledgerloop.js (runs on LedgerLoop's domain)    │
│                                                         │
│  On page load → notifies background (LL_PAGE_READY)     │
│  Background flushes queue → relays via postMessage      │
│  LedgerLoop receives items → deduplicates → adds to     │
│  items[] → refreshDerived() → toast notification        │
└─────────────────────────────────────────────────────────┘
```

### Key constraints
- No inline scripts anywhere (Chrome extension CSP blocks them)
- All persistent state in chrome.storage.local — never in-memory in background.js
  (service workers are killed between events)
- Fetch interceptor must inject into MAIN world via script tag from content script's
  ISOLATED world, then bridge back via window.postMessage
- All files use plain ES2020, no bundler, no npm — pure files the browser loads directly
- postMessage to LedgerLoop is origin-locked (window.location.origin) for security

---

## 2. Complete File Structure

```
ledgerloop-extension/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── popup.css
├── content/
│   ├── vinted.js          ← ISOLATED world: injects interceptor, parses messages,
│   │                         relays to background
│   ├── depop.js           ← same for Depop
│   └── ledgerloop.js      ← runs on LedgerLoop's domain, bridges extension ↔ page
├── inject/
│   ├── vinted-inject.js   ← MAIN world: overrides fetch, posts raw API responses
│   └── depop-inject.js    ← same for Depop
└── icons/
    ├── icon16.png          ← generated programmatically from canvas (see Section 10)
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 3. Data Schemas

### 3a. Normalised item (internal storage format)

Every item captured from any platform is normalised to this shape before storage:

```
{
  id:         String   — platform-prefixed external ID e.g. "vinted_123456"
  platform:   String   — "VINTED" or "DEPOP"
  title:      String   — first line of description only, max 120 chars
  sku:        String   — item ID from platform, empty string if none
  sold:       Number   — total buyer paid in GBP (item price + buyer shipping)
  fees:       Number   — seller-borne platform fees only
  soldAt:     String   — ISO 8601 e.g. "2024-11-15T10:30:00Z"
  capturedAt: String   — ISO 8601, when the extension captured it
  synced:     Boolean  — false until pushed to LedgerLoop
}
```

### 3b. chrome.storage.local schema

```
{
  vinted: {
    items: [ ...normalisedItem ],
    lastSync: "2024-11-15T10:30:00Z",
    userId: "12345678",
    unsyncedCount: 3,
  },
  depop: {
    items: [ ...normalisedItem ],
    lastSync: "2024-11-15T10:30:00Z",
    shopId: "myshopslug",
    unsyncedCount: 5,
  }
}
```

### 3c. LedgerLoop item shape (after push)

When items arrive in LedgerLoop via importFromExtension(), each item gets:

```
{
  id:         String   — sequential LedgerLoop ID (auto-assigned)
  externalId: String   — original extension ID e.g. "vinted_123456" (for dedup)
  platform:   String   — "VINTED" or "DEPOP"
  title:      String
  sku:        String
  cost:       null     — user fills this in the Inventory tab
  sold:       Number
  fees:       Number
  hold:       null
  soldAt:     Date object (parsed from ISO string)
}
```

The externalId field is the deduplication key — before importing, LedgerLoop checks
items.some(i => i.externalId === ext.id) and skips any already-imported items.

---

## 4. API Endpoints to Intercept

### 4a. Vinted

The fetch interceptor watches for these URL patterns (substring match):

| URL pattern                   | Data inside                     | Fields used                                           |
|-------------------------------|---------------------------------|-------------------------------------------------------|
| /api/v2/transactions          | Sold items (paginated)          | id, item.title, item.description, item_price,         |
|                               |                                 | service_fee, created_at, status                       |
| /api/v2/users/current         | Authenticated user              | user.id (stored to identify whose data this is)       |
| /api/v2/users/{id}/items      | Active listings (not sold)      | SKIP — only want sold items                           |

Vinted transaction response shape (community reverse-engineered, with fallback fields):

```
transactions[]: {
  id:               12345678,
  status:           "completed",         ← only import "completed"
  item: {
    id:             87654321,
    title:          "Nike Air Max 90",
    description:    "Great condition...\nSize UK 9\n#nike",
    price:          "25.00",             ← fallback if item_price absent
  },
  item_price:       "25.00",             ← primary revenue field
  buyer_fee:        "0.00",             ← buyer protection, NOT a seller cost
  service_fee:      "0.70",             ← Vinted's seller fee — use this for fees
  total_item_price: "25.00",
  shipment: {
    price:          "3.99"              ← buyer-paid, NOT included in revenue
  },
  created_at:       "2024-11-15T10:30:00Z",
}
```

Revenue = item_price (shipping is buyer-paid pass-through on Vinted)
Fees    = service_fee

### 4b. Depop

| URL pattern                       | Data inside              | Fields used                                     |
|-----------------------------------|--------------------------|-------------------------------------------------|
| /api/v0/selling/orders/sold       | Sold orders (paginated)  | id, productId, itemPrice, buyerShipping,        |
|                                   |                          | depopFee, product.description, created, status  |
| /api/v0/accounts/me               | Authenticated user       | username, id (stored as shopId)                 |
| /api/v0/shop/{id}/products        | Active listings          | SKIP                                            |

Depop sold order response shape:

```
objects[]: {
  id:             "order_abc123",
  productId:      87654321,
  created:        "2024-11-15T10:30:00.000Z",
  status:         "Sold",                    ← only import "Sold"
  itemPrice: {
    amount:       2500,                      ← pence, divide by 100
    currencyCode: "GBP"
  },
  buyerShipping: {
    amount:       350,                       ← pence, include in revenue
    currencyCode: "GBP"
  },
  depopFee: {
    amount:       100,                       ← pence, seller fee — use this
    currencyCode: "GBP"
  },
  product: {
    id:           87654321,
    slug:         "nike-air-max-1234",
    description:  "Nike Air Max 90\nGreat condition...\n#nike",
  }
}
```

Revenue = (itemPrice.amount + buyerShipping.amount) / 100
Fees    = depopFee.amount / 100
Title   = product.description.split('\n')[0].trim()

---

## 5. File-by-file Specification

---

### 5a. manifest.json

```json
{
  "manifest_version": 3,
  "name": "LedgerLoop Sync",
  "version": "1.0.0",
  "description": "Sync your Vinted and Depop sales to LedgerLoop automatically.",
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "https://www.vinted.co.uk/*",
    "https://www.vinted.fr/*",
    "https://www.vinted.de/*",
    "https://www.vinted.be/*",
    "https://www.depop.com/*",
    "https://ledgerloop.uk/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "LedgerLoop Sync",
    "default_icon": {
      "16":  "icons/icon16.png",
      "32":  "icons/icon32.png",
      "48":  "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.vinted.co.uk/*",
        "https://www.vinted.fr/*",
        "https://www.vinted.de/*",
        "https://www.vinted.be/*"
      ],
      "js": ["content/vinted.js"],
      "run_at": "document_start",
      "all_frames": false
    },
    {
      "matches": ["https://www.depop.com/*"],
      "js": ["content/depop.js"],
      "run_at": "document_start",
      "all_frames": false
    },
    {
      "matches": ["https://ledgerloop.uk/*"],
      "js": ["content/ledgerloop.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["inject/vinted-inject.js", "inject/depop-inject.js"],
      "matches": [
        "https://www.vinted.co.uk/*",
        "https://www.vinted.fr/*",
        "https://www.vinted.de/*",
        "https://www.vinted.be/*",
        "https://www.depop.com/*"
      ]
    }
  ]
}
```

Why "tabs" permission: needed in popup.js to detect which platform the active tab is
on and auto-select the correct platform tab in the popup.

Why no "scripting" permission: inject via <script> tag from content script, not
chrome.scripting.executeScript. Smaller permission footprint = easier Chrome Web
Store review.

Why document_idle for ledgerloop.js: LedgerLoop's app.js needs to have run and
registered window.LL before the content script attempts to interact with it.

---

### 5b. inject/vinted-inject.js — MAIN world fetch interceptor

Runs inside the page's JavaScript context. No Chrome APIs available here.
Must be completely self-contained. Must never throw or break the page.

What it does:
1. Wraps window.fetch to intercept all outgoing requests
2. For URLs matching /api/v2/transactions or /api/v2/users/current, clones the
   response, parses JSON, posts to window
3. Always returns the original response unmodified so Vinted works normally

Intercept targets (substring match on the URL string):
  - /api/v2/transactions
  - /api/v2/users/current

Message format posted to window:
```
{
  source:   'LL_VINTED_INJECT',
  endpoint: 'transactions' | 'current_user',
  data:     { ...raw JSON from API },
  url:      'https://www.vinted.co.uk/api/v2/transactions?...'
}
```

Guards:
- Skip if response.ok is false
- Skip if content-type does not include application/json
- Catch and swallow all parse errors silently
- Use unique source prefix so content script can filter safely

---

### 5c. inject/depop-inject.js — MAIN world fetch interceptor for Depop

Identical structure to vinted-inject.js but targets:
  - /api/v0/selling/orders/sold
  - /api/v0/accounts/me

Message format:
```
{
  source:   'LL_DEPOP_INJECT',
  endpoint: 'orders_sold' | 'current_user',
  data:     { ...raw JSON },
  url:      '...'
}
```

---

### 5d. content/vinted.js — ISOLATED world content script

Responsibilities:
1. Inject inject/vinted-inject.js into MAIN world via <script> tag at document_start
2. Listen for window.postMessage events from the injected script
3. Normalise raw Vinted API data into LedgerLoop's item format
4. Send normalised items to background.js via chrome.runtime.sendMessage

Injection technique (fires before any Vinted JS runs):
```javascript
const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject/vinted-inject.js');
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);
```

Message handler — listens for e.data.source === 'LL_VINTED_INJECT' only:
- endpoint 'current_user' → extract data.user.id, send { type: 'VINTED_USER', userId }
- endpoint 'transactions' → normalise each tx, send { type: 'VINTED_ITEMS', items: [...] }

Normalisation logic (per transaction):
```
- Skip if tx.status !== 'completed'
- title   = (tx.item.description || tx.item.title || '').split('\n')[0].trim().slice(0, 120)
- sold    = parseFloat(tx.item_price || tx.total_item_price || tx.item.price || '0')
- fees    = parseFloat(tx.service_fee || '0')
- Skip if sold === 0
- id      = 'vinted_' + tx.id
- sku     = String(tx.item.id) or ''
- soldAt  = tx.created_at
- All fields rounded to 2dp
```

---

### 5e. content/depop.js — ISOLATED world content script for Depop

Same structure as content/vinted.js but targets Depop.

Normalisation logic (per order):
```
- Skip if order.status !== 'Sold'
- title   = (order.product.description || '').split('\n')[0].trim().slice(0, 120)
- sold    = (order.itemPrice.amount + (order.buyerShipping?.amount || 0)) / 100
- fees    = (order.depopFee?.amount || 0) / 100
- Skip if sold === 0
- id      = 'depop_' + order.id
- sku     = String(order.productId) or ''
- soldAt  = order.created
```

---

### 5f. content/ledgerloop.js — bridges extension and LedgerLoop page

Runs on LedgerLoop's hosted domain at document_idle.

On load:
```javascript
chrome.runtime.sendMessage({ type: 'LL_PAGE_READY' });
```

Listens for PUSH_ITEMS from background, relays to page via postMessage:
```javascript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'PUSH_ITEMS') return;
  window.postMessage(
    { source: 'LL_EXT_PUSH', items: msg.items },
    window.location.origin    // origin-locked for security
  );
});
```

---

### 5g. background.js — Service Worker

Stateless between events. All state lives in chrome.storage.local.

Message types handled:

| Message type  | Sender               | Action                                              |
|---------------|----------------------|-----------------------------------------------------|
| VINTED_USER   | content/vinted.js    | Store userId in vinted.userId                       |
| VINTED_ITEMS  | content/vinted.js    | Merge+deduplicate into vinted.items, push to LL tab |
| DEPOP_USER    | content/depop.js     | Store shopId in depop.shopId                        |
| DEPOP_ITEMS   | content/depop.js     | Merge+deduplicate into depop.items, push to LL tab  |
| LL_PAGE_READY | content/ledgerloop.js| Flush all unsynced items to the LedgerLoop tab      |
| GET_STATE     | popup.js             | Read and return full storage state                  |
| CLEAR_PLATFORM| popup.js             | Delete all items for a platform                     |

Deduplication (merge function):
```
- Build a Map keyed by item.id from existing items
- For each incoming item: if id not in map, add it
- Never overwrite existing (preserves synced flag)
- Return Map.values() as array
```

After receiving VINTED_ITEMS or DEPOP_ITEMS:
```
1. Merge + deduplicate into chrome.storage.local
2. Update lastSync timestamp
3. Query chrome.tabs for an open ledgerloop.uk tab
4. If found → chrome.tabs.sendMessage(tabId, { type: 'PUSH_ITEMS', items: newItems })
             → mark those items synced: true in storage
5. If not found → items stay with synced: false
6. Recount unsyncedCount, update badge
```

On LL_PAGE_READY:
```
1. Read all items where synced === false across both platforms
2. If any → sendMessage to LedgerLoop tab with all unsynced items
3. Mark them synced: true in storage
4. Clear badge
```

Badge update:
```javascript
chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
chrome.action.setBadgeBackgroundColor({ color: '#F97316' });
```

Storage write pattern (atomic, prevents race conditions):
```javascript
chrome.storage.local.get(['vinted'], (result) => {
  const existing = result.vinted || { items: [], lastSync: null, userId: null };
  existing.items = mergeItems(existing.items, incomingItems);
  existing.lastSync = new Date().toISOString();
  existing.unsyncedCount = existing.items.filter(i => !i.synced).length;
  chrome.storage.local.set({ vinted: existing });
});
```

---

### 5h. popup.html

Width: 380px. Height: auto (content-driven, max ~520px).
No inline scripts — all JS in popup.js. Loads Inter from Google Fonts.

Structure:
```
┌──────────────────────────────────────────┐
│  HEADER (orange gradient, 64px)          │
│  [LL icon] LedgerLoop Sync    [settings] │
├──────────────────────────────────────────┤
│  PLATFORM TABS (46px)                    │
│  [ Vinted ]     [ Depop ]                │
│  (active = orange underline + text)      │
├──────────────────────────────────────────┤
│  BODY (16px padding)                     │
│                                          │
│  STATUS ROW                              │
│  ● 47 sales synced · last sync 2m ago   │
│  or                                      │
│  ○ No data yet — visit your selling page │
│                                          │
│  RECENT SALES LIST (last 4)              │
│  ┌──────────────────────────────────┐    │
│  │ Nike Air Max 90        £25.00    │    │
│  │ Levi 501 Jeans W32     £18.00    │    │
│  │ Ralph Lauren Polo      £22.00    │    │
│  │ + 44 more...                     │    │
│  └──────────────────────────────────┘    │
│                                          │
│  PENDING BADGE (if unsynced > 0)         │
│  ⚠ 5 sales waiting — open LedgerLoop   │
│                                          │
│  ACTION BUTTON                           │
│  [↗ Open LedgerLoop]                     │
│                                          │
│  EMPTY STATE (if no data)                │
│  Visit your Vinted selling page to       │
│  start syncing sales automatically.      │
│                                          │
├──────────────────────────────────────────┤
│  FOOTER                                  │
│  ledgerloop.uk               v1.0.0      │
└──────────────────────────────────────────┘
```

---

### 5i. popup.js

On load:
1. Send GET_STATE to background, receive full storage
2. Detect active tab URL — Vinted domain → show Vinted tab, Depop → show Depop tab,
   otherwise default to whichever platform has more unsynced items
3. Render appropriate panel

Status rendering:
```
If no items:  grey dot + "No data yet — visit your selling page"
If items:     green dot + "{total} sales synced · last sync {timeAgo}"
If unsynced:  orange warning badge + "{n} sales waiting — open LedgerLoop"
```

timeAgo(isoString) helper returns: "just now", "5m ago", "2h ago", "3 days ago"

Recent sales list:
- Last 4 items sorted by soldAt descending
- Title truncated to 28 chars with ellipsis
- Price right-aligned, JetBrains Mono font
- "and N more..." row if total > 4

Open LedgerLoop button:
- Checks if ledgerloop.uk tab already open via chrome.tabs.query
- If open → chrome.tabs.update(tabId, { active: true }) to focus it
- If not → chrome.tabs.create({ url: 'https://ledgerloop.uk' })

---

### 5j. popup.css — Design Specification

```
Popup width:        380px
Font:               Inter (Google Fonts CDN in popup.html <head>)
Mono font:          JetBrains Mono (prices only)
Base background:    #FFFFFF
Base text:          #1C1917

HEADER
  height:           64px
  background:       linear-gradient(135deg, #F97316 0%, #EA580C 60%, #9A3412 100%)
  padding:          0 16px
  display:          flex, align-items center, justify-content space-between
  Logo text:        15px, weight 700, color #FFFFFF
  Settings icon:    20x20, color #FFFFFF, opacity 0.8

PLATFORM TABS
  height:           46px
  border-bottom:    1px solid #E7E5E4
  Each tab:         flex 1, height 100%, font-size 14px, weight 500
                    inactive: color #78716C, no border
                    active:   color #F97316, border-bottom 2px solid #F97316
                    hover:    background #FAFAF9
                    transition: all 150ms

BODY
  padding:          16px

STATUS ROW
  font-size:        12px, color #78716C
  margin-bottom:    12px
  Status dot:       8x8px circle
                    green (#22C55E) — data present + synced
                    grey (#D6D3D1)  — no data
                    orange (#F97316) pulsing — currently syncing

RECENT SALES LIST
  border:           1px solid #E7E5E4
  border-radius:    10px
  overflow:         hidden
  Row padding:      10px 12px
  Row font-size:    13px, color #1C1917
  Row border-bottom:1px solid #F5F5F4 (except last row)
  Row hover:        background #FAFAF9
  Title:            max-width 200px, overflow hidden, text-overflow ellipsis,
                    white-space nowrap
  Price:            JetBrains Mono, 13px, weight 500
  "N more" row:     color #78716C, 12px, font-style italic

PENDING BADGE
  margin-top:       10px
  padding:          8px 10px
  background:       #FFF7ED
  border:           1px solid #FED7AA
  border-radius:    8px
  font-size:        12px, color #9A3412
  display:          flex, align-items center, gap 6px

ACTION BUTTON (Open LedgerLoop)
  margin-top:       14px
  width:            100%
  height:           40px
  background:       #F97316
  color:            #FFFFFF
  border:           none
  border-radius:    10px
  font-size:        14px, weight 500
  hover:            background #EA580C, transform translateY(-1px),
                    box-shadow 0 4px 12px rgba(249,115,22,0.3)
  disabled:         background #E7E5E4, color #A8A29E, cursor not-allowed
  transition:       all 150ms

EMPTY STATE TEXT
  margin-top:       16px
  font-size:        12px, color #A8A29E
  text-align:       center, line-height 1.5

FOOTER
  border-top:       1px solid #F5F5F4
  padding:          10px 16px
  font-size:        11px, color #A8A29E
  display:          flex, justify-content space-between

PULSING DOT ANIMATION (@keyframes ll-pulse)
  0%/100%:          opacity 1, transform scale(1)
  50%:              opacity 0.5, transform scale(0.85)
  duration:         1.4s, infinite
```

---

## 6. LedgerLoop Changes Required (app.js + dashboard.html)

### 6a. app.js

ADD to PLATFORMS object:
```javascript
VINTED: { name: 'Vinted', color: '#09B1BA', short: 'V' }
```

ADD importFromExtension to window.LL:
```javascript
importFromExtension(extItems) {
  let nextId = items.length > 0
    ? Math.max(...items.map(i => parseInt(i.id) || 0)) + 1 : 1;
  let added = 0;
  for (const ext of extItems) {
    if (items.some(i => i.externalId === ext.id)) continue;  // deduplicate
    items.push({
      id:         String(nextId++),
      externalId: ext.id,
      platform:   ext.platform,
      title:      ext.title,
      sku:        ext.sku,
      cost:       null,
      sold:       ext.sold,
      fees:       ext.fees,
      hold:       null,
      soldAt:     ext.soldAt ? new Date(ext.soldAt) : null,
    });
    added++;
  }
  if (added > 0) {
    refreshDerived();
    renderInventory();
    showSyncToast(added, extItems[0]?.platform);
  }
  return added;
}
```

ADD postMessage listener (in main script body, outside any function):
```javascript
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.source !== 'LL_EXT_PUSH') return;
  window.LL.importFromExtension(e.data.items);
});
```

ADD showSyncToast(count, platform) — bottom-right toast, 4 seconds, orange/white:
- "✓  5 new Vinted sales synced automatically"
- Appears over existing UI, auto-dismisses, no user action required

ADD Vinted to platform mix recomputation:
```javascript
const totals = { EBAY: 0, ETSY: 0, DEPOP: 0, VINTED: 0 };
```

ADD Vinted parser _parseVinted (kept as fallback for manual CSV imports):
```javascript
function _parseVinted(rows) {
  const out = [];
  for (const row of rows) {
    const sold  = _csvMoney(_csvCol(row, 'sale price (gbp)', 'sale price', 'item price'));
    if (!sold) continue;
    const fees  = Math.abs(_csvMoney(_csvCol(row, 'vinted fee (gbp)', 'vinted fee', 'seller fee')));
    const title = (_csvCol(row, 'item title', 'title', 'description') || '')
                    .split(/\r?\n/)[0].trim() || 'Vinted item';
    out.push({
      platform: 'VINTED',
      sku:      _csvCol(row, 'item id', 'sku') || '',
      title,
      cost:     null,
      sold,
      fees,
      hold:     null,
      soldAt:   _csvDate(_csvCol(row, 'date of sale', 'sale date', 'date')),
    });
  }
  return out;
}
```

ADD Vinted detection to _csvDetectPlatform (before Depop check):
```javascript
if (has('vinted fee', 'vinted fee (gbp)')) return 'VINTED';
```

ADD Vinted branch to parser dispatch:
```javascript
const parsed = platform === 'EBAY'   ? _parseEbay(data)
             : platform === 'ETSY'   ? _parseEtsy(data)
             : platform === 'VINTED' ? _parseVinted(data)
             :                         _parseDepop(data);
```

UPDATE beforeFirstChunk preamble regex to include 'vinted fee':
```javascript
/transaction creation date|listing id|order id|depop fee|vinted fee|date of sale|sale date/i
```

### 6b. dashboard.html

ADD Vinted to platform mix card (wherever the eBay/Etsy/Depop rows are displayed).

---

## 7. Icons — Generation Approach

Generate once via a generate-icons.html helper file (included in repo, not shipped):

```javascript
function makeIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Orange rounded square background
  ctx.fillStyle = '#F97316';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.22);
  ctx.fill();
  // White "LL" text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${size * 0.42}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LL', size / 2, size / 2);
  return canvas.toDataURL('image/png');
}
// Run for sizes 16, 32, 48, 128 and save each data URL as the corresponding PNG
```

---

## 8. Build Order

Build in this exact sequence to avoid forward-dependency issues:

1.  icons/                   — generate all four PNGs first (manifest references them)
2.  manifest.json            — defines the entire extension shape
3.  inject/vinted-inject.js  — simplest file, no dependencies
4.  inject/depop-inject.js   — same
5.  content/vinted.js        — depends on vinted-inject.js path
6.  content/depop.js         — depends on depop-inject.js path
7.  content/ledgerloop.js    — depends on message types defined in background.js spec
8.  background.js            — depends on all message types from content scripts
9.  popup.css                — pure design, no logic dependencies
10. popup.html               — depends on popup.css, references popup.js
11. popup.js                 — depends on background message types and storage schema
12. app.js edits             — VINTED platform, importFromExtension, postMessage listener,
                               showSyncToast, _parseVinted, _csvDetectPlatform update
13. dashboard.html edits     — Vinted platform mix row, preamble regex update

---

## 9. Edge Cases and Gotchas

| Risk                                      | Mitigation                                                   |
|-------------------------------------------|--------------------------------------------------------------|
| Vinted/Depop change API field names       | All field lookups use ordered fallback arrays, not single keys|
| SPA navigation doesn't re-run scripts     | Fetch interceptor injected at document_start, stays alive    |
|                                           | for the full lifetime of the tab regardless of navigation    |
| Same transaction captured on repeat loads | Deduplicated by id in background.js merge — never doubled    |
| Service worker killed mid-write           | Storage writes are atomic: get → modify → set in one chain   |
| response.clone().json() rejects           | Wrapped in .catch(() => {}) — silent, never breaks the page  |
| User opens LedgerLoop before items arrive | LL_PAGE_READY fires on every load — always flushes the queue |
| Same items imported twice by user         | externalId field in LedgerLoop prevents re-import            |
| Vinted UK vs Vinted FR (different domains)| Both share the 'vinted' storage key — userId is consistent   |
| popup opened before any data captured     | Empty state UI with instruction text, no blank screen/errors  |
| Multiple Vinted transactions in same resp | All transactions[] array members are processed in one loop   |
| Depop pagination (multiple pages)         | Each paginated response intercepted independently — dedup    |
|                                           | in background handles any overlap between pages              |
| LedgerLoop tab not open when items arrive | Items queue in storage, badge shows count, flushed on open   |
| postMessage intercepted by other scripts  | Source field 'LL_EXT_PUSH' + origin check prevents spoofing  |

---

## 10. What is NOT in Scope (Phase 1)

- Active listings sync (sold items only)
- Real-time background polling (page observer only)
- Vinted messages or offers
- Depop listings management
- Multi-account support per platform
- Safari or Firefox extensions (Chrome only)
- Poshmark, eBay, or Etsy via extension (those platforms have CSV export)

---

## 11. Phase 0 — No-Database / Test Account Mode

LedgerLoop does not yet have a backend database or user authentication system.
The current deployment at ledgerloop.uk is a single-page app (static HTML + JS)
with a single implicit test account — whoever opens the tab.

### How the extension behaves in Phase 0

- The content script on ledgerloop.uk pushes items to whichever LedgerLoop tab
  is open, with no user-identity check. There is no concept of "logged in as X"
  yet, so the push always succeeds.

- No Vinted/Depop user ID is matched against any LedgerLoop account. The
  extension stores the platform userId/shopId in chrome.storage.local for
  future use, but does not send it to LedgerLoop yet.

- Deduplication is handled entirely by the externalId field inside LedgerLoop's
  items[] array. If the same sale arrives twice, the second push is silently
  ignored.

- This means Phase 0 works correctly for a single user in a single browser
  without any server-side infrastructure.

### What changes when the database is built (Phase 1)

When LedgerLoop adds user accounts and a backend:

1. LedgerLoop exposes the logged-in user's ID to the page — e.g. via
   window.LL.currentUserId or a data attribute on the body.

2. The postMessage listener in app.js reads this value and rejects pushes
   where the platform userId stored in the extension does not match.

3. background.js can optionally include the stored userId when building the
   PUSH_ITEMS message so ledgerloop.js can validate before relaying.

4. The extension popup may need a "Link account" flow so users can confirm
   which Vinted/Depop account maps to their LedgerLoop login.

None of these Phase 1 changes affect the extension's file structure or the
core fetch-intercept → background → postMessage pipeline. They are additive
only. Build Phase 0 exactly as specified — Phase 1 layers on top.

### Test account access

During development and testing, open https://ledgerloop.uk in Chrome, install
the unpacked extension, then visit your Vinted or Depop selling page. Sales
captured while the LedgerLoop tab is open will push immediately. Sales captured
while the tab is closed will queue in the extension badge and flush the next
time you open ledgerloop.uk.

---

## 12. Chrome Web Store Submission Notes

- Extension name:    LedgerLoop Sync
- Category:         Productivity
- Permissions to justify in listing:
    "storage"  — stores your captured sales data locally in the browser
    "tabs"     — detects which platform you're on to show the right popup view
- Host permissions to justify:
    vinted.co.uk, vinted.fr etc — reads your own sold items from Vinted
    depop.com                   — reads your own sold orders from Depop
    ledgerloop.uk               — pushes captured data into your LedgerLoop account
- Privacy policy required (mandatory for extensions requesting host permissions)
- Single-purpose description: captures the user's own sold item data from
  Vinted and Depop and syncs it automatically to LedgerLoop for tax tracking

---

End of plan.
