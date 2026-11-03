import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const footer = await readFile(new URL('partials/footer.html', root), 'utf8');
const contact = await readFile(new URL('contact.html', root), 'utf8');

test('shared footer and contact page embed maps without static map images or API keys', () => {
  for (const html of [footer, contact]) {
    assert.match(html, /<iframe[^>]+src="https:\/\/www\.google\.com\/maps\/embed/);
    assert.match(html, /loading="lazy"/);
    assert.doesNotMatch(html, /maps\.googleapis\.com\/maps\/api\/staticmap|GOOGLE_MAPS_STATIC_KEY|map-chapel(?:-2x)?\.webp/);
  }
});
