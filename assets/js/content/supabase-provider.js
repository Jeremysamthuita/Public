import {normalizeRecord, tableName} from './normalize.js';

export async function fetchSupabase(type, {signal, config = window.AIC_SITE_CONFIG || {}} = {}) {
  const settings = config.supabase || {};
  if (!settings.url || !settings.anonKey) throw new Error('Supabase is not configured.');

  const base = new URL(settings.url);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Supabase URL must use HTTP or HTTPS.');
  const params = new URLSearchParams({
    select: '*',
    is_published: 'eq.true',
    order: type === 'sermons' ? 'sermon_date.desc'
      : type === 'events' ? 'event_date.asc' : 'sort_order.asc'
  });
  const now = new Date().toISOString();
  params.set('and', `(or(publish_at.is.null,publish_at.lte.${now}),or(unpublish_at.is.null,unpublish_at.gt.${now}))`);
  const url = `${base.origin}/rest/v1/${tableName(type)}?${params}`;
  const rows = [];

  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(url, {
      signal,
      headers: {
        apikey: settings.anonKey,
        Authorization: `Bearer ${settings.anonKey}`,
        Accept: 'application/json',
        Range: `${offset}-${offset + 999}`
      }
    });
    if (!response.ok) throw new Error(`Supabase request failed with HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid content response.');
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.map(item => normalizeRecord(type, item, {source: item.source || 'supabase'}));
}
