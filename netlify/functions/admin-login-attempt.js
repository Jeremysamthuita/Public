import {createHash} from 'node:crypto';
import {audit,checkOrigin,response} from './_shared/admin-auth.js';

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(event,200,{});
  if(event.httpMethod!=='POST')return response(event,405,{ok:false});
  try{
    checkOrigin(event,{required:true});
    if(String(event.body||'').length>2000)return response(event,413,{ok:false});
    const payload=JSON.parse(event.body||'{}');
    const email=String(payload.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return response(event,400,{ok:false});
    const url=process.env.SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!serviceKey)return response(event,503,{ok:false});
    const settings={baseUrl:new URL(url).origin,serviceKey};
    const rawIp=event.headers?.['x-nf-client-connection-ip']||event.headers?.['X-Nf-Client-Connection-Ip']||event.headers?.['x-forwarded-for']||'';
    const ipHash=rawIp?createHash('sha256').update(String(rawIp).slice(0,100)).digest('hex'):null;
    const emailHash=createHash('sha256').update(email).digest('hex');
    const windowSeconds=600;
    const windowStart=new Date(Math.floor(Date.now()/(windowSeconds*1000))*windowSeconds*1000).toISOString();
    if(ipHash){
      const limited=await fetch(`${settings.baseUrl}/rest/v1/rpc/bump_rate_limit`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_key:`admin-login-audit:${ipHash}:${windowSeconds}`,p_window:windowStart}),signal:AbortSignal.timeout(5000)});
      if(!limited.ok)return response(event,503,{ok:false});
      if(Number(await limited.json())!==1)return response(event,200,{ok:true});
    }
    await audit(settings,null,'admin_login_failure_burst','admin_auth',null,{email_hash:emailHash,ip_hash:ipHash,window_seconds:windowSeconds});
    return response(event,200,{ok:true});
  }catch(error){
    if((error.statusCode||500)>=500)console.error('[admin-login-attempt] Login audit could not be recorded.');
    return response(event,error.statusCode||500,{ok:false});
  }
};
