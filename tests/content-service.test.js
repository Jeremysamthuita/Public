import assert from 'node:assert/strict';
import test from 'node:test';
import {isVisible, normalizeRecord} from '../assets/js/content/normalize.js';
import {getContent, getContentSource} from '../assets/js/content/content-service.js';
import {fetchSupabase} from '../assets/js/content/supabase-provider.js';

function installBrowserConfig(t) {
  const entries = new Map();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousFetch = globalThis.fetch;
  globalThis.location = {origin: 'https://church.example'};
  globalThis.window = {
    location: {search: ''},
    AIC_SITE_CONFIG: {
      contentful: {
        spaceId: 'space',
        environment: 'master',
        deliveryToken: 'delivery-token'
      },
      supabase: {
        url: 'https://project.supabase.co',
        anonKey: 'public-key'
      },
      content: {timeoutMs: 1000, retries: 0, cacheTtlMinutes: 30}
    },
    localStorage: {
      getItem: key => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value)
    }
  };
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.location = previousLocation;
    globalThis.fetch = previousFetch;
  });
  return entries;
}

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => body
  };
}

test('historical sermons remain visible while past events are filtered', () => {
  const sermon = normalizeRecord('sermons', {
    id: 'sermon-1',
    title: 'Sunday Message',
    preacher: 'Rev. Example',
    sermon_date: '2020-01-01',
    is_published: true
  });
  const event = normalizeRecord('events', {
    id: 'event-1',
    title: 'Past event',
    event_date: '2020-01-01',
    is_published: true
  });

  assert.equal(isVisible({...sermon, type: 'sermons'}), true);
  assert.equal(isVisible({...event, type: 'events'}), false);
});

test('merges duplicate Contentful and Supabase records and uses the newer copy', async t => {
  installBrowserConfig(t);
  globalThis.fetch = async url => {
    if (String(url).includes('cdn.contentful.com')) {
      return jsonResponse({
        items: [{
          sys: {id: 'cf-sermon-1', updatedAt: '2025-01-01T00:00:00Z'},
          fields: {
            title: 'Original title',
            preacher: 'Rev. Example',
            date: '2020-01-01'
          }
        }]
      });
    }
    return jsonResponse([{
      id: 'supabase-sermon-1',
      contentful_id: 'cf-sermon-1',
      source: 'contentful',
      title: 'Updated title',
      preacher: 'Rev. Example',
      sermon_date: '2020-01-01',
      is_published: true,
      locally_hidden: false,
      updated_at: '2026-01-01T00:00:00Z'
    }]);
  };

  const records = await getContent('sermons', {forceRefresh: true});
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'Updated title');
  assert.equal(records[0].source, 'contentful');
  assert.equal(getContentSource('sermons'), 'merged');
});

test('a local hide suppresses the matching published Contentful record', async t => {
  installBrowserConfig(t);
  globalThis.fetch = async url => {
    if (String(url).includes('cdn.contentful.com')) {
      return jsonResponse({
        items: [{
          sys: {id: 'cf-hidden-sermon'},
          fields: {title: 'Hidden title', preacher: 'Rev. Example', date: '2020-01-01'}
        }]
      });
    }
    return jsonResponse([{
      id: 'mirror-id',
      contentful_id: 'cf-hidden-sermon',
      source: 'contentful',
      title: 'Hidden title',
      preacher: 'Rev. Example',
      sermon_date: '2020-01-01',
      is_published: true,
      locally_hidden: true
    }]);
  };

  assert.deepEqual(await getContent('sermons', {forceRefresh: true}), []);
});

test('hiding a mirrored gallery entry hides all images copied from that entry', async t => {
  installBrowserConfig(t);
  globalThis.fetch = async url => {
    if (String(url).includes('cdn.contentful.com')) {
      return jsonResponse({
        items: [{
          sys: {id: 'cf-gallery'},
          fields: {img: [{sys: {id: 'image-1'}}, {sys: {id: 'image-2'}}]}
        }],
        includes: {Asset: [
          {sys: {id: 'image-1'}, fields: {file: {url: '//images.example/one.jpg'}}},
          {sys: {id: 'image-2'}, fields: {file: {url: '//images.example/two.jpg'}}}
        ]}
      });
    }
    return jsonResponse([
      {id: 'mirror-1', contentful_id: 'cf-gallery', source: 'contentful', image_url: 'https://images.example/one.jpg', is_published: true, locally_hidden: true},
      {id: 'mirror-2', contentful_id: 'cf-gallery:image:1', source: 'contentful', image_url: 'https://images.example/two.jpg', is_published: true, locally_hidden: false}
    ]);
  };

  assert.deepEqual(await getContent('gallery', {forceRefresh: true}), []);
});

test('premium sermon media is never exposed in public normalized content', () => {
  const sermon = normalizeRecord('sermons', {
    id: 'premium-1',
    title: 'Premium Message',
    preacher: 'Rev. Example',
    sermon_date: '2020-01-01',
    is_premium: true,
    pdf_url: 'https://media.example/private.pdf',
    audio_url: 'https://media.example/private.mp3',
    is_published: true
  });

  assert.equal(sermon.isPremium, true);
  assert.equal(sermon.pdfUrl, '');
  assert.equal(sermon.audioUrl, '');
});

test('Supabase queries include rows needed for local mirror hiding', async t => {
  let requestUrl;
  let requestOptions;
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options) => {
    requestUrl = new URL(url);
    requestOptions = options;
    return jsonResponse([]);
  };
  await fetchSupabase('sermons', {
    config: {supabase: {url: 'https://project.supabase.co', anonKey: 'public-key'}}
  });

  assert.equal(requestUrl.pathname, '/rest/v1/cms_sermons');
  assert.equal(requestUrl.searchParams.has('locally_hidden'), false);
  assert.match(requestUrl.searchParams.get('and'), /or\(unpublish_at\.is\.null/);
  assert.equal(requestOptions.headers.Range, '0-999');
});

test('normalizes Contentful gallery entries with multiple linked images', () => {
  const record = normalizeRecord('gallery', {
    sys: {id: 'gallery-1'},
    fields: {
      img: [{sys: {id: 'asset-1'}}, {sys: {id: 'asset-2'}}]
    }
  }, {
    source: 'contentful',
    assets: [
      {sys: {id: 'asset-1'}, fields: {file: {url: '//images.example/one.jpg'}}},
      {sys: {id: 'asset-2'}, fields: {file: {url: '//images.example/two.jpg'}}}
    ]
  });

  assert.deepEqual(record.images, [
    'https://images.example/one.jpg',
    'https://images.example/two.jpg'
  ]);
});

test('normalizes ministry category and joining guidance across CMS field names', () => {
  const record = normalizeRecord('ministries', {
    name: 'Youth Ministry',
    category: 'Youth',
    joining_information: 'Contact the ministry leader after Sunday service.',
    is_published: true
  });

  assert.equal(record.category, 'Youth');
  assert.equal(record.joiningInformation, 'Contact the ministry leader after Sunday service.');
});

test('normalizes public live-stream site settings from Contentful and Supabase shapes', () => {
  const fromContentful = normalizeRecord('settings', {
    sys: {id:'live-setting'},
    fields: {settingKey:'live_stream',settingValue:{channelId:'UC123',fallbackVideoId:'abcdefghijk'}}
  }, {source:'contentful'});
  const fromSupabase = normalizeRecord('settings', {
    setting_key:'live_stream',
    setting_value:{channelId:'UC123',fallbackVideoId:'abcdefghijk'},
    is_published:true
  });

  assert.equal(fromContentful.settingKey, 'live_stream');
  assert.equal(fromContentful.channelId, 'UC123');
  assert.equal(fromSupabase.settingKey, 'live_stream');
  assert.equal(fromSupabase.fallbackVideoId, 'abcdefghijk');
});

test('public settings omit unknown values such as private API keys', () => {
  const record = normalizeRecord('settings', {
    setting_key:'live_stream',
    setting_value:{
      channelId:'UC123',
      fallbackTitle:'Latest service',
      apiKey:'must-not-be-published',
      secret:'must-not-be-published'
    },
    is_published:true
  });

  assert.equal(record.channelId, 'UC123');
  assert.equal(record.fallbackTitle, 'Latest service');
  assert.equal(JSON.stringify(record).includes('must-not-be-published'), false);
});
