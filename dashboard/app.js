// Token Radar dashboard — static, offline, data-driven.
// Reads window.RADAR from ../data.js (written by main.ts from the same board as board.json).
// Every number, the model breakdown and the farm plan come from that file: what you see here is
// exactly what the Haskell-free model in lib/model.ts computed. No network, no framework.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }

  // el(tag, attrs, ...children): a tiny DOM builder. Text is always textContent, never markup.
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }
  function dot(color) { return el('i', { class: 'dot', style: 'background:' + color }); }

  // ---------- state, filtering, sorting ----------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('w') === '1') state.watchOnly = true;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.watchOnly) p.set('w', '1');
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function baseRows() {
    if (state.tab === 'live') return DATA.live.map(function (r, i) {
      return { rank: null, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
        tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: r.mcap_usd, age_days: null,
        implied_value_usd: r.mcap_usd || 0, live: true, watchlisted: false };
    });
    return DATA.rows;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return baseRows().filter(function (r) {
      if (state.watchOnly && state.tab !== 'live' && !r.watchlisted) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortValue(r) {
    var k = state.sort;
    if (k === 'name') return (r.name || '').toLowerCase();
    if (k === 'category') return (r.category || 'Other').toLowerCase();
    if (k === 'tvl') return r.tvl_usd;
    if (k === 'growth') return r.change_7d;
    if (k === 'age') return r.age_days;
    if (k === 'rank') return r.rank === null ? 1e12 : r.rank;
    return state.tab === 'live' ? (r.mcap_usd || 0) : r.implied_value_usd;
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var av = sortValue(a), bv = sortValue(b);
      var an = av === null || av === undefined, bn = bv === null || bv === undefined;
      if (an && bn) return tie(a, b);
      if (an) return 1; // unknown values always last
      if (bn) return -1;
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return tie(a, b);
    });
  }
  function tie(a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; }

  // ---------- chrome ----------
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'wordmark', text: 'TOKEN ' }, el('span', { text: 'RADAR' }))),
      el('div', { class: 'topmeta' },
        el('span', { class: 'chip signal', text: DATA.model_version }),
        el('span', { class: 'chip', text: 'SNAPSHOT ' + DATA.as_of }),
        el('span', { class: 'chip', text: DATA.source })));
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'Pre-token opportunity board' }),
        el('h1', { text: 'Find the token before it trades.' }),
        el('p', { class: 'lede', text: 'Every watchlist protocol, plus early pre-token projects below the TVL floor, ranked by an implied value learned from this snapshot itself. Token-bearing protocols are kept apart so a market cap is never mistaken for a forecast.' }),
        el('p', { class: 'fine', text: 'One formula, no name special-casing. Open a row for its factor-by-factor breakdown and a costed farm plan.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact accent' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Rows ranked' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'Early, below floor' })),
        el('div', { class: 'fact' }, el('b', { text: DATA.global_multiple.toFixed(2) + '×' }), el('span', { text: 'Median peer multiple' }))));
  }

  function kpis() {
    var top = DATA.rows[0];
    return el('section', { class: 'kpis' },
      el('div', { class: 'kpi' }, el('span', { class: 'k-label', text: 'Top signal' }),
        el('span', { class: 'k-value', text: top ? top.name : 'n/a' }),
        el('span', { class: 'k-sub', text: top ? fmtUsd(top.implied_value_usd) + ' implied · rank 1' : '' })),
      el('div', { class: 'kpi' }, el('span', { class: 'k-label', text: 'Deepest TVL on board' }),
        el('span', { class: 'k-value', text: fmtUsd(DATA.rows.reduce(function (m, r) { return Math.max(m, r.tvl_usd); }, 0)) }),
        el('span', { class: 'k-sub', text: 'across pre-token rows' })),
      el('div', { class: 'kpi' }, el('span', { class: 'k-label', text: 'Median peer multiple' }),
        el('span', { class: 'k-value', text: DATA.global_multiple.toFixed(3) + '×' }),
        el('span', { class: 'k-sub', text: 'mcap ÷ TVL from live peers' })),
      el('div', { class: 'kpi' }, el('span', { class: 'k-label', text: 'Live tokens set aside' }),
        el('span', { class: 'k-value', text: DATA.live.length + ' protocols' }),
        el('span', { class: 'k-sub', text: 'shown with real market caps' })));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var watch = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'muted', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('label', { class: 'toggle', for: 'watch' }, watch, 'Watchlist only'),
      el('span', { class: 'count', text: filtered().length + ' shown' }));
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col', 'aria-sort-active': active ? 'true' : null },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
        render();
      } }, label, active ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null));
  }

  // ---------- tables ----------
  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) return emptyPanel();
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; }).concat([1]));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: r.slug }))),
        el('td', null, el('span', { class: 'cat', text: r.category || 'Other' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'badge ' + (r.watchlisted ? 'watch' : 'early'), text: r.watchlisted ? 'watchlist' : 'early' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols, strongest implied value first. Select any row for the model breakdown and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', '#'), sortHeader('name', 'Protocol'), sortHeader('category', 'Category'),
          sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'),
          sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Source' }))),
        tbody)));
  }

  function liveTable() {
    var list = sorted(filtered());
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'badge live', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains || []).slice(0, 2).join(', ') }))),
        el('td', null, el('span', { class: 'cat', text: r.category || 'Other' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: '—' }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'real cap' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Token already trades: the market cap on the right is a fact, not a model. These rows are excluded from the pre-token ranking.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), sortHeader('name', 'Protocol'), sortHeader('category', 'Category'),
          sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), el('th', { scope: 'col', text: 'Age' }),
          sortHeader('implied', 'Market cap'), el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }

  function emptyPanel() {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches those filters' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
        state.q = ''; state.category = 'all'; state.watchOnly = false; writeHash(); render();
      } })));
  }

  function modelPanel() {
    return el('section', { class: 'panel formula-panel' },
      el('div', { class: 'formula-head' },
        el('div', null, el('h2', { text: 'How implied value is computed' }),
          el('p', { text: 'The comparable multiple is learned from this snapshot: each token-bearing protocol contributes its market cap ÷ TVL, outliers are dropped and the median is taken. Categories with enough peers use their own median; the rest use the global median of ' + DATA.global_multiple.toFixed(3) + '×.' })),
        el('span', { class: 'chip', text: DATA.model_version })),
      el('pre', { class: 'formula', text: DATA.formula }),
      el('div', { class: 'learned' },
        el('span', { class: 'muted', text: 'Learned from ' + DATA.peer_count + ' token-bearing peers in this snapshot:' }),
        DATA.multiples.map(function (x) { return el('span', { class: 'chip', text: x.category + '  ' + x.multiple.toFixed(2) + '× · ' + x.peers + ' peers' }); })),
      el('div', { class: 'legend' },
        el('span', null, dot('var(--amber)'), 'TVL × peer mcap/TVL = base value'),
        el('span', null, dot('var(--mint)'), '7d momentum, clamped ±, scales the base'),
        el('span', null, dot('var(--cyan)'), 'longer run without a token scales it up'),
        el('span', null, dot('var(--muted)'), 'missing listed_at uses a neutral 1.00×')));
  }

  // ---------- detail drawer ----------
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function waterfall(r) {
    var m = r.model;
    var rows = [
      ['TVL', fmtUsd(r.tvl_usd), fmtUsd(r.tvl_usd)],
      ['Peer multiple', m.comparable_multiple.toFixed(2) + '×  ·  ' + m.multiple_source, fmtUsd(m.base_value)],
      ['Momentum', fmtPct(m.growth_pct) + '  →  ' + m.growth_multiplier.toFixed(2) + '×', fmtUsd(m.after_growth)],
      ['Age with no token', fmtAge(m.age_days) + '  →  ' + m.age_multiplier.toFixed(2) + '×', fmtUsd(m.after_age)]
    ];
    if (m.capped) rows.push(['Value cap', 'limit ' + fmtUsd(DATA.model.value_cap), fmtUsd(r.implied_value_usd)]);
    rows.push(['Implied value', 'model estimate', fmtUsd(r.implied_value_usd)]);
    return el('div', { class: 'waterfall' }, rows.map(function (row, i) {
      var last = i === rows.length - 1;
      return el('div', { class: 'wf-row' + (last ? ' final' : '') },
        el('span', { class: 'wf-label', text: row[0] }),
        el('span', { class: 'wf-factor', text: row[1] }),
        el('span', { class: 'wf-total', text: row[2] }));
    }));
  }

  function recompute(r) {
    var m = r.model, k = DATA.model;
    // Same operations, same order, same full-precision factors as lib/model.ts. One final round.
    var raw = Math.max(1, Math.round(r.tvl_usd * m.comparable_multiple * m.growth_multiplier * m.age_multiplier));
    return Math.min(raw, Math.round(k.value_cap));
  }

  function openDetail(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var inner = el('div', { class: 'detail-inner' });
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + r.rank + ' of ' + DATA.board_size + (r.watchlisted ? '  ·  watchlist' : '  ·  early radar') }),
        el('h2', { id: 'detail-title', text: r.name }),
        el('p', { class: 'sub', text: (r.category || 'Other') + '  ·  listed ' + (r.listed_at || 'unknown') + '  ·  ' + fmtAge(r.age_days) + ' with no token' }),
        el('div', { class: 'chains' }, (r.chains || []).map(function (c) { return el('span', { text: c }); }))),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Model breakdown' }),
      waterfall(r),
      el('p', { class: 'section-note', text: 'The comparable factor comes from token-bearing peers in the same category where at least ' + DATA.model.multiple_min_comps + ' exist, otherwise from all peers. TVL and 7d change are figures from the snapshot itself.' }),
      el('p', { class: 'check' + (recompute(r) === r.implied_value_usd ? '' : ' bad'), text: recompute(r) === r.implied_value_usd
        ? '✓ Factors reproduce the board value of ' + fmtUsd(r.implied_value_usd) + ' exactly.'
        : '! Recomputed ' + fmtUsd(recompute(r)) + ' differs from the board — data is stale.' })));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan · ' + (r.farm_plan ? r.farm_plan.length : r.farm_steps.length) + ' steps' }),
      el('p', { class: 'section-note', text: 'Deposit assets and action follow the protocol category and chain; the rate check uses this protocol’s own 7-day change. Costs are gas, bridge fees, deposit size and the primary risk.' }),
      el('ol', { class: 'steps' }, (r.farm_plan || []).map(function (s) {
        return el('li', null,
          el('div', null,
            el('div', { class: 'act', text: s.text }),
            el('div', { class: 'meta' },
              el('span', null, 'COST  ', el('b', { text: s.cost })),
              el('span', null, 'TIME  ', el('b', { text: s.time })))));
      }))));

    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function footer() {
    return el('footer', null,
      el('span', { text: 'Implied value is a model estimate, not a price or a promise. Built from the sealed DefiLlama snapshot dated ' + DATA.as_of + '.' }),
      el('span', { text: 'Offline page · source in the dossier · ' + DATA.model_version }));
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(kpis());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
