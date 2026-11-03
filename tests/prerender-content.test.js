import assert from 'node:assert/strict';
import test from 'node:test';
import {renderSermon, renderServiceTimes, safeHttpsUrl} from '../scripts/prerender-content.mjs';

test('pre-rendered sermon text is escaped and unsafe media URLs are excluded', () => {
  const html = renderSermon({
    title: '<script>alert(1)</script>',
    preacher: 'Rev. Example',
    date: '2026-10-25',
    previewImageUrl: 'javascript:alert(1)',
    pdfUrl: 'javascript:alert(2)',
    audioUrl: 'https://media.example/audio.mp3'
  });

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /https:\/\/media\.example\/audio\.mp3/);
});

test('pre-rendered links accept HTTPS only', () => {
  assert.equal(safeHttpsUrl('https://example.com/resource'), 'https://example.com/resource');
  assert.equal(safeHttpsUrl('http://example.com/resource'), '');
  assert.equal(safeHttpsUrl('javascript:alert(1)'), '');
});

test('service time details include EAT and retain defaults when the CMS has no hours', () => {
  const rendered = renderServiceTimes([{day: 'Sunday', label: 'Main Worship', start: '8:00 AM', end: '12:00 PM'}]);
  assert.match(rendered, /Main Worship — 8:00 AM – 12:00 PM EAT/);

  const fallback = renderServiceTimes([]);
  assert.match(fallback, /Main Worship Service — 8:00 AM – 12:00 PM EAT/);
  assert.match(fallback, /Mid-Week Prayer — 5:30 PM – 7:00 PM EAT/);
  assert.match(fallback, /Youth Fellowship — 6:00 PM – 8:00 PM EAT/);
});
