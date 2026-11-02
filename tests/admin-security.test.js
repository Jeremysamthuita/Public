import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler as usersHandler} from '../netlify/functions/admin-users.js';

test('an editor calling the admin user function directly is rejected before any admin action', async () => {
  const originalFetch = globalThis.fetch;
  const oldEnv = Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_MFA_REQUIRED'].map(key => [key,process.env[key]]));
  const calls = [];
  process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  process.env.ADMIN_MFA_REQUIRED = 'false';
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',email:'editor@example.test'}),{status:200});
    if (String(url).includes('/rest/v1/profiles')) return new Response(JSON.stringify([{id:'00000000-0000-4000-8000-000000000001',role:'editor',is_active:true}]),{status:200});
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const result = await usersHandler({httpMethod:'POST',headers:{origin:'https://aicegertonchapel.netlify.app',authorization:'Bearer test-token'},body:JSON.stringify({action:'invite',email:'new@example.test',role:'admin'})});
    assert.equal(result.statusCode,403);
    assert.equal(calls.length,2);
    assert.equal(calls.some(url => url.includes('/auth/v1/invite')),false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(oldEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('editor rendering keeps CMS text as text instead of interpreting HTML', async () => {
  const source = await readFile(new URL('../assets/js/admin/admin-dashboard.js',import.meta.url),'utf8');
  assert.match(source,/textContent\s*=\s*[^;]+/);
  assert.doesNotMatch(source,/\.innerHTML\s*=/);
});

test('admin pages start hidden until session verification and the public admin route is login-only', async () => {
  const [login,dashboard,consolePage,legacy,styles] = await Promise.all([
    readFile(new URL('../admin/index.html',import.meta.url),'utf8'),
    readFile(new URL('../admin/dashboard.html',import.meta.url),'utf8'),
    readFile(new URL('../admin/console.html',import.meta.url),'utf8'),
    readFile(new URL('../admin.html',import.meta.url),'utf8'),
    readFile(new URL('../assets/css/admin.css',import.meta.url),'utf8')
  ]);
  assert.match(dashboard,/<html[^>]*auth-checking/);
  assert.match(consolePage,/<html[^>]*auth-checking/);
  assert.match(styles,/auth-checking body\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(login,/recentPosts|consolePanel|contentForm/);
  assert.match(legacy,/\/admin\//);
});
