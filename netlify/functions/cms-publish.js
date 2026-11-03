import {createHash} from 'node:crypto';
import {audit, authenticate, checkOrigin, response, serviceRequest, tableForType} from './_shared/admin-auth.js';
import {publishContentful} from './_shared/contentful-publisher.js';

const schemas = {
  sermons: {
    fields: {title:['text',250], preacher:['text',160], ministry_title:['text',120], scripture_reference:['text',240], series:['text',160], sermon_date:['date'], description:['long',10000], preview_image_url:['url'], pdf_url:['url'], audio_url:['url'], video_url:['url'], tags:['tags'], featured:['boolean'], files:['json']},
    required: ['title','preacher','sermon_date']
  },
  events: {
    fields: {title:['text',250], event_date:['date'], end_date:['date'], event_time:['text',120], location:['text',240], description:['long',10000], flyer_url:['url'], flyer_alt:['text',240], registration_url:['url'], category:['text',100], active:['boolean']},
    required: ['title','event_date']
  },
  announcements: {
    fields: {announcement_text:['long',2000], link_url:['url'], link_label:['text',120], severity:['enum',['info','success','warning','urgent']], starts_at:['datetime'], ends_at:['datetime']},
    required: ['announcement_text']
  },
  gallery: {
    fields: {image_url:['url'], alt:['text',240], caption:['text',500]},
    required: ['image_url']
  },
  leadership: {
    fields: {group_name:['enum',['lcc','women','pastoral']], name:['text',160], role:['text',160], bio:['long',5000], message:['long',10000], photo_url:['url'], active:['boolean']},
    required: ['group_name','name']
  },
  ministries: {
    fields: {name:['text',160], category:['text',100], description:['long',5000], leader:['text',160], meeting_time:['text',240], contact:['text',240], joining_information:['long',2000], image_url:['url'], accepting_applications:['boolean']},
    required: ['name']
  },
  service_times: {
    fields: {label:['text',160], day:['text',40], start_time:['text',40], end_time:['text',40], is_live:['boolean']},
    required: ['label','day']
  },
  settings: {
    fields: {setting_key:['text',120], setting_value:['json']},
    required: ['setting_key','setting_value']
  }
};

function cleanText(value, max, long = false) {
  if (typeof value !== 'string') throw new Error('Check the text fields and try again.');
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (cleaned.length > max) throw new Error('One of the text fields is too long.');
  return long ? cleaned : cleaned.replace(/[\r\n]+/g, ' ');
}

function safeUrl(value) {
  if (value === '' || value === null || value === undefined) return null;
  const text = cleanText(value, 2048);
  let url;
  try { url = new URL(text); } catch { throw new Error('Enter a valid link beginning with https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Links must use a secure https:// address.');
  return url.toString();
}

function sanitizeField(field, value) {
  const [kind, rule] = field;
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'text') return cleanText(value, rule);
  if (kind === 'long') return cleanText(value, rule, true);
  if (kind === 'url') return safeUrl(value);
  if (kind === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('Check the yes/no fields and try again.');
    return value;
  }
  if (kind === 'enum') {
    const result = cleanText(value, 80);
    if (!rule.includes(result)) throw new Error('Choose one of the listed options.');
    return result;
  }
  if (kind === 'date') {
    const result = cleanText(value, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw new Error('Enter a valid date.');
    return result;
  }
  if (kind === 'datetime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Enter a valid date and time.');
    return date.toISOString();
  }
  if (kind === 'tags') {
    if (!Array.isArray(value) || value.length > 30) throw new Error('Use up to 30 short tags.');
    return value.map(tag => cleanText(tag, 60)).filter(Boolean);
  }
  if (kind === 'json') {
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Check the structured field and try again.');
    if (JSON.stringify(value).length > 8000) throw new Error('The structured field is too large.');
    return value;
  }
  return null;
}

function sanitizeData(type, input, previous = {}) {
  const schema = schemas[type];
  const allowed = new Set([...Object.keys(schema.fields),'slug','sort_order','publish_at','unpublish_at']);
  if (Object.keys(input || {}).some(field => !allowed.has(field))) throw new Error('This form contains an unsupported field. Refresh the page and try again.');
  const output = {};
  for (const [field, rules] of Object.entries(schema.fields)) {
    const value = Object.hasOwn(input || {}, field) ? input[field] : previous[field];
    if (value !== undefined) output[field] = sanitizeField(rules, value);
  }
  for (const field of schema.required) {
    if (output[field] === null || output[field] === undefined || output[field] === '') {
      throw new Error('Please complete all required fields before saving.');
    }
  }
  for (const [field, kind, max] of [
    ['slug','text',180], ['sort_order','number',null], ['publish_at','datetime',null], ['unpublish_at','datetime',null]
  ]) {
    const value = Object.hasOwn(input || {}, field) ? input[field] : previous[field];
    if (value === undefined) continue;
    if (kind === 'text') output[field] = value ? cleanText(value, max).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
    if (kind === 'number') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < -100000 || number > 100000) throw new Error('Choose a valid display order.');
      output[field] = number;
    }
    if (kind === 'datetime') output[field] = value ? sanitizeField(['datetime'], value) : null;
  }
  return output;
}

function uuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function hashData(data) { return createHash('sha256').update(JSON.stringify(data)).digest('hex'); }

async function byId(settings, table, id) {
  if (!id) return null;
  const rows = await serviceRequest(settings, table, {query: {select:'*', id:`eq.${id}`, limit:'1'}});
  return rows?.[0] || null;
}

async function idemGet(settings, key, userId) {
  const rows = await serviceRequest(settings, 'idempotency_keys', {query:{select:'response,actor_id',idempotency_key:`eq.${key}`,limit:'1'}});
  if (!rows?.length) return null;
  if (rows[0].actor_id !== userId) {
    const error = new Error('This request could not be reused.'); error.statusCode = 409; throw error;
  }
  return rows[0].response;
}

async function queueBackup(settings, actorId, type, recordId, action, error) {
  const pending = await serviceRequest(settings, 'publish_queue', {query:{select:'id',content_type:`eq.${type}`,record_id:`eq.${recordId}`,status:'in.(pending,failed)',limit:'1'}});
  const payload = {action, record_id:recordId};
  if (pending?.length) {
    await serviceRequest(settings, 'publish_queue', {method:'PATCH',query:{id:`eq.${pending[0].id}`},body:{action,payload,status:'pending',next_attempt_at:new Date(Date.now()+60000).toISOString(),last_error:String(error.message).slice(0,2000),updated_at:new Date().toISOString()},prefer:'return=minimal'});
  } else {
    await serviceRequest(settings, 'publish_queue', {method:'POST',query:{select:'id'},body:{content_type:type,record_id:recordId,action,payload,status:'pending',attempts:0,next_attempt_at:new Date(Date.now()+60000).toISOString(),last_error:String(error.message).slice(0,2000),created_by:actorId},prefer:'return=minimal'});
  }
}

async function saveDraft(settings, actorId, profile, type, payload, table) {
  let existingDraft = null;
  let baseRecord = null;
  if (payload.draftId) {
    if (!uuid(payload.draftId)) throw new Error('This draft could not be found.');
    existingDraft = (await serviceRequest(settings,'cms_drafts',{query:{select:'*',draft_id:`eq.${payload.draftId}`,content_type:`eq.${type}`,limit:'1'}}))?.[0] || null;
    if (!existingDraft || (profile.role !== 'admin' && existingDraft.created_by !== actorId)) throw new Error('This draft could not be found.');
    baseRecord = await byId(settings, table, existingDraft.record_id);
  } else if (payload.id) {
    if (!uuid(payload.id)) throw new Error('This item could not be found.');
    baseRecord = await byId(settings, table, payload.id);
    if (!baseRecord) throw new Error('This item could not be found.');
    if (Number(payload.expectedVersion) !== Number(baseRecord.version)) {
      const conflict = new Error('This item changed while you were editing. Reload it before saving.'); conflict.statusCode = 409; throw conflict;
    }
  }
  if (!existingDraft) {
    const draftQuery = {select:'*',content_type:`eq.${type}`,created_by:`eq.${actorId}`,limit:'1'};
    if (baseRecord?.id) draftQuery.record_id = `eq.${baseRecord.id}`;
    else draftQuery.record_id = 'is.null';
    existingDraft = (await serviceRequest(settings,'cms_drafts',{query:draftQuery}))?.[0] || null;
    if (existingDraft && !baseRecord) baseRecord = await byId(settings, table, existingDraft.record_id);
  }
  const previousDraftData = existingDraft?.data || {};
  const source = {...(baseRecord || {}), ...previousDraftData};
  const clean = sanitizeData(type, payload.data, source);
  const draftBody = {
    content_type:type,
    record_id:baseRecord?.id || existingDraft?.record_id || null,
    data:clean,
    base_version:baseRecord?.version ?? existingDraft?.base_version ?? null,
    created_by:existingDraft?.created_by || actorId,
    updated_at:new Date().toISOString()
  };
  let saved;
  if (existingDraft) {
    saved = await serviceRequest(settings,'cms_drafts',{method:'PATCH',query:{draft_id:`eq.${existingDraft.draft_id}`},body:draftBody,prefer:'return=representation'});
  } else {
    saved = await serviceRequest(settings,'cms_drafts',{method:'POST',query:{select:'*'},body:draftBody,prefer:'return=representation'});
  }
  const draft = saved?.[0];
  if (!draft) throw new Error('We could not save this draft. Try again.');
  await audit(settings,actorId,'cms_draft_saved',type,draft.record_id || draft.draft_id);
  return {ok:true,id:draft.record_id || null,draftId:draft.draft_id,version:draft.base_version,steps:{saved:true,live:Boolean(baseRecord?.is_published),backup:false},sync_state:'draft',message:'Draft saved. It is not live on the website yet.'};
}

async function executePublish(event, auth, payload, type, table) {
  const {settings, user, profile} = auth;
  const action = payload.action;
  const allowed = ['save_draft','publish','unpublish','schedule','delete','restore','permanent_delete'];
  if (!allowed.includes(action)) throw new Error('Choose a valid save or publish action.');
  if (action === 'permanent_delete' && profile.role !== 'admin') {
    const error = new Error('Only an administrator can permanently remove content.'); error.statusCode = 403; throw error;
  }
  if (type === 'settings' && profile.role !== 'admin') {
    const error = new Error('Only an administrator can edit site settings.'); error.statusCode = 403; throw error;
  }
  if (action === 'save_draft') return saveDraft(settings,user.id,profile,type,payload,table);

  let draft = null;
  if (payload.draftId) {
    if (!uuid(payload.draftId)) throw new Error('This draft could not be found.');
    draft = (await serviceRequest(settings,'cms_drafts',{query:{select:'*',draft_id:`eq.${payload.draftId}`,content_type:`eq.${type}`,limit:'1'}}))?.[0] || null;
    if (!draft || (profile.role !== 'admin' && draft.created_by !== user.id)) throw new Error('This draft could not be found.');
  }
  const recordId = payload.id || draft?.record_id;
  if (recordId && !uuid(recordId)) throw new Error('This item could not be found.');
  const previous = await byId(settings,table,recordId);
  if (recordId && !previous) throw new Error('This item could not be found.');
  const expectedVersion = payload.expectedVersion ?? draft?.base_version;
  if (previous && Number(expectedVersion) !== Number(previous.version)) {
    const conflict = new Error('This item changed while you were editing. Reload it before saving.'); conflict.statusCode = 409; throw conflict;
  }
  let revisionData = null;
  if(action==='restore'&&payload.revisionId){
    if(!uuid(payload.revisionId))throw new Error('That saved version could not be found.');
    const revisions=await serviceRequest(settings,'cms_revisions',{query:{select:'id,snapshot,changed_by',id:`eq.${payload.revisionId}`,content_type:`eq.${type}`,record_id:`eq.${recordId}`,limit:'1'}});
    revisionData=revisions?.[0]||null;
    if(!revisionData||(profile.role!=='admin'&&revisionData.changed_by!==user.id)){
      const denied=new Error('That saved version could not be found.');denied.statusCode=403;throw denied;
    }
  }
  const restorableFields = [...Object.keys(schemas[type].fields),'slug','sort_order','publish_at','unpublish_at'];
  const inputData = revisionData
    ? Object.fromEntries(restorableFields.filter(field=>Object.hasOwn(revisionData.snapshot||{},field)).map(field=>[field,revisionData.snapshot[field]]))
    : ['unpublish','delete','restore'].includes(action)
      ? Object.fromEntries(restorableFields.filter(field=>Object.hasOwn(payload.data||{},field)).map(field=>[field,payload.data[field]]))
      : {...(draft?.data || {}), ...(payload.data || {})};
  const data = action==='permanent_delete' ? {...(previous||{})} : sanitizeData(type,inputData,previous || {});
  const now = new Date().toISOString();
  if (action === 'schedule') {
    if (!data.publish_at || Date.parse(data.publish_at) <= Date.now()) throw new Error('Choose a future time to schedule this post.');
  }
  if (action === 'publish' || action === 'restore' || action === 'unpublish' || action === 'delete' || action === 'permanent_delete') {
    if (data.publish_at !== undefined && action !== 'publish') data.publish_at = null;
  }
  if (['restore','unpublish','delete','permanent_delete'].includes(action)) data.unpublish_at = null;
  const row = {
    ...data,
    source:previous?.source || 'supabase',
    is_published:action === 'publish' || action === 'restore',
    publish_at:action === 'schedule' ? data.publish_at : (action === 'publish' ? null : null),
    deleted_at:action === 'delete' ? now : (action === 'restore' ? null : previous?.deleted_at || null),
    created_by:previous?.created_by || user.id,
    updated_by:user.id,
    updated_at:now,
    version:(Number(previous?.version) || 0) + 1,
    content_hash:hashData(data),
    sync_state:'pending_contentful',
    sync_attempts:Number(previous?.sync_attempts) || 0,
    last_error:null
  };

  let updatedRow = null;
  if (previous) {
    if (action === 'permanent_delete') {
      await publishContentful(type,previous,'permanent_delete');
      await serviceRequest(settings,'cms_revisions',{method:'DELETE',query:{content_type:`eq.${type}`,record_id:`eq.${previous.id}`},prefer:'return=minimal'});
      await serviceRequest(settings,'cms_drafts',{method:'DELETE',query:{content_type:`eq.${type}`,record_id:`eq.${previous.id}`},prefer:'return=minimal'});
      await serviceRequest(settings,table,{method:'DELETE',query:{id:`eq.${previous.id}`},prefer:'return=minimal'});
      await audit(settings,user.id,'cms_permanently_deleted',type,previous.id);
      return {ok:true,id:previous.id,steps:{saved:true,live:false,backup:true},message:'Content permanently removed.'};
    }
    const saved = await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${previous.id}`,version:`eq.${previous.version}`,select:'*'},body:row,prefer:'return=representation'});
    if (!saved?.length) {
      const conflict = new Error('This item changed while you were editing. Reload it before saving.'); conflict.statusCode = 409; throw conflict;
    }
    updatedRow = saved[0];
    await serviceRequest(settings,'cms_revisions',{method:'POST',query:{on_conflict:'content_type,record_id,version'},body:{content_type:type,record_id:previous.id,version:previous.version,snapshot:previous,changed_by:user.id},prefer:'resolution=merge-duplicates,return=minimal'});
  } else {
    if (action === 'unpublish' || action === 'delete' || action === 'restore') throw new Error('Choose an existing item first.');
    const saved = await serviceRequest(settings,table,{method:'POST',query:{select:'*'},body:row,prefer:'return=representation'});
    if (!saved?.length) throw new Error('We could not save this item. Try again.');
    updatedRow = saved[0];
    await serviceRequest(settings,'cms_revisions',{method:'POST',query:{on_conflict:'content_type,record_id,version'},body:{content_type:type,record_id:updatedRow.id,version:updatedRow.version,snapshot:updatedRow,changed_by:user.id},prefer:'resolution=merge-duplicates,return=minimal'});
  }
  let finalRow = updatedRow;
  if (!finalRow?.id) throw new Error('Your change was saved, but the result could not be confirmed. Refresh the list.');

  if (action === 'schedule') {
    await serviceRequest(settings,'publish_queue',{method:'POST',query:{select:'id'},body:{content_type:type,record_id:finalRow.id,action:'publish',payload:{action:'publish',record_id:finalRow.id},status:'pending',attempts:0,next_attempt_at:finalRow.publish_at,created_by:user.id},prefer:'return=minimal'});
    await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${finalRow.id}`},body:{sync_state:'synced'},prefer:'return=minimal'});
    await audit(settings,user.id,'cms_scheduled',type,finalRow.id,{publish_at:finalRow.publish_at});
    if (draft) await serviceRequest(settings,'cms_drafts',{method:'DELETE',query:{draft_id:`eq.${draft.draft_id}`},prefer:'return=minimal'});
    return {ok:true,id:finalRow.id,version:finalRow.version,steps:{saved:true,live:false,backup:true},sync_state:'scheduled',message:'Scheduled. It will appear on the website at the selected time.'};
  }

  let backup = true;
  let contentfulId = finalRow.contentful_id || null;
  let syncError = null;
  try {
    const result = await publishContentful(type,finalRow,action);
    contentfulId = result.id || contentfulId;
  } catch (error) {
    backup = false;
    syncError = error;
    await queueBackup(settings,user.id,type,finalRow.id,action,error);
  }
  const syncState = backup ? 'synced' : 'pending_contentful';
  await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${finalRow.id}`},body:{contentful_id:contentfulId,sync_state:syncState,sync_attempts:Number(finalRow.sync_attempts)+(backup?0:1),last_error:syncError?.message || null},prefer:'return=minimal'});
  await audit(settings,user.id,`cms_${action}`,type,finalRow.id,{sync_state:syncState});
  if (draft) await serviceRequest(settings,'cms_drafts',{method:'DELETE',query:{draft_id:`eq.${draft.draft_id}`},prefer:'return=minimal'});
  return {
    ok:true,
    id:finalRow.id,
    version:finalRow.version,
    steps:{saved:true,live:Boolean(finalRow.is_published && !finalRow.deleted_at),backup},
    sync_state:syncState,
    message:backup ? (finalRow.is_published ? 'Published on the website and backup updated.' : 'Changes saved and removed from the website.') : (finalRow.is_published ? 'Your post is live. The backup is still being updated.' : 'Your change is saved. The backup is still being updated.'),
    details:syncError?.message || null
  };
}

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(event,200,{});
  if (event.httpMethod !== 'POST') return response(event,405,{ok:false,error:'Use POST to save content.'});
  let pendingIdempotency = '';
  let pendingSettings = null;
  let requestingAdmin = false;
  try {
    checkOrigin(event,{required:true});
    if (String(event.body || '').length > 100000) return response(event,413,{ok:false,error:'This item is too large to save.'});
    const payload = JSON.parse(event.body || '{}');
    const type = payload.type;
    const table = tableForType(type);
    if (!table || !schemas[type]) return response(event,400,{ok:false,error:'Choose a supported content type.'});
    const auth = await authenticate(event,{roles:['admin','editor']});
    requestingAdmin = auth.profile.role === 'admin';
    pendingSettings = auth.settings;
    if (type === 'settings' && auth.profile.role !== 'admin') return response(event,403,{ok:false,error:'Your account does not have permission for this action.'});
    const idempotencyKey = payload.idempotencyKey || event.headers?.['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 120) {
      return response(event,400,{ok:false,error:'Please retry the save. The request could not be identified.'});
    }
    const prior = await idemGet(auth.settings,idempotencyKey,auth.user.id);
    if (prior?.ok) return response(event,200,prior);
    if (prior?.pending) return response(event,409,{ok:false,error:'This save is still being processed. Refresh the list in a moment.'});
    await serviceRequest(auth.settings,'idempotency_keys',{method:'POST',body:{idempotency_key:idempotencyKey,actor_id:auth.user.id,response:{pending:true}},prefer:'return=minimal'});
    pendingIdempotency = idempotencyKey;
    const result = await executePublish(event,auth,payload,type,table);
    await serviceRequest(auth.settings,'idempotency_keys',{method:'PATCH',query:{idempotency_key:`eq.${idempotencyKey}`},body:{response:result},prefer:'return=minimal'});
    pendingIdempotency = '';
    return response(event,200,result);
  } catch (error) {
    if (pendingIdempotency && pendingSettings) {
      try { await serviceRequest(pendingSettings,'idempotency_keys',{method:'DELETE',query:{idempotency_key:`eq.${pendingIdempotency}`},prefer:'return=minimal'}); } catch {}
    }
    const status = [401,403,409].includes(error.statusCode) ? error.statusCode : (error.statusCode ? 500 : 400);
    if (status >= 500) console.error('[cms-publish] Publish request failed.',error.message);
    return response(event,status,{ok:false,error:status === 401 || status === 403 || status === 409 ? error.message : (status >= 500 ? 'We could not save this right now. Your work is still available; please try again.' : (error instanceof SyntaxError ? 'We could not read that form. Refresh the page and try again.' : error.message)),details:requestingAdmin && status >= 500 ? error.message : undefined});
  }
};
