  // ============================================================= //
  // Demo items (12 across eBay/Etsy/Depop)
  // ============================================================= //
  const PLATFORMS = {
    EBAY:  { name:'eBay',  color:'#0064D2', short:'eb' },
    ETSY:  { name:'Etsy',  color:'#F1641E', short:'e'  },
    DEPOP: { name:'Depop', color:'#FF2300', short:'D'  },
  };
  const items = [
    // Items where cost has already been filled in
    { id:'1', platform:'EBAY',  sku:'LV-501-W32',  title:'Vintage Levi 501 Jeans W32',    cost:6.00,  sold:42.00,  fees:5.38,  hold:22, soldAt:new Date('2024-06-03') },
    { id:'2', platform:'DEPOP', sku:'NK-AM90',     title:'Nike Air Max 90 UK9',            cost:27.50, sold:78.00,  fees:9.98,  hold:44, soldAt:new Date('2024-07-15') },
    { id:'3', platform:'EBAY',  sku:'BB-WOOL',     title:'Barbour wool overshirt M',       cost:4.00,  sold:55.00,  fees:7.04,  hold:24, soldAt:new Date('2024-08-01') },
    { id:'4', platform:'EBAY',  sku:'CB-COAT',     title:'Carhartt Detroit jacket L',      cost:40.00, sold:115.00, fees:14.72, hold:39, soldAt:new Date('2024-09-12') },
    { id:'5', platform:'ETSY',  sku:'CER-MUG',     title:'Handmade ceramic mug',           cost:8.00,  sold:28.00,  fees:1.50,  hold:14, soldAt:new Date('2024-10-01') },
    { id:'6', platform:'DEPOP', sku:'STONE-CRD',   title:'Stone Island cord trousers W34', cost:60.00, sold:95.00,  fees:8.55,  hold:22, soldAt:new Date('2024-11-08') },
    { id:'7', platform:'EBAY',  sku:'AD-SAMBA',    title:'Adidas Samba OG UK9',            cost:44.50, sold:92.00,  fees:11.78, hold:24, soldAt:new Date('2024-12-14') },
    { id:'8', platform:'DEPOP', sku:'PATA-RETR',   title:'Patagonia Retro-X fleece M',     cost:42.00, sold:112.00, fees:14.34, hold:41, soldAt:new Date('2025-01-11') },
    // Newly imported from CSVs — cost needs to be filled in
    { id:'9', platform:'EBAY',  sku:'AW-MAC-L',    title:'Aquascutum tan mac L',           cost:null,  sold:85.00,  fees:10.88, hold:18, soldAt:new Date('2025-02-04') },
    { id:'10',platform:'ETSY',  sku:'PLANT-POT',   title:'Hand-painted plant pot set',     cost:null,  sold:45.00,  fees:2.30,  hold:12, soldAt:new Date('2025-02-12') },
    { id:'11',platform:'DEPOP', sku:'BURB-MAC',    title:'Burberry rain coat M',           cost:null,  sold:135.00, fees:12.15, hold:31, soldAt:new Date('2025-02-25') },
    { id:'12',platform:'EBAY',  sku:'AD-SL72',     title:'Adidas SL 72 white UK10',        cost:null,  sold:75.00,  fees:9.60,  hold:20, soldAt:new Date('2025-03-08') },
    { id:'13',platform:'DEPOP', sku:'NF-PUFFER',   title:'North Face Nuptse 700 puffer',   cost:null,  sold:128.00, fees:11.52, hold:9,  soldAt:new Date('2025-03-15') },
    { id:'14',platform:'ETSY',  sku:'KNIT-SCARF',  title:'Hand-knit chunky wool scarf',    cost:null,  sold:38.00,  fees:2.05,  hold:7,  soldAt:new Date('2025-03-22') },
  ];
  // Derived fields — profit and roi are computed from cost so they always stay in sync.
  function computeProfit(item) {
    if (item.cost == null || item.sold == null) return null;
    return item.sold - item.cost - (item.fees || 0);
  }
  function computeRoi(item) {
    const p = computeProfit(item);
    if (p == null || item.cost == null || item.cost <= 0) return null;
    return p / item.cost;
  }
  function needsCost(item) { return item.cost == null; }
  const fmt = (v) => v == null ? '—' : '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCompact = (v) => v == null ? '—' : '£' + Math.round(Number(v)).toLocaleString('en-GB');
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  // ============================================================= //
  // Tax inputs — single source of truth, persisted to localStorage,
  // synced across the Settings tab and the Tax tab.
  // ============================================================= //
  const TAX_INPUTS_KEY = 'ledgerloop-tax-inputs';
  let currentYear = 2024;
  // 'all' shows everything ever imported; a number shows that UK tax year (e.g. 2024 = 2024/25)
  let dashYear = 'all';

  function getDashItems() {
    if (dashYear === 'all') return items;
    return getTaxYearItems(Number(dashYear));
  }

  function getDashTaxYears() {
    const years = new Set();
    for (const item of items) {
      if (!item.soldAt) continue;
      const y = item.soldAt.getUTCFullYear();
      const m = item.soldAt.getUTCMonth() + 1;
      const d = item.soldAt.getUTCDate();
      years.add((m > 4 || (m === 4 && d >= 6)) ? y : y - 1);
    }
    return Array.from(years).sort();
  }
  function loadTaxInputs() {
    // forceAllowance: null = auto-pick cheaper; true = force £1k allowance; false = force actual
    const defaults = { paye: 32000, slPlan: 'PLAN_2', forceAllowance: null };
    try {
      const raw = localStorage.getItem(TAX_INPUTS_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch {}
    return defaults;
  }
  let taxInputs = loadTaxInputs();
  function persistTaxInputs() {
    try { localStorage.setItem(TAX_INPUTS_KEY, JSON.stringify(taxInputs)); } catch {}
  }
  function setupTaxInputs() {
    const payeEls = document.querySelectorAll('[data-taxinp="paye"]');
    const slEls   = document.querySelectorAll('[data-taxinp="sl"]');
    if (!payeEls.length && !slEls.length) return;
    // Seed both forms from state
    payeEls.forEach(el => { el.value = taxInputs.paye ?? ''; });
    slEls.forEach(el   => { el.value = taxInputs.slPlan ?? 'NONE'; });

    payeEls.forEach(el => {
      el.addEventListener('input', () => {
        let v = Number(el.value);
        if (el.value === '' || isNaN(v) || v < 0) v = 0;
        taxInputs.paye = v;
        payeEls.forEach(o => { if (o !== el) o.value = v; });
        persistTaxInputs();
        applyYear(currentYear);
        recomputeDashboardCards();
      });
    });
    slEls.forEach(el => {
      el.addEventListener('change', () => {
        taxInputs.slPlan = el.value;
        slEls.forEach(o => { if (o !== el) o.value = el.value; });
        persistTaxInputs();
        applyYear(currentYear);
        recomputeDashboardCards();
      });
    });
  }

  // Returns items that fall within the UK tax year starting 6 April {year}
  function getTaxYearItems(year) {
    const start = new Date(Date.UTC(year, 3, 6));
    const end   = new Date(Date.UTC(year + 1, 3, 6));
    return items.filter(i => i.soldAt && i.soldAt >= start && i.soldAt < end);
  }
  // Aggregate the year's items. Turnover counts EVERY item (single source of
  // truth — matches the inventory total). Costs only count items where the
  // user has filled in a cost, so an unfilled item is treated as £0 cost
  // (worst-case tax). A warning surfaces when there are items missing costs.
  function computeTaxYearTotals(year) {
    const all = getTaxYearItems(year);
    const known = all.filter(i => i.cost != null);
    const turnover = all.reduce((s, i) => s + (i.sold || 0), 0);
    const cogs     = known.reduce((s, i) => s + i.cost, 0);
    const fees     = known.reduce((s, i) => s + (i.fees || 0), 0);
    return {
      turnover,
      costs: cogs + fees,
      cogs, dsc: fees, gen: 0,
      allCount: all.length,
      knownCount: known.length,
      unknownCount: all.length - known.length,
    };
  }

  // ============================================================= //
  // Inventory editor — spreadsheet-style cost entry
  // ============================================================= //
  let invFilter = 'ALL';            // ALL | NEEDS_COST | HAS_COST
  let selectedIds = new Set();
  let editingId = null;
  let suggestionsActive = false;
  let targetMargin = 0.5;
  let lastClickedIndex = -1;
  let searchQuery = '';             // free-text filter on title + SKU
  let monthFilter = '';             // 'YYYY-MM' or '' for all
  // Sort state — default to newest-sold first, matching the items array order
  let sortKey = 'soldAt';           // 'title' | 'platform' | 'sold' | 'cost' | 'profit' | 'roi' | 'soldAt'
  let sortDir = 'desc';             // 'asc' | 'desc'
  // Pagination
  let invPage = 0;                  // zero-based current page index
  let invPageSize = 50;             // items per page (user can switch to 100)

  // Pull a comparable value for a sort key, returning null for "not yet known"
  // so the sort can park nulls at the end of either direction.
  function sortValueFor(item, key) {
    switch (key) {
      case 'title':    return (item.title || '').toLowerCase();
      case 'platform': return (PLATFORMS[item.platform]?.name || '').toLowerCase();
      case 'sold':     return item.sold == null ? null : Number(item.sold);
      case 'cost':     return item.cost == null ? null : Number(item.cost);
      case 'profit':   return computeProfit(item);                    // null if no cost
      case 'roi':      return computeRoi(item);                       // null if no cost
      case 'soldAt':   return item.soldAt ? item.soldAt.getTime() : null;
      default:         return null;
    }
  }

  function sortItems(list) {
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = sortValueFor(a, sortKey);
      const vb = sortValueFor(b, sortKey);
      // Always put nulls at the bottom, regardless of direction — so the user
      // never has to scroll past empties to find data.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return dir * va.localeCompare(vb);
      }
      return dir * (va - vb);
    });
  }

  function getFilteredItems() {
    let list = items.slice();
    if (invFilter === 'NEEDS_COST') list = list.filter(needsCost);
    else if (invFilter === 'HAS_COST') list = list.filter(i => !needsCost(i));
    if (monthFilter) {
      list = list.filter(i => {
        if (!i.soldAt) return false;
        const key = `${i.soldAt.getUTCFullYear()}-${String(i.soldAt.getUTCMonth() + 1).padStart(2, '0')}`;
        return key === monthFilter;
      });
    }
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      if (q) list = list.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.sku   || '').toLowerCase().includes(q)
      );
    }
    return sortItems(list);
  }

  function getAvailableMonths() {
    const set = new Set();
    for (const item of items) {
      if (!item.soldAt) continue;
      const key = `${item.soldAt.getUTCFullYear()}-${String(item.soldAt.getUTCMonth() + 1).padStart(2, '0')}`;
      set.add(key);
    }
    return Array.from(set).sort().reverse();   // newest first
  }
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  function suggestedCostFor(item) {
    if (item.sold == null) return null;
    // Take net revenue (sale − fees) and treat (1 − margin) as the implied cost.
    const netRev = item.sold - (item.fees || 0);
    return Math.max(0, netRev * (1 - targetMargin));
  }

  function renderInventory() {
    const tbody = document.getElementById('inv-rows');
    if (!tbody) return;
    const filtered = getFilteredItems();

    // Clamp page to valid range after filter/search changes
    const totalPages = Math.max(1, Math.ceil(filtered.length / invPageSize));
    if (invPage >= totalPages) invPage = totalPages - 1;

    const pageStart = invPage * invPageSize;
    const pageItems = filtered.slice(pageStart, pageStart + invPageSize);

    tbody.innerHTML = pageItems.map((item) => {
      const p = PLATFORMS[item.platform];
      const isSelected = selectedIds.has(item.id);
      const isNeeds = needsCost(item);
      const profit = computeProfit(item);
      const roi = computeRoi(item);

      let costHtml;
      if (item.cost != null) {
        costHtml = `<div class="cost-cell" data-id="${item.id}" tabindex="0">${fmt(item.cost)}</div>`;
      } else if (suggestionsActive) {
        const s = suggestedCostFor(item);
        const safe = s != null ? s.toFixed(2) : '0.00';
        costHtml = `<div class="cost-cell suggested" data-id="${item.id}" data-suggestion="${safe}" title="Suggested at ${Math.round(targetMargin*100)}% margin — click to use or edit" tabindex="0">£${safe}</div>`;
      } else {
        costHtml = `<div class="cost-cell empty" data-id="${item.id}" tabindex="0">Add cost</div>`;
      }

      const rowClass = isSelected ? 'row-selected' : (isNeeds ? 'row-needs-cost' : 'hover:bg-stone-50');

      // Fee/shipping deduction summary shown under profit for transparency.
      const fees = item.fees || 0;
      const feeNote = (profit != null && fees > 0)
        ? `<div class="profit-fee-note" title="Platform marketplace fee + payment processing + postage label">−${fmt(fees)} fees</div>`
        : '';

      return `
      <tr class="${rowClass}" data-id="${item.id}">
        <td class="px-4 py-3 align-middle" style="width:36px">
          <input type="checkbox" class="inv-check row-check" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="px-4 py-3 align-top">
          <div class="font-medium">${item.title}</div>
          <div class="mono text-xs text-stone-500 mt-0.5">${item.sku}</div>
        </td>
        <td class="px-4 py-3 align-top">
          <span class="font-semibold text-sm" style="color:${p.color}">${p.name}</span>
        </td>
        <td class="px-4 py-3 align-top text-right mono">${fmt(item.sold)}</td>
        <td class="px-4 py-3 align-top text-right">${costHtml}</td>
        <td class="px-4 py-3 align-top text-right">
          <div class="mono ${profit != null ? (profit >= 0 ? 'text-profit' : 'text-loss') : 'text-stone-400'}">${fmt(profit)}</div>
          ${feeNote}
        </td>
        <td class="px-4 py-3 align-top text-right mono text-stone-500">${roi != null ? Math.round(roi * 100) + '%' : '—'}</td>
        <td class="px-4 py-3 align-top text-xs text-stone-500">${item.soldAt ? item.soldAt.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
      </tr>`;
    }).join('');

    updateInventoryHeader();
    updateSortIndicators();
    attachInventoryRowHandlers();
    renderInventoryPagination(filtered.length, totalPages);
  }

  function renderInventoryPagination(totalItems, totalPages) {
    const el = document.getElementById('inv-pagination');
    if (!el) return;
    if (totalItems === 0) { el.innerHTML = ''; return; }

    const pageStart = invPage * invPageSize + 1;
    const pageEnd   = Math.min((invPage + 1) * invPageSize, totalItems);

    const btnClass = 'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors';
    const activeBtn  = `${btnClass} border-stone-300 bg-white hover:bg-stone-50 text-stone-700`;
    const disabledBtn = `${btnClass} border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed`;

    const prevDisabled = invPage === 0;
    const nextDisabled = invPage >= totalPages - 1;

    el.innerHTML = `
      <div class="flex items-center justify-between gap-4 px-1 pt-3 pb-1 border-t border-stone-200 text-sm text-stone-600">
        <span>${pageStart}–${pageEnd} of ${totalItems} items</span>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-stone-500">
            Per page
            <select id="inv-page-size" class="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="50"  ${invPageSize === 50  ? 'selected' : ''}>50</option>
              <option value="100" ${invPageSize === 100 ? 'selected' : ''}>100</option>
            </select>
          </label>
          <button id="inv-prev-page" class="${prevDisabled ? disabledBtn : activeBtn}" ${prevDisabled ? 'disabled' : ''}>← Prev</button>
          <span class="px-2 font-medium text-stone-700">${invPage + 1} / ${totalPages}</span>
          <button id="inv-next-page" class="${nextDisabled ? disabledBtn : activeBtn}" ${nextDisabled ? 'disabled' : ''}>Next →</button>
        </div>
      </div>`;

    document.getElementById('inv-prev-page')?.addEventListener('click', () => {
      if (invPage > 0) { invPage--; renderInventory(); }
    });
    document.getElementById('inv-next-page')?.addEventListener('click', () => {
      if (invPage < totalPages - 1) { invPage++; renderInventory(); }
    });
    document.getElementById('inv-page-size')?.addEventListener('change', e => {
      invPageSize = Number(e.target.value);
      invPage = 0;
      renderInventory();
    });
  }

  // Inline SVG arrows — neutral (hover state), ascending, descending.
  const SORT_ARROWS = {
    none: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="4.5 6 8 2.5 11.5 6"/><polyline points="4.5 10 8 13.5 11.5 10"/></svg>',
    asc:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="4 10 8 5 12 10"/></svg>',
    desc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="4 6 8 11 12 6"/></svg>',
  };

  function updateSortIndicators() {
    document.querySelectorAll('.inv-sort-header').forEach(th => {
      const key = th.dataset.sortKey;
      const arrow = th.querySelector('[data-arrow]');
      if (!arrow) return;
      if (key === sortKey) {
        arrow.innerHTML = SORT_ARROWS[sortDir];
        arrow.classList.add('active');
        th.classList.add('sorted');
        th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        arrow.innerHTML = SORT_ARROWS.none;
        arrow.classList.remove('active');
        th.classList.remove('sorted');
        th.removeAttribute('aria-sort');
      }
    });
  }

  function setupInventorySort() {
    document.querySelectorAll('.inv-sort-header').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = (key === 'title' || key === 'platform') ? 'asc' : 'desc';
        }
        invPage = 0;
        renderInventory();
      });
    });
  }

  function updateInventoryHeader() {
    const total = items.length;
    const needCount = items.filter(needsCost).length;
    setText('inv-count', `${total} sold items`);
    const needPill = document.getElementById('inv-needs-cost-pill');
    if (needPill) {
      if (needCount > 0) {
        needPill.classList.remove('hidden');
        setText('inv-needs-cost-count', `${needCount} need cost`);
      } else {
        needPill.classList.add('hidden');
      }
    }
    const setPillCount = (filter, n) => {
      const el = document.querySelector(`.inv-filter-pill[data-filter="${filter}"] .pill-count`);
      if (el) el.textContent = ` ${n}`;
    };
    setPillCount('ALL', total);
    setPillCount('NEEDS_COST', needCount);
    setPillCount('HAS_COST', total - needCount);

    const bar = document.getElementById('bulk-bar');
    if (bar) {
      if (selectedIds.size >= 2) {
        bar.classList.remove('hidden');
        setText('bulk-count', `${selectedIds.size} selected`);
      } else {
        bar.classList.add('hidden');
      }
    }
    const sa = document.getElementById('inv-select-all');
    if (sa) {
      const filt = getFilteredItems();
      const allSel = filt.length > 0 && filt.every(i => selectedIds.has(i.id));
      const someSel = !allSel && filt.some(i => selectedIds.has(i.id));
      sa.checked = allSel; sa.indeterminate = someSel;
    }
    // Totals strip — always reflects ALL items (the source of truth that the
    // dashboard, chart and tax page derive from), not the filtered view.
    const totalSold   = items.reduce((s, i) => s + (i.sold || 0), 0);
    const knownItems  = items.filter(i => i.cost != null);
    const totalCost   = knownItems.reduce((s, i) => s + i.cost + (i.fees || 0), 0);
    const totalProfit = knownItems.reduce((s, i) => s + (computeProfit(i) || 0), 0);
    setText('inv-total-sold',      fmt(totalSold));
    setText('inv-total-sold-note', `across ${items.length} ${items.length === 1 ? 'item' : 'items'}`);
    setText('inv-total-cost',      fmt(totalCost));
    setText('inv-total-cost-note', `${knownItems.length} of ${items.length} filled`);
    const profEl = document.getElementById('inv-total-profit');
    if (profEl) {
      profEl.textContent = fmt(totalProfit);
      profEl.classList.remove('text-profit', 'text-loss', 'text-stone-400');
      if (knownItems.length === 0)        profEl.classList.add('text-stone-400');
      else if (totalProfit >= 0)          profEl.classList.add('text-profit');
      else                                profEl.classList.add('text-loss');
    }
  }

  function attachInventoryRowHandlers() {
    document.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = cb.dataset.id;
        const filt = getFilteredItems();
        const idx = filt.findIndex(i => i.id === id);
        if (e.shiftKey && lastClickedIndex >= 0 && lastClickedIndex < filt.length) {
          const start = Math.min(lastClickedIndex, idx);
          const end   = Math.max(lastClickedIndex, idx);
          for (let i = start; i <= end; i++) selectedIds.add(filt[i].id);
        } else {
          if (selectedIds.has(id)) selectedIds.delete(id);
          else selectedIds.add(id);
        }
        lastClickedIndex = idx;
        renderInventory();
      });
    });
    document.querySelectorAll('.cost-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const id = cell.dataset.id;
        const item = items.find(i => i.id === id);
        const prefill = cell.dataset.suggestion ?? (item.cost != null ? String(item.cost) : '');
        enterCostEdit(id, prefill);
      });
    });
  }

  function enterCostEdit(id, prefillValue) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingId = id;
    const cell = document.querySelector(`.cost-cell[data-id="${id}"]`);
    if (!cell) return;
    const startValue = (prefillValue != null && prefillValue !== '') ? prefillValue : (item.cost ?? '');
    cell.classList.remove('empty', 'suggested');
    cell.classList.add('editing');
    cell.innerHTML = `<span class="cur">£</span><input type="number" step="0.01" min="0" value="${startValue}" data-id="${id}">`;
    const input = cell.querySelector('input');
    requestAnimationFrame(() => { input.focus(); input.select(); });

    const moveToOffset = (offset) => {
      const filt = getFilteredItems();
      const i = filt.findIndex(it => it.id === id);
      const next = filt[i + offset];
      if (next) setTimeout(() => enterCostEdit(next.id), 0);
    };
    const save = (then) => {
      if (editingId !== id) return;
      let v = Number(input.value);
      if (input.value === '' || isNaN(v) || v < 0) v = null;
      if (v != null) item.cost = v;
      editingId = null;
      renderInventory();
      refreshDerived();
      if (then === 'next') moveToOffset(+1);
      else if (then === 'prev') moveToOffset(-1);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab')   { e.preventDefault(); save('next'); }
      else if (e.key === 'Escape')                { e.preventDefault(); editingId = null; renderInventory(); }
      else if (e.key === 'ArrowDown')             { e.preventDefault(); save('next'); }
      else if (e.key === 'ArrowUp')               { e.preventDefault(); save('prev'); }
    });
    input.addEventListener('blur', () => { if (editingId === id) save(null); });
  }

  function refreshDerived() {
    const nudge = document.getElementById('import-nudge');
    if (nudge) nudge.classList.toggle('hidden', items.length > 0);
    if (typeof setupDashYearFilter === 'function') setupDashYearFilter();
    if (typeof updateDashboardHeader === 'function') updateDashboardHeader();
    if (earningsChart) buildChart();
    recomputeDashboardCards();
    recomputePlatformMix();
    if (typeof applyYear === 'function') applyYear(currentYear);
  }

  function recomputeDashboardCards() {
    // Dashboard cards mirror the Inventory totals strip exactly:
    //   Turnover = sum of sold for ALL items (matches inventory total sold)
    //   Costs    = sum of cost + fees for items where cost is known
    //   Profit   = sum of per-item computeProfit() for known items (matches inventory total profit)
    // Estimated tax due is computed via the engine using turnover + costs as inputs,
    // so missing-cost items overstate the tax — the warning explains this.
    const dashItems  = getDashItems();
    const allCount   = dashItems.length;
    const known      = dashItems.filter(i => i.cost != null);
    const unknownCount = allCount - known.length;
    const turnover   = dashItems.reduce((s, i) => s + (i.sold || 0), 0);
    const cogs       = known.reduce((s, i) => s + i.cost, 0);
    const fees       = known.reduce((s, i) => s + (i.fees || 0), 0);
    const expenses = cogs + fees;
    const profit   = known.reduce((s, i) => s + (computeProfit(i) || 0), 0);

    let taxEst = 0;
    if (typeof calculateTax === 'function') {
      const r = calculateTax({
        year: currentYear,
        turnover, costs: expenses,
        paye: taxInputs.paye || 0,
        slPlan: taxInputs.slPlan || 'NONE',
        forceAllowance: taxInputs.forceAllowance,
      });
      taxEst = r.totalTax;
    }

    setText('dash-turnover', fmt(turnover));
    setText('dash-expenses', fmt(expenses));
    setText('dash-profit',   fmt(profit));
    setText('dash-tax',      fmt(taxEst));
    // Colour the Trading profit card green when positive, red when negative,
    // neutral grey when no items have a cost filled yet.
    const profEl = document.getElementById('dash-profit');
    if (profEl) {
      profEl.classList.remove('text-profit', 'text-loss', 'text-stone-400');
      if (known.length === 0)   profEl.classList.add('text-stone-400');
      else if (profit >= 0)     profEl.classList.add('text-profit');
      else                      profEl.classList.add('text-loss');
    }

    // Dashboard cost-missing warning
    const warn = document.getElementById('dash-cost-warning');
    if (warn) {
      if (unknownCount > 0) {
        warn.classList.remove('hidden');
        setText('dash-cost-warning-count', String(unknownCount));
      } else {
        warn.classList.add('hidden');
      }
    }

    const needCount = dashItems.filter(needsCost).length;
    setText('dash-sales-count',
      needCount > 0
        ? `${dashItems.length} sales · ${needCount} need cost`
        : `${dashItems.length} sales · all costs filled`
    );

    // Portfolio card → Avg ROI. Portfolio-weighted (total profit ÷ total cost)
    // across items where the user has entered a cost. Items missing a cost are
    // excluded so they don't distort the average.
    const withCost      = dashItems.filter(i => i.cost != null && i.cost > 0);
    const totalCogsOnly = withCost.reduce((s, i) => s + i.cost, 0);
    const totalProfitW  = withCost.reduce((s, i) => s + (computeProfit(i) || 0), 0);
    const avgRoi = totalCogsOnly > 0 ? totalProfitW / totalCogsOnly : null;
    const roiEl  = document.getElementById('dash-avg-roi');
    const noteEl = document.getElementById('dash-avg-roi-note');
    if (roiEl) {
      if (avgRoi == null) {
        roiEl.textContent = '—';
        roiEl.classList.remove('text-profit', 'text-loss');
        roiEl.classList.add('text-stone-400');
      } else {
        roiEl.textContent = Math.round(avgRoi * 100) + '%';
        roiEl.classList.remove('text-stone-400');
        roiEl.classList.toggle('text-profit', avgRoi >= 0);
        roiEl.classList.toggle('text-loss',   avgRoi < 0);
      }
    }
    if (noteEl) {
      if (withCost.length === 0) {
        noteEl.textContent = 'Fill in costs on the Inventory tab';
      } else if (withCost.length < dashItems.length) {
        noteEl.textContent = `Based on ${withCost.length} of ${dashItems.length} items with cost`;
      } else {
        noteEl.textContent = `Based on all ${withCost.length} items`;
      }
    }
  }

  function recomputePlatformMix() {
    const totals = { EBAY: 0, ETSY: 0, DEPOP: 0 };
    for (const item of getDashItems()) totals[item.platform] += item.sold || 0;
    setText('mix-EBAY',  fmtCompact(totals.EBAY));
    setText('mix-ETSY',  fmtCompact(totals.ETSY));
    setText('mix-DEPOP', fmtCompact(totals.DEPOP));
  }

  function setupInventoryEditor() {
    document.querySelectorAll('.inv-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.inv-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        invFilter = pill.dataset.filter;
        invPage = 0;
        selectedIds.clear();
        renderInventory();
      });
    });

    // Month filter — populate dropdown from items' soldAt months, plus handler.
    const monthEl = document.getElementById('inv-month-filter');
    if (monthEl) {
      const months = getAvailableMonths();
      // Preserve "All months" option, then append unique months newest-first
      monthEl.innerHTML = '<option value="">All months</option>' +
        months.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
      monthEl.value = monthFilter;
      monthEl.addEventListener('change', () => {
        monthFilter = monthEl.value || '';
        invPage = 0;
        renderInventory();
      });
    }

    // Search input — real-time filter by title / SKU. Search is a view filter,
    // it does NOT trigger refreshDerived: totals and the chart always reflect
    // the full dataset, not what's currently on screen.
    const searchEl = document.getElementById('inv-search');
    const searchClear = document.getElementById('inv-search-clear');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value || '';
        invPage = 0;
        if (searchClear) searchClear.classList.toggle('hidden', !searchQuery);
        renderInventory();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { searchEl.value = ''; searchQuery = ''; invPage = 0; if (searchClear) searchClear.classList.add('hidden'); renderInventory(); }
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (!searchEl) return;
        searchEl.value = ''; searchQuery = ''; invPage = 0;
        searchClear.classList.add('hidden');
        searchEl.focus();
        renderInventory();
      });
    }

    const marginInput = document.getElementById('margin-input');
    const marginDisplay = document.getElementById('margin-display');
    if (marginInput) {
      const setFill = () => {
        const min = Number(marginInput.min || 0), max = Number(marginInput.max || 100);
        const v = Number(marginInput.value);
        marginInput.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%');
      };
      setFill();
      marginInput.addEventListener('input', () => {
        targetMargin = Number(marginInput.value) / 100;
        if (marginDisplay) marginDisplay.textContent = marginInput.value + '%';
        setFill();
        if (suggestionsActive) renderInventory();
      });
    }

    const toggle = document.getElementById('toggle-suggestions');
    if (toggle) {
      toggle.addEventListener('click', () => {
        suggestionsActive = !suggestionsActive;
        toggle.innerHTML = suggestionsActive
          ? '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Hide suggestions'
          : '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Show suggestions';
        if (window.lucide) lucide.createIcons();
        renderInventory();
      });
    }

    const selectAll = document.getElementById('inv-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const filt = getFilteredItems();
        if (e.target.checked) filt.forEach(i => selectedIds.add(i.id));
        else filt.forEach(i => selectedIds.delete(i.id));
        renderInventory();
      });
    }

    const bulkApply = document.getElementById('bulk-apply');
    const bulkInput = document.getElementById('bulk-input');
    if (bulkApply && bulkInput) {
      const apply = () => {
        let v = Number(bulkInput.value);
        if (bulkInput.value === '' || isNaN(v) || v < 0) return;
        selectedIds.forEach(id => {
          const item = items.find(i => i.id === id);
          if (item) item.cost = v;
        });
        selectedIds.clear();
        bulkInput.value = '';
        renderInventory();
        refreshDerived();
      };
      bulkApply.addEventListener('click', apply);
      bulkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    }

    const bulkClear = document.getElementById('bulk-clear');
    if (bulkClear) {
      bulkClear.addEventListener('click', () => { selectedIds.clear(); renderInventory(); });
    }

    const clearBtn = document.getElementById('inv-clear-costs');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const filled = items.filter(i => i.cost != null).length;
        if (filled === 0) return;
        if (!confirm(`Clear cost prices on all ${filled} items?\n\nThe dashboard chart, tax page and "Estimated tax due" card will all reset until you re-enter costs.`)) return;
        items.forEach(i => { i.cost = null; });
        selectedIds.clear();
        renderInventory();
        refreshDerived();
      });
    }

    const bulkAccept = document.getElementById('bulk-accept-suggestions');
    if (bulkAccept) {
      bulkAccept.addEventListener('click', () => {
        const target = items.filter(needsCost);
        if (target.length === 0) return;
        if (!confirm(`Apply suggested costs at ${Math.round(targetMargin * 100)}% target margin to all ${target.length} items needing cost?\n\nYou can still edit individual values afterwards.`)) return;
        target.forEach(item => {
          const s = suggestedCostFor(item);
          if (s != null) item.cost = Math.round(s * 100) / 100;
        });
        renderInventory();
        refreshDerived();
      });
    }
  }

  // ============================================================= //
  // Chart.js earnings chart
  // ============================================================= //
  let earningsChart = null;
  let chartMetric = 'revenue';
  // Platforms shown on the chart — multi-select. At least one must remain.
  let chartPlatforms = new Set(['EBAY', 'ETSY', 'DEPOP']);
  // Month filter: '' = all months (full tax-year monthly view),
  // 'YYYY-MM' = drill into that month with a daily-resolution series.
  let chartMonth = '';

  function computeMonthlySeries() {
    const dashItems = getDashItems();
    let buckets, labels, getIdx;

    if (chartMonth) {
      // Daily drill-down into a single month
      const [yy, mm] = chartMonth.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      buckets = daysInMonth;
      labels  = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      getIdx  = (d) => {
        if (d.getUTCFullYear() !== yy || d.getUTCMonth() + 1 !== mm) return -1;
        return d.getUTCDate() - 1;
      };
    } else if (dashYear === 'all') {
      // All time: build monthly buckets spanning the full range of imported data
      const keySet = new Set();
      for (const item of dashItems) {
        if (!item.soldAt) continue;
        keySet.add(`${item.soldAt.getUTCFullYear()}-${String(item.soldAt.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const sortedKeys = Array.from(keySet).sort();
      if (!sortedKeys.length) return { labels: [], revenue: [], costs: [], profit: [] };

      // Fill every month between first and last (no gaps in x-axis)
      const monthList = [];
      const [sy, sm] = sortedKeys[0].split('-').map(Number);
      const [ey, em] = sortedKeys[sortedKeys.length - 1].split('-').map(Number);
      let cy = sy, cm = sm;
      while (cy < ey || (cy === ey && cm <= em)) {
        monthList.push({ y: cy, m: cm, key: `${cy}-${String(cm).padStart(2, '0')}` });
        if (++cm > 12) { cm = 1; cy++; }
      }
      buckets = monthList.length;
      labels  = monthList.map(({ y, m }) =>
        new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      );
      getIdx = (d) => {
        const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        return monthList.findIndex(b => b.key === k);
      };
    } else {
      // Specific tax year: 12 months starting Apr of that year
      const yr = Number(dashYear);
      const monthDates = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(yr, 3 + i, 1)));
      buckets = 12;
      labels  = monthDates.map(d => d.toLocaleDateString('en-GB', { month: 'short' }));
      getIdx  = (d) => monthDates.findIndex((m, i) => {
        const next = monthDates[i + 1] ?? new Date(Date.UTC(yr + 1, 3, 6));
        return d >= m && d < next;
      });
    }

    const revenue = new Array(buckets).fill(0);
    const costs   = new Array(buckets).fill(0);
    const profit  = new Array(buckets).fill(0);

    for (const item of dashItems) {
      if (!item.soldAt) continue;
      if (!chartPlatforms.has(item.platform)) continue;
      const idx = getIdx(item.soldAt);
      if (idx < 0) continue;
      // Revenue always plots — even before cost is entered
      revenue[idx] += item.sold || 0;
      // Costs and profit only when cost is known
      const p = computeProfit(item);
      if (p != null) {
        costs[idx]  += (item.cost || 0) + (item.fees || 0);
        profit[idx] += p;
      }
    }
    return { labels, revenue, costs, profit };
  }

  const COLORS = {
    revenue: '#F97316',
    profit:  '#10B981',
    costs:   '#78716C',
  };

  function buildChart(metric) {
    if (metric != null) chartMetric = metric;
    metric = chartMetric;
    const { labels, revenue, costs, profit } = computeMonthlySeries();
    const ctx = document.getElementById('earnings-chart');
    if (!ctx) return;

    const datasets = [];
    if (metric === 'revenue' || metric === 'combined') {
      datasets.push({
        label: 'Revenue', data: revenue,
        borderColor: COLORS.revenue, backgroundColor: 'rgba(249,115,22,0.15)',
        tension: 0.35, fill: metric === 'revenue', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: COLORS.revenue, pointBorderColor: '#FFFFFF', pointBorderWidth: 2,
      });
    }
    if (metric === 'profit' || metric === 'combined') {
      datasets.push({
        label: 'Profit', data: profit,
        borderColor: COLORS.profit, backgroundColor: 'rgba(16,185,129,0.15)',
        tension: 0.35, fill: metric === 'profit', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: COLORS.profit, pointBorderColor: '#FFFFFF', pointBorderWidth: 2,
      });
    }
    if (metric === 'costs' || metric === 'combined') {
      datasets.push({
        label: 'Costs', data: costs,
        borderColor: COLORS.costs, backgroundColor: 'rgba(120,113,108,0.15)',
        tension: 0.35, fill: metric === 'costs', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: COLORS.costs, pointBorderColor: '#FFFFFF', pointBorderWidth: 2,
      });
    }

    if (earningsChart) earningsChart.destroy();
    earningsChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: (() => {
        const dark = document.documentElement.classList.contains('dark');
        // Slate-tinted palette in dark mode so the chart sits cleanly on the
        // #0F172A body and doesn't fight the warm orange data line.
        const gridCol  = dark ? '#1F2A3F' : '#F5F5F4';
        const tickCol  = dark ? '#94A3B8' : '#78716C';
        const labelCol = dark ? '#E2E8F0' : '#44403C';
        const tipBg    = dark ? '#F1F5F9' : '#1C1917';
        const tipFg    = dark ? '#0F172A' : '#FAFAF9';
        const tipBord  = dark ? '#E2E8F0' : '#44403C';
        return {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: metric === 'combined', position: 'bottom', labels: { color: labelCol, boxWidth: 10, boxHeight: 10, padding: 18, font: { family: 'Inter', size: 12 } } },
            tooltip: {
              backgroundColor: tipBg, titleColor: tipFg, bodyColor: tipFg,
              padding: 12, cornerRadius: 8, displayColors: true, borderColor: tipBord, borderWidth: 1,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: £${ctx.parsed.y.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
              }
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: tickCol, font: { family: 'Inter', size: 12 } } },
            y: {
              grid: { color: gridCol, drawBorder: false },
              ticks: { color: tickCol, font: { family: 'JetBrains Mono', size: 11 }, callback: (v) => '£' + v.toLocaleString('en-GB') },
              beginAtZero: true,
            }
          }
        };
      })()
    });

    // Update toggle visual state
    document.querySelectorAll('.chart-toggle').forEach(btn => {
      const active = btn.dataset.metric === metric;
      btn.classList.toggle('bg-white', active);
      btn.classList.toggle('text-stone-900', active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle('text-stone-500', !active);
    });

    // Update stat totals
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    document.getElementById('chart-stat-revenue').textContent = fmt(sum(revenue));
    const profitTotal = sum(profit);
    const profitStat  = document.getElementById('chart-stat-profit');
    profitStat.textContent = fmt(profitTotal);
    // Colour the Total profit stat green when positive, red when negative,
    // neutral grey when there's no data plotted yet.
    profitStat.classList.remove('text-profit', 'text-loss', 'text-stone-400');
    if (sum(revenue) === 0)   profitStat.classList.add('text-stone-400');
    else if (profitTotal >= 0) profitStat.classList.add('text-profit');
    else                       profitStat.classList.add('text-loss');
    document.getElementById('chart-stat-costs').textContent   = fmt(sum(costs));
  }

  document.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => buildChart(btn.dataset.metric));
  });

  // ============================================================= //
  // Chart filters — platform multi-select + month dropdown
  // ============================================================= //
  function updateChartFiltersUI() {
    // Toggle reset button visibility when anything is non-default
    const reset = document.getElementById('chart-filter-reset');
    if (reset) {
      const isDefault = chartPlatforms.size === 3 && !chartMonth;
      reset.classList.toggle('hidden', isDefault);
    }
    // Update subhead under the chart title to reflect the current filter
    const sub = document.querySelector('.card .chart-wrap')?.closest('.card')?.querySelector('p.text-sm.text-stone-500');
    if (sub) {
      const platLabel = chartPlatforms.size === 3
        ? 'all platforms'
        : Array.from(chartPlatforms).map(p => PLATFORMS[p].name).join(' + ');
      const yearLabel = dashYear === 'all'
        ? 'all time'
        : `tax year ${dashYear}/${String(Number(dashYear) + 1).slice(2)}`;
      const monthLabelStr = chartMonth ? monthLabel(chartMonth) : yearLabel;
      const granularity = chartMonth ? 'Daily view' : 'Monthly view';
      sub.textContent = `${granularity} · ${platLabel} · ${monthLabelStr}`;
    }
  }

  function setupChartFilters() {
    // Platform pills — multi-select, but enforce at least one selected.
    const pills = document.querySelectorAll('.chart-platform-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        const plat = pill.dataset.platform;
        if (chartPlatforms.has(plat)) {
          // Block deselecting the last remaining platform
          if (chartPlatforms.size === 1) return;
          chartPlatforms.delete(plat);
        } else {
          chartPlatforms.add(plat);
        }
        const on = chartPlatforms.has(plat);
        pill.classList.toggle('active', on);
        pill.setAttribute('aria-pressed', String(on));
        buildChart();
        updateChartFiltersUI();
      });
    });

    // Month dropdown — populated from items' soldAt months (same source as inventory)
    const monthEl = document.getElementById('chart-month-filter');
    if (monthEl) {
      const months = getAvailableMonths();
      monthEl.innerHTML = '<option value="">All months</option>' +
        months.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
      monthEl.value = chartMonth;
      monthEl.addEventListener('change', () => {
        chartMonth = monthEl.value || '';
        buildChart();
        updateChartFiltersUI();
      });
    }

    // Reset filters
    const reset = document.getElementById('chart-filter-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        chartPlatforms = new Set(['EBAY', 'ETSY', 'DEPOP']);
        chartMonth = '';
        // Reset pill state
        pills.forEach(p => { p.classList.add('active'); p.setAttribute('aria-pressed', 'true'); });
        if (monthEl) monthEl.value = '';
        buildChart();
        updateChartFiltersUI();
      });
    }

    updateChartFiltersUI();
  }

  // ============================================================= //
  // Tax page — dynamic from items + taxInputs (calculateTax engine)
  // ============================================================= //
  function applyYear(year) {
    currentYear = Number(year);
    if (typeof calculateTax !== 'function') return;
    const t = computeTaxYearTotals(currentYear);
    const r = calculateTax({
      year: currentYear,
      turnover: t.turnover,
      costs: t.costs,
      paye: taxInputs.paye || 0,
      slPlan: taxInputs.slPlan || 'NONE',
      forceAllowance: taxInputs.forceAllowance,    // honour user override
    });
    // Top KPI cards on the Tax tab
    setText('tax-turnover', fmt(t.turnover));
    setText('tax-expenses', fmt(r.allowableExpenses));
    setText('tax-profit',   fmt(r.tradingProfit));
    setText('tax-due',      fmt(r.totalTax));
    // SA103S rows on Tax tab
    setText('row-9',  fmt(t.turnover));
    setText('row-20', fmt(r.allowableExpenses));
    setText('row-21', fmt(r.tradingProfit));
    setText('row-31', fmt(r.tradingProfit));
    // Allowance comparison scenarios (numbers + selected/recommended visual state)
    setText('scenario-actual-val',    fmt(r.profitActual));
    setText('scenario-allowance-val', fmt(r.profitAllowance));
    const actualBtn = document.getElementById('scenario-actual');
    const allowBtn  = document.getElementById('scenario-allowance');
    if (actualBtn && allowBtn) {
      const actPill = actualBtn.querySelector('.scenario-pill');
      const allPill = allowBtn.querySelector('.scenario-pill');
      actualBtn.classList.toggle('selected',   !r.useAllowance);
      allowBtn .classList.toggle('selected',    r.useAllowance);
      actualBtn.classList.toggle('recommended', r.recommended === 'actual'    && r.useAllowance !== false);
      allowBtn .classList.toggle('recommended', r.recommended === 'allowance' && r.useAllowance !== true);
      const setPill = (el, kind) => {
        el.className = 'scenario-pill ' + (kind || '');
        el.textContent = kind === 'selected' ? 'Selected' : kind === 'recommended' ? 'Recommended' : '';
      };
      setPill(actPill, !r.useAllowance ? 'selected' : (r.recommended === 'actual'    ? 'recommended' : ''));
      setPill(allPill,  r.useAllowance ? 'selected' : (r.recommended === 'allowance' ? 'recommended' : ''));
    }
    const statusEl = document.getElementById('scenario-status');
    if (statusEl) {
      if (taxInputs.forceAllowance == null) {
        statusEl.textContent = `Auto-picking the cheaper option (${r.recommended === 'allowance' ? '£1,000 allowance' : 'actual expenses'}). Click either card to override.`;
      } else {
        statusEl.innerHTML = `You've manually selected <strong>${r.useAllowance ? 'the £1,000 allowance' : 'actual expenses'}</strong>. <a href="#" id="scenario-reset" class="text-brand-700 underline">Reset to auto</a>`;
      }
    }
    // Sidebar breakdown on Tax tab
    setText('bd-cogs', fmt(t.cogs));
    setText('bd-dsc',  fmt(t.dsc));
    setText('bd-gen',  fmt(t.gen));
    setText('bd-it',   fmt(r.incomeTax));
    setText('bd-c4',   fmt(r.nicC4));
    setText('bd-sl',   fmt(r.studentLoan));
    setText('bd-total',fmt(r.totalTax));
    // Year-button active state
    document.querySelectorAll('.year-btn').forEach(b => {
      const a = Number(b.dataset.year) === currentYear;
      b.classList.toggle('btn-primary', a); b.classList.toggle('btn-outline', !a);
    });
    // Cost-missing warning on Tax tab — count across ALL imported items, not
    // just the current tax year, so it matches the Inventory tab's pill.
    const taxWarn = document.getElementById('tax-cost-warning');
    if (taxWarn) {
      const totalMissingCost = items.filter(needsCost).length;
      if (totalMissingCost > 0) {
        taxWarn.classList.remove('hidden');
        setText('tax-cost-warning-count', String(totalMissingCost));
      } else {
        taxWarn.classList.add('hidden');
      }
    }
    // Also mirror onto the dashboard SA103 preview (if present)
    setText('dash-sa103-9',  fmt(t.turnover));
    setText('dash-sa103-20', fmt(r.allowableExpenses));
    setText('dash-sa103-21', fmt(r.tradingProfit));
    setText('dash-sa103-31', fmt(r.tradingProfit));

    // Accountant pack button — disable when no data, update note
    const packBtn  = document.getElementById('accountant-pack-btn');
    const packNote = document.getElementById('accountant-pack-note');
    if (packBtn) {
      const yearItemCount = getTaxYearItems(year).length;
      const noData = yearItemCount === 0;
      packBtn.disabled = noData;
      packBtn.title    = noData ? 'Import sales data first — no items in this tax year.' : '';
      if (packNote) {
        const missing = items.filter(needsCost).length;
        const yl = yearLabelFor(year);
        packNote.textContent = noData
          ? 'No items in the selected tax year. Import your CSV first.'
          : missing > 0
            ? `${yearItemCount} items in ${yl} · ⚠ ${missing} missing cost price (treated as £0).`
            : `${yearItemCount} items in ${yl} · all cost prices filled.`;
      }
    }
  }
  document.querySelectorAll('.year-btn').forEach(btn => btn.addEventListener('click', () => applyYear(Number(btn.dataset.year))));

  function setupTradingAllowance() {
    const handle = (path) => {
      // path = 'actual' | 'allowance'
      taxInputs.forceAllowance = path === 'allowance';
      persistTaxInputs();
      applyYear(currentYear);
      recomputeDashboardCards();
    };
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => handle(btn.dataset.path));
    });
    // Delegated handler for the "Reset to auto" link (rebuilt inside applyYear).
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('#scenario-reset');
      if (!link) return;
      e.preventDefault();
      taxInputs.forceAllowance = null;
      persistTaxInputs();
      applyYear(currentYear);
      recomputeDashboardCards();
    });
  }

  function setupTabLinks() {
    // Buttons inside warnings / advisories can carry data-tab-link="inventory"
    // and switch the active tab when clicked.
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('[data-tab-link]');
      if (!link) return;
      e.preventDefault();
      switchTab(link.dataset.tabLink);
    });
  }

  // ============================================================= //
  // Light / dark theme toggle
  // ============================================================= //
  const THEME_KEY = 'ledgerloop-theme';
  function isDark() { return document.documentElement.classList.contains('dark'); }
  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    // Repaint the chart so the grid lines, ticks and tooltip suit the new theme.
    if (earningsChart) buildChart();
  }
  function setupTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => applyTheme(isDark() ? 'light' : 'dark'));
  }

  // ============================================================= //
  // Tab switching
  // ============================================================= //
  function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.querySelectorAll('.nav-link[data-tab]').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (tab === 'dashboard' && !earningsChart) buildChart('revenue');
  }
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => link.addEventListener('click', () => switchTab(link.dataset.tab)));

  // ============================================================= //
  // SA103S export — pure CSV builder + branded PDF generator
  // ============================================================= //
  // Pretty plan label for the PDF (and friendlier than the enum slugs).
  function slPlanLabel(plan) {
    return ({
      NONE:     'No student loan',
      PLAN_1:   'Plan 1',
      PLAN_2:   'Plan 2',
      PLAN_4:   'Plan 4 (Scotland)',
      PLAN_5:   'Plan 5',
      POSTGRAD: 'Postgraduate loan',
    })[plan || 'NONE'] || plan;
  }
  function yearLabelFor(year) {
    return `${year}/${String((Number(year) + 1) % 100).padStart(2, '0')}`;
  }
  function gbp(n)  { return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function gbpRaw(n) { return Number(n).toFixed(2); }

  // Pure: SA103S as CSV. Just the four boxes HMRC asks for plus the
  // scenario meta — no AUDIT rows. Kept around (and exposed on LL.) so
  // accountants who'd rather import to Excel can still scrape it, and so
  // the consistency audit can keep cross-checking the export.
  function buildSa103SCsv({ year, turnover, costs, paye, slPlan, tax }) {
    const note   = '"These figures are estimates. LedgerLoop is not a regulated tax advisor. Verify with HMRC or a qualified accountant before submitting."';
    const meta   = [
      `"Tax year","${yearLabelFor(year)}"`,
      `"Expenses path used","${tax.useAllowance ? '£1,000 trading allowance' : 'Actual expenses'}"`,
      `"PAYE income (£)","${gbpRaw(paye || 0)}"`,
      `"Student loan plan","${slPlanLabel(slPlan)}"`,
    ].join('\n');
    const header = '"Form","Box","Label","Value (GBP)","Description"';
    const sa103Rows = [
      ['SA103S', '9',  'Your turnover',              gbpRaw(turnover),              'Total takings within the tax year (sales + shipping charged).'],
      ['SA103S', '20', 'Total allowable expenses',   gbpRaw(tax.allowableExpenses), tax.useAllowance ? 'Flat £1,000 trading allowance.' : 'COGS + platform fees + postage + refunds + general expenses.'],
      ['SA103S', '21', 'Net profit',                 gbpRaw(tax.tradingProfit),     'Turnover − allowable expenses.'],
      ['SA103S', '31', 'Total taxable profits',      gbpRaw(tax.tradingProfit),     'Same as Box 21 for most resellers.'],
    ].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','));
    return [note, meta, '', header, ...sa103Rows].join('\n');
  }

  // Brand colours from the dashboard, expressed as [R,G,B] for jsPDF.
  const PDF_BRAND  = [249, 115, 22];   // brand-500 (orange)
  const PDF_INK    = [28, 25, 23];     // near-black for body
  const PDF_MUTED  = [120, 113, 108];  // stone-500
  const PDF_RULE   = [231, 229, 228];  // stone-200
  const PDF_CREAM  = [255, 251, 245];  // brand-50 wash

  function downloadSa103Pdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Refresh the page and try again.');
      return;
    }
    const year = currentYear;
    const t    = computeTaxYearTotals(year);
    // CRITICAL: pass forceAllowance so the export reflects whichever scenario
    // card the user clicked on the Tax tab. Without this the PDF would always
    // show the auto-recommended option, making the two scenarios identical.
    const r    = calculateTax({
      year,
      turnover: t.turnover, costs: t.costs,
      paye: taxInputs.paye || 0,
      slPlan: taxInputs.slPlan || 'NONE',
      forceAllowance: taxInputs.forceAllowance,
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PAGE_W = 210;
    const MARGIN = 18;
    const yearLbl = yearLabelFor(year);
    const pathLbl = r.useAllowance ? '£1,000 trading allowance' : 'Actual expenses';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const itemsInYear = getTaxYearItems(year);

    // ----------------- Header band -----------------
    doc.setFillColor(...PDF_BRAND);
    doc.rect(0, 0, PAGE_W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('LedgerLoop', MARGIN, 14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('UK Self Assessment summary · SA103S', MARGIN, 21);
    // right-aligned date + year
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Tax year ${yearLbl}`, PAGE_W - MARGIN, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated ${dateStr}`, PAGE_W - MARGIN, 21, { align: 'right' });

    // ----------------- Scenario summary card -----------------
    doc.setTextColor(...PDF_INK);
    const summaryY = 38;
    doc.setFillColor(...PDF_CREAM);
    doc.setDrawColor(254, 215, 170);
    doc.roundedRect(MARGIN, summaryY, PAGE_W - MARGIN * 2, 22, 2, 2, 'FD');
    const cellW = (PAGE_W - MARGIN * 2) / 4;
    const summary = [
      ['TAX YEAR',       yearLbl],
      ['EXPENSES PATH',  pathLbl],
      ['PAYE INCOME',    gbp(taxInputs.paye || 0)],
      ['STUDENT LOAN',   slPlanLabel(taxInputs.slPlan)],
    ];
    summary.forEach(([label, value], i) => {
      const x = MARGIN + cellW * i + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_MUTED);
      doc.text(label, x, summaryY + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...PDF_INK);
      doc.text(String(value), x, summaryY + 15);
    });

    // ----------------- SA103S box table (the actual deliverable) -----------------
    const boxesTitleY = summaryY + 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...PDF_INK);
    doc.text('Figures to enter on your SA103S form', MARGIN, boxesTitleY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_MUTED);
    doc.text('These four numbers map directly to the boxes on the HMRC Self-Employment (short) supplementary page.', MARGIN, boxesTitleY + 5);

    doc.autoTable({
      startY: boxesTitleY + 9,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Box', 'Label', 'Value (GBP)']],
      body: [
        ['9',  'Your turnover',             gbp(t.turnover)],
        ['20', 'Total allowable expenses',  gbp(r.allowableExpenses)],
        ['21', 'Net profit',                gbp(r.tradingProfit)],
        ['31', 'Total taxable profits',     gbp(r.tradingProfit)],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: PDF_INK,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
      },
      bodyStyles: { fontSize: 11, textColor: PDF_INK, cellPadding: 4 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 48, fontStyle: 'bold', font: 'courier' },
      },
      styles: { lineColor: PDF_RULE, lineWidth: 0.2 },
    });

    // ----------------- Tax-bill breakdown -----------------
    const breakdownTitleY = doc.lastAutoTable.finalY + 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...PDF_INK);
    doc.text('Your estimated tax bill', MARGIN, breakdownTitleY);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_MUTED);
    doc.text('For your records only — these are NOT entered on the SA103 form.', MARGIN, breakdownTitleY + 5);
    doc.text('HMRC will calculate them from the four figures above.', MARGIN, breakdownTitleY + 9);

    doc.autoTable({
      startY: breakdownTitleY + 13,
      margin: { left: MARGIN, right: MARGIN },
      body: [
        ['Income tax on trading profit (marginal rate)', gbp(r.incomeTax)],
        ['Class 4 National Insurance',                   gbp(r.nicC4)],
        ['Student loan repayment',                       gbp(r.studentLoan)],
        [{ content: 'Total estimated tax due',           styles: { fontStyle: 'bold', fontSize: 11 } },
         { content: gbp(r.totalTax),                     styles: { fontStyle: 'bold', fontSize: 11, halign: 'right', font: 'courier' } }],
      ],
      theme: 'plain',
      bodyStyles: { fontSize: 10, textColor: PDF_INK, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 50, font: 'courier' },
      },
      didDrawCell: (data) => {
        // Underline row above the total
        if (data.section === 'body' && data.row.index === 2 && data.column.index === 0) {
          const { cell } = data;
          doc.setDrawColor(...PDF_RULE);
          doc.setLineWidth(0.3);
          doc.line(cell.x, cell.y + cell.height, cell.x + (PAGE_W - MARGIN * 2), cell.y + cell.height);
        }
      },
    });

    // ----------------- Data sources / provenance -----------------
    const provY = doc.lastAutoTable.finalY + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_INK);
    doc.text('Worked from your inventory', MARGIN, provY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_MUTED);
    const fromDate = `6 Apr ${year}`;
    const toDate   = `5 Apr ${Number(year) + 1}`;
    doc.text(`${itemsInYear.length} sale${itemsInYear.length === 1 ? '' : 's'} between ${fromDate} and ${toDate}, across eBay, Etsy and Depop.`, MARGIN, provY + 5);
    doc.text(`Adjusted personal allowance applied: ${gbp(r.adjustedPA)}.`, MARGIN, provY + 10);

    // ----------------- Disclaimer footer -----------------
    const footerY = 275;
    doc.setFillColor(...PDF_CREAM);
    doc.rect(0, footerY, PAGE_W, 22, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED);
    doc.setFont('helvetica', 'italic');
    doc.text('These figures are estimates generated from your inventory data. LedgerLoop is not a regulated tax advisor.', MARGIN, footerY + 8);
    doc.text('Verify with HMRC or a qualified accountant before submitting your Self Assessment return.', MARGIN, footerY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text('Sources: gov.uk SA103S notes · gov.uk/income-tax-rates · gov.uk/self-employed-national-insurance-rates', MARGIN, footerY + 18);

    const pathSlug = r.useAllowance ? 'allowance' : 'actual';
    doc.save(`LedgerLoop-SA103S-${year}-${(Number(year) + 1) % 100}-${pathSlug}.pdf`);
  }

  // Back-compat alias (anything still calling downloadSa103 stays working).
  function downloadSa103() { return downloadSa103Pdf(); }

  // ============================================================= //
  // Accountant Export Pack — multi-sheet .xlsx workbook
  // ============================================================= //
  function downloadAccountantPack() {
    if (typeof XLSX === 'undefined') {
      alert('Spreadsheet library failed to load. Refresh the page and try again.');
      return;
    }
    if (!items.length) {
      alert('Import your sales data first — there are no items to export.');
      return;
    }

    const year  = currentYear;
    const t     = computeTaxYearTotals(year);
    const r     = calculateTax({
      year,
      turnover: t.turnover, costs: t.costs,
      paye:     taxInputs.paye    || 0,
      slPlan:   taxInputs.slPlan  || 'NONE',
      forceAllowance: taxInputs.forceAllowance,
    });

    const yearLbl   = yearLabelFor(year);
    const taxStart  = `6 April ${year}`;
    const taxEnd    = `5 April ${year + 1}`;
    const pathLbl   = r.useAllowance ? '£1,000 trading allowance' : 'Actual expenses';
    const dateStr   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const itemsInYear = getTaxYearItems(year);
    const missingCost = itemsInYear.filter(needsCost).length;

    const wb = XLSX.utils.book_new();

    // ---- helpers ----
    const money = n => Number(Number(n).toFixed(2));
    const pct   = n => Number((n * 100).toFixed(1));

    // ================================================================
    // Sheet 1 — SA103S Summary
    // ================================================================
    const s1 = [];

    if (missingCost > 0) {
      s1.push(['⚠ WARNING', `${missingCost} of ${items.length} items have no cost price and are treated as £0. Profit figures are overstated until costs are filled in on the Inventory tab.`]);
      s1.push([]);
    }

    s1.push(['LedgerLoop — Accountant Export Pack']);
    s1.push(['Generated', dateStr]);
    s1.push(['Tax year', yearLbl, `${taxStart} – ${taxEnd}`]);
    s1.push(['Jurisdiction', 'United Kingdom (HMRC Self Assessment)']);
    s1.push(['Form', 'SA103S — Self-employment (short)']);
    s1.push(['Expenses path', pathLbl]);
    s1.push(['PAYE income', money(taxInputs.paye || 0)]);
    s1.push(['Student loan plan', slPlanLabel(taxInputs.slPlan || 'NONE')]);
    s1.push([]);
    s1.push(['── SA103S FORM BOXES ──']);
    s1.push(['Box', 'Label', 'Value (£)', 'Notes']);
    s1.push(['9',  'Your turnover',            money(t.turnover),           'Total sales + buyer-paid shipping for the tax year.']);
    s1.push(['20', 'Total allowable expenses', money(r.allowableExpenses),  r.useAllowance ? 'Flat £1,000 trading allowance used.' : 'COGS + platform fees (actual expenses path).']);
    s1.push(['21', 'Net profit',               money(r.tradingProfit),      'Box 9 minus Box 20.']);
    s1.push(['31', 'Total taxable profits',    money(r.tradingProfit),      'Same as Box 21 for most resellers.']);
    s1.push([]);
    s1.push(['── TAX BILL ESTIMATE (for your records — not entered on SA103S) ──']);
    s1.push(['Item', 'Amount (£)']);
    s1.push(['Income tax on trading profit',  money(r.incomeTax)]);
    s1.push(['Class 4 National Insurance',    money(r.nicC4)]);
    s1.push(['Student loan repayment',        money(r.studentLoan)]);
    s1.push(['Total estimated tax due',       money(r.totalTax)]);
    s1.push(['Estimated take-home (profit after tax)', money(r.takehome)]);

    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [{ wch: 36 }, { wch: 42 }, { wch: 16 }, { wch: 58 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'SA103S Summary');

    // ================================================================
    // Sheet 2 — Platform Breakdown
    // ================================================================
    const platformTotals = {};
    for (const item of itemsInYear) {
      const p = item.platform;
      if (!platformTotals[p]) platformTotals[p] = { count: 0, revenue: 0, fees: 0, cogs: 0, cogsItems: 0, missingCost: 0 };
      const pt = platformTotals[p];
      pt.count++;
      pt.revenue += item.sold || 0;
      pt.fees    += item.fees || 0;
      if (item.cost != null) { pt.cogs += item.cost; pt.cogsItems++; }
      else pt.missingCost++;
    }

    const s2 = [['Platform', 'Items in year', 'Gross revenue (£)', 'Platform fees (£)', 'Cost of goods (£)', 'Items with cost', 'Items missing cost', 'Net profit (£)', 'Notes']];
    const platformOrder = ['EBAY', 'ETSY', 'DEPOP'];
    let totalRev = 0, totalFees = 0, totalCogs = 0, totalCount = 0, totalMissing = 0;
    for (const pid of platformOrder) {
      const pt = platformTotals[pid];
      if (!pt) continue;
      const netProfit = pt.revenue - pt.fees - pt.cogs;
      const note = pt.missingCost > 0 ? `${pt.missingCost} items assumed £0 cost — profit understated` : 'All costs filled';
      s2.push([PLATFORMS[pid].name, pt.count, money(pt.revenue), money(pt.fees), money(pt.cogs), pt.cogsItems, pt.missingCost, money(netProfit), note]);
      totalRev     += pt.revenue;
      totalFees    += pt.fees;
      totalCogs    += pt.cogs;
      totalCount   += pt.count;
      totalMissing += pt.missingCost;
    }
    s2.push(['TOTAL', totalCount, money(totalRev), money(totalFees), money(totalCogs), totalCount - totalMissing, totalMissing, money(totalRev - totalFees - totalCogs), '']);

    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Platform Breakdown');

    // ================================================================
    // Sheet 3 — Item Detail
    // ================================================================
    const s3 = [['Title', 'SKU', 'Platform', 'Sale date', 'Gross sale (£)', 'Platform fees (£)', 'Cost price (£)', 'Net profit (£)', 'ROI (%)', 'Cost missing?']];
    for (const item of itemsInYear) {
      const profit = computeProfit(item);
      const roi    = computeRoi(item);
      const dateStr2 = item.soldAt ? item.soldAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      s3.push([
        item.title || '',
        item.sku   || '',
        PLATFORMS[item.platform]?.name || item.platform,
        dateStr2,
        money(item.sold || 0),
        money(item.fees || 0),
        item.cost != null ? money(item.cost) : '',
        profit != null    ? money(profit)    : '',
        roi    != null    ? pct(roi)         : '',
        item.cost == null ? 'Yes' : 'No',
      ]);
    }

    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!cols'] = [{ wch: 44 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Item Detail');

    // ================================================================
    // Sheet 4 — Assumptions & Disclaimers
    // ================================================================
    const s4 = [
      ['LedgerLoop — Assumptions & Disclaimers'],
      [],
      ['EXPORT METADATA'],
      ['Generated by',    'LedgerLoop (ledgerloop.app)'],
      ['Generated on',    dateStr],
      ['Tax year',        yearLbl],
      ['Items exported',  itemsInYear.length],
      ['Items with cost', itemsInYear.filter(i => i.cost != null).length],
      ['Items missing cost', itemsInYear.filter(needsCost).length],
      [],
      ['TAX YEAR SCOPE'],
      ['Start date',  taxStart],
      ['End date',    taxEnd],
      ['Definition',  'UK tax year: 6 April to 5 April the following year (Income Tax Act 2007 s. 4).'],
      [],
      ['EXPENSES PATH'],
      ['Path used',   pathLbl],
      ['Rationale',   r.useAllowance
        ? 'The £1,000 trading allowance (ITTOIA 2005 s. 783A) was used because it produces a lower taxable profit than actual expenses for this year.'
        : 'Actual expenses (COGS + platform fees) were used because they exceed the £1,000 trading allowance for this year.'],
      ['Note',        'If the user has manually overridden the recommended path, their choice is reflected above.'],
      [],
      ['REVENUE DEFINITION'],
      ['eBay',    'Gross transaction amount (item price + buyer-paid shipping), per eBay Transaction Report.'],
      ['Depop',   '"Total" column (item price + buyer shipping cost), per Depop sales export.'],
      ['Etsy',    '"Item total" column, per Etsy Orders CSV.'],
      [],
      ['EXPENSES DEFINITION (actual expenses path)'],
      ['Cost of goods',   'Purchase cost entered by the user per item in the Inventory tab.'],
      ['Platform fees',   'eBay: Final Value Fee (fixed + variable). Depop: Depop fee + Depop Payments fee + Boosting fee. Etsy: listing + transaction + processing fees.'],
      ['Not included',    'Home office costs, mileage, phone/internet, packaging — user must add these separately if claiming actual expenses.'],
      [],
      ['PAYE & STUDENT LOAN'],
      ['PAYE income used',         gbp(taxInputs.paye || 0)],
      ['Student loan plan',        slPlanLabel(taxInputs.slPlan || 'NONE')],
      ['Note',                     'PAYE figures are self-reported by the user and not verified. The tax estimate is marginal — it shows only the additional tax attributable to self-employment profit.'],
      [],
      ['JURISDICTION'],
      ['Country',     'United Kingdom'],
      ['Tax authority', 'HM Revenue & Customs (HMRC)'],
      ['Relevant form', 'SA103S — Short Self-Employment supplementary pages'],
      ['Applicable if', 'Annual turnover below £85,000 and business activity qualifies as trading.'],
      [],
      ['DISCLAIMERS'],
      ['1.', 'LedgerLoop is not a regulated tax adviser, accountant, or financial adviser.'],
      ['2.', 'Figures are estimates based on user-entered data and publicly available HMRC rates. They have not been reviewed or verified by HMRC.'],
      ['3.', 'This export is provided for informational purposes only and does not constitute tax advice.'],
      ['4.', 'You should verify all figures with a qualified accountant or directly with HMRC before submitting your Self Assessment return.'],
      ['5.', 'Tax rates and thresholds change each year. Confirm current rates at gov.uk before filing.'],
    ];

    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!cols'] = [{ wch: 24 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Assumptions & Notes');

    // ---- write and trigger download ----
    const yr2 = String((Number(year) + 1) % 100).padStart(2, '0');
    XLSX.writeFile(wb, `LedgerLoop_AccountantPack_${year}-${yr2}.xlsx`);
  }

  // ============================================================= //
  // Free UK tax calculator
  // ============================================================= //
  const CALC_RATES = {
    2024: {
      personalAllowance: 12570, paTaperStart: 100000,
      bands: [
        { threshold: 12570,  rate: 0.20 },
        { threshold: 50270,  rate: 0.40 },
        { threshold: 125140, rate: 0.45 },
      ],
      class4: { lower: 12570, upper: 50270, mainRate: 0.06, upperRate: 0.02 },
      tradingAllowance: 1000,
      studentLoans: {
        PLAN_1:   { threshold: 24990, rate: 0.09 },
        PLAN_2:   { threshold: 27295, rate: 0.09 },
        PLAN_4:   { threshold: 31395, rate: 0.09 },
        PLAN_5:   { threshold: 25000, rate: 0.09 },
        POSTGRAD: { threshold: 21000, rate: 0.06 },
      },
    },
    2025: {
      personalAllowance: 12570, paTaperStart: 100000,
      bands: [
        { threshold: 12570,  rate: 0.20 },
        { threshold: 50270,  rate: 0.40 },
        { threshold: 125140, rate: 0.45 },
      ],
      class4: { lower: 12570, upper: 50270, mainRate: 0.06, upperRate: 0.02 },
      tradingAllowance: 1000,
      studentLoans: {
        PLAN_1:   { threshold: 26065, rate: 0.09 },
        PLAN_2:   { threshold: 28470, rate: 0.09 },
        PLAN_4:   { threshold: 32745, rate: 0.09 },
        PLAN_5:   { threshold: 25000, rate: 0.09 },
        POSTGRAD: { threshold: 21000, rate: 0.06 },
      },
    },
  };

  function applyBandsTax(income, adjustedPA, bands) {
    if (income <= adjustedPA) return 0;
    const eff = bands.map((b, i) => i === 0 ? { ...b, threshold: adjustedPA } : b);
    let tax = 0;
    for (let i = 0; i < eff.length; i++) {
      const band = eff[i];
      const nextT = i + 1 < eff.length ? eff[i + 1].threshold : null;
      if (income <= band.threshold) break;
      const upper = nextT === null ? income : Math.min(income, nextT);
      const taxable = upper - band.threshold;
      if (taxable > 0) tax += taxable * band.rate;
    }
    return tax;
  }

  function class4(profit, c4) {
    if (profit <= c4.lower) return 0;
    const main = Math.min(profit, c4.upper) - c4.lower;
    const upper = Math.max(0, profit - c4.upper);
    return main * c4.mainRate + upper * c4.upperRate;
  }

  function calculateTax({ year, turnover, costs, paye, slPlan, forceAllowance = null }) {
    const r = CALC_RATES[year];
    const profitActual = turnover - costs;
    const profitAllowance = Math.max(0, turnover - r.tradingAllowance);
    const recommended = profitAllowance < profitActual ? 'allowance' : 'actual';
    // Honour the user's manual override if they clicked a scenario card;
    // otherwise fall back to the cheaper of the two.
    const useAllowance = forceAllowance === true ? true
                        : forceAllowance === false ? false
                        : (recommended === 'allowance');
    const tradingProfit = Math.max(0, useAllowance ? profitAllowance : profitActual);
    const allowableExpenses = useAllowance ? r.tradingAllowance : costs;

    const total = tradingProfit + paye;
    const adjustedPA = total <= r.paTaperStart
      ? r.personalAllowance
      : Math.max(0, r.personalAllowance - (total - r.paTaperStart) / 2);

    const taxOnBase = applyBandsTax(paye, adjustedPA, r.bands);
    const taxOnTotal = applyBandsTax(total, adjustedPA, r.bands);
    const incomeTax = Math.max(0, taxOnTotal - taxOnBase);
    const nicC4 = class4(tradingProfit, r.class4);

    let studentLoan = 0;
    if (slPlan !== 'NONE' && r.studentLoans[slPlan]) {
      const sl = r.studentLoans[slPlan];
      const slBase = paye > sl.threshold ? (paye - sl.threshold) * sl.rate : 0;
      const slTotal = total > sl.threshold ? (total - sl.threshold) * sl.rate : 0;
      studentLoan = Math.max(0, slTotal - slBase);
    }

    const totalTax = incomeTax + nicC4 + studentLoan;
    const takehome = Math.max(0, tradingProfit - totalTax);
    return { profitActual, profitAllowance, useAllowance, recommended, tradingProfit, allowableExpenses,
             adjustedPA, incomeTax, nicC4, studentLoan, totalTax, takehome };
  }

  function fmtPounds(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  // Calculator state
  let calcState = {
    year: 2024,
    turnover: 18500,
    costs: 9900,
    paye: 32000,
    slPlan: 'PLAN_2',
  };

  function syncCalcUI() {
    // Slider fill colour
    const setFill = (sliderId, max) => {
      const el = document.getElementById(sliderId);
      if (el) el.style.setProperty('--fill', Math.min(100, (Number(el.value) / Number(el.max)) * 100) + '%');
    };
    setFill('calc-turnover');
    setFill('calc-costs');
    setFill('calc-paye');
  }

  function renderCalc() {
    const r = calculateTax(calcState);

    document.getElementById('calc-total').textContent = fmtPounds(r.totalTax);
    document.getElementById('calc-trading-profit').textContent = fmtPounds(r.tradingProfit);
    document.getElementById('calc-profit-total').textContent = fmtPounds(r.tradingProfit);

    document.getElementById('calc-row-turnover').textContent = fmtPounds(calcState.turnover);
    document.getElementById('calc-row-expenses').textContent = fmtPounds(r.allowableExpenses);
    document.getElementById('calc-row-profit').textContent   = fmtPounds(r.tradingProfit);
    document.getElementById('calc-row-tax').textContent      = fmtPounds(r.incomeTax);
    document.getElementById('calc-row-c4').textContent       = fmtPounds(r.nicC4);
    document.getElementById('calc-row-sl').textContent       = fmtPounds(r.studentLoan);
    document.getElementById('calc-row-takehome').textContent = fmtPounds(r.takehome);

    document.getElementById('calc-key-takehome').textContent = fmtPounds(r.takehome);
    document.getElementById('calc-key-tax').textContent      = fmtPounds(r.incomeTax);
    document.getElementById('calc-key-c4').textContent       = fmtPounds(r.nicC4);
    document.getElementById('calc-key-sl').textContent       = fmtPounds(r.studentLoan);

    // Path badge
    const badge = document.getElementById('calc-path-badge');
    badge.textContent = r.useAllowance ? '£1,000 allowance' : 'Actual expenses';

    // Stacked breakdown bar — flex weights proportional to each segment
    const total = Math.max(r.tradingProfit, 1);
    const segs = document.querySelectorAll('#calc-breakdown .calc-segment');
    segs[0].style.flex = (r.takehome / total) * 100;
    segs[1].style.flex = (r.incomeTax / total) * 100;
    segs[2].style.flex = (r.nicC4 / total) * 100;
    segs[3].style.flex = (r.studentLoan / total) * 100;

    // Allowance tip
    const tip = document.getElementById('calc-allowance-tip');
    const tipText = document.getElementById('calc-allowance-tip-text');
    if (calcState.turnover > 1000 && calcState.turnover <= 1000 + calcState.costs && r.useAllowance) {
      tip.classList.remove('hidden');
      tipText.innerHTML = `We're applying the <strong>£1,000 trading allowance</strong> because it gives a lower tax bill than claiming your £${Math.round(calcState.costs).toLocaleString('en-GB')} of actual expenses.`;
    } else if (calcState.turnover <= 1000) {
      tip.classList.remove('hidden');
      tipText.innerHTML = `Under £1,000 turnover — you may not need to file Self Assessment at all for this income. Verify with HMRC.`;
    } else if (calcState.turnover >= 90000) {
      tip.classList.remove('hidden');
      tipText.innerHTML = `You're at or over the <strong>£90,000 VAT registration threshold</strong>. You'll need to register for VAT with HMRC and likely file SA103F (full) instead of SA103S.`;
    } else {
      tip.classList.add('hidden');
    }

    syncCalcUI();
  }

  function setupCalc() {
    if (!document.getElementById('calc-total')) return; // calculator section not present

    const bindSlider = (sliderId, inputId, key, max) => {
      const slider = document.getElementById(sliderId);
      const input  = document.getElementById(inputId);
      if (!slider || !input) return;
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        calcState[key] = v;
        input.value = v;
        renderCalc();
      });
      input.addEventListener('input', () => {
        let v = Number(input.value);
        if (isNaN(v)) v = 0;
        if (v < 0) v = 0;
        calcState[key] = v;
        if (v <= Number(slider.max)) slider.value = v;
        else slider.value = slider.max;
        renderCalc();
      });
    };
    bindSlider('calc-turnover', 'calc-turnover-input', 'turnover');
    bindSlider('calc-costs',    'calc-costs-input',    'costs');
    bindSlider('calc-paye',     'calc-paye-input',     'paye');

    document.getElementById('calc-sl').addEventListener('change', (e) => {
      calcState.slPlan = e.target.value;
      renderCalc();
    });
    document.querySelectorAll('.calc-year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calc-year-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        calcState.year = Number(btn.dataset.year);
        renderCalc();
      });
    });

    renderCalc();
  }

  // ============================================================= //
  // Auth + routing (multi-page: landing.html / dashboard.html)
  // ============================================================= //
  const AUTH_KEY = 'ledgerloop-authed';
  function isAuthed() { return localStorage.getItem(AUTH_KEY) === '1'; }
  function signIn(user) {
    localStorage.setItem(AUTH_KEY, '1');
    localStorage.setItem('ledgerloop-user', user);
    window.location.href = 'dashboard.html';
  }
  function signOut() {
    localStorage.removeItem(AUTH_KEY); localStorage.removeItem('ledgerloop-user');
    window.location.href = 'landing.html';
  }
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name)?.classList.add('active');
    document.title = name === 'app' ? 'LedgerLoop — app' : name === 'login' ? 'LedgerLoop — sign in' : 'LedgerLoop — UK reseller tax & inventory';
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (window.lucide) lucide.createIcons();
    if (name === 'app') {
      setTimeout(() => { if (!earningsChart) buildChart('revenue'); }, 50);
    }
  }
  function route() {
    const onDashboard = !!document.getElementById('view-app');
    const onLanding   = !!document.getElementById('view-landing');
    if (onDashboard) {
      if (!isAuthed()) { window.location.href = 'landing.html#/login'; return; }
      const whoEl = document.getElementById('who');
      if (whoEl) whoEl.textContent = localStorage.getItem('ledgerloop-user') || 'test';
      showView('app');
      return;
    }
    if (onLanding) {
      const hash = location.hash || '#/';
      if (hash.startsWith('#/login')) {
        if (isAuthed()) { window.location.href = 'dashboard.html'; return; }
        showView('login');
      } else {
        showView('landing');
      }
    }
  }
  // Login form only exists on landing.html — guard the listener.
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = document.getElementById('login-user').value.trim();
      const pass = document.getElementById('login-pass').value;
      const errEl = document.getElementById('login-error');
      if (user === 'test' && pass === 'test') { errEl.classList.add('hidden'); signIn(user); }
      else { errEl.textContent = 'Incorrect credentials. Use test / test for the demo.'; errEl.classList.remove('hidden'); }
    });
  }

  // ============================================================= //
  // Reveal animations (no-op on dashboard since no .reveal elements there)
  // ============================================================= //
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // ============================================================= //
  // Init — every setup function is guarded internally, so calling them
  // on the wrong page is a safe no-op.
  // ============================================================= //
  // ============================================================= //
  // Cross-site consistency audit. Open the browser console and run
  // `LL.audit()` — it walks the tax engine through every code path and
  // every UI sink (dashboard cards, tax-tab cards, SA103 mirror, sidebar
  // breakdown, downloaded CSV) and prints PASS/FAIL for each invariant.
  //
  // Why this exists: the SA103 CSV download had a real bug where it
  // ignored the user's scenario-card choice (allowance vs actual). The
  // audit makes sure that bug class can't come back unnoticed.
  // ============================================================= //
  function runConsistencyAudit() {
    const tol = 0.01;
    const checks = [];
    const log = (name, pass, detail = '') => checks.push({ name, pass, detail });
    const approx = (a, b) => Math.abs(Number(a) - Number(b)) < tol;
    const moneyOf = (txt) => Number(String(txt).replace(/[£,\s]/g, '')) || 0;
    const readMoney = (id) => moneyOf(document.getElementById(id)?.textContent || '0');

    // Drive both years through every flag combination so we lock in the
    // override behaviour as well as the auto-pick.
    const years    = [2024, 2025];
    const paths    = [null, true, false];   // null = auto, true = force allowance, false = force actual
    const payeVals = [0, 32000, 60000];     // tests basic-rate, mid-band, higher-band marginal

    for (const year of years) {
      const t = computeTaxYearTotals(year);
      for (const force of paths) {
        for (const paye of payeVals) {
          const r = calculateTax({
            year, turnover: t.turnover, costs: t.costs,
            paye, slPlan: 'PLAN_2', forceAllowance: force,
          });
          const tag = `y=${year} force=${force} paye=${paye}`;

          // Invariant 1: forceAllowance=true → expenses are exactly £1,000.
          if (force === true) {
            log(`${tag}: allowance path → expenses = £1000`,
              approx(r.allowableExpenses, 1000),
              `got £${r.allowableExpenses}`);
          }
          // Invariant 2: forceAllowance=false → expenses match the cost feed.
          if (force === false) {
            log(`${tag}: actual path → expenses = costs (${t.costs.toFixed(2)})`,
              approx(r.allowableExpenses, t.costs),
              `got £${r.allowableExpenses}`);
          }
          // Invariant 3: Trading profit equals turnover − allowableExpenses (clamped at 0).
          const expectedProfit = Math.max(0, t.turnover - r.allowableExpenses);
          log(`${tag}: tradingProfit = max(0, turnover − expenses)`,
            approx(r.tradingProfit, expectedProfit),
            `got £${r.tradingProfit}, expected £${expectedProfit}`);
          // Invariant 4: Total tax is the sum of its three components.
          log(`${tag}: totalTax = incomeTax + Class4 + studentLoan`,
            approx(r.totalTax, r.incomeTax + r.nicC4 + r.studentLoan),
            `got £${r.totalTax}, components sum to £${r.incomeTax + r.nicC4 + r.studentLoan}`);
        }

        // Invariant 5: auto-pick is the cheaper of the two manual paths.
        const auto      = calculateTax({ year, turnover: t.turnover, costs: t.costs, paye: 32000, slPlan: 'PLAN_2', forceAllowance: null });
        const allowance = calculateTax({ year, turnover: t.turnover, costs: t.costs, paye: 32000, slPlan: 'PLAN_2', forceAllowance: true });
        const actual    = calculateTax({ year, turnover: t.turnover, costs: t.costs, paye: 32000, slPlan: 'PLAN_2', forceAllowance: false });
        log(`y=${year}: auto-pick = cheaper(allowance, actual)`,
          approx(auto.totalTax, Math.min(allowance.totalTax, actual.totalTax)),
          `auto £${auto.totalTax}, allowance £${allowance.totalTax}, actual £${actual.totalTax}`);

        // Invariant 6: the cheaper-path rule.
        //   - costs > £1,000 → actual deduction > allowance → actual gives lower profit → lower tax
        //   - costs < £1,000 → allowance deducts more than actual → allowance gives lower tax
        if (t.costs > 1000 + tol) {
          log(`y=${year}: costs > £1000 → actual tax ≤ allowance tax`,
            actual.totalTax <= allowance.totalTax + tol,
            `actual £${actual.totalTax.toFixed(2)} vs allowance £${allowance.totalTax.toFixed(2)}`);
        } else if (t.costs < 1000 - tol && t.turnover > 1000) {
          log(`y=${year}: costs < £1000 → allowance tax ≤ actual tax`,
            allowance.totalTax <= actual.totalTax + tol,
            `allowance £${allowance.totalTax.toFixed(2)} vs actual £${actual.totalTax.toFixed(2)}`);
        }
      }
    }

    // Invariant 7: CSV reflects the scenario. Build the CSV twice (once per
    // path) and confirm the £1,000 line shows up only on the allowance one,
    // and the true cost shows up only on the actual one.
    const tNow = computeTaxYearTotals(currentYear);
    const rAllow  = calculateTax({ year: currentYear, turnover: tNow.turnover, costs: tNow.costs, paye: taxInputs.paye || 0, slPlan: taxInputs.slPlan || 'NONE', forceAllowance: true });
    const rActual = calculateTax({ year: currentYear, turnover: tNow.turnover, costs: tNow.costs, paye: taxInputs.paye || 0, slPlan: taxInputs.slPlan || 'NONE', forceAllowance: false });
    const csvAllow  = buildSa103SCsv({ year: currentYear, turnover: tNow.turnover, costs: tNow.costs, paye: taxInputs.paye || 0, slPlan: taxInputs.slPlan || 'NONE', tax: rAllow });
    const csvActual = buildSa103SCsv({ year: currentYear, turnover: tNow.turnover, costs: tNow.costs, paye: taxInputs.paye || 0, slPlan: taxInputs.slPlan || 'NONE', tax: rActual });
    log('CSV (allowance path) labels itself "£1,000 trading allowance"', csvAllow.includes('1,000 trading allowance'));
    log('CSV (actual   path) labels itself "Actual expenses"',           csvActual.includes('Actual expenses'));
    log('CSV (allowance path) Box 20 = 1000.00',                         csvAllow.includes('"1000.00"'));
    log('CSV (actual   path) Box 20 = ' + tNow.costs.toFixed(2),         csvActual.includes(`"${tNow.costs.toFixed(2)}"`));
    log('CSVs differ between scenarios',                                  csvAllow !== csvActual);

    // ---------- Inventory is the source of truth — audit every consumer ----------
    // Build canonical aggregates in three scopes, matching how each UI section
    // is actually defined. Using a single all-items total was correct before
    // tax-year and dash-year filters were added; now each section needs its own.

    // Scope A — ALL items. The Inventory totals strip is explicitly all-time
    // (see comment in updateInventoryHeader). Cost warnings also use all items.
    const known          = items.filter(i => i.cost != null);
    const unknown        = items.filter(i => i.cost == null);
    const invTotalSold   = items.reduce((s, i) => s + (i.sold || 0), 0);
    const invTotalCogs   = known.reduce((s, i) => s + i.cost, 0);
    const invTotalFees   = known.reduce((s, i) => s + (i.fees || 0), 0);
    const invTotalCosts  = invTotalCogs + invTotalFees;
    const invTotalProfit = known.reduce((s, i) => s + (computeProfit(i) || 0), 0);

    // Scope B — Dashboard-filtered items (getDashItems, respects dashYear).
    // KPI cards (dash-turnover / dash-expenses / dash-profit), platform mix,
    // Avg ROI, and the chart all use this scope.
    const dashAuditItems  = getDashItems();
    const dashAuditKnown  = dashAuditItems.filter(i => i.cost != null);
    const dashTotalSold   = dashAuditItems.reduce((s, i) => s + (i.sold || 0), 0);
    const dashTotalCogs   = dashAuditKnown.reduce((s, i) => s + i.cost, 0);
    const dashTotalFees   = dashAuditKnown.reduce((s, i) => s + (i.fees || 0), 0);
    const dashTotalCosts  = dashTotalCogs + dashTotalFees;
    const dashTotalProfit = dashAuditKnown.reduce((s, i) => s + (computeProfit(i) || 0), 0);
    const dashAvgRoi      = dashTotalCogs > 0 ? dashTotalProfit / dashTotalCogs : null;

    // Scope C — Current tax year (getTaxYearItems(currentYear)).
    // Tax-tab KPI cards, SA103 boxes, sidebar breakdown, and
    // computeTaxYearTotals all use this scope.
    const yearAuditItems   = getTaxYearItems(currentYear);
    const yearAuditKnown   = yearAuditItems.filter(i => i.cost != null);
    const yearAuditUnknown = yearAuditItems.filter(i => i.cost == null);
    const yearTotalSold    = yearAuditItems.reduce((s, i) => s + (i.sold || 0), 0);
    const yearTotalCogs    = yearAuditKnown.reduce((s, i) => s + i.cost, 0);
    const yearTotalFees    = yearAuditKnown.reduce((s, i) => s + (i.fees || 0), 0);
    const yearTotalCosts   = yearTotalCogs + yearTotalFees;

    // Invariant 8: inventory totals strip mirrors all-items aggregates.
    log('Inventory totals strip — Total sold matches sum(item.sold)',
      approx(readMoney('inv-total-sold'), invTotalSold),
      `strip £${readMoney('inv-total-sold')} vs canon £${invTotalSold.toFixed(2)}`);
    log('Inventory totals strip — Total cost matches sum(cost + fees) on known items',
      approx(readMoney('inv-total-cost'), invTotalCosts),
      `strip £${readMoney('inv-total-cost')} vs canon £${invTotalCosts.toFixed(2)}`);
    log('Inventory totals strip — Total profit matches sum(computeProfit) on known items',
      approx(readMoney('inv-total-profit'), invTotalProfit),
      `strip £${readMoney('inv-total-profit')} vs canon £${invTotalProfit.toFixed(2)}`);

    // Invariant 9: dashboard KPI cards match the dash-filtered scope (dashYear);
    // tax-tab cards and SA103 boxes match the current-year scope.
    log('Dashboard turnover card = dash-filtered total sold',
      approx(readMoney('dash-turnover'), dashTotalSold),
      `card £${readMoney('dash-turnover')} vs dash £${dashTotalSold.toFixed(2)}`);
    log('Dashboard allowable-expenses card = dash-filtered cost + fees',
      approx(readMoney('dash-expenses'), dashTotalCosts),
      `card £${readMoney('dash-expenses')} vs dash £${dashTotalCosts.toFixed(2)}`);
    log('Dashboard trading-profit card = dash-filtered total profit',
      approx(readMoney('dash-profit'), dashTotalProfit),
      `card £${readMoney('dash-profit')} vs dash £${dashTotalProfit.toFixed(2)}`);
    log('Tax-tab turnover card = current-year total sold',
      approx(readMoney('tax-turnover'), yearTotalSold),
      `card £${readMoney('tax-turnover')} vs year £${yearTotalSold.toFixed(2)}`);
    log('Dashboard SA103 mirror Box 9 = current-year total sold',
      approx(readMoney('dash-sa103-9'), yearTotalSold),
      `box-9 £${readMoney('dash-sa103-9')} vs year £${yearTotalSold.toFixed(2)}`);
    log('Tax-tab SA103 Box 9 = current-year total sold',
      approx(readMoney('row-9'), yearTotalSold),
      `box-9 £${readMoney('row-9')} vs year £${yearTotalSold.toFixed(2)}`);

    // Invariant 10: Avg ROI on the Portfolio card = dash-scope profit ÷ dash-scope COGS.
    if (dashAvgRoi != null) {
      const shownPct    = Number((document.getElementById('dash-avg-roi')?.textContent || '').replace(/[%\s]/g, ''));
      const expectedPct = Math.round(dashAvgRoi * 100);
      log('Portfolio Avg ROI card = (dashProfit / dashCogs) × 100, rounded',
        Math.abs(shownPct - expectedPct) <= 1,
        `card ${shownPct}% vs canon ${expectedPct}%`);
    }

    // Invariant 11: platform-mix sums match per-platform totals within the
    // dash-filtered scope (same scope recomputePlatformMix uses).
    const mixCanon = { EBAY: 0, ETSY: 0, DEPOP: 0, VINTED: 0 };
    dashAuditItems.forEach(i => { if (mixCanon[i.platform] != null) mixCanon[i.platform] += (i.sold || 0); });
    log('Platform mix EBAY  = sum(item.sold where platform=EBAY, dash scope)',
      approx(readMoney('mix-EBAY'),  mixCanon.EBAY),
      `card £${readMoney('mix-EBAY')} vs canon £${mixCanon.EBAY.toFixed(2)}`);
    log('Platform mix DEPOP = sum(item.sold where platform=DEPOP, dash scope)',
      approx(readMoney('mix-DEPOP'), mixCanon.DEPOP),
      `card £${readMoney('mix-DEPOP')} vs canon £${mixCanon.DEPOP.toFixed(2)}`);
    log('Platform mix ETSY  = sum(item.sold where platform=ETSY, dash scope)',
      approx(readMoney('mix-ETSY'),  mixCanon.ETSY),
      `card £${readMoney('mix-ETSY')} vs canon £${mixCanon.ETSY.toFixed(2)}`);
    log('Platform-mix sum = dash-filtered total sold',
      approx(mixCanon.EBAY + mixCanon.DEPOP + mixCanon.ETSY + mixCanon.VINTED, dashTotalSold));

    // Invariant 12: Tax-tab sidebar breakdown is additive and matches the
    // current-year engine (same scope applyYear uses to populate bd-* elements).
    const bdCogs = readMoney('bd-cogs');
    const bdDsc  = readMoney('bd-dsc');
    const bdGen  = readMoney('bd-gen');
    log('Sidebar breakdown — COGS line = sum(item.cost) on known items in current year',
      approx(bdCogs, yearTotalCogs),
      `sidebar £${bdCogs} vs year £${yearTotalCogs.toFixed(2)}`);
    log('Sidebar breakdown — Direct sale costs line = sum(item.fees) on known items in current year',
      approx(bdDsc, yearTotalFees),
      `sidebar £${bdDsc} vs year £${yearTotalFees.toFixed(2)}`);
    log('Sidebar breakdown — bd-cogs + bd-dsc + bd-gen = current-year canonical costs',
      approx(bdCogs + bdDsc + bdGen, yearTotalCosts),
      `sum £${(bdCogs + bdDsc + bdGen).toFixed(2)} vs year £${yearTotalCosts.toFixed(2)}`);

    // Invariant 13: Chart's underlying monthly series matches the dash-filtered
    // scope. Temporarily reset platform + month filters so the test isn't
    // affected by whatever the user happens to be viewing.
    const _savedPlatforms = new Set(chartPlatforms);
    const _savedMonth     = chartMonth;
    chartPlatforms = new Set(['EBAY', 'ETSY', 'DEPOP', 'VINTED']);
    chartMonth     = '';
    const series = computeMonthlySeries();
    chartPlatforms = _savedPlatforms;
    chartMonth     = _savedMonth;
    const seriesRevenue = series.revenue.reduce((s, v) => s + v, 0);
    const seriesProfit  = series.profit.reduce((s, v) => s + v, 0);
    const seriesCosts   = series.costs.reduce((s, v) => s + v, 0);
    const allInDash     = dashAuditItems.filter(i => i.soldAt);
    const knownInDash   = allInDash.filter(i => i.cost != null);
    const allRevenue    = allInDash.reduce((s, i) => s + (i.sold || 0), 0);
    const knownProfit   = knownInDash.reduce((s, i) => s + (computeProfit(i) || 0), 0);
    const knownCosts    = knownInDash.reduce((s, i) => s + (i.cost || 0) + (i.fees || 0), 0);
    log('Chart series revenue = all dash items revenue',
      approx(seriesRevenue, allRevenue),
      `series £${seriesRevenue.toFixed(2)} vs dash £${allRevenue.toFixed(2)}`);
    log('Chart series profit  = known-cost dash items profit',
      approx(seriesProfit, knownProfit),
      `series £${seriesProfit.toFixed(2)} vs dash £${knownProfit.toFixed(2)}`);
    log('Chart series costs   = known-cost dash items costs',
      approx(seriesCosts, knownCosts),
      `series £${seriesCosts.toFixed(2)} vs dash ${knownCosts.toFixed(2)}`);

    // Invariant 14: computeTaxYearTotals is derived correctly from the
    // current-year item subset — not from all items across every year.
    log('computeTaxYearTotals — turnover = current-year total sold',
      approx(tNow.turnover, yearTotalSold),
      `engine £${tNow.turnover.toFixed(2)} vs year £${yearTotalSold.toFixed(2)}`);
    log('computeTaxYearTotals — costs = current-year cost+fees on known items',
      approx(tNow.costs, yearTotalCosts),
      `engine £${tNow.costs.toFixed(2)} vs year £${yearTotalCosts.toFixed(2)}`);
    log('computeTaxYearTotals — unknownCount = items missing cost in current year',
      tNow.unknownCount === yearAuditUnknown.length,
      `engine ${tNow.unknownCount} vs year ${yearAuditUnknown.length}`);

    // Invariant 15: cost warnings are visible iff ANY imported item (across all
    // years) is missing a cost — the warnings intentionally use the all-items count
    // so the user sees the full picture regardless of which year filter is active.
    const dashWarnHidden = document.getElementById('dash-cost-warning')?.classList.contains('hidden');
    const taxWarnHidden  = document.getElementById('tax-cost-warning')?.classList.contains('hidden');
    const expectHidden   = unknown.length === 0;
    log('Dashboard cost-warning banner hidden iff every item has a cost',
      dashWarnHidden === expectHidden,
      `hidden=${dashWarnHidden}, unknown=${unknown.length}`);
    log('Tax tab cost-warning banner hidden iff every item has a cost',
      taxWarnHidden === expectHidden,
      `hidden=${taxWarnHidden}, unknown=${unknown.length}`);

    // The dashboard "Trading profit" card derives from sum-of-known-profits;
    // the tax-tab "Trading profit" derives from turnover − costs via engine.
    // These differ when some items lack a cost — that's expected, so audit
    // each against its own definition, not against each other.

    // Print to console.
    const passed = checks.filter(c => c.pass).length;
    const failed = checks.length - passed;
    const header = `LedgerLoop self-check — ${passed}/${checks.length} pass${failed ? `, ${failed} FAIL` : ''}`;
    console.groupCollapsed(`%c${header}`, `color:${failed ? '#F43F5E' : '#10B981'};font-weight:600`);
    checks.forEach(c => {
      const style = `color:${c.pass ? '#10B981' : '#F43F5E'};font-family:monospace;font-size:11px`;
      console.log(`%c${c.pass ? '✔' : '✘'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`, style);
    });
    console.groupEnd();
    return { passed, failed, total: checks.length, checks };
  }

  // Public debug surface — pop the console any time and run `LL.audit()`.
  window.LL = {
    audit:            runConsistencyAudit,
    calculateTax,
    computeTaxYearTotals,
    buildSa103SCsv,
    downloadSa103Pdf,
    downloadAccountantPack,
    getState:         () => ({ items, taxInputs, currentYear, sortKey, sortDir, chartPlatforms: [...chartPlatforms], chartMonth, chartMetric, monthFilter, invFilter, searchQuery }),
  };

  // Render the audit report into the Settings → System diagnostics card.
  function renderDiagnostics() {
    const target = document.getElementById('diag-result');
    if (!target) return;
    const r = runConsistencyAudit();
    const ok = r.failed === 0;
    const failures = r.checks.filter(c => !c.pass);
    const showSection = (label, items) => items.length === 0 ? '' : `
      <details class="mt-3" ${ok ? '' : 'open'}>
        <summary class="cursor-pointer text-xs font-medium text-stone-600 hover:text-stone-900 select-none">
          ${label} (${items.length})
        </summary>
        <ul class="mt-2 space-y-1 text-xs font-mono pl-3 border-l border-stone-200">
          ${items.map(c => `
            <li class="flex items-start gap-2 leading-relaxed ${c.pass ? 'text-stone-600' : 'text-rose-600'}">
              <span class="${c.pass ? 'text-emerald-600' : 'text-rose-600'} flex-shrink-0">${c.pass ? '✓' : '✗'}</span>
              <span><span>${c.name}</span>${c.detail ? `<br><span class="text-stone-400">${c.detail}</span>` : ''}</span>
            </li>
          `).join('')}
        </ul>
      </details>`;

    target.classList.remove('hidden');
    target.innerHTML = `
      <div class="rounded-xl px-4 py-3 flex items-center gap-3"
           style="background:${ok ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)'};
                  border:1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'};">
        <i data-lucide="${ok ? 'check-circle-2' : 'alert-circle'}" class="w-5 h-5" style="color:${ok ? '#047857' : '#BE123C'};"></i>
        <div class="flex-1">
          <p class="text-sm font-medium" style="color:${ok ? '#047857' : '#BE123C'};">
            ${ok ? `All ${r.total} consistency checks passed` : `${r.failed} of ${r.total} checks failed`}
          </p>
          <p class="text-xs mt-0.5" style="color:${ok ? '#065F46' : '#9F1239'}; opacity:.9;">
            ${ok
              ? 'Every figure on the dashboard, tax page, and SA103 export reflects your inventory exactly.'
              : 'See the detail below or check the browser console for full output.'}
          </p>
        </div>
        <span class="badge ${ok ? 'badge-success' : ''}" style="${ok ? '' : 'background:rgba(244,63,94,0.15);color:#BE123C;'}">
          ${r.passed} pass · ${r.failed} fail
        </span>
      </div>
      ${showSection('Failures', failures)}
      ${showSection('All checks', r.checks)}
    `;
    if (window.lucide) lucide.createIcons();
  }

  function updateDashboardHeader() {
    const sub = document.getElementById('dash-header-sub');
    if (!sub) return;
    if (dashYear === 'all') {
      const n = getDashItems().length;
      sub.textContent = `All time · ${n} sale${n !== 1 ? 's' : ''}`;
    } else {
      const yr = Number(dashYear);
      sub.textContent = `Tax year ${yr}/${String(yr + 1).slice(2)} · 6 Apr ${yr} → 5 Apr ${yr + 1}`;
    }
  }

  function setupDashYearFilter() {
    const container = document.getElementById('dash-year-selector');
    if (!container) return;

    function render() {
      const years = getDashTaxYears();
      const opts  = ['all', ...years];
      container.innerHTML = opts.map(y => {
        const label  = y === 'all' ? 'All time' : `${y}/${String(Number(y) + 1).slice(2)}`;
        const active = String(dashYear) === String(y);
        return `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline'} dash-year-btn" data-dashyear="${y}">${label}</button>`;
      }).join('');

      container.querySelectorAll('.dash-year-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          dashYear = btn.dataset.dashyear === 'all' ? 'all' : Number(btn.dataset.dashyear);
          render();
          updateDashboardHeader();
          recomputeDashboardCards();
          recomputePlatformMix();
          buildChart();
          updateChartFiltersUI();
          // Refresh month dropdown to reflect data in the new year range
          const monthEl = document.getElementById('chart-month-filter');
          if (monthEl) {
            const months = getAvailableMonths();
            monthEl.innerHTML = '<option value="">All months</option>' +
              months.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
            chartMonth = '';
            monthEl.value = '';
          }
        });
      });
    }

    render();
  }

  function setupClearAllItems() {
    const btn = document.getElementById('clear-all-items');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!items.length) return;
      if (!confirm(`Remove all ${items.length} item${items.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      items.length = 0;
      refreshDerived();
      renderInventory();
    });
  }

  function setupDiagnostics() {
    const btn = document.getElementById('diag-run');
    if (!btn) return;
    btn.addEventListener('click', renderDiagnostics);
  }

  // ============================================================= //
  // CSV Import — PapaParse multi-platform parser
  // ============================================================= //
  // Normalise en-dash/em-dash to hyphen for column name comparisons
  const _normKey = s => (s || '').toLowerCase().replace(/[–—]/g, '-').trim();

  // Treat blanks, dashes, N/A, and Excel formula exports (=""-"") as absent
  const _csvIsEmpty = v =>
    v == null || v === '' || v === '--' || v === 'N/A' ||
    (typeof v === 'string' && v.startsWith('='));

  function _csvDetectPlatform(headers) {
    const h = headers.map(_normKey);
    const has = (...terms) => terms.some(t => h.some(col => col.includes(t)));
    if (has('transaction creation date') || has('final value fee') || has('custom label')) return 'EBAY';
    if (has('depop fee', 'commission amount', 'commission rate')) return 'DEPOP';
    if ((has('listing id') || has('listing fee') || has('transaction fee')) && has('item name', 'item total', 'order value')) return 'ETSY';
    return null;
  }

  function _csvCol(row, ...keys) {
    for (const k of keys) {
      const kn = _normKey(k);
      const found = Object.keys(row).find(rk => _normKey(rk) === kn);
      if (found !== undefined && !_csvIsEmpty(row[found])) return row[found];
    }
    return null;
  }

  function _csvMoney(v) {
    if (_csvIsEmpty(v)) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function _csvDate(v) {
    if (_csvIsEmpty(v)) return null;
    const s = String(v).trim();
    // Depop DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    // eBay "24 Dec 2025"
    const mdy = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (mdy) {
      const mo = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }[mdy[2].toLowerCase().slice(0, 3)];
      if (mo !== undefined) return new Date(Date.UTC(+mdy[3], mo, +mdy[1]));
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function _parseEbay(rows) {
    const out = [];
    for (const row of rows) {
      // Only import actual sales — skip Refund, Payout, Charge, Transfer, Hold, etc.
      const type = (_csvCol(row, 'type') || '').trim().toLowerCase();
      if (type && type !== 'order' && type !== 'sale') continue;
      // gross transaction amount = item price + buyer-paid shipping — the correct revenue figure
      const sold = _csvMoney(_csvCol(row, 'gross transaction amount', 'gross amount', 'item subtotal', 'unit price', 'selling price'));
      if (!sold || sold < 0) continue;
      // Column names use en-dash (–); _normKey handles the conversion
      const fvfFixed = _csvMoney(_csvCol(row, 'final value fee - fixed', 'fvf fixed'));
      const fvfVar   = _csvMoney(_csvCol(row, 'final value fee - variable', 'fvf variable'));
      out.push({
        platform: 'EBAY',
        sku:    _csvCol(row, 'custom label', 'sku', 'item id') || '',
        title:  _csvCol(row, 'item title', 'description', 'title') || 'eBay item',
        cost:   null,
        sold,
        fees:   Math.abs(fvfFixed) + Math.abs(fvfVar),
        hold:   null,
        soldAt: _csvDate(_csvCol(row, 'transaction creation date', 'order date', 'date/time', 'sale date')),
      });
    }
    return out;
  }

  function _parseEtsy(rows) {
    const out = [];
    for (const row of rows) {
      const sold = _csvMoney(_csvCol(row, 'item total', 'order value', 'price'));
      if (!sold) continue;
      const fees = Math.abs(_csvMoney(_csvCol(row, 'listing fee')))
                 + Math.abs(_csvMoney(_csvCol(row, 'transaction fee')))
                 + Math.abs(_csvMoney(_csvCol(row, 'processing fee', 'payment processing')));
      out.push({
        platform: 'ETSY',
        sku:    _csvCol(row, 'sku') || '',
        title:  _csvCol(row, 'item name', 'title', 'listing title') || 'Etsy item',
        cost:   null,
        sold:   Math.abs(sold),
        fees,
        hold:   null,
        soldAt: _csvDate(_csvCol(row, 'order date', 'sale date', 'date')),
      });
    }
    return out;
  }

  function _parseDepop(rows) {
    const out = [];
    for (const row of rows) {
      // Use "Total" as revenue (item price + buyer shipping). Bundle secondary rows
      // have an empty Total — skip them to avoid double-counting.
      const totalRaw = _csvCol(row, 'total');
      if (_csvIsEmpty(totalRaw)) continue;
      const sold = _csvMoney(totalRaw);
      if (!sold || sold < 0) continue;

      // Seller-borne fees: Depop fee + Depop Payments fee + Boosting fee.
      // "Buyer Marketplace Fee" is paid by the buyer, not a seller deduction.
      const fees = Math.abs(_csvMoney(_csvCol(row, 'depop fee')))
                 + Math.abs(_csvMoney(_csvCol(row, 'depop payments fee')))
                 + Math.abs(_csvMoney(_csvCol(row, 'boosting fee')));

      // Title: first line of Description only
      const fullDesc = _csvCol(row, 'description') || '';
      const title = (fullDesc.split(/\r?\n/)[0].trim()) || _csvCol(row, 'name') || 'Depop item';

      // SKU: use SKU column; treat N/A as empty
      const skuRaw = _csvCol(row, 'sku') || '';

      out.push({
        platform: 'DEPOP',
        sku:    skuRaw,
        title,
        cost:   null,
        sold,
        fees,
        hold:   null,
        soldAt: _csvDate(_csvCol(row, 'date of sale', 'sale date', 'date')),
      });
    }
    return out;
  }

  function _showImportFeedback(type, msg) {
    const el = document.getElementById('import-feedback');
    if (!el) return;
    el.className = 'rounded-xl px-4 py-3 text-sm mt-5 flex items-center gap-3';
    const spinner = `<svg class="w-4 h-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12" opacity=".3"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>`;
    const check   = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
    const cross   = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`;
    if (type === 'loading') { el.style.cssText = 'background:#F0F9FF;border:1px solid #BAE6FD;color:#0369A1;'; el.innerHTML = spinner + `<span>${msg}</span>`; }
    else if (type === 'success') { el.style.cssText = 'background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D;'; el.innerHTML = check + `<span>${msg}</span>`; }
    else { el.style.cssText = 'background:#FFF1F2;border:1px solid #FECDD3;color:#BE123C;'; el.innerHTML = cross + `<span>${msg}</span>`; }
    el.classList.remove('hidden');
  }

  // Parse a single file and resolve with { platform, count } on success or { error, fileName } on failure.
  function _parseSingleFile(file) {
    return new Promise(resolve => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        return resolve({ error: 'Not a CSV file', fileName: file.name });
      }
      if (file.size > 10 * 1024 * 1024) {
        return resolve({ error: 'Exceeds 10 MB limit', fileName: file.name });
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        beforeFirstChunk: chunk => {
          const lines = chunk.split('\n');
          const idx = lines.findIndex(l =>
            /transaction creation date|listing id|order id|depop fee|commission amount|date of sale|sale date/i.test(l)
          );
          return idx > 0 ? lines.slice(idx).join('\n') : chunk;
        },
        complete: ({ data, meta }) => {
          if (!data.length) return resolve({ error: 'Empty or unreadable', fileName: file.name });
          const headers = meta.fields || Object.keys(data[0] || {});
          const platform = _csvDetectPlatform(headers);
          if (!platform) return resolve({ error: 'Format not recognised', fileName: file.name });
          const parsed = platform === 'EBAY' ? _parseEbay(data)
                       : platform === 'ETSY' ? _parseEtsy(data)
                       :                       _parseDepop(data);
          if (!parsed.length) return resolve({ error: 'No valid sale rows found', fileName: file.name, platform });
          resolve({ platform, parsed, fileName: file.name });
        },
        error: err => resolve({ error: err.message, fileName: file.name }),
      });
    });
  }

  async function _processImportedFiles(files) {
    if (!files || !files.length) return;
    if (typeof Papa === 'undefined') {
      _showImportFeedback('error', 'CSV parser not loaded — refresh the page and try again.');
      return;
    }

    const fileArr = Array.from(files);
    const label = fileArr.length === 1 ? fileArr[0].name : `${fileArr.length} files`;
    _showImportFeedback('loading', `Reading ${label}…`);

    const results = await Promise.all(fileArr.map(_parseSingleFile));

    const successes = results.filter(r => r.parsed);
    const failures  = results.filter(r => r.error);

    if (successes.length) {
      let nextId = items.length > 0 ? Math.max(...items.map(i => parseInt(i.id) || 0)) + 1 : 1;
      for (const r of successes) {
        r.parsed.forEach(p => { p.id = String(nextId++); });
        items.push(...r.parsed);
      }
      refreshDerived();
      renderInventory();
    }

    // Build summary message
    if (successes.length && !failures.length) {
      // All succeeded — group by platform
      const byPlatform = {};
      for (const r of successes) {
        byPlatform[r.platform] = (byPlatform[r.platform] || 0) + r.parsed.length;
      }
      const parts = Object.entries(byPlatform)
        .map(([p, n]) => `${n} ${PLATFORMS[p].name} ${n === 1 ? 'sale' : 'sales'}`);
      const total = successes.reduce((s, r) => s + r.parsed.length, 0);
      const summary = parts.length > 1 ? `${total} items (${parts.join(', ')})` : parts[0];
      _showImportFeedback('success', `Imported ${summary} — add cost prices in the Inventory tab to complete your tax estimate.`);
    } else if (successes.length && failures.length) {
      // Partial success
      const total = successes.reduce((s, r) => s + r.parsed.length, 0);
      const errList = failures.map(f => `${f.fileName}: ${f.error}`).join('; ');
      _showImportFeedback('success', `Imported ${total} item${total === 1 ? '' : 's'}. ${failures.length} file${failures.length === 1 ? '' : 's'} skipped — ${errList}.`);
    } else {
      // All failed
      if (fileArr.length === 1) {
        _showImportFeedback('error', `${failures[0].error} — expected an eBay Transaction Report, Etsy Orders CSV, or Depop sales download.`);
      } else {
        const errList = failures.map(f => `${f.fileName}: ${f.error}`).join('; ');
        _showImportFeedback('error', `No files could be imported. ${errList}`);
      }
    }
  }

  function setupCsvImport() {
    const dropzone  = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const chooseBtn = document.getElementById('csv-choose-btn');
    if (!dropzone || !fileInput || !chooseBtn) return;

    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) _processImportedFiles(e.target.files);
      fileInput.value = '';
    });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dropzone-active'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-active');
      if (e.dataTransfer.files.length) _processImportedFiles(e.dataTransfer.files);
    });
  }

  // Hide the import nudge banner if items already exist on load
  const _nudge = document.getElementById('import-nudge');
  if (_nudge) _nudge.classList.toggle('hidden', items.length > 0);

  renderInventory();
  if (typeof setupInventoryEditor === 'function') setupInventoryEditor();
  if (typeof setupInventorySort === 'function') setupInventorySort();
  if (typeof setupTaxInputs === 'function') setupTaxInputs();
  if (typeof setupTradingAllowance === 'function') setupTradingAllowance();
  if (typeof setupTabLinks === 'function') setupTabLinks();
  if (typeof setupTheme === 'function') setupTheme();
  if (typeof setupChartFilters === 'function') setupChartFilters();
  if (typeof setupDiagnostics === 'function') setupDiagnostics();
  if (typeof setupCsvImport === 'function') setupCsvImport();
  if (typeof setupClearAllItems === 'function') setupClearAllItems();
  if (typeof setupDashYearFilter === 'function') setupDashYearFilter();
  if (typeof updateDashboardHeader === 'function') updateDashboardHeader();
  if (typeof recomputeDashboardCards === 'function') recomputeDashboardCards();
  if (typeof recomputePlatformMix === 'function')  recomputePlatformMix();
  if (typeof applyYear === 'function') applyYear(currentYear);
  setupCalc();
  lucide.createIcons();
  route();
  window.addEventListener('hashchange', route);

  // Auto-run the consistency audit a beat after all UI is painted, so any
  // drift between inventory and downstream UI screams in the console the
  // moment the page loads. Silent on success, loud on failure.
  if (document.getElementById('view-app')) {
    setTimeout(() => {
      try {
        const r = runConsistencyAudit();
        if (r.failed > 0) {
          console.warn(`%cLedgerLoop self-check: ${r.failed} of ${r.total} invariants FAILED. Open the Settings → System diagnostics panel for details, or run LL.audit() to inspect.`,
            'color:#F43F5E;font-weight:600;font-size:13px');
        }
      } catch (err) {
        console.error('LedgerLoop self-check crashed:', err);
      }
    }, 250);
  }
