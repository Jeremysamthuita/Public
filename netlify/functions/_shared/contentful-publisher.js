const contentTypeIds = {
  sermons: 'sermons',
  events: 'upcomingEvent',
  announcements: 'announcement',
  gallery: 'galleryImage',
  leadership: 'leadershipProfile',
  ministries: 'ministry',
  service_times: 'serviceTime',
  settings: 'siteSetting'
};

const fieldMappings = {
  sermons: {
    title: 'title', preacher: 'preacher', ministry_title: 'ministryTitle', scripture_reference: 'scriptureReference',
    series: 'series', sermon_date: 'date', description: 'description', preview_image_url: 'previewImageUrl',
    pdf_url: 'pdfUrl', audio_url: 'audioUrl', video_url: 'videoUrl', tags: 'tags', featured: 'featured'
  },
  events: {
    title: 'title', event_date: 'date', end_date: 'endDate', event_time: 'time', location: 'location',
    description: 'description', flyer_url: 'flyerUrl', flyer_alt: 'flyerAlt', registration_url: 'registrationUrl',
    category: 'category', active: 'active'
  },
  announcements: {
    announcement_text: 'text', link_url: 'linkUrl', link_label: 'linkLabel', severity: 'severity',
    starts_at: 'startsAt', ends_at: 'endsAt'
  },
  gallery: {image_url: 'imageUrl', alt: 'alt', caption: 'caption'},
  leadership: {
    group_name: 'group', name: 'name', role: 'role', bio: 'bio', message: 'message', photo_url: 'photoUrl', active: 'active'
  },
  ministries: {
    name: 'name', description: 'description', leader: 'leader', meeting_time: 'meetingTime', contact: 'contact',
    image_url: 'imageUrl', accepting_applications: 'acceptingApplications'
  },
  service_times: {label: 'label', day: 'day', start_time: 'start', end_time: 'end', is_live: 'isLive'},
  settings: {setting_key: 'settingKey', setting_value: 'settingValue'}
};

function settings() {
  const {CONTENTFUL_SPACE_ID: space, CONTENTFUL_MANAGEMENT_TOKEN: token} = process.env;
  if (!space || !token) throw new Error('Contentful publishing is not configured.');
  return {
    space,
    token,
    environment: process.env.CONTENTFUL_ENV || process.env.CONTENTFUL_ENVIRONMENT || 'master',
    locale: process.env.CONTENTFUL_LOCALE || 'en-US'
  };
}

async function cmaRequest(config, path, {method = 'GET', body = null, version = null, contentTypeId = null} = {}) {
  const headers = {Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.contentful.management.v1+json'};
  if (body !== null) headers['Content-Type'] = 'application/vnd.contentful.management.v1+json';
  if (version !== null) headers['X-Contentful-Version'] = String(version);
  if (contentTypeId) headers['X-Contentful-Content-Type'] = contentTypeId;
  const result = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(config.space)}/environments/${encodeURIComponent(config.environment)}${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  if (!result.ok) {
    let message = `Contentful returned HTTP ${result.status}.`;
    try {
      const details = await result.json();
      message = details.message || details.details || message;
    } catch {}
    const error = new Error(message);
    error.status = result.status;
    throw error;
  }
  if (result.status === 204) return null;
  return result.json();
}

function fieldValue(type, name, value, locale) {
  if (value === null || value === undefined || value === '') return undefined;
  if ((name.endsWith('_date') || name.endsWith('_at')) && typeof value === 'string') return {[locale]: value};
  return {[locale]: value};
}

function entryFields(type, row, locale) {
  const fields = {};
  for (const [column, fieldId] of Object.entries(fieldMappings[type])) {
    const value = fieldValue(type, column, row[column], locale);
    if (value) fields[fieldId] = value;
  }
  if (row.slug) fields.slug = {[locale]: row.slug};
  return fields;
}

export async function publishContentful(type, row, action) {
  if (['unpublish', 'delete', 'permanent_delete'].includes(action) && !row.contentful_id) return {id: null, version: null};
  const config = settings();
  const contentTypeId = contentTypeIds[type];
  if (!contentTypeId) throw new Error('This content type is not configured for publishing.');
  if (action === 'permanent_delete') {
    let existing = await cmaRequest(config, `/entries/${encodeURIComponent(row.contentful_id)}`);
    if (existing.sys.publishedVersion) {
      await cmaRequest(config, `/entries/${encodeURIComponent(existing.sys.id)}/published/${existing.sys.version}`, {method:'DELETE'});
      existing = await cmaRequest(config, `/entries/${encodeURIComponent(row.contentful_id)}`);
    }
    await cmaRequest(config, `/entries/${encodeURIComponent(existing.sys.id)}`, {method:'DELETE', version:existing.sys.version});
    return {id: null, version: null};
  }
  const fields = entryFields(type, row, config.locale);
  let entry;
  if (row.contentful_id) {
    entry = await cmaRequest(config, `/entries/${encodeURIComponent(row.contentful_id)}`);
    entry = await cmaRequest(config, `/entries/${encodeURIComponent(row.contentful_id)}`, {
      method: 'PUT', version: entry.sys.version,
      body: {fields}
    });
  } else {
    entry = await cmaRequest(config, '/entries', {
      method: 'POST',
      body: {fields},
      contentTypeId
    });
  }

  if (action === 'unpublish' || action === 'delete') {
    if (entry.sys.publishedVersion) {
      await cmaRequest(config, `/entries/${encodeURIComponent(entry.sys.id)}/published/${entry.sys.version}`, {method: 'DELETE'});
    }
    return {id: entry.sys.id, version: entry.sys.version};
  }

  if (action === 'publish' || action === 'restore') {
    entry = await cmaRequest(config, `/entries/${encodeURIComponent(entry.sys.id)}/published`, {
      method: 'PUT', version: entry.sys.version
    });
  }
  return {id: entry.sys.id, version: entry.sys.version};
}

export function contentTypeIdFor(type) {
  return contentTypeIds[type] || null;
}
