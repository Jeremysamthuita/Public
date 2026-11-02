import {randomUUID} from 'node:crypto';
import {audit, authenticate, checkOrigin, response} from './_shared/admin-auth.js';

const LIMITS={'image/jpeg':8,'image/png':8,'image/webp':8,'application/pdf':15,'audio/mpeg':60,'audio/mp4':60};

function cleanName(value){
  const name=String(value||'upload').normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').slice(-100);
  return name||'upload';
}
function storageHeaders(key){return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(event,200,{});
  if(event.httpMethod!=='POST')return response(event,405,{ok:false,error:'Use POST to upload a file.'});
  try{
    checkOrigin(event,{required:true});
    if(String(event.body||'').length>10000)return response(event,413,{ok:false,error:'The upload request is too large.'});
    const payload=JSON.parse(event.body||'{}');
    const {user,settings}=await authenticate(event,{roles:['admin','editor']});
    if(payload.action==='prepare'){
      const mime=String(payload.contentType||'').toLowerCase();
      const size=Number(payload.size);
      const maxBytes=(LIMITS[mime]||0)*1024*1024;
      if(!maxBytes)return response(event,400,{ok:false,error:'Choose a photo, PDF, or audio file in a supported format.'});
      if(!Number.isFinite(size)||size<=0||size>maxBytes)return response(event,400,{ok:false,error:`This file is too large. The maximum for this type is ${LIMITS[mime]} MB.`});
      const type=String(payload.type||'content').replace(/[^a-z0-9_-]/gi,'').slice(0,32)||'content';
      const path=`${type}/${user.id}/${randomUUID()}-${cleanName(payload.name)}`;
      const encoded=path.split('/').map(encodeURIComponent).join('/');
      const sign=await fetch(`${settings.baseUrl}/storage/v1/object/upload/sign/cms-media/${encoded}`,{
        method:'POST',headers:storageHeaders(settings.serviceKey),body:JSON.stringify({upsert:false}),signal:AbortSignal.timeout(9000)
      });
      if(!sign.ok)throw new Error(`Storage upload preparation returned HTTP ${sign.status}.`);
      const result=await sign.json();
      const rawUrl=result.signedUrl||result.signedURL||result.url;
      if(!rawUrl||!result.token)throw new Error('Storage did not return an upload link.');
      const uploadUrl=new URL(rawUrl,settings.baseUrl);
      if(!uploadUrl.searchParams.has('token'))uploadUrl.searchParams.set('token',result.token);
      await audit(settings,user.id,'cms_upload_prepared','media',path,{content_type:mime,size});
      return response(event,200,{ok:true,path,uploadUrl:uploadUrl.toString(),contentType:mime,size});
    }
    if(payload.action==='complete'){
      const path=String(payload.path||'');
      if(!path.startsWith(`${String(payload.type||'').replace(/[^a-z0-9_-]/gi,'')}/${user.id}/`)||path.includes('..'))return response(event,403,{ok:false,error:'This upload is not available to your account.'});
      const encoded=path.split('/').map(encodeURIComponent).join('/');
      const check=await fetch(`${settings.baseUrl}/storage/v1/object/info/cms-media/${encoded}`,{headers:{apikey:settings.serviceKey,Authorization:`Bearer ${settings.serviceKey}`},signal:AbortSignal.timeout(9000)});
      if(!check.ok)throw new Error(`Uploaded file check returned HTTP ${check.status}.`);
      const info=await check.json();
      const mime=String(info.metadata?.mimetype||info.metadata?.contentType||info.contentType||'').toLowerCase();
      const maxBytes=(LIMITS[mime]||0)*1024*1024;
      const actualSize=Number(info.metadata?.size||info.size||0);
      if(!LIMITS[mime]||!actualSize||actualSize>maxBytes){
        await fetch(`${settings.baseUrl}/storage/v1/object/cms-media/${encoded}`,{method:'DELETE',headers:{apikey:settings.serviceKey,Authorization:`Bearer ${settings.serviceKey}`},signal:AbortSignal.timeout(9000)});
        return response(event,400,{ok:false,error:'This file type or size is not supported. The uploaded file was removed.'});
      }
      const publicUrl=`${settings.baseUrl}/storage/v1/object/public/cms-media/${encoded}`;
      await audit(settings,user.id,'cms_upload_completed','media',path,{content_type:mime});
      return response(event,200,{ok:true,path,url:publicUrl,contentType:mime});
    }
    return response(event,400,{ok:false,error:'Choose a supported upload action.'});
  }catch(error){
    const status=error.statusCode||500;
    if(status>=500)console.error('[cms-upload] Upload request failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'We could not prepare the upload. Please try again.'});
  }
};
