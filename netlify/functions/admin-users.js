import {audit, authenticate, checkOrigin, response, serviceRequest} from './_shared/admin-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function supabaseHeaders(key) { return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}; }

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(event,200,{});
  let requestingAdmin = false;
  try {
    checkOrigin(event,{required:event.httpMethod === 'POST'});
    const auth = await authenticate(event,{roles:['admin']});
    requestingAdmin = true;
    if (event.httpMethod === 'GET') {
      const {settings} = auth;
      const [profilesResponse,usersResponse] = await Promise.all([
        serviceRequest(settings,'profiles',{query:{select:'id,role,is_active,display_name,can_moderate_prayers,can_view_inbox,can_view_payments,last_login_at,created_at',order:'created_at.desc',limit:'200'}}),
        fetch(`${settings.baseUrl}/auth/v1/admin/users?page=1&per_page=200`,{headers:{apikey:settings.serviceKey,Authorization:`Bearer ${settings.serviceKey}`},signal:AbortSignal.timeout(10000)})
      ]);
      if (!usersResponse.ok) throw new Error(`Auth user list returned HTTP ${usersResponse.status}.`);
      const users = (await usersResponse.json()).users || [];
      const emails = new Map(users.map(user => [user.id,user.email || '']));
      const items = (profilesResponse || []).map(profile => ({...profile,email:emails.get(profile.id) || ''}));
      return response(event,200,{ok:true,items});
    }
    if (event.httpMethod !== 'POST') return response(event,405,{ok:false,error:'Use GET or POST.'});
    if (String(event.body || '').length > 12000) return response(event,413,{ok:false,error:'That request is too large.'});
    const payload = JSON.parse(event.body || '{}');
    if (payload.action === 'invite') {
      const email = String(payload.email || '').trim().toLowerCase();
      const role = payload.role;
      const displayName = String(payload.displayName || '').trim().slice(0,120);
      if (!EMAIL.test(email) || !['editor','admin'].includes(role)) return response(event,400,{ok:false,error:'Enter a valid email and choose a role.'});
      const invite = await fetch(`${auth.settings.baseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(`${process.env.URL || 'https://aicegertonchapel.netlify.app'}/admin/`)}`,{
        method:'POST',headers:supabaseHeaders(auth.settings.serviceKey),
        body:JSON.stringify({email,data:{display_name:displayName}}),
        signal:AbortSignal.timeout(12000)
      });
      if (!invite.ok) {
        const status=invite.status;
        return response(event,status===422?409:status,{ok:false,error:status===422?'This email may already have an account. Ask them to reset their password or contact the administrator.':'The invitation could not be sent. Check the account email settings and try again.'});
      }
      const user=await invite.json();
      let profileRows=[];
      for(let attempt=0;attempt<4;attempt+=1){
        profileRows=await serviceRequest(auth.settings,'profiles',{query:{select:'id',id:`eq.${user.id}`,limit:'1'}});
        if(profileRows?.length) break;
        await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
      }
      if(!profileRows?.length) throw new Error('The account was invited, but its access profile was not created.');
      await serviceRequest(auth.settings,'profiles',{method:'PATCH',query:{id:`eq.${user.id}`},body:{role,is_active:true,display_name:displayName || null,can_moderate_prayers:Boolean(payload.canModeratePrayers),can_view_inbox:Boolean(payload.canViewInbox),can_view_payments:Boolean(payload.canViewPayments)},prefer:'return=minimal'});
      await audit(auth.settings,auth.user.id,'admin_user_invited','profile',user.id,{role});
      return response(event,200,{ok:true,message:'Invitation sent. The new team member can set a password from the email.'});
    }
    if (payload.action === 'update') {
      if (!UUID.test(String(payload.id || ''))) return response(event,400,{ok:false,error:'Choose a valid account.'});
      const changes={};
      if(['admin','editor','member'].includes(payload.role)) changes.role=payload.role;
      if(typeof payload.isActive==='boolean') changes.is_active=payload.isActive;
      if(typeof payload.canModeratePrayers==='boolean') changes.can_moderate_prayers=payload.canModeratePrayers;
      if(typeof payload.canViewInbox==='boolean') changes.can_view_inbox=payload.canViewInbox;
      if(typeof payload.canViewPayments==='boolean') changes.can_view_payments=payload.canViewPayments;
      if(typeof payload.displayName==='string') changes.display_name=payload.displayName.trim().slice(0,120)||null;
      if(!Object.keys(changes).length) return response(event,400,{ok:false,error:'Choose an access setting to change.'});
      if(payload.id===auth.user.id && (changes.is_active===false || (changes.role && changes.role!=='admin'))) return response(event,400,{ok:false,error:'You cannot disable or remove administrator access from your own account.'});
      if(payload.id!==auth.user.id && (changes.is_active===false || (changes.role && changes.role!=='admin'))){
        const existing=await serviceRequest(auth.settings,'profiles',{query:{select:'role,is_active',id:`eq.${payload.id}`,limit:'1'}});
        if(existing?.[0]?.role==='admin'&&existing[0].is_active){
          const admins=await serviceRequest(auth.settings,'profiles',{query:{select:'id',role:'eq.admin',is_active:'eq.true',limit:'2'}});
          if((admins||[]).length<=1)return response(event,409,{ok:false,error:'Keep at least one active administrator account.'});
        }
      }
      await serviceRequest(auth.settings,'profiles',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{...changes,updated_at:new Date().toISOString()},prefer:'return=minimal'});
      await audit(auth.settings,auth.user.id,'admin_user_updated','profile',payload.id,{changed:Object.keys(changes)});
      return response(event,200,{ok:true,message:'Account access updated.'});
    }
    if(payload.action==='reset_password'){
      const email=String(payload.email||'').trim().toLowerCase();
      if(!EMAIL.test(email))return response(event,400,{ok:false,error:'Enter a valid email address.'});
      const reset=await fetch(`${auth.settings.baseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(`${process.env.URL || 'https://aicegertonchapel.netlify.app'}/admin/`)}`,{
        method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(10000)
      });
      if(!reset.ok)throw new Error(`Password reset returned HTTP ${reset.status}.`);
      await audit(auth.settings,auth.user.id,'admin_password_reset_requested','profile',null);
      return response(event,200,{ok:true,message:'If that account exists, a password reset email has been sent.'});
    }
    return response(event,400,{ok:false,error:'Choose a supported account action.'});
  }catch(error){
    const status=error.statusCode||500;
    if(status>=500)console.error('[admin-users] Account action failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'We could not complete that account action. Please try again.',details:requestingAdmin&&status>=500?error.message:undefined});
  }
};
