import {contentTypeName, normalizeRecord, tableName} from '../../../assets/js/content/normalize.js';

const types = ['sermons', 'events', 'leadership', 'gallery', 'announcements', 'ministries', 'service_times', 'settings'];
const fieldsByType = {
  sermons: item => ({
    title: item.title,
    preacher: item.preacher || null,
    ministry_title: item.ministryTitle || null,
    scripture_reference: item.scriptureReference || null,
    series: item.series || null,
    sermon_date: item.date || null,
    description: item.description || null,
    preview_image_url: item.previewImageUrl || null,
    pdf_url: item.pdfUrl || null,
    files: item.files || [],
    audio_url: item.audioUrl || null,
    video_url: item.videoUrl || null,
    tags: item.tags || [],
    featured: Boolean(item.featured)
  }),
  events: item => ({
    title: item.title,
    event_date: item.date || null,
    end_date: item.endDate || null,
    event_time: item.time || null,
    location: item.location || null,
    description: item.description || null,
    flyer_url: item.flyerUrl || null,
    flyer_alt: item.flyerAlt || null,
    registration_url: item.registrationUrl || null,
    category: item.category || null,
    active: item.active !== false
  }),
  leadership: item => ({
    group_name: item.group,
    name: item.name,
    role: item.role || null,
    bio: item.bio || null,
    message: item.message || null,
    photo_url: item.photoUrl || null,
    active: item.active !== false
  }),
  gallery: item => ({image_url: item.imageUrl, alt: item.alt || '', caption: item.caption || null}),
  announcements: item => ({
    announcement_text: item.text,
    link_url: item.linkUrl || null,
    link_label: item.linkLabel || null,
    severity: item.severity || 'info',
    starts_at: item.startsAt || null,
    ends_at: item.endsAt || null
  }),
  ministries: item => ({
    name: item.name,
    description: item.description || null,
    leader: item.leader || null,
    meeting_time: item.meetingTime || null,
    contact: item.contact || null,
    image_url: item.imageUrl || null,
    accepting_applications: Boolean(item.acceptingApplications)
  }),
  service_times: item => ({
    label: item.label,
    day: item.day,
    start_time: item.start || null,
    end_time: item.end || null,
    is_live: Boolean(item.isLive)
  }),
  settings: item => ({
    setting_key: item.settingKey,
    setting_value: item.value || item.setting_value || {}
  })
};

function getSettings() {
  const {SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONTENTFUL_SPACE_ID, CONTENTFUL_DELIVERY_TOKEN} = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CONTENTFUL_SPACE_ID || !CONTENTFUL_DELIVERY_TOKEN) {
    throw new Error('CMS sync requires Supabase service credentials and Contentful delivery configuration.');
  }
  const url = new URL(SUPABASE_URL);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Supabase URL must use HTTP or HTTPS.');
  return {
    supabaseUrl: url.origin,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    contentful: {
      spaceId: CONTENTFUL_SPACE_ID,
      environment: process.env.CONTENTFUL_ENV || process.env.CONTENTFUL_ENVIRONMENT || 'master',
      token: CONTENTFUL_DELIVERY_TOKEN
    }
  };
}

async function supabaseRequest(settings, table, {method = 'GET', query = {}, body = null, prefer = ''} = {}) {
  const params = new URLSearchParams(query);
  const url = `${settings.supabaseUrl}/rest/v1/${table}${params.size ? `?${params}` : ''}`;
  const headers = {
    apikey: settings.serviceRoleKey,
    Authorization: `Bearer ${settings.serviceRoleKey}`,
    Accept: 'application/json'
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.message || payload.details || detail;
    } catch {}
    throw new Error(`Supabase request to ${table} failed: ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function mirrorRow(type, record) {
  const content = fieldsByType[type](record);
  const required = {
    sermons: Boolean(content.title && content.preacher && content.sermon_date),
    events: Boolean(content.title && content.event_date),
    leadership: Boolean(content.name && ['lcc', 'women', 'pastoral'].includes(content.group_name)),
    gallery: Boolean(content.image_url),
    announcements: Boolean(content.announcement_text),
    ministries: Boolean(content.name),
    service_times: Boolean(content.label && content.day),
    settings: Boolean(content.setting_key)
  };
  if (!required[type]) return null;
  return {
    ...content,
    source: 'contentful',
    contentful_id: record.id,
    slug: record.slug || null,
    is_published: record.isPublished !== false,
    publish_at: record.publishAt || null,
    unpublish_at: record.unpublishAt || null,
    sort_order: Number(record.sortOrder) || 0
  };
}

function expandGalleryRecords(records) {
  return records.flatMap(record => {
    const images = (record.images || [record.imageUrl]).filter(Boolean);
    if (images.length < 2) return [record];
    return images.map((imageUrl, index) => ({
      ...record,
      id: index === 0 ? record.id : `${record.id}:image:${index}`,
      externalKey: index === 0 ? record.externalKey : `${record.externalKey}:image:${index}`,
      imageUrl,
      images: [imageUrl],
      sortOrder: (record.sortOrder || 0) + index
    }));
  });
}

async function fetchEntries(type, settings) {
  const allItems = [];
  const assets = new Map();
  let total = Infinity;
  let skip = 0;
  while (skip < total) {
    const params = new URLSearchParams({
      access_token: settings.token,
      content_type: contentTypeName(type),
      include: '2',
      limit: '1000',
      skip: String(skip)
    });
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(settings.spaceId)}/environments/${encodeURIComponent(settings.environment)}/entries?${params}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error(`Contentful ${type} request returned HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page.items)) throw new Error(`Contentful returned an invalid ${type} response.`);
    allItems.push(...page.items);
    for (const asset of page.includes?.Asset || []) assets.set(asset.sys.id, asset);
    total = Number(page.total) || allItems.length;
    skip += page.items.length;
    if (!page.items.length) break;
  }
  return allItems.map(entry => normalizeRecord(type, entry, {
    source: 'contentful',
    assets: [...assets.values()]
  }));
}

function quotePostgrestValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function reconcileType(settings, type, records) {
  const table = tableName(type);
  const entries = type === 'gallery' ? expandGalleryRecords(records) : records;
  const rows = entries.map(record => mirrorRow(type, record)).filter(Boolean);
  for (let offset = 0; offset < rows.length; offset += 500) {
    await supabaseRequest(settings, table, {
      method: 'POST',
      query: {on_conflict: 'contentful_id'},
      body: rows.slice(offset, offset + 500),
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }

  const existing = [];
  for (let offset = 0; ; offset += 1000) {
    const data = await supabaseRequest(settings, table, {
      query: {
        select: 'contentful_id', source: 'eq.contentful',
        order: 'contentful_id.asc', offset: String(offset), limit: '1000'
      }
    });
    existing.push(...(data || []).map(row => row.contentful_id).filter(Boolean));
    if (!data || data.length < 1000) break;
  }
  const retained = new Set(rows.map(row => row.contentful_id));
  const stale = existing.filter(id => !retained.has(id));
  for (let offset = 0; offset < stale.length; offset += 500) {
    const ids = stale.slice(offset, offset + 500).map(quotePostgrestValue).join(',');
    await supabaseRequest(settings, table, {
      method: 'PATCH',
      query: {contentful_id: `in.(${ids})`},
      body: {is_published: false},
      prefer: 'return=minimal'
    });
  }
  return rows.length;
}

async function recordSync(settings, record) {
  await supabaseRequest(settings, 'cms_sync_log', {
    method: 'POST',
    body: record,
    prefer: 'return=minimal'
  });
}

export async function runCmsSync(requestedTypes = types, createdBy = null) {
  const selectedTypes = [...new Set(requestedTypes)].filter(type => types.includes(type));
  if (!selectedTypes.length) throw new Error('No supported content types were requested.');
  const settings = getSettings();
  const results = await Promise.all(selectedTypes.map(async type => {
    const startedAt = new Date().toISOString();
    try {
      const entries = await fetchEntries(type, settings.contentful);
      const count = await reconcileType(settings, type, entries);
      const result = {
        provider: 'contentful', content_type: type, status: 'success',
        message: `Reconciled ${count} published entries.`, record_count: count,
        created_by: createdBy, started_at: startedAt, completed_at: new Date().toISOString()
      };
      await recordSync(settings, result);
      return result;
    } catch (error) {
      const result = {
        provider: 'contentful', content_type: type, status: 'failed',
        message: error.message, record_count: 0, created_by: createdBy,
        started_at: startedAt, completed_at: new Date().toISOString()
      };
      try {
        await recordSync(settings, result);
      } catch (logError) {
        return {...result, message: `${error.message} Sync-log write also failed: ${logError.message}`};
      }
      return result;
    }
  }));
  return {
    synced: results.filter(result => result.status === 'success').reduce((sum, item) => sum + item.record_count, 0),
    types: results.length,
    failures: results.filter(result => result.status === 'failed').map(({content_type, message}) => ({content_type, message})),
    results
  };
}

export function supportedContentTypes() {
  return [...types];
}
