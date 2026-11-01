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
  const main = document.querySelector('main');
  if (!main || !items.length || main.querySelector('[data-cms-announcements]')) return;
  const region = document.createElement('section');
  region.className = 'cms-announcements';
  region.dataset.cmsAnnouncements = '';
  region.setAttribute('aria-label', 'Church announcements');
  for (const item of items) {
    const article = document.createElement('article');
    article.className = `cms-announcement cms-announcement--${item.severity}`;
    article.appendChild(text('p', item.text));
    if (item.linkUrl) {
      const link = document.createElement('a');
      link.href = item.linkUrl;
      link.textContent = item.linkLabel || 'Learn more';
      article.appendChild(link);
    }
    region.appendChild(article);
  }
  const badge = sourceBadge('announcements');
  if (badge) region.appendChild(badge);
  main.prepend(region);
}

function renderServiceTimes(items) {
  const target = document.querySelector('[data-service-times]');
  if (!target || !items.length) return;
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement('p');
    row.appendChild(text('strong', item.day || item.label));
    const detail = document.createElement('span');
    const name = item.label && item.label !== item.day ? `${item.label} — ` : '';
    detail.textContent = `${name}${[item.start, item.end].filter(Boolean).join(' – ')}${item.isLive ? ' · Live' : ''}`;
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
  if (item.leader) {
    const leader = document.createElement('p');
    leader.append(text('strong', 'Leader: '), document.createTextNode(item.leader));
    card.appendChild(leader);
  }
  if (item.contact) card.appendChild(text('p', `Contact: ${item.contact}`));
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
  if (!target || !items.length) return;
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
