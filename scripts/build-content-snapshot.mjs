import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeContent} from '../assets/js/content/content-service.js';
import {contentTypeName, normalizeRecord} from '../assets/js/content/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'content-snapshot.json');
const types = ['sermons', 'events', 'leadership', 'gallery', 'announcements', 'ministries', 'service_times', 'settings'];
const env = process.env;
// The delivery token and space ID are public (they already live in site-config.js), so the build
// falls back to that file when Netlify environment variables are not set.
const siteConfigText = await readFile(path.join(root, 'site-config.js'), 'utf8').catch(() => '');
const fromSiteConfig = key => siteConfigText.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`))?.[1];
const config = {
  contentful: {
    spaceId: env.CONTENTFUL_SPACE_ID || fromSiteConfig('spaceId'),
    environment: env.CONTENTFUL_ENV || env.CONTENTFUL_ENVIRONMENT || fromSiteConfig('environment') || 'master',
    deliveryToken: env.CONTENTFUL_DELIVERY_TOKEN || fromSiteConfig('deliveryToken')
  },
  supabase: {url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY},
  content: {policy: env.CONTENT_POLICY || 'contentful-first'}
};

async function fetchContentful(type) {
  const items = [];
  const assets = new Map();
  let total = Infinity;
  let skip = 0;
  while (skip < total) {
    const params = new URLSearchParams({
      access_token: config.contentful.deliveryToken,
      content_type: contentTypeName(type),
      include: '2',
      limit: '1000',
      skip: String(skip)
    });
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(config.contentful.spaceId)}/environments/${encodeURIComponent(config.contentful.environment)}/entries?${params}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`Contentful ${type} returned HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page.items)) throw new Error(`Contentful returned invalid ${type} data.`);
    items.push(...page.items);
    for (const asset of page.includes?.Asset || []) assets.set(asset.sys.id, asset);
    total = Number(page.total) || items.length;
    skip += page.items.length;
    if (!page.items.length) break;
  }
  return items.map(item => normalizeRecord(type, item, {
    source: 'contentful',
    assets: [...assets.values()]
  }));
}

async function fetchSupabase(type) {
  const project = new URL(config.supabase.url);
  const params = new URLSearchParams({
    select: '*',
    is_published: 'eq.true',
    order: type === 'sermons' ? 'sermon_date.desc'
      : type === 'events' ? 'event_date.asc' : 'sort_order.asc'
  });
  const now = new Date().toISOString();
  params.set('and', `(or(publish_at.is.null,publish_at.lte.${now}),or(unpublish_at.is.null,unpublish_at.gt.${now}))`);
  const url = `${project.origin}/rest/v1/cms_${type}?${params}`;
  const records = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: config.supabase.anonKey,
        Authorization: `Bearer ${config.supabase.anonKey}`,
        Accept: 'application/json',
        Range: `${offset}-${offset + 999}`
      }
    });
    if (!response.ok) throw new Error(`Supabase ${type} returned HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Supabase returned invalid ${type} data.`);
    records.push(...page);
    if (page.length < 1000) break;
  }
  return records.map(record => normalizeRecord(type, record, {source: record.source || 'supabase'}));
}

async function readPreviousSnapshot() {
  try {
    const previous = JSON.parse(await readFile(snapshotPath, 'utf8'));
    return previous && typeof previous === 'object' ? previous : {};
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[snapshot] Existing snapshot could not be read.', error);
    return {};
  }
}

function validSnapshot(snapshot) {
  return types.some(type => Array.isArray(snapshot[type]));
}

const sources = [];
if (config.contentful.spaceId && config.contentful.deliveryToken) sources.push(['contentful', fetchContentful]);
if (config.supabase.url && config.supabase.anonKey) sources.push(['supabase', fetchSupabase]);
const previous = await readPreviousSnapshot();

if (!sources.length) {
  if (validSnapshot(previous)) {
    console.warn('[snapshot] No public CMS credentials are configured; retaining the existing snapshot.');
  } else {
    throw new Error('[snapshot] No CMS source or valid last-known-good snapshot is available.');
  }
} else {
  const content = {};
  let successfulTypeCount = 0;
  for (const type of types) {
    const results = await Promise.allSettled(sources.map(async ([source, fetchItems]) => ({
      source,
      items: await fetchItems(type)
    })));
    const successful = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    for (const result of results) {
      if (result.status === 'rejected') console.warn(`[snapshot] ${type} source failed: ${result.reason.message}`);
    }
    console.log(`[snapshot] ${type}: ${successful.map(result => `${result.source}=${result.items.length}`).join(', ') || 'no source answered'}`);
    if (successful.length) {
      content[type] = mergeContent(
        successful.flatMap(result => result.items.map(item => ({...item, type}))),
        config.content.policy
      );
      successfulTypeCount += 1;
    } else {
      content[type] = Array.isArray(previous[type]) ? previous[type] : [];
    }
  }
  if (successfulTypeCount === 0) {
    if (!validSnapshot(previous)) throw new Error('[snapshot] Both CMS sources failed and no valid snapshot exists.');
    console.warn('[snapshot] Both CMS sources failed; retaining the last-known-good snapshot.');
    process.exit(0);
  }
  const version = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const snapshot = {version, generatedAt: new Date().toISOString(), ...content};
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`[snapshot] Wrote ${snapshotPath}.`);
}
