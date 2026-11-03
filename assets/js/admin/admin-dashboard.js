import {protectAdminPage, requestFunction, setStatus} from './admin-client.js';

const types = {
  sermons: {label:'Sermon',plural:'Sermons',fields:[['title','Sermon title','text',true,'Example: Sunday sermon'],['preacher','Preacher name','text',true,'Name of the preacher'],['scripture_reference','Bible passage','text',false,'Example: Psalm 23'],['series','Series','text'],['sermon_date','Date shared','date',true],['description','Description','textarea'],['preview_image_url','Cover image','url'],['video_url','Video link','url'],['audio_url','Audio recording','url'],['pdf_url','Sermon file (PDF)','url',false,'Upload a PDF sermon manuscript, notes, or study guide.'],['tags','Topics','tags',false,'Separate topics with commas']]},
  events: {label:'Event',plural:'Events',fields:[['title','Event name','text',true],['event_date','Date','date',true],['end_date','Last day','date'],['event_time','Time','text',false,'Example: 10:00 AM'],['location','Location','text'],['description','What should people know?','textarea'],['flyer_url','Event flyer or image','url'],['flyer_alt','Photo description','text'],['registration_url','Registration link','url'],['category','Event type','text']]},
  announcements: {label:'Announcement',plural:'Announcements',fields:[['announcement_text','Announcement','textarea',true],['link_url','Optional link','url'],['link_label','Link button text','text'],['severity','Style','select',true,['info','success','warning','urgent']],['starts_at','Show from','datetime-local'],['ends_at','Stop showing','datetime-local']]},
  gallery: {label:'Gallery photo',plural:'Gallery',fields:[['image_url','Upload gallery image','url',true],['alt','Photo description','text'],['caption','Caption','textarea']]},
  leadership: {label:'Leader profile',plural:'Leaders',fields:[['group_name','Leadership group','select',true,['lcc','women','pastoral']],['name','Name','text',true],['role','Role','text'],['bio','Short biography','textarea'],['message','Message','textarea'],['photo_url','Upload profile photo','url']]},
  ministries: {label:'Ministry',plural:'Ministries',fields:[['name','Ministry name','text',true],['category','Ministry category','text',false,'Example: Worship, Youth, Outreach'],['description','About this ministry','textarea'],['leader','Leader name','text'],['meeting_time','Meeting time','text'],['contact','Contact details','text'],['joining_information','How to join','textarea'],['image_url','Upload ministry card image','url'],['accepting_applications','Accepting new members','checkbox']]},
  service_times: {label:'Service time',plural:'Service times',fields:[['label','Service name','text',true],['day','Day','text',true],['start_time','Starts at','text'],['end_time','Ends at','text'],['is_live','Streamed live','checkbox']]},
  settings: {label:'Live stream setting',plural:'Live stream settings',fields:[['setting_key','Setting name','text',true,'Use live_stream for the stream page.'],['setting_value','Live stream details (JSON)','json',true,'Set channelId, fallbackVideoId, liveMessage and offlineMessage. Keep API keys out of this field.']]}
};

const home = document.getElementById('homeView');
const editorView = document.getElementById('editorView');
const permissionView = document.getElementById('permissionView');
const form = document.getElementById('contentForm');
const preview = document.getElementById('contentPreview');
const list = document.getElementById('recentPosts');
const listStatus = document.getElementById('listStatus');
let profile = null;
let currentType = 'sermons';
let currentItem = null;
let dirty = false;
let pendingKey = null;
let autosaveTimer = null;

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function localDraftKey() { return `aic-admin-draft:${currentType}:${currentItem?.draft_id || currentItem?.id || 'new'}`; }
function fieldLabel(name) {
  const labels = {lcc:'LCC',women:'Women',pastoral:'Pastoral',info:'Information',success:'Positive',warning:'Caution',urgent:'Urgent'};
  return labels[name] || name;
}
function fromLocalDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 3 * 60 * 60_000).toISOString().slice(0,16);
}
function eastAfricaDate(value) {
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4])-3,Number(match[5]))).toISOString() : null;
}
function toApiValue(input, kind) {
  if (kind === 'checkbox') return input.checked;
  if (kind === 'tags') return input.value.split(',').map(value => value.trim()).filter(Boolean);
  if (kind === 'json') return JSON.parse(input.value || '{}');
  if (kind === 'datetime-local') return input.value ? eastAfricaDate(input.value) : null;
  return input.value.trim() || null;
}

async function compressPhoto(file) {
  if(file.size>30*1024*1024)throw new Error('This photo is too large to prepare on this device. Choose a photo under 30 MB.');
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
  if(!blob)throw new Error('This photo could not be prepared. Choose another photo.');
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
}

function putFile(url,file,progress){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type);xhr.setRequestHeader('x-upsert','false');
    xhr.upload.onprogress=event=>{if(event.lengthComputable)progress.value=Math.round(event.loaded/event.total*100);};
    xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('upload_failed'));
    xhr.onerror=()=>reject(new Error('upload_network'));
    xhr.send(file);
  });
}

function addField([name,label,kind,required = false,helpOrOptions = null], value = null) {
  const wrapper = node('div','','field');
  const labelElement = node('label',label);
  labelElement.htmlFor = `field-${name}`;
  if (required) labelElement.appendChild(node('span',' *'));
  let input;
  if (kind === 'textarea' || kind === 'json') input = document.createElement('textarea');
  else if (kind === 'select') {
    input = document.createElement('select');
    for (const optionValue of helpOrOptions || []) {
      const option = node('option',fieldLabel(optionValue));
      option.value = optionValue;
      input.appendChild(option);
    }
  } else {
    input = document.createElement('input');
    input.type = kind === 'tags' ? 'text' : kind;
  }
  input.id = `field-${name}`;
  input.name = name;
  input.required = required;
  if (kind === 'checkbox') input.checked = Boolean(value);
  else if (kind === 'datetime-local') input.value = fromLocalDate(value);
  else if (kind === 'tags') input.value = Array.isArray(value) ? value.join(', ') : (value || '');
  else if (kind === 'json') input.value = typeof value === 'string' ? value : JSON.stringify(value || {},null,2);
  else input.value = value ?? '';
  input.addEventListener('input', () => { dirty = true; updatePreview(); scheduleAutosave(); });
  input.addEventListener('change', () => { dirty = true; updatePreview(); scheduleAutosave(); });
  wrapper.append(labelElement,input);
  if (helpOrOptions && kind !== 'select') wrapper.appendChild(node('small',helpOrOptions));
  if(kind==='url'){
    const uploadLabel=node('label',`Or upload ${label.toLowerCase()}`);
    const uploadKind = name==='pdf_url' ? 'pdf' : name==='audio_url' ? 'audio' : (name==='video_url'||name==='registration_url'||name==='link_url') ? 'none' : 'image';
    const accept = uploadKind==='pdf' ? 'application/pdf' : uploadKind==='audio' ? 'audio/mpeg,audio/mp4' : uploadKind==='image' ? 'image/jpeg,image/png,image/webp' : '';
    const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept=accept;fileInput.disabled=uploadKind==='none';fileInput.setAttribute('aria-label',`Choose a file for ${label.toLowerCase()}`);
    const progress=document.createElement('progress');progress.max=100;progress.value=0;progress.hidden=true;
    const uploadStatus=node('small');uploadStatus.setAttribute('role','status');
    if(uploadKind!=='none')wrapper.appendChild(node('small',uploadKind==='image'?'JPG, PNG or WebP up to 8 MB. Photos are reduced to fit the page.':uploadKind==='pdf'?'PDF files up to 15 MB.':'MP3 or M4A audio up to 60 MB.'));
    fileInput.addEventListener('change',async()=>{
      let file=fileInput.files?.[0];if(!file)return;
      if(uploadKind==='image'&&!file.type.startsWith('image/')){uploadStatus.textContent='Choose a JPG, PNG or WebP image.';return;}
      if(uploadKind==='pdf'&&file.type!=='application/pdf'){uploadStatus.textContent='Choose a PDF file.';return;}
      if(uploadKind==='audio'&&!file.type.startsWith('audio/')){uploadStatus.textContent='Choose an MP3 or M4A audio file.';return;}
      if(file.type.startsWith('image/')){uploadStatus.textContent='Preparing a smaller photo…';try{file=await compressPhoto(file);}catch(error){uploadStatus.textContent=error.message;return;}}
      const maxMb=file.type==='application/pdf'?15:file.type.startsWith('audio/')?60:8;
      if(file.size>maxMb*1024*1024){uploadStatus.textContent=`Choose a file smaller than ${maxMb} MB.`;return;}
      fileInput.disabled=true;progress.hidden=false;progress.value=0;uploadStatus.textContent='Preparing secure upload…';
      try{
        const prepared=await requestFunction('cms-upload',{method:'POST',body:{action:'prepare',type:currentType,name:file.name,contentType:file.type,size:file.size}});
        uploadStatus.textContent='Uploading…';await putFile(prepared.uploadUrl,file,progress);
        const completed=await requestFunction('cms-upload',{method:'POST',body:{action:'complete',type:currentType,path:prepared.path}});
        input.value=completed.url;input.dispatchEvent(new Event('input',{bubbles:true}));uploadStatus.textContent='Upload complete. It will be added when you save this post.';dirty=true;scheduleAutosave();
      }catch{uploadStatus.textContent='The upload did not finish. Check your connection and try again.';}
      finally{fileInput.disabled=false;}
    });
    wrapper.append(uploadLabel,fileInput,progress,uploadStatus);
  }
  form.appendChild(wrapper);
}

function getFormData({allowInvalid = false} = {}) {
  const data = {};
  for (const [name,,kind] of types[currentType].fields) {
    const input = form.elements.namedItem(name);
    try { data[name] = toApiValue(input,kind); }
    catch (error) { if (!allowInvalid) throw error; data[name] = input.value; }
  }
  const publishAt = form.elements.namedItem('publish_at');
  data.publish_at = publishAt?.value ? eastAfricaDate(publishAt.value) : null;
  return data;
}

function updatePreview() {
  const data = getFormData({allowInvalid:true});
  preview.replaceChildren();
  if (data.preview_image_url || data.flyer_url || data.image_url || data.photo_url || data.image_url) {
    const imageUrl = data.preview_image_url || data.flyer_url || data.image_url || data.photo_url;
    if (/^https:\/\//i.test(imageUrl || '')) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = data.flyer_alt || data.alt || '';
      preview.appendChild(image);
    }
  }
  const copy = node('div');
  const title = data.title || data.name || data.label || data.announcement_text || data.caption || (data.setting_key ? `Settings: ${data.setting_key}` : '') || 'Your post title';
  copy.appendChild(node('h3',title));
  const subtitle = [data.preacher,data.sermon_date,data.event_date,data.event_time,data.day,data.group_name].filter(Boolean).map(fieldLabel).join(' · ');
  if (subtitle) copy.appendChild(node('p',subtitle));
  const description = data.description || data.announcement_text || data.bio || data.caption || '';
  if (description) copy.appendChild(node('p',description));
  preview.appendChild(copy);
}

function getStatus(item) {
  if (item.is_draft) return 'Draft';
  if (item.deleted_at) return 'Hidden';
  if (item.publish_at && new Date(item.publish_at) > new Date()) return 'Scheduled';
  if (item.is_published) return 'Live on website';
  return 'Draft';
}

function displayTitle(item) {
  return item.title || item.name || item.label || item.announcement_text || item.caption || 'Untitled post';
}

async function loadItems() {
  const type = document.getElementById('filterType').value;
  currentType = type;
  setStatus(listStatus,'Loading posts…');
  list.replaceChildren();
  try {
    const result = await requestFunction('cms-list',{query:{type,status:document.getElementById('filterStatus').value,q:document.getElementById('searchPosts').value}});
    if (!result.items.length) {
      setStatus(listStatus,'No posts match those filters yet. Choose an action above to create one.');
      return [];
    }
    setStatus(listStatus,'');
    for (const item of result.items) {
      const card = node('article','','admin-item');
      const main = node('div');
      const heading = node('h3',displayTitle(item));
      heading.appendChild(node('span',getStatus(item),'admin-chip'));
      const when = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '';
      main.append(heading,node('p',when ? `Updated ${when}` : types[type].label));
      const actions = node('div','','admin-item-actions');
      const edit = node('button',item.is_draft?'Edit draft':'Edit','admin-secondary');
      edit.type = 'button';
      edit.addEventListener('click',() => openEditor(type,item));
      actions.appendChild(edit);
      if (item.is_published && !item.is_draft && !item.deleted_at) {
        const hide = node('button','Hide from website','admin-secondary');
        hide.type = 'button';
        hide.addEventListener('click',() => runAction(type,item,'unpublish'));
        actions.appendChild(hide);
        const remove = node('button','Remove from website','admin-secondary');
        remove.type='button'; remove.addEventListener('click',() => runAction(type,item,'delete'));
        actions.appendChild(remove);
      }
      if (item.deleted_at) {
        const restore = node('button','Restore','admin-secondary');
        restore.type='button'; restore.addEventListener('click',() => runAction(type,item,'restore'));
        actions.appendChild(restore);
      }
      if (!item.is_draft && !item.deleted_at) {
        const undo=node('button','Undo last change','admin-secondary');
        undo.type='button';
        undo.addEventListener('click',async()=>{
          try{
            const history=await requestFunction('cms-history',{query:{type,id:item.id}});
            const revision=history.items.find(entry=>Number(entry.version)<Number(item.version));
            if(!revision){setStatus(listStatus,'There is no earlier saved version to restore.');return;}
            if(!window.confirm('Restore the previous version of this post?'))return;
            const result=await requestFunction('cms-publish',{method:'POST',body:{type,action:'restore',id:item.id,expectedVersion:item.version,revisionId:revision.id,idempotencyKey:crypto.randomUUID(),data:revision.snapshot}});
            setStatus(listStatus,result.message||'Previous version restored.');await loadItems();
          }catch{setStatus(listStatus,'We could not restore this version. Refresh the list and try again.','error');}
        });
        actions.appendChild(undo);
      }
      const view = node('a','View website','admin-secondary');
      view.href = websiteUrl(type,item);
      view.target = '_blank'; view.rel='noopener noreferrer';
      actions.appendChild(view);
      card.append(main,actions);
      list.appendChild(card);
    }
    return result.items;
  } catch {
    setStatus(listStatus,'We could not load posts right now. Please refresh and try again.','error');
    return [];
  }
}

function websiteUrl(type,item) {
  const pages = {sermons:'/sermons.html',events:'/#events',announcements:'/',gallery:'/about.html',leadership:'/about.html',ministries:'/ministries.html',service_times:'/live.html',settings:'/live.html'};
  return `${pages[type] || '/'}${item.slug ? `#${encodeURIComponent(item.slug)}` : ''}`;
}

function openEditor(type,item=null) {
  if (type === 'settings' && !item) item = {setting_key:'live_stream',setting_value:{channelId:'',fallbackVideoId:'',liveMessage:'We are live now — join us in worship!',offlineMessage:'No live broadcast right now.'}};
  currentType = type;
  currentItem = item;
  dirty = false;
  pendingKey = null;
  home.hidden = true;
  permissionView.hidden = true;
  editorView.hidden = false;
  document.getElementById('editorTypeLabel').textContent = `${item?'EDIT':'NEW'} ${types[type].label.toUpperCase()}`;
  document.getElementById('editorHeading').textContent = item ? `Edit ${displayTitle(item)}` : `Add ${types[type].label.toLowerCase()}`;
  document.getElementById('editorHelp').textContent = item?.is_published
    ? 'You can save a private draft or publish your changes when they are ready.'
    : 'Complete the required details. You can save a draft and return later.';
  form.replaceChildren();
  for (const field of types[type].fields) addField(field,item?.[field[0]] ?? item?.data?.[field[0]] ?? null);
  const publishField = ['publish_at','Publish at (East Africa Time)','datetime-local',false,'Choose a future time when this should appear.'];
  const unpublishField = ['unpublish_at','Hide at (East Africa Time)','datetime-local',false,'Optional. Choose when this should be hidden from the website.'];
  addField(publishField,item?.publish_at || null);
  addField(unpublishField,item?.unpublish_at || null);
  const controls = node('div','','admin-toolbar');
  const saveDraft = node('button','Save draft','admin-secondary');
  saveDraft.type='button'; saveDraft.addEventListener('click',() => submitAction('save_draft'));
  const schedule = node('button','Schedule','admin-secondary');
  schedule.type='button'; schedule.addEventListener('click',() => submitAction('schedule'));
  const publish = node('button',item?.is_published?'Publish changes':'Publish now','admin-primary');
  publish.type='button'; publish.style.width='auto'; publish.style.padding='0 24px';
  publish.addEventListener('click',() => submitAction('publish'));
  controls.append(saveDraft,schedule,publish);
  form.appendChild(controls);
  updatePreview();
  const cached = localStorage.getItem(localDraftKey());
  if (cached && !item?.is_draft && window.confirm('We found an unsaved version of this post on this device. Restore it?')) {
    try {
      const saved = JSON.parse(cached);
      for (const [name,value] of Object.entries(saved)) {
        const input = form.elements.namedItem(name);
        if (!input) continue;
        const kind = types[type].fields.find(field => field[0] === name)?.[2];
        if (kind === 'checkbox') input.checked=Boolean(value);
        else input.value = kind === 'tags' ? (value || []).join(', ') : String(value || '');
      }
      dirty = true;
      updatePreview();
    } catch {}
  }
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(localDraftKey(),JSON.stringify(getFormData()));
      setStatus(document.getElementById('editorStatus'),'Saved on this device.');
    } catch {
      setStatus(document.getElementById('editorStatus'),'This browser could not save a local recovery copy.');
    }
  },2500);
}

async function submitAction(action) {
  if (!form.reportValidity()) return;
  if (action === 'publish' && !window.confirm('Publish this post on the website now?')) return;
  if (action === 'schedule' && !form.elements.namedItem('publish_at').value) {
    setStatus(document.getElementById('editorStatus'),'Choose a date and time before scheduling.','error');
    form.elements.namedItem('publish_at').focus();
    return;
  }
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => {button.disabled=true;});
  setStatus(document.getElementById('editorStatus'),action==='publish'?'Publishing…':action==='schedule'?'Scheduling…':'Saving draft…');
  if (!pendingKey) pendingKey = crypto.randomUUID();
  const data = getFormData();
  const body = {
    type:currentType,
    action,
    id:currentItem?.record_id || (currentItem?.is_draft ? null : currentItem?.id),
    draftId:currentItem?.draft_id || null,
    expectedVersion:currentItem?.version ?? null,
    data,
    idempotencyKey:pendingKey
  };
  try {
    const result = await requestFunction('cms-publish',{method:'POST',body});
    pendingKey = null;
    dirty = false;
    localStorage.removeItem(localDraftKey());
    setStatus(document.getElementById('editorStatus'),result.message || 'Saved.');
    if (action === 'save_draft') {
      currentItem = {...currentItem,draft_id:result.draftId,id:result.draftId,record_id:result.id,is_draft:true,version:result.version,...data};
    } else {
      currentItem = null;
      window.setTimeout(() => {editorView.hidden=true;home.hidden=false;loadItems();},1300);
    }
  } catch (error) {
    const message = error.status === 409 ? 'Someone updated this post while you were editing. Go back, reload the list, and reopen it.' : 'We could not save this yet. Your work remains in this form and on this device. Please try again.';
    setStatus(document.getElementById('editorStatus'),message,'error');
  } finally {
    buttons.forEach(button => {button.disabled=false;});
  }
}

async function runAction(type,item,action) {
  const message = action === 'unpublish' ? 'Hide this post from the website? You can show it again later.'
    : action === 'delete' ? 'Remove this post from the website? You can restore it later.' : 'Restore this post as a draft?';
  if (!window.confirm(message)) return;
  try {
    const result = await requestFunction('cms-publish',{method:'POST',body:{type,action,id:item.id,expectedVersion:item.version,idempotencyKey:crypto.randomUUID(),data:item}});
    setStatus(listStatus,result.message || 'Updated.');
    await loadItems();
  } catch (error) {
    setStatus(listStatus,error.status===409?'This post changed. Refresh the list and try again.':'We could not update this post. Try again.','error');
  }
}

function openPermissionSection(section) {
  const titles = {prayers:'Prayer requests',inbox:'Messages',applications:'Ministry joining requests'};
  home.hidden=true; editorView.hidden=true; permissionView.hidden=false;
  document.getElementById('permissionHeading').textContent=titles[section];
  requestFunction('admin-data',{query:{section}}).then(result => {
    const target=document.getElementById('permissionList'); target.replaceChildren();
    if (!result.items.length) target.appendChild(node('p','There are no new items to review.'));
    for (const item of result.items) {
      const card=node('article','','admin-item'); const main=node('div');
      main.append(node('h3',item.display_name||item.full_name||item.name||'Anonymous'),node('p',item.request_text||item.message||''));
      const actions=node('div','','admin-item-actions');
      if(section==='prayers'&&!item.is_approved){const approve=node('button','Approve','admin-secondary');approve.type='button';approve.onclick=()=>permissionAction('approve_prayer',item.id);actions.appendChild(approve);}
      if(section==='inbox'){const done=node('button','Mark handled','admin-secondary');done.type='button';done.onclick=()=>permissionAction('close_inquiry',item.id);actions.appendChild(done);}
      if(section==='applications'){main.appendChild(node('p',`Ministry: ${item.ministry || '—'} · Phone: ${item.phone || '—'}`));const done=node('button','Mark for follow-up','admin-secondary');done.type='button';done.onclick=()=>permissionAction('close_application',item.id);actions.appendChild(done);}
      card.append(main,actions);target.appendChild(card);
    }
  }).catch(()=>setStatus(document.getElementById('permissionStatus'),'We could not load these items. Please try again.','error'));
}

async function permissionAction(action,id) {
  try { await requestFunction('admin-data',{method:'POST',body:{action,id}}); openPermissionSection(action.includes('prayer')?'prayers':action.includes('application')?'applications':'inbox'); }
  catch { setStatus(document.getElementById('permissionStatus'),'We could not update this item. Try again.','error'); }
}

document.querySelectorAll('[data-new-type]').forEach(button => button.addEventListener('click',() => openEditor(button.dataset.newType)));
document.querySelectorAll('[data-admin-section]').forEach(button => button.addEventListener('click',() => openPermissionSection(button.dataset.adminSection)));
document.getElementById('backToHome').addEventListener('click',() => {editorView.hidden=true;home.hidden=false;loadItems();});
document.getElementById('backFromPermission').addEventListener('click',() => {permissionView.hidden=true;home.hidden=false;loadItems();});
document.getElementById('filterType').addEventListener('change',loadItems);
document.getElementById('filterStatus').addEventListener('change',loadItems);
document.getElementById('searchPosts').addEventListener('input',() => {clearTimeout(window.adminSearchTimer);window.adminSearchTimer=setTimeout(loadItems,250);});
window.addEventListener('beforeunload',event => {if(dirty){event.preventDefault();event.returnValue='';}});

profile = await protectAdminPage();
if (profile) {
  document.getElementById('consoleLink').hidden = profile.role !== 'admin';
  const perm = profile.permissions || {};
  document.getElementById('permissionCards').hidden = !(perm.moderatePrayers || perm.viewInbox);
  document.querySelector('[data-admin-section="prayers"]').hidden = !perm.moderatePrayers;
  document.querySelector('[data-admin-section="inbox"]').hidden = !perm.viewInbox;
  document.querySelector('[data-admin-section="applications"]').hidden = !perm.viewInbox;
  document.querySelector('[data-new-type="settings"]').hidden = profile.role !== 'admin';
  const notice = new URLSearchParams(location.search).get('notice');
  if (notice==='timeout') setStatus(listStatus,'You were signed out after a period of inactivity. Sign in again when ready.');
  const params=new URLSearchParams(location.search);
  const requestedType=params.get('type');
  const requestedId=params.get('id');
  if(requestedType&&types[requestedType]&&requestedId){
    document.getElementById('filterType').value=requestedType;
    const items=await loadItems();
    const item=items.find(record=>record.id===requestedId||record.record_id===requestedId);
    if(item)openEditor(requestedType,item);
    else setStatus(listStatus,'That post is no longer available.');
  }else await loadItems();
}
