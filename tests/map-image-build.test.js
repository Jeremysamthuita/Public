import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/generate-map-image.mjs', import.meta.url));

test('local builds without a map key retain generated images and warn', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {...process.env, GOOGLE_MAPS_STATIC_KEY: '', NETLIFY: ''}
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /keeping any existing generated map images/);
});

test('Netlify builds require the server-side static map key', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {...process.env, GOOGLE_MAPS_STATIC_KEY: '', NETLIFY: 'true'}
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GOOGLE_MAPS_STATIC_KEY is required/);
});
