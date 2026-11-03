import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function stableFooter(html, page) {
  const matches = [...html.matchAll(/<footer class="site-footer">[\s\S]*?<\/footer>/g)];
  assert.equal(matches.length, 1, `${page} should have exactly one shared footer`);
  return matches[0][0]
    .replace(/<!--CONTENT:SERVICE_TIMES:START-->[\s\S]*?<!--CONTENT:SERVICE_TIMES:END-->/, '<!--SERVICE_TIMES-->')
    .replace(/<!--CONTENT:ANNOUNCEMENTS:START-->[\s\S]*?<!--CONTENT:ANNOUNCEMENTS:END-->/, '<!--ANNOUNCEMENTS-->');
}

test('all public pages use the same shared footer markup', async () => {
  const pages = (await readdir(root))
    .filter(file => file.endsWith('.html') && file !== 'admin.html')
    .sort();
  const footerByPage = await Promise.all(pages.map(async page => [
    page,
    stableFooter(await readFile(path.join(root, page), 'utf8'), page)
  ]));
  const expected = footerByPage[0][1];

  for (const [page, footer] of footerByPage.slice(1)) {
    assert.equal(footer, expected, `${page} footer differs from ${footerByPage[0][0]}`);
  }
});

test('shared styles remove page-level bottom padding while reserving room for announcements', async () => {
  const css = await readFile(path.join(root, 'site-chrome.css'), 'utf8');
  assert.match(css, /body\s*\{[^}]*padding-bottom:\s*0\s*!important;/s);
  assert.match(css, /body\.has-cms-announcements\s*\{[^}]*padding-bottom:\s*max\(/s);
});
