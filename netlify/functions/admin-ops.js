import {runCmsSync,supportedContentTypes} from './_shared/cms-sync-core.js';
import {audit,authenticate,checkOrigin,response,serviceRequest} from './_shared/admin-auth.js';

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(event,200,{});
  if(event.httpMethod!=='POST')return response(event,405,{ok:false,error:'Use POST to run an administrator action.'});
  try{
    checkOrigin(event,{required:true});
    const auth=await authenticate(event,{roles:['admin']});
    if(String(event.body||'').length>10000)return response(event,413,{ok:false,error:'That request is too large.'});
    const payload=JSON.parse(event.body||'{}');
    const now=new Date().toISOString();
    if(payload.action==='retry_job'){
      await serviceRequest(auth.settings,'publish_queue',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{status:'pending',next_attempt_at:now,last_error:null,updated_at:now},prefer:'return=minimal'});
      await audit(auth.settings,auth.user.id,'publish_queue_retry','publish_queue',payload.id);
      return response(event,200,{ok:true,message:'The job is queued for another attempt.'});
    }
    if(payload.action==='retry_all'){
      await serviceRequest(auth.settings,'publish_queue',{method:'PATCH',query:{status:'in.(failed,processing)',select:'id'},body:{status:'pending',next_attempt_at:now,last_error:null,updated_at:now},prefer:'return=representation'});
      await audit(auth.settings,auth.user.id,'publish_queue_retry_all','publish_queue');
      return response(event,200,{ok:true,message:'Failed jobs are queued for another attempt.'});
    }
    if(payload.action==='mark_resolved'){
      await serviceRequest(auth.settings,'publish_queue',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{status:'resolved',updated_at:now},prefer:'return=minimal'});
      await audit(auth.settings,auth.user.id,'publish_queue_resolved','publish_queue',payload.id);
      return response(event,200,{ok:true,message:'The job was marked resolved.'});
    }
    if(payload.action==='sync_contentful'){
      const requested=Array.isArray(payload.types)?payload.types:supportedContentTypes();
      if(requested.some(type=>!supportedContentTypes().includes(type)))return response(event,400,{ok:false,error:'Choose a supported content group.'});
      const result=await runCmsSync(requested,auth.user.id);
      await audit(auth.settings,auth.user.id,'contentful_sync_requested','cms_sync_log',null,{types:requested.length});
      const success=result.failures.length===0;
      return response(event,success?200:502,{ok:success,result:success?{synced:result.synced,types:result.types}:undefined,error:success?undefined:'Some content could not be refreshed. Check the service log and try again.',details:success?undefined:result.failures});
    }
    if(payload.action==='rebuild_snapshot'){
      const hook=process.env.NETLIFY_BUILD_HOOK_URL;
      if(!hook)return response(event,503,{ok:false,error:'The site refresh connection is not configured yet.'});
      const triggered=await fetch(hook,{method:'POST',signal:AbortSignal.timeout(8000)});
      if(!triggered.ok)throw new Error(`Build request returned HTTP ${triggered.status}.`);
      await audit(auth.settings,auth.user.id,'snapshot_rebuild_requested','site');
      return response(event,200,{ok:true,message:'The site refresh has started.'});
    }
    return response(event,400,{ok:false,error:'Choose a supported administrator action.'});
  }catch(error){
    const status=error.statusCode||500;
    if(status>=500)console.error('[admin-ops] Administrator action failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'That action could not be completed. Please try again.',details:status>=500?error.message:undefined});
  }
};
