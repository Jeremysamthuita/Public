/* Sermons page helpers: compact mobile toolbar + 50-per-page pagination.
   Works alongside the existing search / filter / AI-search scripts: it only
   toggles panels and shows or hides sermon cards that are already on the page. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pendingReset = false;
  let resetTimer = 0;

  /* ---------------- toolbar ---------------- */
  function initToolbar() {
    const bar = $('#sermonToolbar');
    if (!bar) return;
    const searchBtn = $('#stSearchToggle');
    const filterBtn = $('#stFilterToggle');
    const searchInput = $('#searchInput');
    const month = $('#monthFilter');
    const year = $('#yearFilter');
    const ai = $('#aiSermonSearch');
    const badge = $('.st-badge', bar);
    const dot = $('.st-dot', bar);
    const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 850px)') : { matches: false };
    const longPlaceholder = ai ? ai.getAttribute('placeholder') : '';

    const setOpen = (name, open) => {
      bar.classList.toggle(`open-${name}`, open);
      const btn = name === 'search' ? searchBtn : filterBtn;
      if (btn) btn.setAttribute('aria-expanded', String(open));
    };
    const toggle = name => {
      const open = !bar.classList.contains(`open-${name}`);
      setOpen(name === 'search' ? 'filters' : 'search', false);
      setOpen(name, open);
      if (open && name === 'search' && searchInput) searchInput.focus();
      if (open && name === 'filters' && month) month.focus();
    };
    const refresh = () => {
      const filters = (month && month.value ? 1 : 0) + (year && year.value ? 1 : 0);
      if (badge) { badge.textContent = String(filters); badge.hidden = filters === 0; }
      if (dot) dot.hidden = !(searchInput && searchInput.value.trim());
    };
    const adaptPlaceholder = () => {
      if (!ai) return;
      ai.setAttribute('placeholder', narrow.matches ? 'Ask AI: "healing sermons last month"' : longPlaceholder);
    };

    if (searchBtn) searchBtn.addEventListener('click', () => toggle('search'));
    if (filterBtn) filterBtn.addEventListener('click', () => toggle('filters'));
    bar.addEventListener('input', refresh);
    bar.addEventListener('change', refresh);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (bar.classList.contains('open-search') || bar.classList.contains('open-filters'))) {
        setOpen('search', false); setOpen('filters', false);
      }
    });
    if (narrow.addEventListener) narrow.addEventListener('change', adaptPlaceholder);
    adaptPlaceholder();
    refresh();
    // the month and year lists are filled in later by the page script
    [month, year].forEach(select => { if (select) new MutationObserver(refresh).observe(select, { childList: true }); });
  }

  /* ---------------- pagination ---------------- */
  function initPager() {
    const container = $('#sermon-container');
    const pager = $('#sermonPager');
    if (!container || !pager) return;
    const size = Math.max(1, Number(container.dataset.pageSize) || 20);
    let page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1);
    let scheduled = false;
    let applying = false;

    const filteredOut = card => card.hidden || card.style.display === 'none' ||
      card.getAttribute('aria-hidden') === 'true' || /(^|\s)(hidden|is-hidden|filtered-out|d-none)(\s|$)/.test(card.className);

    function pageList(current, total) {
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      const set = new Set([1, total, current, current - 1, current + 1]);
      if (current <= 3) [2, 3, 4].forEach(n => set.add(n));
      if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(n => set.add(n));
      const sorted = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
      const out = [];
      sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push('gap'); out.push(n); });
      return out;
    }

    function renderControls(total, pages, start, end) {
      const mk = (label, target, attrs = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sp-btn ${attrs.cls || ''}`.trim();
        b.innerHTML = label;
        if (attrs.aria) b.setAttribute('aria-label', attrs.aria);
        if (attrs.current) b.setAttribute('aria-current', 'page');
        if (attrs.disabled) b.disabled = true;
        b.addEventListener('click', () => go(target));
        return b;
      };
      const summary = document.createElement('p');
      summary.className = 'sp-summary';
      summary.id = 'spSummary';
      summary.tabIndex = -1;
      summary.textContent = `Showing ${start + 1}–${end} of ${total} sermons`;
      const controls = document.createElement('div');
      controls.className = 'sp-controls';
      controls.appendChild(mk('<i class="fas fa-chevron-left" aria-hidden="true"></i> Previous', page - 1, { cls: 'sp-nav', aria: 'Previous page', disabled: page <= 1 }));
      const compact = document.createElement('span');
      compact.className = 'sp-compact';
      compact.textContent = `Page ${page} of ${pages}`;
      controls.appendChild(compact);
      pageList(page, pages).forEach(item => {
        if (item === 'gap') { const gap = document.createElement('span'); gap.className = 'sp-gap'; gap.textContent = '…'; controls.appendChild(gap); }
        else controls.appendChild(mk(String(item), item, { cls: 'sp-num', aria: `Page ${item}`, current: item === page }));
      });
      controls.appendChild(mk('Next <i class="fas fa-chevron-right" aria-hidden="true"></i>', page + 1, { cls: 'sp-nav', aria: 'Next page', disabled: page >= pages }));
      pager.replaceChildren(summary, controls);
    }

    function apply() {
      scheduled = false;
      applying = true;
      const cards = [...container.children].filter(el => el.classList.contains('sermon-card'));
      const matching = cards.filter(card => !filteredOut(card));
      if (pendingReset) { page = 1; pendingReset = false; }
      const pages = Math.max(1, Math.ceil(matching.length / size));
      page = Math.min(Math.max(1, page), pages);
      const start = (page - 1) * size;
      const end = Math.min(matching.length, start + size);
      cards.forEach(card => card.removeAttribute('data-paged'));
      if (pages > 1) matching.forEach((card, i) => { if (i < start || i >= end) card.setAttribute('data-paged', 'out'); });
      pager.hidden = pages <= 1;
      if (pages > 1) renderControls(matching.length, pages, start, end);
      else pager.replaceChildren();
      applying = false;
    }

    function schedule() {
      if (scheduled || applying) return;
      scheduled = true;
      requestAnimationFrame(apply);
    }

    function go(target) {
      page = target;
      apply();
      const url = new URL(location.href);
      if (page > 1) url.searchParams.set('page', String(page)); else url.searchParams.delete('page');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      container.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      const summary = $('#spSummary');
      if (summary) summary.focus({ preventScroll: true });
    }

    // a new search or filter starts again from page 1
    const markReset = event => {
      if (!event.target.closest('#sermonToolbar')) return;
      pendingReset = true;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { pendingReset = false; }, 1500);
    };
    document.addEventListener('input', markReset);
    document.addEventListener('change', markReset);

    new MutationObserver(schedule).observe(container, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
    });
    window.addEventListener('aic:content-updated', schedule);
    apply();
  }

  function init() { initToolbar(); initPager(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.AICSermonPager = { init };
})();