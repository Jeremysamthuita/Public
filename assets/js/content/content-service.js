import {readCache, writeCache} from './cache.js';
import {fetchContentful} from './contentful-provider.js';
import {isVisible} from './normalize.js';
import {fetchSupabase} from './supabase-provider.js';

const lastSources = new Map();
const config = () => window.AIC_SITE_CONFIG || {};

function debugMode() {
  return new URLSearchParams(window.location.search).get('debugContent') === '1';
}

function cacheIsFresh(cached) {
  const ttlMinutes = Math.max(0, Number(config().content?.cacheTtlMinutes) || 0);
  const savedAt = Date.parse(cached?.savedAt || '');
  return ttlMinutes > 0 && !Number.isNaN(savedAt) &&
    Date.now() - savedAt < ttlMinutes * 60 * 1000;
}

function cmsMode() {
  return new URLSearchParams(window.location.search).get('cms') || '';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function announceUpdate(type) {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aic:content-updated', {detail: {type}}));
  }
}

async function attempt(provider, type, providerName) {
  const settings = config().content || {};
  const retries = Math.max(0, Number(settings.retries) || 0);
  const timeoutMs = Math.max(100, Number(settings.timeoutMs) || 4000);
  let lastError;

  for (let index = 0; index <= retries; index += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const items = await provider(type, {signal: controller.signal, config: config()});
      return {provider: providerName, items};
    } catch (error) {
      lastError = error;
      if (index < retries) await wait(150 * (2 ** index));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function mergeKey(item) {
  if (item.externalKey) return `${item.type || ''}:${item.externalKey}`;
  if (item.slug && item.date) return `${item.type || ''}:${item.slug}:${item.date}`;
  if (item.slug) return `${item.type || ''}:${item.slug}`;
  return item.id;
}

function hiddenGroupKey(item) {
  const key = mergeKey(item);
  return item.type === 'gallery' ? String(key).split(':image:')[0] : key;
}

export function mergeContent(items, policy = 'merge') {
  const priority = policy === 'supabase-first' ? ['supabase', 'contentful'] : ['contentful', 'supabase'];
  const hidden = new Set(items
    .filter(item => item.source === 'contentful' && item.locallyHidden)
    .map(hiddenGroupKey));
  const map = new Map();
  for (const item of items) {
    if (item.locallyHidden) continue;
    const key = mergeKey(item);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, item);
      continue;
    }
    const currentTime = Date.parse(current.updatedAt) || 0;
    const itemTime = Date.parse(item.updatedAt) || 0;
    if (itemTime > currentTime ||
        (itemTime === currentTime && priority.indexOf(item.source) < priority.indexOf(current.source))) {
      map.set(key, {...current, ...item});
    }
  }
  return [...map.values()]
    .filter(item => !hidden.has(hiddenGroupKey(item)) && isVisible(item))
    .sort((left, right) => {
      if (left.type === 'sermons') return (right.date || '').localeCompare(left.date || '');
      if (left.type === 'events') return (left.date || '').localeCompare(right.date || '');
      return (left.sortOrder || 0) - (right.sortOrder || 0);
    });
}

async function snapshot(type) {
  const snapshotUrl = config().content?.snapshotUrl || '/content-snapshot.json';
  const response = await fetch(snapshotUrl, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Content snapshot failed with HTTP ${response.status}.`);
  const data = await response.json();
  const items = data?.[type];
  if (!Array.isArray(items)) throw new Error('Content snapshot has no matching content type.');
  return items;
}

async function refresh(type) {
  const mode = cmsMode();
  if (mode === 'off') throw new Error('CMS requests are disabled by the test switch.');
  const requests = [];
  const settings = config();
  if ((!mode || mode === 'contentful') && settings.contentful?.spaceId &&
      settings.contentful?.environment && settings.contentful?.deliveryToken) {
    requests.push(attempt(fetchContentful, type, 'contentful'));
  }
  if ((!mode || mode === 'supabase') && settings.supabase?.url && settings.supabase?.anonKey) {
    requests.push(attempt(fetchSupabase, type, 'supabase'));
  }
  if (!requests.length) throw new Error('No CMS providers are configured for this request.');
  const results = await Promise.allSettled(requests);
  const fulfilled = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const rejected = results.filter(result => result.status === 'rejected');
  if (debugMode()) {
    console.info('[content-service] Provider health', {
      type,
      contentful: fulfilled.some(result => result.provider === 'contentful'),
      supabase: fulfilled.some(result => result.provider === 'supabase')
    });
  } else if (rejected.length) {
    console.warn(`[content-service] One or more content sources failed for ${type}.`);
  }

  if (!fulfilled.length) throw new AggregateError(rejected.map(result => result.reason), 'All configured content sources failed.');
  const policy = config().content?.policy || 'merge';
  const records = fulfilled.flatMap(result => result.items.map(item => ({...item, type})));
  const merged = mergeContent(records, policy);
  const sources = [...new Set(fulfilled.map(result => result.provider))];
  writeCache(type, merged);
  lastSources.set(type, sources.length > 1 ? 'merged' : sources[0]);
  return merged;
}

export async function getContent(type, {limit = null, forceRefresh = false} = {}) {
  const cached = readCache(type);
  if (cached && !forceRefresh && cacheIsFresh(cached)) {
    lastSources.set(type, 'cache');
    const visible = cached.items.filter(item => isVisible(item));
    return limit ? visible.slice(0, limit) : visible;
  }

  if (cached && !forceRefresh) {
    refresh(type).then(() => announceUpdate(type)).catch(error => {
      if (debugMode()) console.info(`[content-service] Background refresh failed for ${type}.`, error);
    });
    const visible = cached.items.filter(item => isVisible(item));
    return limit ? visible.slice(0, limit) : visible;
  }

  let items;
  try {
    items = await refresh(type);
  } catch (sourceError) {
    if (cached?.items?.length) {
      lastSources.set(type, 'cache');
      items = cached.items.filter(item => isVisible(item));
    } else {
      try {
        items = await snapshot(type);
        lastSources.set(type, 'snapshot');
      } catch (snapshotError) {
        lastSources.set(type, '');
        if (debugMode()) console.info(`[content-service] No source, cache, or snapshot for ${type}.`, sourceError, snapshotError);
        items = [];
      }
    }
  }
  return limit ? items.slice(0, limit) : items;
}

export function getContentSource(type) {
  return lastSources.get(type) || '';
}
