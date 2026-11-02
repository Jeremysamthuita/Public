import {publishContentful} from './_shared/contentful-publisher.js';
import {serviceRequest, tableForType} from './_shared/admin-auth.js';

export const config = {schedule:'*/5 * * * *'};
const types = ['sermons','events','announcements','gallery','leadership','ministries','service_times','settings'];

function dbSettings() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Scheduled publishing is not configured.');
  return {baseUrl:new URL(process.env.SUPABASE_URL).origin,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY};
}

async function addRetry(settings, row, type, error) {
  const pending = await serviceRequest(settings,'publish_queue',{query:{select:'id',content_type:`eq.${type}`,record_id:`eq.${row.id}`,action:'eq.unpublish',status:'in.(pending,failed)',limit:'1'}});
  const payload={action:'unpublish',record_id:row.id};
  const retry={status:'pending',attempts:0,next_attempt_at:new Date(Date.now()+60_000).toISOString(),last_error:String(error.message).slice(0,2000),updated_at:new Date().toISOString()};
  if (pending?.length) await serviceRequest(settings,'publish_queue',{method:'PATCH',query:{id:`eq.${pending[0].id}`},body:{...retry,payload},prefer:'return=minimal'});
  else await serviceRequest(settings,'publish_queue',{method:'POST',body:{content_type:type,record_id:row.id,action:'unpublish',payload,...retry,created_by:row.updated_by||null},prefer:'return=minimal'});
}

export const handler = async () => {
  try {
    const settings=dbSettings();
    const now=new Date().toISOString();
    let processed=0;
    for (const type of types) {
      const table=tableForType(type);
      const due=await serviceRequest(settings,table,{query:{select:'*',is_published:'eq.true',deleted_at:'is.null',unpublish_at:`lte.${now}`,order:'unpublish_at.asc',limit:'25'}});
      for (const row of due||[]) {
        const changed=await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${row.id}`,version:`eq.${row.version}`,is_published:'eq.true',select:'*'},body:{is_published:false,unpublish_at:null,version:Number(row.version)+1,updated_at:now,sync_state:'pending_contentful'},prefer:'return=representation'});
        if (!changed?.length) continue;
        await serviceRequest(settings,'cms_revisions',{method:'POST',query:{on_conflict:'content_type,record_id,version'},body:{content_type:type,record_id:row.id,version:row.version,snapshot:row,changed_by:null},prefer:'resolution=merge-duplicates,return=minimal'});
        try {
          await publishContentful(type,{...changed[0],unpublish_at:null},'unpublish');
          await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${row.id}`},body:{sync_state:'synced',last_error:null},prefer:'return=minimal'});
        } catch (error) {
          await addRetry(settings,changed[0],type,error);
          await serviceRequest(settings,table,{method:'PATCH',query:{id:`eq.${row.id}`},body:{sync_state:'pending_contentful',sync_attempts:Number(row.sync_attempts||0)+1,last_error:String(error.message).slice(0,2000)},prefer:'return=minimal'});
        }
        processed+=1;
      }
    }
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({processed})};
  } catch (error) {
    console.error('[scheduled-publish] Scheduled content check failed.',error.message);
    return {statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'Scheduled publishing could not be checked.'})};
  }
};
