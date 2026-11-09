import {getContent, getContentSource} from './content-service.js';

const config = () => window.AIC_SITE_CONFIG || {};

function text(tag, value, className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value || '';
  return element;
}

function image(url, alt, className = '') {
  if (!url) return null;
  const element = document.createElement('img');
  element.src = url;
  element.alt = alt || '';
  element.loading = 'lazy';
  element.decoding = 'async';
  if (className) element.className = className;
  return element;
}

function sourceBadge(type) {
  if (new URLSearchParams(location.search).get('debugContent') !== '1') return null;
  const badge = text('span', getContentSource(type) || 'unknown', 'cms-source-badge');
  badge.setAttribute('aria-label', `Content source: ${badge.textContent}`);
  return badge;
}

function renderAnnouncement(items) {
  let region = document.body.querySelector('[data-cms-announcements]');
  if (!items.length) {
    region?.announcementCleanup?.();
    region?.remove();
    document.body.classList.remove('has-cms-announcements');
    return;
  }
  try {
    if (sessionStorage.getItem('aic-announcements-dismissed') === 'true') {
      region?.announcementCleanup?.();
      region?.remove();
      document.body.classList.remove('has-cms-announcements');
      return;
    }
  } catch { /* dismissal is optional when storage is unavailable */ }
  if (!region) {
    region = document.createElement('section');
    // Hide while building — prevents flash of bare unstyled element.
    // The attribute is removed synchronously after replaceChildren() below.
    region.setAttribute('data-loading', '');
    document.body.appendChild(region);
  }
  region.announcementCleanup?.();
  region.className = 'cms-announcements';
  region.dataset.cmsAnnouncements = '';
  region.setAttribute('aria-label', 'Church announcements');
  region.setAttribute('role', 'region');

  const badge = text('span', 'Announcement', 'cms-announcements__badge');
  const close = document.createElement('button');
  close.className = 'cms-announcements__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss announcements');
  close.textContent = '×';

  const viewport = document.createElement('div');
  viewport.className = 'cms-announcements__viewport';
  const slide = document.createElement('article');
  slide.className = 'cms-announcement';
  const message = text('p', '', 'cms-announcement__text');
  slide.appendChild(message);
  viewport.appendChild(slide);

  const footer = document.createElement('div');
  footer.className = 'cms-announcements__footer';
  const link = document.createElement('a');
  link.className = 'cms-announcement__link';
  link.hidden = true;
  const controls = document.createElement('div');
  controls.className = 'cms-announcements__controls';
  const previous = document.createElement('button');
  previous.className = 'cms-announcements__nav';
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Previous announcement');
  previous.textContent = '‹';
  const position = text('span', '', 'cms-announcements__position');
  position.setAttribute('aria-live', 'off');
  const next = document.createElement('button');
  next.className = 'cms-announcements__nav';
  next.type = 'button';
  next.setAttribute('aria-label', 'Next announcement');
  next.textContent = '›';
  controls.append(previous, position, next);
  footer.append(link, controls);

  let currentIndex = 0;
  let animationTimer;
  let animationTimeout;
  const showAnnouncement = (index, animate = true) => {
    currentIndex = (index + items.length) % items.length;
    const item = items[currentIndex];
    window.clearTimeout(animationTimeout);
    if (animate) slide.classList.add('is-changing');
    animationTimeout = window.setTimeout(() => {
      message.textContent = item.text || '';
      slide.className = `cms-announcement cms-announcement--${item.severity || 'info'}`;
      position.textContent = `${currentIndex + 1} / ${items.length}`;
      const safeUrl = safeAnnouncementUrl(item.linkUrl);
      if (safeUrl) {
        link.href = safeUrl;
        link.textContent = item.linkLabel || 'Learn more';
        link.hidden = false;
        if (new URL(safeUrl).origin !== location.origin) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } else {
          link.removeAttribute('target');
          link.removeAttribute('rel');
        }
      } else {
        link.hidden = true;
        link.removeAttribute('href');
      }
    }, animate ? 150 : 0);
  };
  const stopAutoplay = () => window.clearInterval(animationTimer);
  const startAutoplay = () => {
    stopAutoplay();
    if (items.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationTimer = window.setInterval(() => showAnnouncement(currentIndex + 1), 8000);
    }
  };

  previous.addEventListener('click', () => showAnnouncement(currentIndex - 1));
  next.addEventListener('click', () => showAnnouncement(currentIndex + 1));
  if (items.length < 2) controls.hidden = true;
  region.addEventListener('pointerenter', stopAutoplay);
  region.addEventListener('pointerleave', startAutoplay);
  region.addEventListener('focusin', stopAutoplay);
  region.addEventListener('focusout', event => {
    if (!region.contains(event.relatedTarget)) startAutoplay();
  });
  close.addEventListener('click', () => {
    stopAutoplay();
    window.clearTimeout(animationTimeout);
    try { sessionStorage.setItem('aic-announcements-dismissed', 'true'); } catch { /* dismissal lasts for this page only */ }
    region.remove();
    document.body.classList.remove('has-cms-announcements');
  });

  region.replaceChildren(badge, close, viewport, footer);
  // All children are in place — reveal the card in one paint.
  region.removeAttribute('data-loading');
  showAnnouncement(0, false);
  startAutoplay();
  region.announcementCleanup = () => {
    stopAutoplay();
    window.clearTimeout(animationTimeout);
  };
  const source = sourceBadge('announcements');
  if (source) footer.appendChild(source);
  document.body.classList.add('has-cms-announcements');
}

function safeAnnouncementUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderServiceTimes(items) {
  const target = document.querySelector('[data-service-times]');
  if (!target) return;
  if (!items.length) return;
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement('p');
    row.appendChild(text('strong', item.day || item.label));
    const detail = document.createElement('span');
    const name = item.label && item.label !== item.day ? `${item.label} — ` : '';
    const time = [item.start, item.end].filter(Boolean).join(' – ');
    detail.textContent = `${name}${time}${time ? ' EAT' : ''}${item.isLive ? ' · Live' : ''}`;
    row.append(document.createElement('br'), detail);
    fragment.appendChild(row);
  }
  const badge = sourceBadge('service_times');
  if (badge) fragment.appendChild(badge);
  target.replaceChildren(fragment);
}

function ministryCard(item) {
  const card = document.createElement('article');
  card.className = 'ministry';
  const photo = image(item.imageUrl, item.name ? `${item.name} ministry` : 'Ministry');
  if (photo) photo.className = 'ministry-img';
  else {
    const fallback = text('div', 'Photo unavailable', 'ministry-photo-placeholder');
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', `${item.name || 'Ministry'} photo unavailable`);
    card.appendChild(fallback);
  }
  if (photo) card.appendChild(photo);
  card.appendChild(text('h2', item.name));
  if (item.description) card.appendChild(text('p', item.description));
  if (item.category) {
    const category = document.createElement('p');
    category.append(text('strong', 'Category: '), document.createTextNode(item.category));
    card.appendChild(category);
  }
  if (item.leader) {
    const leader = document.createElement('p');
    leader.append(text('strong', 'Leader: '), document.createTextNode(item.leader));
    card.appendChild(leader);
  }
  if (item.contact) card.appendChild(text('p', `Contact: ${item.contact}`));
  if (item.joiningInformation) {
    const joining = document.createElement('p');
    joining.append(text('strong', 'How to join: '), document.createTextNode(item.joiningInformation));
    card.appendChild(joining);
  }
  if (item.meetingTime) {
    const schedule = document.createElement('p');
    schedule.append(text('strong', 'Meeting time: '), document.createTextNode(item.meetingTime));
    card.appendChild(schedule);
  }
  const badge = sourceBadge('ministries');
  if (badge) card.appendChild(badge);
  return card;
}

function renderMinistries(items) {
  const target = document.querySelector('.ministries-container');
  if (!target) return;
  if (!items.length) return;
  target.replaceChildren(...items.map(ministryCard));
  const select = document.getElementById('ministry');
  if (!select) return;
  const placeholder = select.options[0]?.cloneNode(true);
  select.replaceChildren();
  if (placeholder) select.appendChild(placeholder);
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

async function load(type, render) {
  try {
    const items = await getContent(type);
    render(items);
  } catch (error) {
    console.error(`[content-cards] Could not render ${type}.`, error);
  }
}

export function initContentCards() {
  load('announcements', renderAnnouncement);
  load('service_times', renderServiceTimes);
  if (document.querySelector('.ministries-container')) load('ministries', renderMinistries);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('aic:content-updated', event => {
    const renderers = {
      announcements: renderAnnouncement,
      service_times: renderServiceTimes,
      ministries: renderMinistries
    };
    const render = renderers[event.detail?.type];
    if (render) load(event.detail.type, render);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentCards, {once: true});
  } else {
    initContentCards();
  }
}
