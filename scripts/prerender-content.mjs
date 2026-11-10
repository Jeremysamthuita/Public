import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'content-snapshot.json');

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function formattedDate(value) {
  if (!value) return 'Date not provided';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Date not provided';
  return date.toLocaleDateString('en-KE', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function renderSermon(item) {
  const title = escapeHtml(item.title || 'Sermon');
  const imageUrl = safeHttpsUrl(item.previewImageUrl);
  const preview = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${title} sermon preview" width="640" height="360" loading="lazy" decoding="async">`
    : `<div class="sermon-preview-placeholder">
         <div class="sermon-placeholder-icon"><i class="fas fa-book-bible" aria-hidden="true"></i></div>
         <span class="sermon-placeholder-label">Sunday Sermon</span>
       </div>`;
  const badge = `<div class="sermon-preview-tag"><i class="fas fa-church" aria-hidden="true"></i><span>AIC Egerton</span></div>`;
  const preacher = item.preacher
    ? `<div><strong>${escapeHtml(item.ministryTitle ? `Preacher · ${item.ministryTitle}` : 'Preacher')}</strong><span>${escapeHtml(item.preacher)}</span></div>`
    : '';
  const pdfUrl = safeHttpsUrl(item.pdfUrl);
  const audioUrl = safeHttpsUrl(item.audioUrl);
  const videoUrl = safeHttpsUrl(item.videoUrl);
  const files = [
    ...(pdfUrl ? [{url: pdfUrl, name: item.pdfName || 'sermon.pdf', type: 'application/pdf'}] : []),
    ...(Array.isArray(item.files) ? item.files : Array.isArray(item.presentationAssets) ? item.presentationAssets : [])
  ];
  const links = files.map(file => {
    const url = safeHttpsUrl(file.url);
    if (!url) return '';
    return `<a class="sermon-download-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(file.name || 'Sermon resource')}"><i class="fas fa-download" aria-hidden="true"></i> Download</a>`;
  }).join('');
  const video = videoUrl
    ? `<a class="sermon-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-youtube" aria-hidden="true"></i> Watch sermon</a>`
    : '';
  const audio = audioUrl
    ? `<audio controls preload="none" aria-label="Listen to ${title}" src="${escapeHtml(audioUrl)}"></audio>`
    : '';

  return `<article class="sermon-card"><div class="sermon-preview">${badge}${preview}</div><div class="sermon-content"><div class="sermon-title-wrapper"><h3 class="sermon-card-title">${title}</h3></div><div class="sermon-meta">${preacher}<div><strong>Date</strong><span>${escapeHtml(formattedDate(item.date))}</span></div></div>${item.scriptureReference ? `<p class="sermon-scripture-reference">Scripture: ${escapeHtml(item.scriptureReference)}</p>` : ''}${item.series ? `<p class="sermon-series">Series: ${escapeHtml(item.series)}</p>` : ''}${audio}<div class="sermon-actions">${links}${video}</div></div></article>`;
}

function renderEvent(item) {
  if (!item.title || !item.date) return '';
  const title = escapeHtml(item.title);
  const flyerUrl = safeHttpsUrl(item.flyerUrl);
  const registrationUrl = safeHttpsUrl(item.registrationUrl);
  const reminder = registrationUrl
    ? `<a class="event-reminder" href="${escapeHtml(registrationUrl)}" target="_blank" rel="noopener noreferrer">Register</a>`
    : `<a class="event-reminder" href="https://wa.me/254799522418?text=${encodeURIComponent(`Hello, please remind me about ${item.title} on ${item.date}${item.time ? ` at ${item.time}` : ''}.`)}" target="_blank" rel="noopener noreferrer">Remind Me</a>`;
  const flyer = flyerUrl
    ? `<img src="${escapeHtml(flyerUrl)}" alt="${escapeHtml(item.flyerAlt || `${item.title} event flyer`)}" width="640" height="400" loading="lazy" decoding="async">`
    : '';
  return `<article class="event-card">${flyer}<div class="event-card-content"><p class="event-date">${escapeHtml([formattedDate(item.date), item.time].filter(Boolean).join(' · '))}</p><h3>${title}</h3>${item.location ? `<p class=\"event-venue\">📍 ${escapeHtml(item.location)}</p>` : ''}${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}${reminder}</div></article>`;
}

export function renderServiceTimes(items) {
  if (!items.length) {
    return '<p><strong>Sunday</strong><br>Main Worship Service — 8:00 AM – 12:00 PM EAT</p><p><strong>Wednesday</strong><br>Mid-Week Prayer — 5:30 PM – 7:00 PM EAT</p><p><strong>Friday</strong><br>Youth Fellowship — 6:00 PM – 8:00 PM EAT</p>';
  }
  return items.map(item => {
    const name = item.label && item.label !== item.day ? `${item.label} — ` : '';
    const time = [item.start, item.end].filter(Boolean).join(' – ');
    return `<p><strong>${escapeHtml(item.day || item.label || 'Service')}</strong><br>${escapeHtml(`${name}${time}${time ? ' EAT' : ''}${item.isLive ? ' · Live' : ''}`)}</p>`;
  }).join('');
}

function galleryPhotos(items) {
  return items.flatMap(item =>
    (Array.isArray(item.images) ? item.images : [item.imageUrl])
      .filter(Boolean)
      .map(url => ({url: safeHttpsUrl(url), alt: item.alt || item.caption || 'AIC Egerton Chapel gallery photo'}))
  ).filter(item => item.url);
}

function renderGallery(images) {
  return images.map((image, index) =>
    `<img${index === 0 ? ' class="active"' : ''} src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" width="640" height="400" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">`
  ).join('') || '<p class="gallery-empty">Gallery photos are not available right now.</p>';
}

function renderIndexGallery(images) {
  const first = images[0];
  return first
    ? `<img class="blinds" src="${escapeHtml(first.url)}" alt="${escapeHtml(first.alt)}" width="640" height="400" loading="eager" decoding="async">`
    : '';
}

function renderAnnouncements(items) {
  if (!items.length) return '';
  const announcements = items.map(item => {
    const severity = ['info', 'warning', 'urgent'].includes(item.severity) ? item.severity : 'info';
    const linkUrl = safeHttpsUrl(item.linkUrl);
    const link = linkUrl
      ? `<a href="${escapeHtml(linkUrl)}">${escapeHtml(item.linkLabel || 'Learn more')}</a>`
      : '';
    return `<article class="cms-announcement cms-announcement--${severity}"><p>${escapeHtml(item.text)}</p>${link}</article>`;
  }).join('');
  return `<section class="cms-announcements" data-cms-announcements aria-label="Church announcements" aria-live="off"><span class="cms-announcements__badge">Announcement</span><div class="cms-announcements__viewport"><div class="cms-announcements__track"><div class="cms-announcements__sequence">${announcements}</div><div class="cms-announcements__sequence" aria-hidden="true" inert>${announcements}</div></div></div><button class="cms-announcements__close" type="button" aria-label="Dismiss announcements">×</button></section>`;
}

function replaceMarker(html, name, content) {
  const start = `<!--CONTENT:${name}:START-->`;
  const end = `<!--CONTENT:${name}:END-->`;
  const marker = new RegExp(`${start}[\\s\\S]*?${end}`, 'g');
  if (!marker.test(html)) return html;
  return html.replace(marker, `${start}${content}${end}`);
}

function addContentVersion(html, version, generatedAt) {
  const tag = `<meta name="content-version" content="${escapeHtml(version)}">`;
  const generatedAtTag = `<meta name="content-generated-at" content="${escapeHtml(generatedAt || '')}">`;
  const existing = /<meta\b[^>]*name=["']content-version["'][^>]*>/i;
  const withVersion = existing.test(html) ? html.replace(existing, tag) : html.replace(/<head\b[^>]*>/i, match => `${match}\n    ${tag}`);
  const generatedAtPattern = /<meta\b[^>]*name=["']content-generated-at["'][^>]*>/i;
  return generatedAtPattern.test(withVersion)
    ? withVersion.replace(generatedAtPattern, generatedAtTag)
    : withVersion.replace(tag, `${tag}\n    ${generatedAtTag}`);
}

export async function buildContentHtml() {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.version) {
    throw new Error('[prerender] The content snapshot has no version.');
  }
  const content = type => Array.isArray(snapshot[type]) ? snapshot[type] : [];
  const sermons = content('sermons');
  const events = content('events').map(renderEvent).filter(Boolean);
  const photos = galleryPhotos(content('gallery'));
  const pages = (await readdir(root)).filter(file => file.endsWith('.html'));

  for (const page of pages) {
    const file = path.join(root, page);
    let html = await readFile(file, 'utf8');
    html = addContentVersion(html, snapshot.version, snapshot.generatedAt);
    html = replaceMarker(html, 'EVENTS', events.join('') ||
      '<p class="events-empty">No upcoming events at the moment. Please check back soon.</p>');
    html = replaceMarker(html, 'INDEX_SERMONS', sermons.slice(0, 3).map(renderSermon).join('') ||
      '<p class="sermon-empty">No sermons are available yet. Please check back soon.</p>');
    html = replaceMarker(html, 'SERMONS', sermons.map(renderSermon).join('') ||
      '<p class="sermon-empty">No sermons are available yet. Please check back soon.</p>');
    html = replaceMarker(html, 'ABOUT_GALLERY', renderGallery(photos));
    html = replaceMarker(html, 'INDEX_GALLERY', renderIndexGallery(photos));
    html = replaceMarker(html, 'SERVICE_TIMES', renderServiceTimes(content('service_times')));
    html = replaceMarker(html, 'ANNOUNCEMENTS', renderAnnouncements(content('announcements')));
    await writeFile(file, html);
  }
  console.log(`[prerender] Injected public snapshot content into ${pages.length} pages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildContentHtml();
}
