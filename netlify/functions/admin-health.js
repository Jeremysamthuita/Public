import {authenticate, checkOrigin, response, serviceRequest} from './_shared/admin-auth.js';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';

async function check(url,headers={}) {
  try {
    const result=await fetch(url,{headers,signal:AbortSignal.timeout(5000)});
    return {ok:result.ok,status:result.status};
  } catch { return {ok:false,status:0}; }
}

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(event,200,{});
  if(event.httpMethod!=='GET')return response(event,405,{ok:false,error:'Use GET to load service status.'});
  try{
    checkOrigin(event);
    const {settings}=await authenticate(event,{roles:['admin']});
    const supabaseAuth=await check(`${settings.baseUrl}/auth/v1/health`,{apikey:process.env.SUPABASE_ANON_KEY});
    let contentful={ok:false,status:0};
    if(process.env.CONTENTFUL_SPACE_ID&&process.env.CONTENTFUL_MANAGEMENT_TOKEN){
      contentful=await check(`https://api.contentful.com/spaces/${encodeURIComponent(process.env.CONTENTFUL_SPACE_ID)}`,{Authorization:`Bearer ${process.env.CONTENTFUL_MANAGEMENT_TOKEN}`});
    }
    const [queue,sync] = await Promise.all([
      serviceRequest(settings,'publish_queue',{query:{select:'id,content_type,record_id,action,status,attempts,next_attempt_at,last_error,created_at',order:'created_at.desc',limit:'100'}}).catch(()=>[]),
      serviceRequest(settings,'cms_sync_log',{query:{select:'provider,content_type,status,record_count,message,completed_at',order:'completed_at.desc',limit:'15'}}).catch(()=>[])
    ]);
    let snapshotAge=null;
    try{const info=await stat(resolve(process.cwd(),'content-snapshot.json'));snapshotAge=Math.max(0,Math.floor((Date.now()-info.mtimeMs)/60000));}catch{}
    let projectRef='';
    try{projectRef=new URL(process.env.SUPABASE_URL).hostname.split('.')[0];}catch{}
    const result={
      ok:true,
      checks:{
        supabase:{ok:supabaseAuth.ok,message:supabaseAuth.ok?'Connected':'Could not reach the database service'},
        contentful:{ok:contentful.ok,configured:Boolean(process.env.CONTENTFUL_SPACE_ID&&process.env.CONTENTFUL_MANAGEMENT_TOKEN),message:contentful.ok?'Connected':process.env.CONTENTFUL_MANAGEMENT_TOKEN?'Could not reach the content service':'Server publishing credentials are not configured'},
        email:{ok:Boolean(process.env.EMAIL_PROVIDER&&process.env.EMAIL_API_KEY),message:process.env.EMAIL_PROVIDER&&process.env.EMAIL_API_KEY?'Configured':'Email service is not configured'},
        daraja:{ok:Boolean(process.env.DARAJA_CONSUMER_KEY&&process.env.DARAJA_CONSUMER_SECRET&&process.env.DARAJA_PASSKEY),message:process.env.DARAJA_CONSUMER_KEY?'Configured':'Not configured'},
        youtube:{ok:Boolean(process.env.YOUTUBE_API_KEY&&process.env.YOUTUBE_CHANNEL_ID),message:process.env.YOUTUBE_API_KEY?'Configured':'Not configured'}
      },
      queue:{pending:(queue||[]).filter(job=>job.status==='pending').length,failed:(queue||[]).filter(job=>job.status==='failed').length,jobs:(queue||[]).filter(job=>['failed','pending'].includes(job.status)).slice(0,30)},
      lastSync:(sync||[])[0]||null,
      recentSync:sync||[],
      snapshotAgeMinutes:snapshotAge,
      links:{supabase:projectRef?`https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}`:'https://supabase.com/dashboard/',contentful:process.env.CONTENTFUL_SPACE_ID?`https://app.contentful.com/spaces/${encodeURIComponent(process.env.CONTENTFUL_SPACE_ID)}/environments/${encodeURIComponent(process.env.CONTENTFUL_ENV||'master')}/content`:'https://app.contentful.com/'}
    };
    return response(event,200,result);
  }catch(error){
    const status=error.statusCode||500;
    if(status>=500)console.error('[admin-health] Service overview failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'Could not load service status.'});
  }
};
