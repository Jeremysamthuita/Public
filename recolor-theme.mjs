#!/usr/bin/env node
/**
 * AIC Egerton Chapel: recolor the whole website to the church colors
 * (burgundy + red + black + cream, with gold, forest green, navy, pink, purple and light blue as secondary colors).
 *
 *   node recolor-theme.mjs                 -> DRY RUN: shows what would change, writes nothing
 *   node recolor-theme.mjs --apply         -> makes the changes (originals saved in a folder NEXT TO the project: <project>-theme-backup)
 *   node recolor-theme.mjs --revert        -> puts the original files back from that backup folder
 *   node recolor-theme.mjs --print-theme   -> prints the palette as CSS (this is theme.css's token section)
 *
 * Options:  --dir <folder>   project folder (default: current folder)
 *           --include-js     also recolor colors written inside .js files (off by default)
 *           --exclude <text> skip any file whose path contains this text (can be repeated)
 *           --backup <folder> where to keep the originals (default: <project>-theme-backup, next to the project)
 *
 * What it does: finds the old purple / red / blue / teal / bright-green / orange colors in your
 * .css files, in <style> blocks and style="" attributes in .html files, and swaps them for the new
 * palette written as  var(--aic-burgundy-700, #7b1e2e).  Changing a color later means editing
 * theme.css only. Running it twice is safe: colors that already use var(--aic-...) are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ palette (single source of truth) */
export const SCALES = {
  burgundy: { 50:'#fbf1f2',100:'#f5e1e4',200:'#ebc3c9',300:'#dc97a2',400:'#c4667a',500:'#a63a4c',600:'#8f2a3b',700:'#7b1e2e',800:'#5e1623',900:'#3d0f17',950:'#2a0a10' },
  red:      { 50:'#fef2f2',100:'#fde2e4',200:'#fbc4c9',300:'#f593a0',400:'#e8586c',500:'#d62839',600:'#bd1c2c',700:'#9b1624',800:'#7a111c',900:'#520b13' },
  gold:     { 50:'#fffaeb',100:'#fdf0c4',200:'#f9e08a',300:'#f4cf55',400:'#efbd2e',500:'#e0a817',600:'#c58f0e',700:'#9f700a',800:'#7a5508',900:'#4d3606' },
  green:    { 50:'#eef6f0',100:'#dcece1',200:'#b9d9c4',300:'#8dbf9f',400:'#5ea178',500:'#3a8a5a',600:'#2a7048',700:'#1e5a3a',800:'#14402b',900:'#0d2b1d' },
  navy:     { 50:'#eef2f8',100:'#d9e2f0',200:'#b3c4e0',300:'#86a1cb',400:'#5379af',500:'#2f5590',600:'#1f4177',700:'#16325f',800:'#0f2347',900:'#0a1830',950:'#060e1d' },
  pink:     { 50:'#fdf2f7',100:'#fbe1ee',200:'#f7c1db',300:'#f192bf',400:'#e8609f',500:'#d63384',600:'#b8266f',700:'#931d58',800:'#701644',900:'#4a0e2d' },
  purple:   { 50:'#f6f1fb',100:'#ebe0f6',200:'#d6bfee',300:'#b994e0',400:'#9a68cf',500:'#7e44b8',600:'#65349b',700:'#4e2a7a',800:'#3a1f5c',900:'#261340' },
  sky:      { 50:'#f0f8fe',100:'#dff0fc',200:'#bde0f8',300:'#8ecaf2',400:'#5db0e8',500:'#3a96d6',600:'#2478b8',700:'#1b5f93',800:'#154a72',900:'#0e334e' },
  cream:    { 50:'#fffdf8',100:'#fdf9f0',200:'#faf5e9',300:'#f3ead6',400:'#e8dcc0',500:'#d9c9a3' },
  ink:      { 50:'#f7f5f3',100:'#ece8e4',200:'#d9d3cd',300:'#b8b0a8',400:'#8f867d',500:'#6b6258',600:'#4a423a',700:'#3a322c',800:'#2b2420',900:'#1c1614',950:'#120d0c' }
};

/* old brand colors we know about -> exact new shade */
const EXACT = {
  // old purples / violets -> burgundy (the brand)
  '8e44ad':['burgundy',700], '9b59b6':['burgundy',600], '71358c':['burgundy',800], '6c2f8a':['burgundy',800], '5b2a86':['burgundy',800],
  '7a3a9b':['burgundy',700], '70428e':['burgundy',700], '43245e':['burgundy',900], '342044':['burgundy',900], '2c173f':['burgundy',950],
  '261536':['burgundy',950], '4a2d7a':['burgundy',800], '33205a':['burgundy',900], '7c3aed':['burgundy',700], '6d28d9':['burgundy',800],
  '1b0d30':['burgundy',950], '31154e':['burgundy',900], '4a1c6e':['burgundy',800], '1e1338':['ink',900], '321e5a':['ink',800],
  '1a237e':['burgundy',800], '3b3a9c':['burgundy',800],
  // old reds -> the true red
  'e74c3c':['red',600], 'c0392b':['red',700], 'ff6b81':['red',400], 'ff4b2b':['red',500], 'ff416c':['red',500], 'e53935':['red',600],
  'dc2626':['red',600], 'b91c1c':['red',700], 'e11d48':['red',600], 'ef4444':['red',500],
  // yellows / oranges -> sunshine gold
  'f5c453':['gold',400], 'ffae00':['gold',400], 'f39c12':['gold',500], 'e67e22':['gold',600], 'fd964c':['gold',500], 'f59e0b':['gold',400],
  'fbbf24':['gold',300], 'f5b942':['gold',400], 'fef3c7':['gold',100], '92400e':['gold',800],
  // blues -> navy
  '2563eb':['navy',600], '3f51b5':['navy',600], '485c9b':['navy',600], '38489c':['navy',600],
  // near-blacks and slate -> warm black
  '0f172a':['ink',950], '020617':['ink',950], '1e293b':['ink',900], '050e22':['ink',900], '223857':['ink',700],
  '2c3e50':['ink',800], '24213b':['ink',800], '171525':['ink',950], '29243a':['ink',800],
  // greys with a cool tint -> cream
  'f5f7fa':['cream',100], 'e4e7f1':['cream',300], 'f8fafc':['cream',100], 'f8f7fa':['cream',100], 'e2e8f0':['cream',300]
};

/* ------------------------------------------------------------------ color math */
const clamp01 = v => Math.min(1, Math.max(0, v));
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : null };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
const lightnessOf = hex => rgbToHsl(hexToRgb(hex)).l;
const STEP_L = {};
for (const [name, scale] of Object.entries(SCALES)) STEP_L[name] = Object.entries(scale).map(([step, hex]) => ({ step: Number(step), l: lightnessOf(hex) }));
function nearestStep(scaleName, l) {
  return STEP_L[scaleName].reduce((best, cur) => (Math.abs(cur.l - l) < Math.abs(best.l - l) ? cur : best)).step;
}
const tripletOf = hex => { const { r, g, b } = hexToRgb(hex); return `${r} ${g} ${b}`; };

/* decide which palette shade replaces an old color; returns [scale, step] or null (leave as is) */
function mapFamily({ r, g, b }) {
  const key = [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  if (EXACT[key]) return EXACT[key];
  const { h, s, l } = rgbToHsl({ r, g, b });
  if (s < 0.06) return null;                              // pure greys, black and white stay as they are
  if (s < 0.24 || (h >= 170 && h <= 260 && s < 0.35)) return l > 0.85 ? ['cream', nearestStep('cream', l)] : ['ink', nearestStep('ink', l)];  // washed-out greys -> warm cream / warm black
  if (l < 0.16 && h >= 170 && h < 290) return ['ink', nearestStep('ink', l)];   // near-black navy / indigo -> warm black
  const solid = l > 0.38 && l <= 0.80 && s > 0.35;        // a strong mid-tone fill: keep it dark enough for white text
  if (h >= 335 || h < 18) {                                // red and pink
    if (l < 0.26) return ['burgundy', nearestStep('burgundy', l)];
    return ['red', nearestStep('red', solid ? 0.40 : l)];
  }
  if (h >= 235 && h < 335) return ['burgundy', nearestStep('burgundy', solid ? 0.42 : l)];   // purple, violet, indigo, magenta -> brand burgundy
  if (h < 70) return ['gold', nearestStep('gold', l)];                                        // orange, yellow
  if (h < 190) return ['green', nearestStep('green', solid ? 0.40 : l)];                      // green, teal
  return l < 0.55 ? ['navy', nearestStep('navy', l)] : ['sky', nearestStep('sky', l)];        // blue
}

/* ------------------------------------------------------------------ text processing */
const COLOR_RE = new RegExp([
  'rgba?\\(\\s*var\\(--aic-[^)]*\\)[^)]*\\)',              // already converted: rgb(var(--aic-..) / .2)
  'var\\(--aic-[^)]*\\)',                                  // already converted: var(--aic-..)
  '#[0-9a-fA-F]{8}\\b', '#[0-9a-fA-F]{6}\\b', '#[0-9a-fA-F]{3,4}\\b',
  'rgba?\\(\\s*\\d{1,3}\\s*[ ,]\\s*\\d{1,3}\\s*[ ,]\\s*\\d{1,3}\\s*(?:[,/]\\s*[\\d.]+%?\\s*)?\\)'
].join('|'), 'g');

function parseColor(text) {
  if (text.startsWith('#')) {
    const rgb = hexToRgb(text);
    return { ...rgb, a: rgb.a };
  }
  const nums = text.match(/[\d.]+%?/g);
  if (!nums || nums.length < 3) return null;
  const [r, g, b] = nums.slice(0, 3).map(Number);
  return { r, g, b, a: nums[3] !== undefined ? nums[3] : null, alphaText: nums[3] };
}
const tokenFor = (scale, step, alpha) => {
  const hex = SCALES[scale][step];
  if (alpha === null || alpha === undefined) return `var(--aic-${scale}-${step}, ${hex})`;
  const a = typeof alpha === 'number' ? String(Math.round(alpha * 100) / 100).replace(/^0\./, '.') : alpha;
  return `rgb(var(--aic-${scale}-${step}-rgb, ${tripletOf(hex)}) / ${a})`;
};

function makeStats() { return { total: 0, byMapping: new Map() }; }
function note(stats, from, scale, step) {
  stats.total++;
  const k = `${from} -> ${scale}-${step}`;
  stats.byMapping.set(k, (stats.byMapping.get(k) || 0) + 1);
}

function convertColors(value, stats) {
  return value.replace(COLOR_RE, text => {
    if (text.includes('--aic-')) return text;
    const c = parseColor(text);
    if (!c) return text;
    const target = mapFamily(c);
    if (!target) return text;
    note(stats, text.toLowerCase(), target[0], target[1]);
    const alpha = c.alphaText !== undefined ? c.alphaText : (typeof c.a === 'number' ? c.a : null);
    return tokenFor(target[0], target[1], alpha);
  });
}

/* a gradient that mixes purple / red tones becomes one smooth maroon -> red ramp, so white text stays readable */
const GRADIENT_START = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;
const RAMPS = {
  2: [['burgundy', 800], ['red', 600]],
  3: [['burgundy', 900], ['burgundy', 700], ['red', 600]],
  4: [['burgundy', 950], ['burgundy', 800], ['burgundy', 700], ['red', 600]]
};
function convertGradients(value, stats) {
  let out = '', last = 0, m;
  GRADIENT_START.lastIndex = 0;
  while ((m = GRADIENT_START.exec(value))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break;
    const inner = value.slice(open + 1, end);
    const colors = [...inner.matchAll(COLOR_RE)].filter(c => !c[0].includes('--aic-'));
    const chromatic = colors.map(c => ({ c, p: parseColor(c[0]) })).filter(x => x.p && rgbToHsl(x.p).s >= 0.06 && (x.p.a === null || x.p.a === undefined || Number(x.p.alphaText ?? x.p.a) >= 0.5));
    const brand = chromatic.filter(x => { const t = mapFamily(x.p); return t && (t[0] === 'burgundy' || t[0] === 'red'); });
    if (chromatic.length >= 2 && brand.length === chromatic.length) {
      const ramp = RAMPS[Math.min(chromatic.length, 4)];
      let idx = 0, rebuilt = '', pos = 0;
      for (const { c, p } of chromatic) {
        const [scale, step] = ramp[Math.min(idx, ramp.length - 1)]; idx++;
        rebuilt += inner.slice(pos, c.index);
        const alpha = p.alphaText !== undefined ? p.alphaText : (typeof p.a === 'number' ? p.a : null);
        note(stats, c[0].toLowerCase() + ' (in gradient)', scale, step);
        rebuilt += tokenFor(scale, step, alpha);
        pos = c.index + c[0].length;
      }
      rebuilt += inner.slice(pos);
      out += value.slice(last, open + 1) + rebuilt + ')';
      last = end + 1;
    }
    GRADIENT_START.lastIndex = end + 1;
  }
  return out + value.slice(last);
}

const recolorValue = (value, stats) => convertColors(convertGradients(value, stats), stats);

/* property values only: text after a ':' inside a declaration block { ... }. Selectors are never touched. */
const recolorDeclarations = (text, stats) =>
  text.replace(/:\s*([^;{}]*)/g, (whole, value) => whole.slice(0, whole.length - value.length) + recolorValue(value, stats));
function recolorCss(css, stats) {
  return css.replace(/\{([^{}]*)\}/g, (_, block) => `{${recolorDeclarations(block, stats)}}`);
}

function recolorHtml(html, stats) {
  let out = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, css, c) => a + recolorCss(css, stats) + c);
  out = out.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_, a, q, v) => `${a}${q}${recolorDeclarations(`x:${v}`, stats).slice(2)}${q}`);
  out = out.replace(/(\s(?:fill|stroke|stop-color|flood-color)\s*=\s*)(["'])(#[0-9a-fA-F]{3,8})\2/gi, (_, a, q, v) => `${a}${q}${recolorHexAttr(v, stats)}${q}`);
  out = out.replace(/(<meta\s+name=["']theme-color["']\s+content=["'])(#[0-9a-fA-F]{3,8})(["'])/gi, (_, a, v, c) => { note(stats, v.toLowerCase(), 'burgundy', 700); return a + SCALES.burgundy[700] + c; });
  return out;
}
function recolorHexAttr(hex, stats) {   // attributes can not hold var(); use the plain hex of the new shade
  const t = mapFamily(hexToRgb(hex));
  if (!t) return hex;
  note(stats, hex.toLowerCase(), t[0], t[1]);
  return SCALES[t[0]][t[1]];
}
function recolorManifest(text, stats) {
  return text
    .replace(/("theme_color"\s*:\s*")(#[0-9a-fA-F]{3,8})(")/g, (_, a, v, c) => { note(stats, v.toLowerCase(), 'burgundy', 700); return a + SCALES.burgundy[700] + c; })
    .replace(/("background_color"\s*:\s*")(#[0-9a-fA-F]{3,8})(")/g, (_, a, v, c) => { note(stats, v.toLowerCase(), 'cream', 100); return a + SCALES.cream[100] + c; });
}

function ensureThemeLink(html) {
  if (/href=["'][^"']*theme\.css/i.test(html)) return html;
  return html.replace(/<\/head>/i, '    <link rel="stylesheet" href="/theme.css">\n</head>');
}

/* ------------------------------------------------------------------ files */
const SKIP_DIRS = new Set(['node_modules', '.git', '.netlify', '.theme-backup', 'dist', 'build', 'vendor']);
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files); }
    else files.push(path.join(dir, entry.name));
  }
  return files;
}

export function processFile(file, text, { includeJs = false } = {}) {
  const stats = makeStats();
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file).toLowerCase();
  let out = text;
  if (base === 'theme.css') return { out: text, stats };
  if (ext === '.css') out = recolorCss(text, stats);
  else if (ext === '.html' || ext === '.htm') { out = recolorHtml(text, stats); out = ensureThemeLink(out); }
  else if (ext === '.webmanifest' || base === 'manifest.json') out = recolorManifest(text, stats);
  else if (ext === '.js' || ext === '.mjs') {
    if (!includeJs) return { out: text, stats };
    out = text.replace(/(["'`])(#[0-9a-fA-F]{6})\1/g, (whole, q, hex) => { const t = mapFamily(hexToRgb(hex)); if (!t) return whole; note(stats, hex.toLowerCase(), t[0], t[1]); return q + SCALES[t[0]][t[1]] + q; });
  } else return { out: text, stats };
  return { out, stats };
}

function main() {
  const args = process.argv.slice(2);
  const flag = name => args.includes(name);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const root = path.resolve(value('--dir') || '.');
  const excludes = args.flatMap((a, i) => (a === '--exclude' ? [args[i + 1]] : []));

  if (flag('--print-theme')) { process.stdout.write(themeTokens()); return; }

  // backups live NEXT TO the project (not inside it), so they can never be published with the site
  const backupRoot = path.resolve(value('--backup') || path.join(path.dirname(root), `${path.basename(root)}-theme-backup`));
  if (flag('--revert')) {
    if (!fs.existsSync(backupRoot)) { console.log(`Nothing to revert: no backup folder found at ${backupRoot}`); return; }
    let n = 0;
    for (const file of walk(backupRoot)) {
      const rel = path.relative(backupRoot, file);
      fs.copyFileSync(file, path.join(root, rel)); n++;
    }
    console.log(`Restored ${n} file(s) from ${backupRoot}`);
    return;
  }

  const apply = flag('--apply');
  const includeJs = flag('--include-js');
  let changedFiles = 0, totalColors = 0;
  const overall = new Map();
  for (const file of walk(root)) {
    const rel = path.relative(root, file);
    if (excludes.some(x => rel.includes(x))) continue;
    if (!/\.(css|html?|webmanifest|json|js|mjs)$/i.test(file)) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const { out, stats } = processFile(file, text, { includeJs });
    if (out === text) continue;
    changedFiles++; totalColors += stats.total;
    stats.byMapping.forEach((n, k) => overall.set(k, (overall.get(k) || 0) + n));
    console.log(`${apply ? 'changed' : 'would change'}  ${rel}   (${stats.total} color${stats.total === 1 ? '' : 's'})`);
    if (apply) {
      const backup = path.join(backupRoot, rel);
      if (!fs.existsSync(backup)) { fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, text); }
      fs.writeFileSync(file, out);
    }
  }
  console.log(`\n${apply ? 'Done' : 'Dry run'}: ${changedFiles} file(s), ${totalColors} color(s).`);
  const top = [...overall.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (top.length) { console.log('\nMost common swaps:'); top.forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`)); }
  if (!apply) console.log('\nNothing was written. Run again with --apply to make the changes (originals are saved in a backup folder next to your project).');
  else console.log(`\nOriginals are saved in ${backupRoot}\n(run with --revert to undo). Make sure theme.css is in the project root.`);
}

export function themeTokens() {
  const lines = [':root {'];
  for (const [name, scale] of Object.entries(SCALES)) {
    lines.push(`  /* ${name} */`);
    for (const [step, hex] of Object.entries(scale)) {
      lines.push(`  --aic-${name}-${step}: ${hex};`);
      lines.push(`  --aic-${name}-${step}-rgb: ${tripletOf(hex)};`);
    }
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
