(function () {
  const databaseName = 'aic-content';
  const storeName = 'snapshots';
  const storageKey = 'aic-content-snapshot-v1';
  const embeddedVersion = document.querySelector('meta[name="content-version"]')?.content || '';
  const embeddedGeneratedAt = Date.parse(document.querySelector('meta[name="content-generated-at"]')?.content || '') || 0;
  const state = {snapshot: null, etag: '', ready: null, refresh: null};
  let pendingRefresh = null;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, {keyPath: 'key'});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open IndexedDB.'));
    });
  }

  async function readIndexedSnapshot() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get('latest');
      request.onsuccess = () => {
        database.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error('Could not read the cached snapshot.'));
      };
    });
  }

  async function saveSnapshot(record) {
    let database;
    let indexedDbError;
    try {
      database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put({...record, key: 'latest'});
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Could not save the snapshot.'));
        transaction.onabort = () => reject(transaction.error || new Error('Snapshot storage was aborted.'));
      });
      return;
    } catch (error) {
      indexedDbError = error;
    } finally {
      database?.close();
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch (error) {
      console.warn('[content-bootstrap] Snapshot could not be cached.', indexedDbError, error);
    }
  }

  function readLocalSnapshot() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.info('[content-bootstrap] Local snapshot cache is unavailable.', error);
      return null;
    }
  }

  function isUsable(record) {
    const snapshot = record?.snapshot;
    if (!snapshot || !snapshot.version || typeof snapshot !== 'object') return false;
    const cachedAt = Date.parse(snapshot.generatedAt || '') || 0;
    return !embeddedGeneratedAt || cachedAt >= embeddedGeneratedAt ||
      snapshot.version === embeddedVersion;
  }

  async function loadCachedSnapshot() {
    let record;
    try {
      record = await readIndexedSnapshot();
    } catch (error) {
      console.info('[content-bootstrap] IndexedDB cache is unavailable; trying local storage.', error);
    }
    if (!record) record = readLocalSnapshot();
    if (isUsable(record)) {
      state.snapshot = record.snapshot;
      state.etag = record.etag || '';
    }
  }

  function notifyContentChanged(previousVersion, nextVersion) {
    if (previousVersion === nextVersion) return;
    for (const type of Object.keys(state.snapshot || {})) {
      if (Array.isArray(state.snapshot[type])) {
        window.dispatchEvent(new CustomEvent('aic:content-updated', {detail: {type}}));
      }
    }
  }

  function refreshSnapshot() {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = (async () => {
      const headers = state.etag ? {'If-None-Match': state.etag} : {};
      const response = await fetch('/content-snapshot.json', {
        cache: 'no-cache',
        headers,
        signal: AbortSignal.timeout(10000)
      });
      if (response.status === 304 && state.snapshot) return state.snapshot;
      if (!response.ok) throw new Error(`Content snapshot returned HTTP ${response.status}.`);
      const snapshot = await response.json();
      if (!snapshot || !['string', 'number'].includes(typeof snapshot.version)) {
        throw new Error('Content snapshot has an invalid shape.');
      }
      const snapshotGeneratedAt = Date.parse(snapshot.generatedAt || '') || 0;
      if (embeddedGeneratedAt && snapshotGeneratedAt < embeddedGeneratedAt &&
          snapshot.version !== embeddedVersion) {
        throw new Error('The cached content snapshot is older than the page content.');
      }
      const previousVersion = state.snapshot?.version || '';
      state.snapshot = snapshot;
      state.etag = response.headers.get('etag') || '';
      await saveSnapshot({snapshot, etag: state.etag});
      notifyContentChanged(previousVersion || embeddedVersion, snapshot.version);
      return snapshot;
    })().catch(error => {
      console.warn('[content-bootstrap] Background snapshot refresh failed.', error);
      throw error;
    }).finally(() => {
      pendingRefresh = null;
    });
    return pendingRefresh;
  }

  state.ready = loadCachedSnapshot();
  state.refresh = refreshSnapshot;
  window.AIC_CONTENT_BOOTSTRAP = state;
  state.ready.then(() => {
    if (document.visibilityState !== 'hidden') refreshSnapshot().catch(() => {});
  }).catch(error => {
    console.warn('[content-bootstrap] Could not initialize the content cache.', error);
  });

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') refreshSnapshot().catch(() => {});
  };
  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  window.setInterval(refreshWhenVisible, 150000);
})();
