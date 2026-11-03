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
    region?.remove();
    document.body.classList.remove('has-cms-announcements');
    return;
  }
  if (!region) {
    region = document.createElement('section');
    document.body.appendChild(region);
  }
  region.className = 'cms-announcements';
  region.dataset.cmsAnnouncements = '';
  region.setAttribute('aria-label', 'Church announcements');
  region.setAttribute('aria-live', 'off');

  const badge = text('span', 'Announcement', 'cms-announcements__badge');
  const viewport = document.createElement('div');
  viewport.className = 'cms-announcements__viewport';
  const track = document.createElement('div');
  track.className = 'cms-announcements__track';
  const sequence = document.createElement('div');
  sequence.className = 'cms-announcements__sequence';
  const appendItem = (parent, item) => {
    const article = document.createElement('article');
    article.className = `cms-announcement cms-announcement--${item.severity}`;
    article.appendChild(text('p', item.text));
    if (item.linkUrl) {
      const link = document.createElement('a');
      link.href = item.linkUrl;
      link.textContent = item.linkLabel || 'Learn more';
      article.appendChild(link);
    }
    parent.appendChild(article);
  };
  for (const item of items) appendItem(sequence, item);
  const repeatedSequence = sequence.cloneNode(true);
  repeatedSequence.setAttribute('aria-hidden', 'true');
  repeatedSequence.setAttribute('inert', '');
  track.append(sequence, repeatedSequence);
  viewport.appendChild(track);

  const close = document.createElement('button');
  close.className = 'cms-announcements__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss announcements');
  close.textContent = '×';
  close.addEventListener('click', () => {
    region.remove();
    document.body.classList.remove('has-cms-announcements');
  });

  region.replaceChildren(badge, viewport);
  const source = sourceBadge('announcements');
  if (source) region.appendChild(source);
  region.appendChild(close);
  document.body.classList.add('has-cms-announcements');
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
