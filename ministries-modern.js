/* =====================================================
   AIC EGERTON CHAPEL: MINISTRIES PAGE
   - Built-in list of ministries (from #ministryData)
   - Enriched / extended by published "ministry" entries in Contentful
   - Filter tabs, search, cards, slide-over drawer with the interest form
===================================================== */
(() => {
  'use strict';

  const GROUPS = {
    all: { label: 'All' },
    fellowship: { label: 'Fellowships & Groups', icon: 'fa-users' },
    music: { label: 'Music & Worship', icon: 'fa-music' },
    service: { label: 'Service & Operations', icon: 'fa-hand-holding-heart' },
    youth: { label: 'Youth & Children', icon: 'fa-child' }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { seed: [], cms: [], all: [], group: 'all', query: '', current: null, lastFocus: null };

  /* ---------- helpers ---------- */
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  const text = value => (typeof value === 'string' ? value.trim() : '');
  const keyOf = value => String(value || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, '');
  const slugOf = value => String(value || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  function groupFor(category, name) {
    const hay = `${category || ''} ${name || ''}`.toLowerCase();
    if (/music|worship|choir|praise|band|instrument|singing/.test(hay)) return 'music';
    if (/youth|child|kid|teen|sunday school|cadette|junior|student|young/.test(hay)) return 'youth';
    if (/service|operation|usher|media|catering|hospitality|tech|welcome|protocol|sound|decor|security/.test(hay)) return 'service';
    return 'fellowship';
  }
  const defaultIcon = group => (GROUPS[group] && GROUPS[group].icon) || 'fa-users';

  function splitTimes(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    return String(value || '').split(/\r?\n|;|\|/).map(s => s.trim()).filter(Boolean);
  }

  function safeImage(url) {
    const raw = text(url);
    if (!raw) return '';
    try { const u = new URL(raw, location.origin); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }

  /* ---------- data: built-in list + Contentful ---------- */
  function readSeed() {
    try { return JSON.parse($('#ministryData').textContent || '[]').map(item => ({ ...item, source: 'seed' })); }
    catch { return []; }
  }

  function fromCms(item) {
    const name = text(item.name);
    if (!name) return null;
    const group = groupFor(item.category, name);
    return {
      id: `cms-${item.id || keyOf(name)}`,
      name,
      group,
      categoryText: text(item.category),
      motto: text(item.motto),
      vision: text(item.vision),
      mission: text(item.mission) || text(item.description),
      summary: text(item.description) || text(item.mission),
      times: splitTimes(item.meetingTime),
      photo: safeImage(item.imageUrl),
      joining: text(item.joiningInformation),
      leader: text(item.leader),
      contact: text(item.contact),
      sortOrder: Number(item.sortOrder) || 0,
      source: 'cms'
    };
  }

  function seedKeys(seed) { return [keyOf(seed.name), keyOf(seed.joinValue), ...(seed.aliases || []).map(keyOf)].filter(Boolean); }

  function buildList(seed, cms, mode) {
    const normalizedSeed = seed.map(s => ({
      ...s, group: s.group, summary: s.mission || s.vision || s.motto || '', photo: '', joining: '', leader: '', contact: '', sortOrder: 0
    }));
    const used = new Set();
    const merged = [];
    const bySeed = new Map();
    cms.forEach(c => {
      const index = normalizedSeed.findIndex((s, i) => !used.has(i) && seedKeys(s).includes(keyOf(c.name)));
      if (index >= 0) { used.add(index); bySeed.set(index, c); }
    });
    normalizedSeed.forEach((s, i) => {
      const c = bySeed.get(i);
      if (c) {
        merged.push({
          ...s, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && !v.length))),
          id: s.id, group: c.categoryText ? c.group : s.group, icon: s.icon, joinValue: s.joinValue, source: 'cms'
        });
      } else if (mode !== 'replace' || !cms.length) merged.push(s);
    });
    cms.forEach(c => {
      if ([...bySeed.values()].includes(c)) return;
      merged.push({ ...c, id: slugOf(c.name) || c.id, icon: defaultIcon(c.group), joinValue: c.name, aliases: [] });
    });
    const hasOrder = merged.some(m => m.sortOrder);
    return hasOrder ? merged.map((m, i) => ({ m, i })).sort((a, b) => (a.m.sortOrder || 999) - (b.m.sortOrder || 999) || a.i - b.i).map(x => x.m) : merged;
  }

  async function loadCms() {
    try {
      const service = await import('/assets/js/content/content-service.js');
      const items = await service.getContent('ministries');
      return (Array.isArray(items) ? items : []).map(fromCms).filter(Boolean);
    } catch (error) {
      console.warn('[ministries] Could not read ministries from the CMS; showing the built-in list.', error);
      return [];
    }
  }

  /* ---------- builders (escaped) ---------- */
  const timeLabel = m => (m.times.length ? m.times[0] : 'Schedule shared by the team');

  function mediaHTML(m) {
    const art = m.photo
      ? `<img src="${esc(m.photo)}" alt="" loading="lazy" decoding="async">`
      : `<div class="mn-art" aria-hidden="true"><i class="fas ${esc(m.icon)} mn-ghost"></i></div>`;
    return art;
  }

  function cardHTML(m) {
    const extra = m.times.length > 1 ? `<span class="mn-time-more">+${m.times.length - 1} more</span>` : '';
    return `
      <div class="mn-media">${mediaHTML(m)}
        <span class="mn-cat">${esc(GROUPS[m.group].label)}</span>
        <span class="mn-badge" aria-hidden="true"><i class="fas ${esc(m.icon)}"></i></span>
      </div>
      <div class="mn-body">
        <h3>${esc(m.name)}</h3>
        <p class="mn-summary">${esc(m.summary || m.mission || '')}</p>
        <span class="mn-time${m.times.length ? '' : ' is-tba'}"><i class="fas fa-clock" aria-hidden="true"></i>${esc(timeLabel(m))}${extra}</span>
        <div class="mn-card-actions">
          <button class="mn-btn mn-btn-outline mn-btn-sm" type="button" data-learn="${esc(m.id)}">Learn more</button>
          <button class="mn-btn mn-btn-brand mn-btn-sm" type="button" data-join-ministry="${esc(m.id)}">I’m interested</button>
        </div>
      </div>`;
  }

  function detailHTML(m) {
    const quotes = [['Motto', m.motto], ['Vision', m.vision]].filter(([, v]) => v)
      .map(([label, v]) => `<blockquote class="mn-quote"><small>${label}</small>“${esc(v)}”</blockquote>`).join('');
    const times = m.times.length
      ? m.times.map(t => `<li><i class="fas fa-clock" aria-hidden="true"></i>${esc(t)}</li>`).join('')
      : '<li class="is-tba"><i class="fas fa-circle-info" aria-hidden="true"></i>Meeting times are shared by the ministry team when you sign up</li>';
    const people = [m.leader && `Led by ${m.leader}`, m.contact && `Contact: ${m.contact}`].filter(Boolean).join(' · ');
    return `
      <div class="mn-d-art" data-group="${esc(m.group)}">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : `<i class="fas ${esc(m.icon)} mn-ghost" aria-hidden="true"></i>`}
        <span class="mn-d-badge" aria-hidden="true"><i class="fas ${esc(m.icon)}"></i></span>
      </div>
      <div class="mn-d-body">
        <span class="mn-d-cat">${esc(GROUPS[m.group].label)}</span>
        <h2 id="mnDrawerTitle">${esc(m.name)}</h2>
        ${quotes}
        ${m.mission ? `<div class="mn-d-block"><h3><i class="fas fa-bullseye" aria-hidden="true"></i>Our mission</h3><p class="mn-text">${esc(m.mission)}</p></div>` : ''}
        <div class="mn-d-block"><h3><i class="fas fa-calendar-check" aria-hidden="true"></i>Weekly meetups</h3><ul class="mn-times">${times}</ul></div>
        ${m.joining ? `<div class="mn-d-block"><h3><i class="fas fa-door-open" aria-hidden="true"></i>How to join</h3><p class="mn-text">${esc(m.joining)}</p></div>` : ''}
        ${people ? `<p class="mn-d-note">${esc(people)}</p>` : ''}
        <div class="mn-jump"><button class="mn-btn mn-btn-brand" type="button" data-jump-form><i class="fas fa-hand-point-down" aria-hidden="true"></i> Express interest</button></div>
      </div>`;
  }

  const genericDetailHTML = () => `
    <div class="mn-d-art" data-group="music"><i class="fas fa-hands-holding-circle mn-ghost" aria-hidden="true"></i><span class="mn-d-badge" aria-hidden="true"><i class="fas fa-heart"></i></span></div>
    <div class="mn-d-body">
      <span class="mn-d-cat">Join us</span>
      <h2 id="mnDrawerTitle">Join a Ministry</h2>
      <p class="mn-text">Pick the ministry you would like to be part of and share your details. The church team will reach out to you by phone. Not sure yet? Close this panel and browse the cards to learn more.</p>
    </div>`;

  /* ---------- rendering ---------- */
  function filtered() {
    const query = state.query.trim().toLowerCase();
    return state.all.filter(m => (state.group === 'all' || m.group === state.group) &&
      (!query || [m.name, m.mission, m.vision, m.motto, m.summary, GROUPS[m.group].label].join(' ').toLowerCase().includes(query)));
  }

  function renderTabs() {
    const box = $('#mnTabs');
    const counts = { all: state.all.length };
    state.all.forEach(m => { counts[m.group] = (counts[m.group] || 0) + 1; });
    box.innerHTML = Object.keys(GROUPS).map(key =>
      `<button class="mn-tab" type="button" data-group="${key}" aria-pressed="${state.group === key}">${esc(GROUPS[key].label)} <span class="mn-tab-count">${counts[key] || 0}</span></button>`).join('');
  }

  function renderGrid() {
    const list = filtered();
    const grid = $('#ministryGrid');
    $('#mnStatus').textContent = list.length === state.all.length ? '' : `Showing ${list.length} of ${state.all.length} ministries`;
    const count = $('#mnCount');
    if (count) count.textContent = state.all.length;
    if (!list.length) {
      grid.innerHTML = '<div class="mn-empty"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><h3>No ministries match your search</h3><p>Try another word, or show all ministries.</p><button class="mn-btn mn-btn-brand" type="button" data-clear>Show all ministries</button></div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    list.forEach((m, i) => {
      const card = document.createElement('article');
      card.className = 'mn-card';
      card.dataset.id = m.id;
      card.dataset.group = m.group;
      card.style.setProperty('--i', String(Math.min(i, 12)));
      card.innerHTML = cardHTML(m);
      fragment.appendChild(card);
    });
    grid.replaceChildren(fragment);
  }

  function refresh() {
    state.all = buildList(state.seed, state.cms, ($('#ministryGrid').dataset.source || 'merge'));
    syncSelect();
    renderTabs();
    renderGrid();
    if (location.hash && !state.current) openFromHash();
  }

  /* the select inside the form keeps its original values; new ministries are added */
  function syncSelect() {
    const select = $('#ministry');
    if (!select) return;
    const have = new Set([...select.options].map(o => o.value));
    state.all.forEach(m => {
      const value = m.joinValue || m.name;
      if (!have.has(value)) { select.appendChild(new Option(m.name, value)); have.add(value); }
    });
  }

  /* ---------- drawer ---------- */
  const focusable = root => $$('a[href],button:not([disabled]),input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])', root).filter(el => el.offsetParent !== null);

  function openDrawer(ministry, { updateHash = true } = {}) {
    const drawer = $('#mnDrawer');
    state.lastFocus = document.activeElement;
    state.current = ministry;
    const select = $('#ministry');
    const row = $('#mnSelectRow');
    const intro = $('#mnJoinIntro');
    $('#mnDetail').innerHTML = ministry ? detailHTML(ministry) : genericDetailHTML();
    if (ministry) {
      const value = ministry.joinValue || ministry.name;
      if (![...select.options].some(o => o.value === value)) select.appendChild(new Option(ministry.name, value));
      select.value = value;
      row.hidden = true;
      intro.textContent = `Interested in ${ministry.name}? Leave your details and the team will call you.`;
    } else {
      select.value = '';
      row.hidden = false;
      intro.textContent = 'Choose a ministry and leave your details. The team will call you.';
    }
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-lock');
    $('#mnScroll').scrollTop = 0;
    if (updateHash && ministry) history.replaceState(null, '', `#${encodeURIComponent(ministry.id)}`);
    $('#mnClose').focus();
  }

  function closeDrawer({ clearHash = true } = {}) {
    const drawer = $('#mnDrawer');
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-lock');
    if (clearHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
    state.current = null;
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
  }

  function jumpToForm() {
    const card = $('#mnJoin');
    card.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { const first = $('#name'); if (first) first.focus({ preventScroll: true }); }, reduceMotion() ? 0 : 450);
  }

  function openFromHash() {
    const key = decodeURIComponent(location.hash.slice(1));
    if (!key || key === 'main' || key === 'ministries') return;
    const match = state.all.find(m => m.id === key || slugOf(m.name) === key);
    if (match) openDrawer(match, { updateHash: false });
  }

  function scrollToServiceTimes() {
    const target = $('#service-times') || $('.footer-services') || $('[data-service-times]');
    if (!target) { location.href = '/index.html#events'; return; }
    target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    target.classList.remove('mn-pulse');
    void target.offsetWidth;
    target.classList.add('mn-pulse');
  }

  /* ---------- events ---------- */
  function bind() {
    $('#mnTabs').addEventListener('click', event => {
      const tab = event.target.closest('[data-group]');
      if (!tab) return;
      state.group = tab.dataset.group;
      renderTabs();
      renderGrid();
    });
    let timer;
    const searchInput = $('#mnSearch');
    const clearBtn = $('#mnSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', event => {
        clearTimeout(timer);
        if (clearBtn) clearBtn.hidden = !event.target.value;
        timer = setTimeout(() => { state.query = event.target.value; renderGrid(); }, 150);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        clearBtn.hidden = true;
        state.query = '';
        renderGrid();
      });
    }
    $('#ministryGrid').addEventListener('click', event => {
      if (event.target.closest('[data-clear]')) {
        state.group = 'all';
        state.query = '';
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.hidden = true;
        renderTabs();
        renderGrid();
        return;
      }
      const card = event.target.closest('.mn-card');
      if (!card) return;
      const ministry = state.all.find(m => m.id === card.dataset.id);
      if (!ministry) return;
      const wantsForm = event.target.closest('[data-join-ministry]');
      openDrawer(ministry);
      if (wantsForm) setTimeout(jumpToForm, 380);
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-mn-join]')) { openDrawer(null); return; }
      if (event.target.closest('[data-mn-times]')) { event.preventDefault(); scrollToServiceTimes(); return; }
      if (event.target.closest('[data-mn-close]')) { closeDrawer(); return; }
      if (event.target.closest('[data-jump-form]')) jumpToForm();
    });
    document.addEventListener('keydown', event => {
      const drawer = $('#mnDrawer');
      if (!drawer.classList.contains('open')) return;
      if (event.key === 'Escape') { closeDrawer(); return; }
      if (event.key === 'Tab') {
        const items = focusable($('.mn-panel'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('hashchange', () => { if (!location.hash) closeDrawer({ clearHash: false }); else openFromHash(); });
    window.addEventListener('aic:content-updated', async event => {
      if (event.detail && event.detail.type === 'ministries') { state.cms = await loadCms(); refresh(); }
    });
  }

  async function init() {
    state.seed = readSeed();
    // the baptism year limit in the form should not be stuck in the past
    const baptism = $('#baptismYear');
    if (baptism) baptism.max = String(new Date().getFullYear());
    bind();
    refresh();                       // shows the built-in list immediately
    state.cms = await loadCms();     // then adds anything published in Contentful
    if (state.cms.length) refresh();
  }

  window.AICMinistries = { buildList, fromCms, groupFor, splitTimes, keyOf, cardHTML, detailHTML };
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})();