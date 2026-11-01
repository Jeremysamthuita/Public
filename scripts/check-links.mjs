import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = (await readdir(root)).filter(file => file.endsWith('.html'));
const errors = [];
const titles = new Map();
const chrome = new Map();

function report(file, message) {
  errors.push(`${file}: ${message}`);
}

function normalizedSection(html, name) {
  const open = name === 'header'
    ? /<!--CHROME:HEADER:START-->/
    : /<!--CHROME:FOOTER:START-->/;
  const close = name === 'header'
    ? /<!--CHROME:HEADER:END-->/
    : /<!--CHROME:FOOTER:END-->/;
  const start = html.search(open);
  const end = html.search(close);
  if (start < 0 || end < start) return '';
  return html.slice(start, end)
    .replace(/\saria-current=(["'])page\1/gi, '')
    .replace(/\bclass=(["'])([^"']*)\1/gi, (_, quote, value) => {
      const classes = value.split(/\s+/).filter(name => name && name !== 'active');
      return classes.length ? `class=${quote}${classes.join(' ')}${quote}` : '';
    })
    .replace(/\s+>/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function localPath(value) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname || pathname.startsWith('#') || /^(?:mailto:|tel:|data:|blob:|javascript:|about:)/i.test(pathname)) return null;
  if (!pathname.startsWith('/')) return {error: `internal URL must be root-relative: ${value}`};
  if (pathname.includes(' ')) return {error: `internal URL contains a space: ${value}`};
  return {pathname};
}

async function checkTarget(file, value) {
  const parsed = localPath(value);
  if (!parsed) return;
  if (parsed.error) {
    report(file, parsed.error);
    return;
  }
  const target = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const resolved = path.resolve(root, `.${target}`);
  if (!resolved.startsWith(root + path.sep)) {
    report(file, `internal URL escapes the site root: ${value}`);
    return;
  }
  try {
    await stat(resolved);
    const actual = path.relative(root, resolved).replaceAll(path.sep, '/');
    const expected = target.slice(1);
    if (actual !== expected) report(file, `path case mismatch: ${value}`);
  } catch {
    report(file, `missing internal target: ${value}`);
  }
}

for (const page of pages) {
  const html = await readFile(path.join(root, page), 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) report(page, 'missing title');
  else {
    if (titles.has(title)) report(page, `duplicate title also used in ${titles.get(title)}`);
    titles.set(title, page);
  }
  if (!/<main\b[^>]*\bid=["']main["']/i.test(html)) report(page, 'missing <main id="main">');
  if (!/class=["'][^"']*\baic-skip-link\b/i.test(html)) report(page, 'missing skip link');
  if (!/<link\b[^>]*rel=["']canonical["']/i.test(html)) report(page, 'missing canonical URL');

  const header = normalizedSection(html, 'header');
  if (!header) report(page, 'missing shared header markers');
  else if (!chrome.has('header')) chrome.set('header', {html: header, page});
  else if (chrome.get('header').html !== header) report(page, `header differs from ${chrome.get('header').page}`);

  if (page !== 'admin.html') {
    const footer = normalizedSection(html, 'footer');
    if (!footer) report(page, 'missing shared footer markers');
    else if (!chrome.has('footer')) chrome.set('footer', {html: footer, page});
    else if (chrome.get('footer').html !== footer) report(page, `footer differs from ${chrome.get('footer').page}`);
  }

  const ids = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/gi), match => match[1]));
  for (const match of html.matchAll(/\s(?:href|src|action)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (value === '#') continue;
    if (value.startsWith('#')) {
      if (!ids.has(decodeURIComponent(value.slice(1)))) report(page, `missing in-page anchor: ${value}`);
    } else if (!value.startsWith('${')) {
      await checkTarget(page, value);
    }
  }
}

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
for (const item of [...(manifest.icons || []), ...(manifest.shortcuts || [])]) {
  const target = item.src || item.url;
  if (target) await checkTarget('manifest.webmanifest', target);
}

const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
for (const [, url] of sitemap.matchAll(/<loc>(.*?)<\/loc>/gi)) {
  const pathname = new URL(url).pathname;
  await checkTarget('sitemap.xml', pathname);
}

const netlify = await readFile(path.join(root, 'netlify.toml'), 'utf8');
for (const [, target] of netlify.matchAll(/^\s*to\s*=\s*"([^"]+)"/gim)) {
  if (target.startsWith('/.netlify/functions/')) continue;
  await checkTarget('netlify.toml', target);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.length} pages, shared chrome, sitemap, manifest, and redirect targets; no broken internal links found.`);
}
