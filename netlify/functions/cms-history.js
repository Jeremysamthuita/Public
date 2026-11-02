import {authenticate,checkOrigin,response,serviceRequest,tableForType} from './_shared/admin-auth.js';

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(event,200,{});
  if(event.httpMethod!=='GET')return response(event,405,{ok:false,error:'Use GET to review recent changes.'});
  try{
    checkOrigin(event);
    const {user,profile,settings}=await authenticate(event,{roles:['admin','editor']});
    const type=event.queryStringParameters?.type||'';
    const id=event.queryStringParameters?.id||'';
    if(!tableForType(type)||!/^[0-9a-f-]{36}$/i.test(id))return response(event,400,{ok:false,error:'Choose a valid post.'});
    const query={select:'id,version,snapshot,changed_by,created_at',content_type:`eq.${type}`,record_id:`eq.${id}`,order:'version.desc',limit:'20'};
    if(profile.role!=='admin')query.changed_by=`eq.${user.id}`;
    const rows=await serviceRequest(settings,'cms_revisions',{query});
    const items=(rows||[]).map(row=>{
      if(profile.role==='admin')return row;
      const snapshot={...row.snapshot};
      for(const key of ['last_error','contentful_id','source','sync_state','sync_attempts','content_hash','created_by','updated_by'])delete snapshot[key];
      return {...row,snapshot};
    });
    return response(event,200,{ok:true,items});
  }catch(error){
    const status=error.statusCode||500;
    if(status>=500)console.error('[cms-history] Revision history request failed.',error.message);
    return response(event,status,{ok:false,error:status===401||status===403?error.message:'We could not load the change history. Try again.'});
  }
};
