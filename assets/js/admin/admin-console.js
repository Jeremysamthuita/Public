import {protectAdminPage,requestFunction,setStatus} from './admin-client.js';

const labels={sermons:'Sermon',events:'Event',announcements:'Announcement',gallery:'Gallery photo',leadership:'Leader',ministries:'Ministry',service_times:'Service time',settings:'Site setting'};
const byId=id=>document.getElementById(id);
const node=(tag,text='',className='')=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
let profile=null;
let editingSetting=null;

function titleOf(item){return item.title||item.name||item.label||item.announcement_text||item.setting_key||item.image_url||'Untitled';}
function showError(error){setStatus(byId('consoleStatus'),`${error.message||'Action failed.'}${error.details?` — ${error.details}`:''}`,'error');}
function formatDate(value){return value?new Date(value).toLocaleString():'—';}

async function loadHealth(){
  setStatus(byId('consoleStatus'),'Checking service status…');
  try{
    const health=await requestFunction('admin-health');
    byId('openSupabase').href=health.links.supabase;
    byId('openContentful').href=health.links.contentful;
    const cards=byId('healthCards');cards.replaceChildren();
    for(const [key,check] of Object.entries(health.checks)){
      const card=node('article','','admin-panel');
      const heading=key==='daraja'?'Payments':key[0].toUpperCase()+key.slice(1);
      card.append(node('h3',heading),node('p',check.ok?'Connected':check.configured===false?'Not set up':'Needs attention'),node('p',check.message));
      card.dataset.state=check.ok?'ok':'warn';cards.appendChild(card);
    }
    byId('syncHistory').replaceChildren();
    if(!health.recentSync.length)byId('syncHistory').appendChild(node('p','No synchronization has run yet.'));
    for(const record of health.recentSync){
      const card=node('article','','admin-item');
      card.append(node('div',`${record.provider} · ${record.content_type} · ${record.status} · ${formatDate(record.completed_at)}`),node('p',`${record.record_count} records${record.message?` — ${record.message}`:''}`));
      byId('syncHistory').appendChild(card);
    }
    setStatus(byId('consoleStatus'),`Status refreshed. Snapshot last changed ${health.snapshotAgeMinutes===null?'—':`${health.snapshotAgeMinutes} minutes ago`}.`);
  }catch(error){showError(error);}
}

async function loadQueue(){
  try{
    const health=await requestFunction('admin-health');
    const list=byId('queueList');list.replaceChildren();
    if(!health.queue.jobs.length){list.appendChild(node('p','No failed or waiting jobs.'));return;}
    for(const job of health.queue.jobs){
      const card=node('article','','admin-item');const detail=node('div');
      detail.append(node('h3',`${labels[job.content_type]||job.content_type} · ${job.action}`),node('p',`Status: ${job.status} · Attempts: ${job.attempts} · Next try: ${formatDate(job.next_attempt_at)}`),node('p',`Reference: ${job.record_id}`));
      if(job.last_error)detail.appendChild(node('p',`Last issue: ${job.last_error}`));
      const actions=node('div','','admin-item-actions');
      if(job.status!=='resolved'){
        const retry=node('button','Retry','admin-secondary');retry.type='button';retry.onclick=()=>queueAction('retry_job',job.id);actions.appendChild(retry);
        const resolved=node('button','Mark resolved','admin-secondary');resolved.type='button';resolved.onclick=()=>queueAction('mark_resolved',job.id);actions.appendChild(resolved);
      }
      card.append(detail,actions);list.appendChild(card);
    }
  }catch(error){showError(error);}
}

async function queueAction(action,id=null){
  try{const result=await requestFunction('admin-ops',{method:'POST',body:{action,id}});setStatus(byId('consoleStatus'),result.message);await Promise.all([loadQueue(),loadHealth()]);}
  catch(error){showError(error);}
}

async function loadUsers(){
  try{
    const result=await requestFunction('admin-users');const list=byId('userList');list.replaceChildren();
    for(const user of result.items){
      const card=node('article','','admin-panel');const heading=node('h3',user.display_name||user.email||'Team account');
      const email=node('p',user.email);const settings=node('div');settings.className='admin-actions-grid';
      const roleWrap=node('label','Access level');const role=document.createElement('select');
      for(const [value,text] of [['editor','Content editor'],['admin','Administrator'],['member','No dashboard access']]){const option=node('option',text);option.value=value;role.appendChild(option);}role.value=user.role;roleWrap.appendChild(role);
      const activeWrap=node('label');const active=document.createElement('input');active.type='checkbox';active.checked=user.is_active;activeWrap.append(active,' Account active');
      const permissionControls=[];
      for(const [key,label] of [['can_moderate_prayers','Moderate prayer requests'],['can_view_inbox','Read messages and ministry requests'],['can_view_payments','View payments']]){
        const wrap=node('label');const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(user[key]);wrap.append(check,` ${label}`);permissionControls.push([key,check]);settings.appendChild(wrap);
      }
      const save=node('button','Save access','admin-secondary');save.type='button';save.onclick=async()=>{
        try{const update={action:'update',id:user.id,role:role.value,isActive:active.checked};for(const [key,control] of permissionControls){update[{can_moderate_prayers:'canModeratePrayers',can_view_inbox:'canViewInbox',can_view_payments:'canViewPayments'}[key]]=control.checked;}const res=await requestFunction('admin-users',{method:'POST',body:update});setStatus(byId('consoleStatus'),res.message);loadUsers();}
        catch(error){showError(error);}
      };
      const reset=node('button','Send password reset','admin-secondary');reset.type='button';reset.onclick=async()=>{if(!window.confirm(`Send a password reset link to ${user.email}?`))return;try{const res=await requestFunction('admin-users',{method:'POST',body:{action:'reset_password',email:user.email}});setStatus(byId('consoleStatus'),res.message);}catch(error){showError(error);}};
      const meta=node('p',`Last signed in: ${formatDate(user.last_login_at)} · Added: ${formatDate(user.created_at)}`);
      card.append(heading,email,roleWrap,activeWrap,settings,meta,node('div','','admin-item-actions'));
      card.lastChild.append(save,reset);list.appendChild(card);
    }
  }catch(error){showError(error);}
}

byId('inviteForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=byId('inviteForm').querySelector('button[type="submit"]');button.disabled=true;
  try{
    const result=await requestFunction('admin-users',{method:'POST',body:{action:'invite',email:byId('inviteEmail').value.trim(),displayName:byId('inviteName').value.trim(),role:byId('inviteRole').value,canModeratePrayers:byId('invitePrayers').checked,canViewInbox:byId('inviteInbox').checked,canViewPayments:byId('invitePayments').checked}});
    setStatus(byId('consoleStatus'),result.message);byId('inviteForm').reset();await loadUsers();
  }catch(error){showError(error);}finally{button.disabled=false;}
});

async function loadContent(){
  const type=byId('consoleContentType').value;
  try{
    const result=await requestFunction('cms-list',{query:{type,q:byId('consoleSearch').value,status:'all'}});
    const rows=byId('contentRows');rows.replaceChildren();
    for(const item of result.items){
      const row=document.createElement('tr');
      const content=node('td',titleOf(item));const state=node('td',item.is_draft?'Draft':item.deleted_at?'Hidden':item.publish_at&&new Date(item.publish_at)>new Date()?'Scheduled':item.is_published?'Live':'Draft');
      const source=node('td',item.source||'Supabase');const sync=node('td',item.sync_state||'—');
      const actions=node('td');const controls=node('div','','admin-item-actions');
      const details=node('button','Details','admin-secondary');details.type='button';details.onclick=async()=>{
        byId('rawRecordText').textContent=JSON.stringify(item,null,2);byId('rawRecord').hidden=false;const revisions=byId('revisionList');revisions.replaceChildren();
        try{const history=await requestFunction('cms-history',{query:{type,id:item.id}});for(const revision of history.items){const card=node('article','','admin-item');const info=node('div',`Version ${revision.version} · ${formatDate(revision.created_at)}`);const restore=node('button','Restore this version','admin-secondary');restore.type='button';restore.disabled=Number(revision.version)>=Number(item.version);restore.onclick=async()=>{if(!window.confirm(`Restore version ${revision.version}?`))return;try{const result=await requestFunction('cms-publish',{method:'POST',body:{type,action:'restore',id:item.id,expectedVersion:item.version,revisionId:revision.id,data:revision.snapshot,idempotencyKey:crypto.randomUUID()}});setStatus(byId('consoleStatus'),result.message);byId('rawRecord').hidden=true;await loadContent();}catch(error){showError(error);}};card.append(info,restore);revisions.appendChild(card);}if(!history.items.length)revisions.appendChild(node('p','No saved versions yet.'));}catch(error){revisions.appendChild(node('p',error.message||'Could not load versions.'));}
      };controls.appendChild(details);
      if(type==='settings'&&!item.is_draft){
        const editSetting=node('button','Edit site setting','admin-secondary');editSetting.type='button';editSetting.onclick=()=>{
          editingSetting=item;byId('settingKey').value=item.setting_key||'';byId('settingValue').value=JSON.stringify(item.setting_value||{},null,2);byId('createSetting').textContent='Save setting';setStatus(byId('consoleStatus'),`Editing ${item.setting_key||'site setting'}.`);
        };controls.appendChild(editSetting);
      }else if(!item.is_draft){
        const edit=node('a','Edit in editor','admin-secondary');edit.href=`/admin/dashboard.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`;controls.appendChild(edit);
        const remove=node('button','Permanently delete','admin-secondary');remove.type='button';remove.onclick=async()=>{
          if(!window.confirm(`Permanently remove “${titleOf(item)}”? This cannot be undone.`))return;
          if(!window.confirm('Confirm permanent removal. Content and revision history will be deleted.'))return;
          try{const res=await requestFunction('cms-publish',{method:'POST',body:{type,action:'permanent_delete',id:item.id,expectedVersion:item.version,data:item,idempotencyKey:crypto.randomUUID()}});setStatus(byId('consoleStatus'),res.message||'Permanently deleted.');await loadContent();}catch(error){showError(error);}
        };controls.appendChild(remove);
      }
      actions.appendChild(controls);row.append(content,state,source,sync,actions);rows.appendChild(row);
    }
    byId('settingsCreator').hidden=type!=='settings';
  }catch(error){showError(error);}
}

byId('createSetting').addEventListener('click',async()=>{
  let value;try{value=JSON.parse(byId('settingValue').value||'{}');if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();}catch{setStatus(byId('consoleStatus'),'Enter a valid object for the setting value.','error');return;}
  try{const body={type:'settings',action:'publish',data:{setting_key:byId('settingKey').value.trim(),setting_value:value},idempotencyKey:crypto.randomUUID()};if(editingSetting){body.id=editingSetting.id;body.expectedVersion=editingSetting.version;}const result=await requestFunction('cms-publish',{method:'POST',body});editingSetting=null;byId('createSetting').textContent='Create setting';byId('settingKey').value='';byId('settingValue').value='{}';setStatus(byId('consoleStatus'),result.message);await loadContent();}catch(error){showError(error);}
});

async function loadPrivate(){
  const section=byId('privateSection').value;
  try{
    const result=await requestFunction('admin-data',{query:{section}});const rows=byId('privateRows');rows.replaceChildren();
    for(const item of result.items){
      const row=document.createElement('tr');
      const primary=section==='payments'?item.mpesa_receipt_number||'Payment':section==='prayers'?item.display_name||'Anonymous':item.full_name||item.name||'Request';
      const detail=section==='payments'?`KES ${item.amount} · ${item.purpose} · ${item.phone_number}`:section==='prayers'?`${item.category||''} · ${item.request_text||''}`:section==='applications'?`${item.ministry} · ${item.phone}`:`${item.email||''} · ${item.message||''}`;
      row.append(node('td',primary),node('td',detail),node('td',item.status|| (item.is_approved?'Approved':'Pending')),node('td',formatDate(item.created_at)));rows.appendChild(row);
    }
    if(!result.items.length)rows.appendChild(Object.assign(document.createElement('tr'),{textContent:'No records found.'}));
  }catch(error){showError(error);}
}

async function loadAudit(){
  try{
    const result=await requestFunction('admin-data',{query:{section:'audit'}});const list=byId('auditList');list.replaceChildren();
    for(const item of result.items){const card=node('article','','admin-item');card.append(node('strong',item.action),node('p',`${item.target_type||'—'} · ${item.target_id||'—'} · ${formatDate(item.created_at)}`),node('pre',JSON.stringify(item.metadata||{},null,2)));list.appendChild(card);}
    if(!result.items.length)list.appendChild(node('p','No recorded actions yet.'));
  }catch(error){showError(error);}
}

document.querySelectorAll('[data-console-panel]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-console-panel]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));
  document.querySelectorAll('[id^="console-"][role="tabpanel"]').forEach(panel=>{panel.hidden=panel.id!==`console-${button.dataset.consolePanel}`;});
  if(button.dataset.consolePanel==='publishing')loadQueue();
  if(button.dataset.consolePanel==='users')loadUsers();
  if(button.dataset.consolePanel==='content')loadContent();
  if(button.dataset.consolePanel==='records')loadPrivate();
  if(button.dataset.consolePanel==='audit')loadAudit();
}));
byId('refreshHealth').onclick=loadHealth;
byId('retryAll').onclick=()=>queueAction('retry_all');
byId('runSync').onclick=async()=>{try{const result=await requestFunction('admin-ops',{method:'POST',body:{action:'sync_contentful'}});setStatus(byId('consoleStatus'),`${result.result.synced} records refreshed across ${result.result.types} content types.`);loadHealth();}catch(error){showError(error);}};
byId('rebuildSnapshot').onclick=async()=>{try{const result=await requestFunction('admin-ops',{method:'POST',body:{action:'rebuild_snapshot'}});setStatus(byId('consoleStatus'),result.message);}catch(error){showError(error);}};
byId('consoleContentType').onchange=loadContent;byId('reloadContent').onclick=loadContent;
byId('consoleSearch').addEventListener('input',()=>{clearTimeout(window.consoleSearchTimer);window.consoleSearchTimer=setTimeout(loadContent,250);});
byId('privateSection').onchange=loadPrivate;byId('loadPrivate').onclick=loadPrivate;
byId('closeRaw').onclick=()=>byId('rawRecord').hidden=true;

profile=await protectAdminPage({adminOnly:true});
if(profile){await loadHealth();}
