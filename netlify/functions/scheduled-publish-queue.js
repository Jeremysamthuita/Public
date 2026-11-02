import {sendEmail} from './_shared/email.js';
import {contentTypeIdFor, publishContentful} from './_shared/contentful-publisher.js';
import {serviceRequest, tableForType} from './_shared/admin-auth.js';

export const config = {schedule: '*/5 * * * *'};

function settings() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Publishing queue is not configured.');
  return {baseUrl:new URL(process.env.SUPABASE_URL).origin,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY};
}

async function notifyFailure(type, recordId, reason) {
  if (!process.env.CHURCH_EMAIL) return;
  try {
    await sendEmail({
      to:process.env.CHURCH_EMAIL,
      subject:'AIC Chapel website content needs attention',
      text:`A content backup could not be updated after several attempts.\nContent type: ${type}\nReference: ${recordId}\nReason: ${String(reason).slice(0,500)}\nPlease open the admin console and review the publishing queue.`,
      html:`<p>A content backup could not be updated after several attempts.</p><p>Content type: ${type}<br>Reference: ${recordId}</p><p>Please open the admin console and review the publishing queue.</p>`
    });
  } catch (error) {
    console.error('[scheduled-publish-queue] Failure notification could not be sent.',error.message);
  }
}

export const handler = async () => {
  try {
    const db = settings();
    const now = new Date().toISOString();
    const jobs = await serviceRequest(db,'publish_queue',{query:{select:'*',status:'eq.pending',next_attempt_at:`lte.${now}`,order:'next_attempt_at.asc',limit:'25'}});
    const results = [];
    for (const job of jobs || []) {
      const table = tableForType(job.content_type);
      if (!table) {
        await serviceRequest(db,'publish_queue',{method:'PATCH',query:{id:`eq.${job.id}`},body:{status:'failed',last_error:'Unknown content type.',updated_at:now},prefer:'return=minimal'});
        continue;
      }
      const claimed = await serviceRequest(db,'publish_queue',{method:'PATCH',query:{id:`eq.${job.id}`,status:'eq.pending',select:'id'},body:{status:'processing',updated_at:now},prefer:'return=representation'});
      if (!claimed?.length) continue;
      try {
        let rows = await serviceRequest(db,table,{query:{select:'*',id:`eq.${job.record_id}`,limit:'1'}});
        const row = rows?.[0];
        if (!row) throw new Error('The content was removed before its backup completed.');
        const scheduled = job.action === 'publish' && !row.is_published && row.publish_at && Date.parse(row.publish_at) <= Date.now();
        let publishRow = row;
        if (scheduled) {
          await serviceRequest(db,'cms_revisions',{method:'POST',query:{on_conflict:'content_type,record_id,version'},body:{content_type:job.content_type,record_id:row.id,version:row.version,snapshot:row,changed_by:job.created_by || null},prefer:'resolution=merge-duplicates,return=minimal'});
          const update = await serviceRequest(db,table,{method:'PATCH',query:{id:`eq.${row.id}`,version:`eq.${row.version}`,select:'*'},body:{is_published:true,version:Number(row.version)+1,updated_at:now,sync_state:'pending_contentful'},prefer:'return=representation'});
          if (!update?.length) throw new Error('Scheduled content changed before it could publish.');
          publishRow = update[0];
        }
        const result = await publishContentful(job.content_type,publishRow,job.action);
        await serviceRequest(db,table,{method:'PATCH',query:{id:`eq.${row.id}`},body:{contentful_id:result.id || row.contentful_id,sync_state:'synced',last_error:null},prefer:'return=minimal'});
        await serviceRequest(db,'publish_queue',{method:'PATCH',query:{id:`eq.${job.id}`},body:{status:'resolved',last_error:null,updated_at:new Date().toISOString()},prefer:'return=minimal'});
        results.push({id:job.id,status:'resolved'});
      } catch (error) {
        const attempts = Number(job.attempts || 0) + 1;
        const failed = attempts >= 8;
        const delayMinutes = Math.min(5 * (2 ** Math.min(attempts - 1, 6)), 360);
        const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
        await serviceRequest(db,'publish_queue',{method:'PATCH',query:{id:`eq.${job.id}`},body:{status:failed?'failed':'pending',attempts,last_error:String(error.message).slice(0,2000),next_attempt_at:nextAttempt,updated_at:new Date().toISOString()},prefer:'return=minimal'});
        await serviceRequest(db,tableForType(job.content_type),{method:'PATCH',query:{id:`eq.${job.record_id}`},body:{sync_state:failed?'failed':'pending_contentful',sync_attempts:attempts,last_error:String(error.message).slice(0,2000)},prefer:'return=minimal'});
        if (failed) await notifyFailure(job.content_type,job.record_id,error.message);
        results.push({id:job.id,status:failed?'failed':'retrying'});
      }
    }
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({processed:results.length,results})};
  } catch (error) {
    console.error('[scheduled-publish-queue] Queue processing failed.',error.message);
    return {statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'Publishing queue could not be processed.'})};
  }
};
