import {contentTypeName, normalizeRecord} from './normalize.js';

export async function fetchContentful(type, {signal, config = window.AIC_SITE_CONFIG || {}} = {}) {
  const settings = config.contentful || {};
  if (!settings.spaceId || !settings.environment || !settings.deliveryToken) {
    throw new Error('Contentful is not configured.');
  }

  const items = [];
  const assets = new Map();
  let total = Infinity;
  let skip = 0;
  while (skip < total) {
    const params = new URLSearchParams({
      access_token: settings.deliveryToken,
      content_type: contentTypeName(type),
      include: '2',
      limit: '1000',
      skip: String(skip)
    });
    if (type === 'sermons') params.set('order', '-fields.date');
    if (type === 'events') params.set('order', 'fields.date');
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(settings.spaceId)}/environments/${encodeURIComponent(settings.environment)}/entries?${params}`;
    const response = await fetch(url, {signal, cache: 'no-store'});
    if (!response.ok) throw new Error(`Contentful request failed with HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('Contentful returned an invalid content response.');
    items.push(...data.items);
    for (const asset of data.includes?.Asset || []) assets.set(asset.sys.id, asset);
    total = Number(data.total) || items.length;
    skip += data.items.length;
    if (!data.items.length) break;
  }
  return items.map(item => normalizeRecord(type, item, {
    source: 'contentful',
    assets: [...assets.values()]
  }));
}
