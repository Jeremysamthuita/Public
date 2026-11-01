const CACHE_VERSION = 1;
const CACHE_PREFIX = 'aic-content-v1:';

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readCache(type) {
  try {
    const raw = storage()?.getItem(`${CACHE_PREFIX}${type}`);
    const item = raw ? JSON.parse(raw) : null;
    if (item?.version === CACHE_VERSION && Array.isArray(item.items)) return item;
  } catch (error) {
    console.warn('[content-cache] Could not read cache.', error);
  }
  return null;
}

export function writeCache(type, items) {
  try {
    storage()?.setItem(`${CACHE_PREFIX}${type}`, JSON.stringify({
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      items
    }));
  } catch (error) {
    console.warn('[content-cache] Could not save cache.', error);
  }
}
