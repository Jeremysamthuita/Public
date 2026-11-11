/* =====================================================
   AIC EGERTON CHAPEL: PROJECTS & DEVELOPMENT HUB
   Reads published "project" entries from Contentful
   using the site's shared settings (site-config.js).
===================================================== */
(() => {
  'use strict';

  const CACHE_KEY = 'aic-projects-v1';
  const STATUS_ORDER = ['ongoing', 'proposed', 'on-hold', 'completed'];
  const STATUS_LABEL = { ongoing: 'Ongoing', proposed: 'Proposed', 'on-hold': 'On hold', completed: 'Completed' };
  const CATEGORIES = {
    infrastructure: { label: 'Infrastructure', icon: 'fa-building' },
    education: { label: 'Education', icon: 'fa-graduation-cap' },
    community: { label: 'Community', icon: 'fa-users' },
    outreach: { label: 'Outreach', icon: 'fa-hand-holding-heart' },
    environment: { label: 'Environment', icon: 'fa-leaf' },
    other: { label: 'Other', icon: 'fa-star' }
  };

  const state = { all: [], status: 'all', category: 'all', query: '', sort: 'featured', lastFocus: null, lightbox: { images: [], index: 0 } };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- small helpers ---------- */
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  const text = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);
  const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

  function money(value) {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(number(value));
  }

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function fmtDate(value, fallback = 'To be confirmed') {
    const date = parseDate(value);
    return date ? date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : fallback;
  }

  // Only allow safe link types. mailto: and tel: are accepted when opts.contact is true.
  function safeUrl(value, opts = {}) {
    const raw = text(value);
    if (!raw) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    try {
      const url = new URL(raw);
      const allowed = ['https:', 'http:'].concat(opts.contact ? ['mailto:', 'tel:'] : []);
      return allowed.includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function jsonList(value) {
    if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
    if (value && Array.isArray(value.items)) return value.items.filter(item => item && typeof item === 'object');
    if (value && typeof value === 'object' && Object.keys(value).length) return [value];
    return [];
  }

  function imageUrl(url, width) {
    if (!url) return '';
    return /\.ctfassets\.net/.test(url) ? `${url}?w=${width}&fm=webp&q=75` : url;
  }

  function categoryMeta(key) { return CATEGORIES[key] || { label: text(key, 'Other') || 'Other', icon: 'fa-star' }; }
  const percentComplete = p => (p.status === 'completed' ? 100 : p.progress);
  const fundingPercent = p => (p.budget > 0 ? Math.min(100, Math.round((p.received / p.budget) * 100)) : null);

  /* ---------- Contentful ---------- */
  function resolveAsset(link, assets) {
    const asset = assets.get(link?.sys?.id);
    const file = asset?.fields?.file;
    if (!file?.url || !String(file.contentType || '').startsWith('image/')) return null;
    return {
      url: file.url.startsWith('//') ? `https:${file.url}` : file.url,
      title: text(asset.fields.title),
      description: text(asset.fields.description)
    };
  }

  function normalizeProject(item, assets) {
    const f = item.fields || {};
    const title = text(f.title);
    if (!title) return null;
    const status = text(f.status, 'proposed').toLowerCase();
    if (!STATUS_ORDER.includes(status)) return null;
    const cover = resolveAsset(f.coverImage, assets);
    const gallery = (Array.isArray(f.gallery) ? f.gallery : []).map(link => resolveAsset(link, assets)).filter(Boolean);
    return {
      id: item.sys?.id || title,
      updatedAt: item.sys?.updatedAt || '',
      title,
      slug: text(f.slug),
      summary: text(f.summary),
      description: text(f.description),
      status,
      category: text(f.category, 'other').toLowerCase(),
      budget: Math.max(0, number(f.estimatedBudget)),
      received: Math.max(0, number(f.fundsReceived)),
      progress: Math.max(0, Math.min(100, Math.round(number(f.progress)))),
      startDate: f.startDate || '',
      completionDate: f.expectedCompletion || '',
      featured: f.featured === true,
      cover: cover ? cover.url : '',
      gallery,
      supportUrl: text(f.supportUrl),
      supportDescription: text(f.supportDescription),
      stakeholders: jsonList(f.stakeholders),
      milestones: jsonList(f.milestones),
      updates: jsonList(f.updates),
      reports: jsonList(f.reports)
    };
  }

  async function fetchProjects() {
    const c = (window.AIC_SITE_CONFIG || {}).contentful || {};
    if (!c.spaceId || !c.environment || !c.deliveryToken) throw new Error('Contentful is not configured.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const items = [];
      const assets = new Map();
      let total = Infinity;
      let skip = 0;
      while (skip < total) {
        const params = new URLSearchParams({
          access_token: c.deliveryToken, content_type: 'project', include: '2', limit: '100', skip: String(skip)
        });
        const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(c.spaceId)}/environments/${encodeURIComponent(c.environment)}/entries?${params}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Contentful returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error('Contentful returned an invalid response.');
        items.push(...data.items);
        for (const asset of data.includes?.Asset || []) assets.set(asset.sys.id, asset);
        total = Number(data.total) || items.length;
        skip += data.items.length;
        if (!data.items.length) break;
      }
      return items.map(item => normalizeProject(item, assets)).filter(Boolean);
    } finally { clearTimeout(timer); }
  }

  const loadCache = () => {
    try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return Array.isArray(saved?.items) ? saved.items : []; }
    catch { return []; }
  };
  const saveCache = items => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch { /* storage may be unavailable */ } };

  /* ---------- filtering and sorting ---------- */
  function filterProjects(list, f) {
    const query = f.query.trim().toLowerCase();
    const result = list.filter(p => {
      if (f.status !== 'all' && p.status !== f.status) return false;
      if (f.category !== 'all' && p.category !== f.category) return false;
      if (!query) return true;
      const haystack = [p.title, p.summary, p.description, categoryMeta(p.category).label, ...p.stakeholders.map(s => s.name)].join(' ').toLowerCase();
      return haystack.includes(query);
    });
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const sorters = {
      featured: (a, b) => (b.featured - a.featured) || (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) || byTitle(a, b),
      newest: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
      progress: (a, b) => percentComplete(b) - percentComplete(a) || byTitle(a, b),
      name: byTitle
    };
    return result.sort(sorters[f.sort] || sorters.featured);
  }

  /* ---------- HTML builders (pure, escaped) ---------- */
  function supportLink(p) {
    const direct = safeUrl(p.supportUrl, { contact: true });
    if (direct) return { href: direct, external: /^https?:/.test(direct) };
    const phone = (window.AIC_SITE_CONFIG || {}).whatsappNumber;
    if (!phone) return { href: '/contact.html', external: false };
    const message = `Hello AIC Egerton Chapel, I would like to support the "${p.title}" project. Please share how I can help.`;
    return { href: `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`, external: true };
  }
  const linkAttrs = link => (link.external ? ' target="_blank" rel="noopener noreferrer"' : '');

  function cardHTML(p) {
    const cat = categoryMeta(p.category);
    const pct = percentComplete(p);
    const media = p.cover
      ? `<img src="${esc(imageUrl(p.cover, 800))}" alt="" loading="lazy" decoding="async">`
      : `<div class="pj-ph" aria-hidden="true"><i class="fas ${cat.icon}"></i></div>`;
    const support = p.status === 'completed' ? '' : (() => {
      const link = supportLink(p);
      return `<a class="pj-btn pj-btn-primary pj-btn-sm" href="${esc(link.href)}"${linkAttrs(link)}><i class="fas fa-heart" aria-hidden="true"></i> Support</a>`;
    })();
    return `
      <div class="pj-card-media">${media}${p.featured ? '<span class="pj-ribbon"><i class="fas fa-star" aria-hidden="true"></i> Featured</span>' : ''}</div>
      <div class="pj-card-body">
        <div class="pj-card-top">
          <span class="pj-badge st-${esc(p.status)}">${esc(STATUS_LABEL[p.status])}</span>
          <span class="pj-cat"><i class="fas ${cat.icon}" aria-hidden="true"></i>${esc(cat.label)}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="pj-summary">${esc(p.summary || p.description)}</p>
        <div class="pj-progress">
          <div class="pj-progress-head"><span>Implementation progress</span><span>${pct}%</span></div>
          <div class="pj-track" role="progressbar" aria-label="${esc(p.title)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="pj-fill${p.status === 'completed' ? ' is-done' : ''}" data-pct="${pct}"></div></div>
        </div>
        <div class="pj-meta">
          <div><small>Estimated cost</small><strong>${p.budget > 0 ? esc(money(p.budget)) : 'To be confirmed'}</strong></div>
          <div><small>${p.status === 'completed' ? 'Completed' : 'Expected completion'}</small><strong>${esc(fmtDate(p.completionDate))}</strong></div>
        </div>
        <div class="pj-card-actions">
          <button class="pj-btn pj-btn-outline pj-btn-sm" type="button" data-open="${esc(p.id)}">View details</button>
          ${support}
        </div>
      </div>`;
  }

  function milestoneState(status) {
    const s = text(status).toLowerCase();
    if (/complete|done|finish/.test(s)) return { cls: 'done', icon: 'fa-check', label: 'Completed' };
    if (/progress|ongoing|current|start|underway/.test(s)) return { cls: 'active', icon: 'fa-play', label: 'In progress' };
    return { cls: 'planned', icon: 'fa-hourglass-half', label: 'Planned' };
  }

  function modalHTML(p) {
    const cat = categoryMeta(p.category);
    const pct = percentComplete(p);
    const fund = fundingPercent(p);
    const gap = Math.max(0, p.budget - p.received);
    const link = supportLink(p);
    const milestones = p.milestones.map(m => {
      const st = milestoneState(m.status);
      return `<li class="${st.cls}"><span class="pj-dot"><i class="fas ${st.icon}" aria-hidden="true"></i></span><strong>${esc(text(m.title, 'Milestone'))}</strong>${m.description ? `<p>${esc(m.description)}</p>` : ''}<small>${esc(st.label)}${parseDate(m.date) ? ` · ${esc(fmtDate(m.date))}` : ''}</small></li>`;
    }).join('');
    const updates = [...p.updates].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(u =>
      `<li class="done"><span class="pj-dot"><i class="fas fa-bullhorn" aria-hidden="true"></i></span><strong>${esc(text(u.title, 'Update'))}</strong><p>${esc(u.description || u.body || u.text || u.message || '')}</p>${parseDate(u.date) ? `<small>${esc(fmtDate(u.date))}</small>` : ''}</li>`).join('');
    const people = p.stakeholders.map(s => {
      const name = text(s.name);
      if (!name) return '';
      const role = [s.role || s.position, s.organisation || s.organization].filter(Boolean).join(', ');
      return `<li><strong>${esc(name)}</strong>${role ? esc(role) : ''}</li>`;
    }).join('');
    const reports = p.reports.map(r => {
      const url = safeUrl(r.url);
      if (!url) return '';
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-lines" aria-hidden="true"></i>${esc(text(r.title, 'View report'))}${parseDate(r.date) ? `<small>${esc(fmtDate(r.date))}</small>` : ''}</a></li>`;
    }).join('');
    const gallery = p.gallery.map((img, i) =>
      `<button type="button" data-lightbox="${i}" aria-label="Open photo ${i + 1} of ${p.gallery.length}"><img src="${esc(imageUrl(img.url, 500))}" alt="${esc(img.description || img.title || `${p.title} photo ${i + 1}`)}" loading="lazy" decoding="async"></button>`).join('');
    const cover = p.cover
      ? `<img class="pj-cover" src="${esc(imageUrl(p.cover, 1400))}" alt="">`
      : `<div class="pj-cover-ph" aria-hidden="true"><i class="fas ${cat.icon}"></i></div>`;

    return `${cover}
      <div class="pj-modal-body">
        <div class="pj-card-top"><span class="pj-badge st-${esc(p.status)}">${esc(STATUS_LABEL[p.status])}</span><span class="pj-cat"><i class="fas ${cat.icon}" aria-hidden="true"></i>${esc(cat.label)}</span></div>
        <h2 id="modal-title">${esc(p.title)}</h2>
        ${p.summary ? `<p class="pj-lead">${esc(p.summary)}</p>` : ''}
        ${p.description ? `<p class="pj-text">${esc(p.description)}</p>` : ''}

        <section class="pj-block"><h3><i class="fas fa-chart-line" aria-hidden="true"></i>Project overview</h3>
          <div class="pj-tiles">
            <div class="pj-tile"><small>Estimated budget</small><strong>${p.budget > 0 ? esc(money(p.budget)) : 'To be confirmed'}</strong></div>
            <div class="pj-tile"><small>Progress</small><strong>${pct}%</strong></div>
            <div class="pj-tile"><small>Start date</small><strong>${esc(fmtDate(p.startDate))}</strong></div>
            <div class="pj-tile"><small>Expected completion</small><strong>${esc(fmtDate(p.completionDate))}</strong></div>
          </div>
        </section>

        <section class="pj-block"><h3><i class="fas fa-hand-holding-dollar" aria-hidden="true"></i>Funding</h3>
          ${p.budget > 0 ? `<div class="pj-funds">
            <div class="pj-funds-row"><span>Received: <strong>${esc(money(p.received))}</strong></span><span>Still needed: <strong>${esc(money(gap))}</strong></span></div>
            <div class="pj-track" role="progressbar" aria-label="Funding progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fund}"><div class="pj-fill is-funds" data-pct="${fund}"></div></div>
            <p class="pj-note">${fund}% of the estimated budget has been received. Figures reflect the latest published information.</p></div>`
            : '<p class="pj-empty-line">Funding details will be published once the budget is approved.</p>'}
        </section>

        <section class="pj-block"><h3><i class="fas fa-list-check" aria-hidden="true"></i>Milestones</h3>
          ${milestones ? `<ol class="pj-timeline">${milestones}</ol>` : '<p class="pj-empty-line">Milestones will be published soon.</p>'}
        </section>

        <section class="pj-block"><h3><i class="fas fa-bullhorn" aria-hidden="true"></i>Latest updates</h3>
          ${updates ? `<ol class="pj-timeline">${updates}</ol>` : '<p class="pj-empty-line">No updates have been published yet.</p>'}
        </section>

        ${people ? `<section class="pj-block"><h3><i class="fas fa-people-group" aria-hidden="true"></i>Stakeholders</h3><ul class="pj-people">${people}</ul></section>` : ''}
        ${gallery ? `<section class="pj-block"><h3><i class="fas fa-images" aria-hidden="true"></i>Gallery</h3><div class="pj-gallery">${gallery}</div></section>` : ''}
        ${reports ? `<section class="pj-block"><h3><i class="fas fa-folder-open" aria-hidden="true"></i>Reports and documents</h3><ul class="pj-docs">${reports}</ul></section>` : ''}

        ${p.status === 'completed' ? '' : `<section class="pj-support"><h3><i class="fas fa-heart" aria-hidden="true"></i>Support this project</h3>
          <p class="pj-text">${esc(p.supportDescription || 'Your giving, prayers and participation help make this project possible.')}</p>
          <div class="pj-hero-actions"><a class="pj-btn pj-btn-primary" href="${esc(link.href)}"${linkAttrs(link)}>Support this project</a><a class="pj-btn pj-btn-outline" href="/give.html">Ways to give</a></div></section>`}
      </div>`;
  }

  /* ---------- rendering ---------- */
  function setBusy(isBusy) { const grid = $('#project-grid'); if (grid) grid.setAttribute('aria-busy', String(isBusy)); }

  function animateBars(root) {
    $$('.pj-fill[data-pct]', root).forEach(bar => {
      const pct = bar.dataset.pct;
      if (reduceMotion()) bar.style.width = `${pct}%`;
      else requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
    });
  }

  function countUp(el, target) {
    if (!el) return;
    if (reduceMotion() || target < 2) { el.textContent = target; return; }
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / 700);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderStats() {
    const count = status => state.all.filter(p => p.status === status).length;
    countUp($('#total-projects'), state.all.length);
    countUp($('#ongoing-projects'), count('ongoing'));
    countUp($('#proposed-projects'), count('proposed'));
    countUp($('#completed-projects'), count('completed'));
    const funds = state.all.reduce((sum, p) => sum + p.received, 0);
    const box = $('#stat-funds');
    if (box) { box.hidden = funds <= 0; $('#funds-received').textContent = money(funds); }
    $$('[data-count]').forEach(el => {
      const key = el.dataset.count;
      el.textContent = key === 'all' ? state.all.length : count(key);
    });
  }

  function showState(kind) {
    const empty = $('#project-empty');
    const error = $('#project-error');
    const grid = $('#project-grid');
    empty.hidden = kind !== 'empty' && kind !== 'nomatch';
    error.hidden = kind !== 'error';
    grid.hidden = kind === 'empty' || kind === 'error' || kind === 'nomatch';
    if (kind === 'empty') {
      empty.innerHTML = '<i class="fas fa-helmet-safety" aria-hidden="true"></i><h3>Projects will be published soon</h3><p>We are preparing our project updates. Please check back shortly.</p><a class="pj-btn pj-btn-primary" href="/contact.html">Contact the church</a>';
    } else if (kind === 'nomatch') {
      empty.innerHTML = '<i class="fas fa-magnifying-glass" aria-hidden="true"></i><h3>No projects match your search</h3><p>Try a different word, or clear the filters to see every project.</p><button class="pj-btn pj-btn-primary" type="button" data-clear>Clear filters</button>';
    }
  }

  function renderGrid() {
    const filters = { status: state.status, category: state.category, query: state.query, sort: state.sort };
    const list = filterProjects(state.all, filters);
    const grid = $('#project-grid');
    const active = state.status !== 'all' || state.category !== 'all' || state.query.trim();
    $('#clear-filters').hidden = !active;
    $('#results-count').textContent = state.all.length
      ? `Showing ${list.length} of ${state.all.length} project${state.all.length === 1 ? '' : 's'}`
      : '';
    setBusy(false);
    if (!state.all.length) { showState('empty'); return; }
    if (!list.length) { showState('nomatch'); return; }
    showState('grid');
    const fragment = document.createDocumentFragment();
    list.forEach((p, index) => {
      const card = document.createElement('article');
      card.className = 'pj-card';
      card.dataset.id = p.id;
      card.innerHTML = cardHTML(p);
      fragment.appendChild(card);
    });
    grid.replaceChildren(fragment);
    animateBars(grid);
  }

  function setProjects(list) {
    state.all = list;
    renderStats();
    renderGrid();
  }

  /* ---------- modal ---------- */
  const focusable = root => $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', root).filter(el => el.offsetParent !== null);

  function toast(message) {
    const el = $('#pj-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function openProject(project, { updateHash = true } = {}) {
    const modal = $('#project-modal');
    state.lastFocus = document.activeElement;
    state.current = project;
    $('#modal-content').innerHTML = modalHTML(project);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pj-lock');
    $('#project-modal .pj-dialog').scrollTop = 0;
    animateBars(modal);
    const target = project.slug || project.id;
    if (updateHash && target) history.replaceState(null, '', `#${encodeURIComponent(target)}`);
    $('#pj-close').focus();
  }

  function closeProject({ clearHash = true } = {}) {
    const modal = $('#project-modal');
    if (!modal.classList.contains('open')) return;
    closeLightbox();
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pj-lock');
    if (clearHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
    state.current = null;
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
  }

  function openFromHash() {
    const key = decodeURIComponent(location.hash.slice(1));
    if (!key || key === 'main' || key === 'projects') return;
    const project = state.all.find(p => p.slug === key || p.id === key);
    if (project) openProject(project, { updateHash: false });
  }

  async function shareProject() {
    const p = state.current;
    if (!p) return;
    const url = `${location.origin}${location.pathname}#${encodeURIComponent(p.slug || p.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: p.title, text: p.summary, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch { toast('Copy this page address to share'); }
  }

  /* ---------- lightbox ---------- */
  function showLightbox(index) {
    const images = state.lightbox.images;
    if (!images.length) return;
    state.lightbox.index = (index + images.length) % images.length;
    const image = images[state.lightbox.index];
    $('#pj-lb-img').src = imageUrl(image.url, 1600);
    $('#pj-lb-img').alt = image.description || image.title || 'Project photo';
    $('#pj-lb-caption').textContent = `${state.lightbox.index + 1} of ${images.length}${image.description ? ` · ${image.description}` : ''}`;
    $('#pj-lightbox').classList.add('open');
    $('#pj-lb-close').focus();
  }
  function closeLightbox() {
    const box = $('#pj-lightbox');
    if (!box || !box.classList.contains('open')) return false;
    box.classList.remove('open');
    return true;
  }

  /* ---------- page wiring ---------- */
  function bindToolbar() {
    let timer;
    $('#project-search').addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = event.target.value; renderGrid(); }, 160);
    });
    $('#project-category').addEventListener('change', event => { state.category = event.target.value; renderGrid(); });
    $('#project-sort').addEventListener('change', event => { state.sort = event.target.value; renderGrid(); });
    $('#status-chips').addEventListener('click', event => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      state.status = chip.dataset.filter;
      $$('#status-chips [data-filter]').forEach(btn => btn.setAttribute('aria-pressed', String(btn === chip)));
      renderGrid();
    });
    const clear = () => {
      state.status = 'all'; state.category = 'all'; state.query = ''; state.sort = 'featured';
      $('#project-search').value = ''; $('#project-category').value = 'all'; $('#project-sort').value = 'featured';
      $$('#status-chips [data-filter]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === 'all')));
      renderGrid();
    };
    $('#clear-filters').addEventListener('click', clear);
    $('#project-empty').addEventListener('click', event => { if (event.target.closest('[data-clear]')) clear(); });
    $('#project-grid').addEventListener('click', event => {
      const opener = event.target.closest('[data-open]');
      if (!opener) return;
      const project = state.all.find(p => p.id === opener.dataset.open);
      if (project) openProject(project);
    });
    $('#retry-projects').addEventListener('click', load);
  }

  function bindModal() {
    const modal = $('#project-modal');
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-close-modal]')) closeProject();
      if (event.target.closest('#pj-share')) shareProject();
      const thumb = event.target.closest('[data-lightbox]');
      if (thumb && state.current) {
        state.lightbox.images = state.current.gallery;
        showLightbox(Number(thumb.dataset.lightbox));
      }
    });
    const box = $('#pj-lightbox');
    box.addEventListener('click', event => {
      if (event.target === box || event.target.closest('#pj-lb-close')) closeLightbox();
      else if (event.target.closest('#pj-lb-prev')) showLightbox(state.lightbox.index - 1);
      else if (event.target.closest('#pj-lb-next')) showLightbox(state.lightbox.index + 1);
    });
    document.addEventListener('keydown', event => {
      const lightboxOpen = box.classList.contains('open');
      if (event.key === 'Escape') {
        if (lightboxOpen) { closeLightbox(); $('#pj-close').focus(); }
        else closeProject();
        return;
      }
      if (lightboxOpen) {
        if (event.key === 'ArrowLeft') showLightbox(state.lightbox.index - 1);
        if (event.key === 'ArrowRight') showLightbox(state.lightbox.index + 1);
        return;
      }
      if (event.key === 'Tab' && modal.classList.contains('open')) {
        const items = focusable(modal.querySelector('.pj-dialog'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('hashchange', () => {
      if (!location.hash) closeProject({ clearHash: false });
      else openFromHash();
    });
  }

  // Mobile menu: one reliable handler so the menu button works on this page.
  function setupMenu() {
    const toggle = $('#menuToggle');
    const links = $('#navLinks');
    if (!toggle || !links) return;
    const set = open => {
      links.classList.toggle('active', open);
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    };
    document.addEventListener('click', event => {
      if (event.target.closest('#menuToggle')) { event.stopImmediatePropagation(); set(!links.classList.contains('active')); return; }
      if (links.classList.contains('active') && (event.target.closest('#navLinks a') || !event.target.closest('nav'))) set(false);
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && links.classList.contains('active')) set(false); });
  }

  function markCurrentNav() {
    $$('#navLinks a').forEach(a => {
      if (/\/projects\.html$/.test(a.getAttribute('href') || '')) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
    });
  }

  function notice(message) {
    const el = $('#project-notice');
    el.textContent = message || '';
    el.hidden = !message;
  }

  async function load() {
    setBusy(true);
    $('#project-error').hidden = true;
    try {
      const fresh = await fetchProjects();
      const changed = JSON.stringify(fresh) !== JSON.stringify(state.all);
      saveCache(fresh);
      notice('');
      if (changed || !state.all.length) setProjects(fresh);
      else setBusy(false);
      if (location.hash) openFromHash();
    } catch (error) {
      console.error('[projects] Could not load projects.', error);
      setBusy(false);
      if (state.all.length) notice('We could not refresh the latest information, so you are seeing saved details.');
      else showState('error');
    }
  }

  function init() {
    setupMenu();
    markCurrentNav();
    bindToolbar();
    bindModal();
    const cached = loadCache();
    if (cached.length) setProjects(cached);
    load();
  }

  window.AICProjects = { normalizeProject, filterProjects, cardHTML, modalHTML, safeUrl, supportLink, fmtDate, money, jsonList, milestoneState };
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})();