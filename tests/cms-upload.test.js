import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/cms-upload.js';

test('signed upload URLs retain the Supabase Storage API prefix', async () => {
  const originalFetch=globalThis.fetch;
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_MFA_REQUIRED','ALLOWED_ORIGINS'];
  const oldEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const userId='00000000-0000-4000-8000-000000000001';
  process.env.SUPABASE_URL='https://unit-test.supabase.co';
  process.env.SUPABASE_ANON_KEY='test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';
  process.env.ADMIN_MFA_REQUIRED='false';
  process.env.ALLOWED_ORIGINS='https://aicegertonchapel.netlify.app';
  globalThis.fetch=async(url)=>{
    const requestUrl=String(url);
    if(requestUrl.includes('/auth/v1/user'))return new Response(JSON.stringify({id:userId}),{status:200});
    if(requestUrl.includes('/rest/v1/profiles'))return new Response(JSON.stringify([{id:userId,role:'editor',is_active:true}]),{status:200});
    if(requestUrl.includes('/rest/v1/rpc/bump_rate_limit'))return new Response('1',{status:200});
    if(requestUrl.includes('/storage/v1/object/upload/sign/'))return new Response(JSON.stringify({
      url:'/object/upload/sign/cms-media/sermons/file.webp',
      token:'signed-upload-token'
    }),{status:200});
    if(requestUrl.includes('/rest/v1/audit_log'))return new Response(null,{status:204});
    throw new Error(`Unexpected request: ${requestUrl}`);
  };
  try{
    const result=await handler({
      httpMethod:'POST',
      headers:{origin:'https://aicegertonchapel.netlify.app',authorization:'Bearer test-token'},
      body:JSON.stringify({action:'prepare',type:'sermons',name:'file.webp',contentType:'image/webp',size:1024})
    });
    const body=JSON.parse(result.body);
    assert.equal(result.statusCode,200);
    assert.equal(new URL(body.uploadUrl).pathname,'/storage/v1/object/upload/sign/cms-media/sermons/file.webp');
    assert.equal(new URL(body.uploadUrl).searchParams.get('token'),'signed-upload-token');
  } finally{
    globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(oldEnv))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});
