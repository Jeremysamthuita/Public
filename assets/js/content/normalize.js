const contentfulTypes = {
  sermons: 'sermons',
  events: 'upcomingEvent',
  leadership: 'leadershipProfile',
  gallery: 'galleryImage',
  announcements: 'announcement',
  ministries: 'ministry',
  service_times: 'serviceTime',
  settings: 'siteSetting'
};

const cmsTables = {
  sermons: 'cms_sermons',
  events: 'cms_events',
  leadership: 'cms_leadership',
  gallery: 'cms_gallery',
  announcements: 'cms_announcements',
  ministries: 'cms_ministries',
  service_times: 'cms_service_times',
  settings: 'cms_settings'
};

export function contentTypeName(type) {
  return contentfulTypes[type] || type;
}

export function tableName(type) {
  return cmsTables[type] || `cms_${type}`;
}

export function normalizeDate(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fieldValue(fields, ...names) {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null) return value;
  }
  return '';
}

function assetUrl(value, assets = []) {
  const id = value?.sys?.id;
  const asset = id ? assets.find(item => item.sys?.id === id) : value;
  const raw = asset?.fields?.file?.url || asset?.url || value?.url || '';
  return raw.startsWith('//') ? `https:${raw}` : raw;
}

function cleanUrl(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw, globalThis.location?.origin || 'https://localhost');
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return url.protocol === 'https:' || localHttp ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeFiles(fields, assets) {
  const linked = fieldValue(fields, 'powerpoint', 'files');
  const links = Array.isArray(linked) ? linked : linked ? [linked] : [];
  return links.map(item => {
    const id = item?.sys?.id;
    const asset = assets.find(candidate => candidate.sys?.id === id);
    const url = cleanUrl(assetUrl(item, assets));
    if (!url) return null;
    const file = asset?.fields?.file || item;
    return {
      url,
      name: file.fileName || item?.name || asset?.fields?.title || 'Sermon resource',
      type: file.contentType || item?.type || ''
    };
  }).filter(Boolean);
}

function assetUrls(value, assets) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(item => cleanUrl(assetUrl(item, assets))).filter(Boolean);
}

export function normalizeRecord(type, record, {source = 'supabase', assets = []} = {}) {
  const fields = record.fields || record;
  const id = record.sys?.id || record.id || '';
  const externalKey = record.contentful_id || record.externalKey || id || record.slug || '';
  const base = {
    id,
    source,
    externalKey,
    slug: fields.slug || record.slug || '',
    publishAt: fields.publishAt || record.publish_at || null,
    unpublishAt: fields.unpublishAt || record.unpublish_at || null,
    isPublished: fields.isPublished ?? record.is_published ?? true,
    locallyHidden: fields.locallyHidden ?? record.locally_hidden ?? false,
    sortOrder: Number(fields.sortOrder ?? record.sort_order) || 0,
    updatedAt: record.sys?.updatedAt || record.updated_at || record.created_at || ''
  };

  if (type === 'sermons') {
    const sourceFiles = normalizeFiles(fields, assets);
    const isPremium = Boolean(fieldValue(fields, 'isPremium', 'is_premium'));
    const pdf = fieldValue(fields, 'sermonPdf', 'pdfUrl', 'pdf_url', 'resource_pack_url');
    const pdfUrl = cleanUrl(typeof pdf === 'string' ? pdf : assetUrl(pdf, assets));
    const pdfId = pdf?.sys?.id;
    const files = (isPremium ? [] : sourceFiles).filter(file => {
      const original = fieldValue(fields, 'powerpoint', 'files');
      const linked = Array.isArray(original) ? original : original ? [original] : [];
      const match = linked.find(item => assetUrl(item, assets) === file.url);
      return !pdfId || match?.sys?.id !== pdfId;
    });
    const audio = fieldValue(fields, 'audio', 'audioFile', 'audioUrl', 'audio_url');
    const preview = fieldValue(fields, 'previewImage', 'previewImageUrl', 'preview_image_url');
    const video = fieldValue(fields, 'videoUrl', 'youtubeUrl', 'video_url');
    return {
      ...base,
      title: fieldValue(fields, 'title'),
      preacher: fieldValue(fields, 'preacher'),
      ministryTitle: fieldValue(fields, 'ministryTitle', 'speakerTitle', 'ministry_title'),
      date: normalizeDate(fieldValue(fields, 'date', 'sermon_date')),
      series: fieldValue(fields, 'series'),
      scriptureReference: fieldValue(fields, 'scriptureReference', 'scripture_reference', 'scripture'),
      description: fieldValue(fields, 'description'),
      previewImageUrl: cleanUrl(typeof preview === 'string' ? preview : assetUrl(preview, assets)),
      pdfUrl: isPremium ? '' : pdfUrl,
      files,
      videoUrl: isPremium ? '' : cleanUrl(video),
      audioUrl: isPremium ? '' : cleanUrl(typeof audio === 'string' ? audio : assetUrl(audio, assets)),
      tags: Array.isArray(fields.tags) ? fields.tags : [],
      featured: Boolean(fields.featured),
      isPremium,
      premiumAmount: Number(fieldValue(fields, 'premiumAmount', 'premium_amount')) || 0,
      presentationAssets: files,
      pdfName: pdf?.fields?.file?.fileName || 'sermon.pdf'
    };
  }

  if (type === 'events') {
    return {
      ...base,
      title: fieldValue(fields, 'title'),
      date: normalizeDate(fieldValue(fields, 'date', 'event_date')),
      endDate: normalizeDate(fieldValue(fields, 'endDate', 'end_date')),
      time: fieldValue(fields, 'time', 'event_time'),
      location: fieldValue(fields, 'location'),
      description: fieldValue(fields, 'description'),
      flyerUrl: cleanUrl(typeof fields.flyer === 'string' ? fields.flyer : assetUrl(fields.flyer, assets) || fieldValue(fields, 'flyerUrl', 'flyer_url')),
      flyerAlt: fieldValue(fields, 'flyerAlt', 'flyer_alt'),
      registrationUrl: cleanUrl(fieldValue(fields, 'registrationUrl', 'registration_url')),
      category: fieldValue(fields, 'category'),
      active: fields.active !== false
    };
  }

  if (type === 'leadership') {
    const photo = fieldValue(fields, 'photo', 'photoUrl', 'photo_url');
    return {
      ...base,
      group: String(fieldValue(fields, 'group', 'group_name') || 'lcc').toLowerCase(),
      name: fieldValue(fields, 'name'),
      role: fieldValue(fields, 'role'),
      bio: fieldValue(fields, 'bio'),
      message: fieldValue(fields, 'message'),
      photoUrl: cleanUrl(typeof photo === 'string' ? photo : assetUrl(Array.isArray(photo) ? photo[0] : photo, assets)),
      sortOrder: Number(fields.sortOrder ?? record.sort_order) || 0,
      active: fields.active !== false
    };
  }

  if (type === 'gallery') {
    const image = fieldValue(fields, 'image', 'photo', 'img', 'imageUrl', 'image_url');
    const images = typeof image === 'string'
      ? [cleanUrl(image)].filter(Boolean)
      : assetUrls(image, assets);
    return {
      ...base,
      imageUrl: images[0] || '',
      images,
      alt: fieldValue(fields, 'alt', 'imageAlt', 'image_alt') || '',
      caption: fieldValue(fields, 'caption', 'title'),
      sortOrder: Number(fields.sortOrder ?? record.sort_order) || 0
    };
  }

  if (type === 'announcements') {
    return {
      ...base,
      text: fieldValue(fields, 'text', 'announcement_text', 'title'),
      linkUrl: cleanUrl(fieldValue(fields, 'linkUrl', 'link_url')),
      linkLabel: fieldValue(fields, 'linkLabel', 'link_label'),
      severity: fieldValue(fields, 'severity') || 'info',
      startsAt: fields.startsAt || record.starts_at || null,
      endsAt: fields.endsAt || record.ends_at || null
    };
  }

  if (type === 'ministries') {
    return {
      ...base,
      name: fieldValue(fields, 'name', 'title'),
      category: fieldValue(fields, 'category'),
      description: fieldValue(fields, 'description'),
      leader: fieldValue(fields, 'leader'),
      meetingTime: fieldValue(fields, 'meetingTime', 'meeting_time'),
      contact: fieldValue(fields, 'contact'),
      joiningInformation: fieldValue(fields, 'joiningInformation', 'joining_information'),
      imageUrl: cleanUrl(typeof fields.image === 'string' ? fields.image : assetUrl(fields.image, assets) || fieldValue(fields, 'imageUrl', 'image_url')),
      acceptingApplications: Boolean(fieldValue(fields, 'acceptingApplications', 'accepting_applications')),
      sortOrder: Number(fields.sortOrder ?? record.sort_order) || 0
    };
  }

  if (type === 'service_times') {
    return {
      ...base,
      label: fieldValue(fields, 'label', 'title'),
      day: fieldValue(fields, 'day'),
      start: fieldValue(fields, 'start', 'start_time'),
      end: fieldValue(fields, 'end', 'end_time'),
      isLive: Boolean(fieldValue(fields, 'isLive', 'is_live'))
    };
  }

  if (type === 'settings') {
    const rawValue = record.setting_value || fieldValue(fields, 'settingValue', 'value');
    const publicKeys = ['channelId', 'fallbackVideoId', 'fallbackTitle', 'liveMessage', 'offlineMessage'];
    const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? Object.fromEntries(publicKeys
        .filter(key => typeof rawValue[key] === 'string')
        .map(key => [key, rawValue[key]]))
      : {};
    return {
      ...base,
      ...value,
      value,
      settingKey: fieldValue(fields, 'settingKey', 'key') || record.setting_key || ''
    };
  }

  return {...base, ...fields};
}

export function isVisible(record, now = Date.now()) {
  if (!record.isPublished || record.locallyHidden) return false;
  if (record.active === false) return false;
  const publishAt = record.publishAt ? Date.parse(record.publishAt) : NaN;
  const unpublishAt = record.unpublishAt ? Date.parse(record.unpublishAt) : NaN;
  const startsAt = record.startsAt ? Date.parse(record.startsAt) : NaN;
  const endsAt = record.endsAt ? Date.parse(record.endsAt) : NaN;
  if (!Number.isNaN(publishAt) && publishAt > now) return false;
  if (!Number.isNaN(unpublishAt) && unpublishAt <= now) return false;
  if (!Number.isNaN(startsAt) && startsAt > now) return false;
  if (!Number.isNaN(endsAt) && endsAt <= now) return false;
  const today = normalizeDate(new Date(now).toLocaleString('sv-SE', {timeZone: 'Africa/Nairobi'}));
  if (record.type === 'events' && record.date && record.date < today) {
    return false;
  }
  return true;
}
