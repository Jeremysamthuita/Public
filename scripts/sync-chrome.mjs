import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headerTemplate = await readFile(path.join(root, 'partials', 'header.html'), 'utf8');
const footerTemplate = await readFile(path.join(root, 'partials', 'footer.html'), 'utf8');
const pages = (await readdir(root)).filter(file => file.endsWith('.html'));
const origin = 'https://aicegertonchapel.netlify.app';

function withMarkers(html, kind, template, existingMarkup, include) {
  const start = `<!--CHROME:${kind}:START-->`;
  const end = `<!--CHROME:${kind}:END-->`;
  const marked = new RegExp(`${start}[\\s\\S]*?${end}`);
  const markup = `${start}\n${template.trim()}\n${end}`;
  if (marked.test(html)) return html.replace(marked, markup);
  if (!include) {
    return html.replace(new RegExp(`\\s*${existingMarkup}`, 'i'), '');
  }
  if (existingMarkup && new RegExp(existingMarkup, 'i').test(html)) {
    return html.replace(new RegExp(existingMarkup, 'i'), markup);
  }
  return html.replace(/<\/body>/i, `  ${markup}\n</body>`);
}

function currentHeader(page) {
  const activeHref = page === 'index.html'
    ? '/index.html'
    : `/${page}`;
  return headerTemplate.replace(
    '<li><a href="' + activeHref + '">',
    '<li><a href="' + activeHref + '" class="active" aria-current="page">'
  );
}

function rootRelativeUrls(html) {
  return html.replace(/(\s)(href|src|action)=(["'])(.*?)\3/gi, (match, spacing, attr, quote, value) => {
    if (!value || value.startsWith('/') || value.startsWith('#') ||
        /^(?:[a-z][a-z\d+.-]*:|\/\/|\$\{)/i.test(value)) return match;
    return `${spacing}${attr}=${quote}/${value}${quote}`;
  });
}

function ensureCanonical(html, page) {
  const canonical = page === 'index.html' ? `${origin}/` : `${origin}/${page}`;
  const tag = `<link rel="canonical" href="${canonical}">`;
  if (/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, tag);
  }
  return html.replace(/<\/title>/i, `</title>\n    ${tag}`);
}

function ensureMain(html) {
  const mainPattern = /<main\b([^>]*)>/i;
  const match = html.match(mainPattern);
  if (match) {
    const attributes = match[1]
      .replace(/\s+id=["'][^"']*["']/i, '')
      .trim();
    return html.replace(mainPattern, `<main${attributes ? ` ${attributes}` : ''} id="main">`);
  }
  const open = '<main id="main">';
  html = html.replace(/<!--CHROME:HEADER:END-->/, `<!--CHROME:HEADER:END-->\n${open}`);
  return html.replace(/<!--CHROME:FOOTER:START-->/, '</main>\n<!--CHROME:FOOTER:START-->')
    .replace(/<\/body>/i, match => pageIsAdmin(html) ? `</main>\n${match}` : match);
}

function ensureSingleSkipLink(html) {
  const start = html.indexOf('<!--CHROME:HEADER:START-->');
  const end = html.indexOf('<!--CHROME:HEADER:END-->');
  if (start < 0 || end < start) return html;
  const skipLink = /<a\b[^>]*class=["'][^"']*\baic-skip-link\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
  const before = html.slice(0, start).replace(skipLink, '');
  const header = html.slice(start, end);
  const after = html.slice(end).replace(skipLink, '');
  return `${before}${header}${after}`;
}

function pageIsAdmin(html) {
  return /<title>Admin\b/i.test(html);
}

for (const page of pages) {
  const file = path.join(root, page);
  let html = await readFile(file, 'utf8');
  const headerRegex = '<header\\s+class=["\\\']site-header["\\\'][\\s\\S]*?<\\/header>';
  const footerRegex = '<footer\\s+class=["\\\']site-footer["\\\'][\\s\\S]*?<\\/footer>';
  html = withMarkers(html, 'HEADER', currentHeader(page), headerRegex, true);
  html = withMarkers(html, 'FOOTER', footerTemplate, footerRegex, page !== 'admin.html');
  html = ensureSingleSkipLink(html);
  if (page !== 'admin.html' && !html.includes('/assets/js/content/content-cards.js')) {
    html = html.replace(/<\/body>/i, '  <script type="module" src="/assets/js/content/content-cards.js"></script>\n</body>');
  }
  html = html.replace(/<title>([\s\S]*?)<\/title>,/i, '<title>$1</title>');
  html = ensureMain(html);
  html = ensureCanonical(html, page);
  html = rootRelativeUrls(html);
  await writeFile(file, html);
}

console.log(`Synchronized shared chrome in ${pages.length} HTML pages.`);
