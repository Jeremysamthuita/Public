import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function installServiceWorker(t) {
  const listeners = new Map();
  let fetchCalls = 0;
  const context = {
    URL,
    Request,
    Response,
    console,
    fetch: async () => {
      fetchCalls += 1;
      return new Response('ok');
    },
    caches: {
      open: async () => {
        throw new Error('Private requests must not access the cache.');
      }
    },
    self: {
      location: new URL('https://church.example'),
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: () => {},
      clients: {claim: () => {}}
    }
  };
  vm.runInNewContext(source, context);
  t.after(() => {
    assert.equal(fetchCalls, 0);
  });
  return listeners.get('fetch');
}

test('service worker bypasses admin pages, admin assets, functions, APIs, and auth', t => {
  const handleFetch = installServiceWorker(t);
  const privateUrls = [
    'https://church.example/admin/',
    'https://church.example/admin/dashboard.html',
    'https://church.example/assets/css/admin.css',
    'https://church.example/assets/js/admin/admin-dashboard.js',
    'https://church.example/.netlify/functions/admin-session',
    'https://church.example/api/admin-session',
    'https://project.supabase.co/auth/v1/token'
  ];

  for (const url of privateUrls) {
    let intercepted = false;
    handleFetch({
      request: {method: 'GET', url, mode: 'cors', destination: ''},
      respondWith: () => { intercepted = true; }
    });
    assert.equal(intercepted, false, `${url} should bypass the service worker`);
  }
});
