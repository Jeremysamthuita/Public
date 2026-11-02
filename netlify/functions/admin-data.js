import {audit, authenticate, checkOrigin, response, serviceRequest} from './_shared/admin-auth.js';

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(event,200,{});
  try {
    checkOrigin(event,{required:event.httpMethod === 'POST'});
    const {user,profile,settings} = await authenticate(event,{roles:['admin','editor']});
    if (event.httpMethod === 'GET') {
      const section = event.queryStringParameters?.section || '';
      const permission = section === 'prayers' ? 'can_moderate_prayers'
        : ['inbox','applications'].includes(section) ? 'can_view_inbox'
          : section === 'payments' ? 'can_view_payments' : '';
      if (section === 'audit' && profile.role === 'admin') {
        const items=await serviceRequest(settings,'audit_log',{query:{select:'id,actor_id,action,target_type,target_id,metadata,created_at',order:'created_at.desc',limit:'100'}});
        return response(event,200,{ok:true,items:items||[]});
      }
      if (!permission) return response(event,400,{ok:false,error:'Choose a supported section.'});
      if (profile.role !== 'admin' && !profile[permission]) return response(event,403,{ok:false,error:'Your account does not have permission to view these items.'});
      const table = section === 'prayers' ? 'prayer_requests'
        : section === 'applications' ? 'ministry_applications'
          : section === 'payments' ? 'mpesa_payments' : 'contact_inquiries';
      const select = section === 'prayers'
        ? 'id,display_name,category,request_text,is_approved,private,created_at'
        : section === 'applications' ? 'id,name,phone,age,baptism_year,ministry,status,created_at'
          : section === 'payments' ? 'id,mpesa_receipt_number,phone_number,amount,purpose,status,created_at'
            : 'id,full_name,email,phone,message,category,urgency_level,status,created_at';
      const items = await serviceRequest(settings,table,{query:{select,order:'created_at.desc',limit:'100'}});
      await audit(settings,user.id,`admin_view_${section}`,section);
      return response(event,200,{ok:true,items:items || []});
    }
    if (event.httpMethod !== 'POST') return response(event,405,{ok:false,error:'Use GET or POST.'});
    if (String(event.body || '').length > 8000) return response(event,413,{ok:false,error:'That request is too large.'});
    const payload = JSON.parse(event.body || '{}');
    if (payload.action === 'approve_prayer') {
      if (profile.role !== 'admin' && !profile.can_moderate_prayers) return response(event,403,{ok:false,error:'Your account does not have permission to review prayer requests.'});
      const rows = await serviceRequest(settings,'prayer_requests',{query:{select:'id,private',id:`eq.${payload.id}`,limit:'1'}});
      if (!rows?.length) return response(event,404,{ok:false,error:'This request is no longer available.'});
      if (rows[0].private) return response(event,400,{ok:false,error:'Private prayer requests cannot be shown publicly.'});
      await serviceRequest(settings,'prayer_requests',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{is_approved:true},prefer:'return=minimal'});
      await audit(settings,user.id,'prayer_approved','prayer_request',payload.id);
      return response(event,200,{ok:true,message:'Prayer request approved.'});
    }
    if (payload.action === 'close_inquiry') {
      if (profile.role !== 'admin' && !profile.can_view_inbox) return response(event,403,{ok:false,error:'Your account does not have permission to manage messages.'});
      await serviceRequest(settings,'contact_inquiries',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{status:'done',handled_at:new Date().toISOString()},prefer:'return=minimal'});
      await audit(settings,user.id,'inquiry_handled','contact_inquiry',payload.id);
      return response(event,200,{ok:true,message:'Message marked as handled.'});
    }
    if(payload.action==='close_application'){
      if(profile.role!=='admin'&&!profile.can_view_inbox)return response(event,403,{ok:false,error:'Your account does not have permission to manage applications.'});
      await serviceRequest(settings,'ministry_applications',{method:'PATCH',query:{id:`eq.${payload.id}`},body:{status:'in_progress'},prefer:'return=minimal'});
      await audit(settings,user.id,'ministry_application_reviewed','ministry_application',payload.id);
      return response(event,200,{ok:true,message:'Application marked for follow-up.'});
    }
    return response(event,400,{ok:false,error:'Choose a supported action.'});
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[admin-data] Protected data request failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'We could not complete that request. Please try again.'});
  }
};
