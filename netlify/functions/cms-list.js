import {authenticate, checkOrigin, response, serviceRequest, tableForType} from './_shared/admin-auth.js';

const visibleFields = {
  sermons: ['title','preacher','ministry_title','scripture_reference','series','sermon_date','description','preview_image_url','pdf_url','files','audio_url','video_url','tags','featured'],
  events: ['title','event_date','end_date','event_time','location','description','flyer_url','flyer_alt','registration_url','category','active'],
  announcements: ['announcement_text','link_url','link_label','severity','starts_at','ends_at'],
  gallery: ['image_url','alt','caption'],
  leadership: ['group_name','name','role','bio','message','photo_url','active'],
  ministries: ['name','category','description','leader','meeting_time','contact','joining_information','image_url','accepting_applications'],
  service_times: ['label','day','start_time','end_time','is_live'],
  settings: ['setting_key','setting_value']
};

function editorRecord(type, row) {
  const safe = {
    id: row.id,
    slug: row.slug,
    is_published: row.is_published,
    publish_at: row.publish_at,
    unpublish_at: row.unpublish_at,
    sort_order: row.sort_order,
    deleted_at: row.deleted_at,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  for (const key of visibleFields[type]) safe[key] = row[key];
  return safe;
}

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(event, 200, {});
  if (event.httpMethod !== 'GET') return response(event, 405, {error: 'Use GET to load content.'});
  try {
    checkOrigin(event);
    const {profile, settings} = await authenticate(event, {roles: ['admin', 'editor']});
    const params = new URLSearchParams(event.rawQuery || '');
    if (!event.rawQuery) {
      for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
        if (value !== undefined && value !== null) params.set(key, value);
      }
    }
    const type = params.get('type') || '';
    const table = tableForType(type);
    if (!table) return response(event, 400, {error: 'Choose a supported content type.'});
    const query = {select: '*', order: 'updated_at.desc', limit: '200'};
    const result = await serviceRequest(settings, table, {query});
    const draftQuery = {select:'*',content_type:`eq.${type}`,order:'updated_at.desc',limit:'100'};
    if (profile.role !== 'admin') draftQuery.created_by = `eq.${profile.id}`;
    const drafts = await serviceRequest(settings,'cms_drafts',{query:draftQuery});
    const search = (params.get('q') || '').trim().toLocaleLowerCase();
    const status = params.get('status') || 'all';
    let rows = (result || []).filter(row => {
      if (search && !visibleFields[type].some(key => String(row[key] ?? '').toLocaleLowerCase().includes(search))) return false;
      if (status === 'deleted' && !row.deleted_at) return false;
      if (status === 'published' && (!row.is_published || row.deleted_at)) return false;
      if (status === 'draft' && (row.is_published || row.deleted_at)) return false;
      if (status === 'scheduled' && (!row.publish_at || new Date(row.publish_at) <= new Date() || row.deleted_at)) return false;
      if (status !== 'deleted' && row.deleted_at) return false;
      return true;
    });
    const draftRows = (drafts || []).filter(draft => {
      if (status === 'published' || status === 'scheduled' || status === 'deleted') return false;
      if (search && !visibleFields[type].some(key => String(draft.data?.[key] ?? '').toLocaleLowerCase().includes(search))) return false;
      return true;
    }).map(draft => ({
      ...draft.data,
      id:draft.draft_id,
      draft_id:draft.draft_id,
      record_id:draft.record_id,
      version:draft.base_version,
      is_draft:true,
      is_published:false,
      deleted_at:null,
      updated_at:draft.updated_at,
      created_at:draft.created_at
    }));
    rows = rows.slice(0, 100);
    if (profile.role !== 'admin') rows = rows.map(row => editorRecord(type, row));
    rows = [...draftRows,...rows].sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0,100);
    return response(event, 200, {ok: true, type, items: rows});
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[cms-list] Content request failed.', error.message);
    return response(event, status, {ok: false, error: status === 401 || status === 403 ? error.message : 'We could not load content. Please try again.'});
  }
};
