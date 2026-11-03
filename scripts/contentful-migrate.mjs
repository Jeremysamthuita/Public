const space = process.env.CONTENTFUL_SPACE_ID;
const environment = process.env.CONTENTFUL_ENV || process.env.CONTENTFUL_ENVIRONMENT || 'Church-Website';
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const locale = process.env.CONTENTFUL_LOCALE || 'en-US';

if (!space || !token) {
  console.error('Set CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN before running this command.');
  process.exitCode = 1;
} else {
  const shared = [['slug','Symbol'],['publishAt','Date'],['unpublishAt','Date'],['sortOrder','Integer']];
  const definitions = {
    sermons: {name:'Sermon', fields:[...shared,['title','Symbol',true],['preacher','Symbol',true],['ministryTitle','Symbol'],['scriptureReference','Symbol'],['series','Symbol'],['date','Date',true],['description','Text'],['previewImageUrl','Symbol'],['pdfUrl','Symbol'],['audioUrl','Symbol'],['videoUrl','Symbol'],['tags','Array'],['featured','Boolean']]},
    upcomingEvent: {name:'Upcoming event', fields:[...shared,['title','Symbol',true],['date','Date',true],['endDate','Date'],['time','Symbol'],['location','Symbol'],['description','Text'],['flyerUrl','Symbol'],['flyerAlt','Symbol'],['registrationUrl','Symbol'],['category','Symbol'],['active','Boolean']]},
    leadershipProfile: {name:'Leadership profile', fields:[...shared,['group','Symbol',true],['name','Symbol',true],['role','Symbol'],['bio','Text'],['message','Text'],['photoUrl','Symbol'],['active','Boolean']]},
    galleryImage: {name:'Gallery image', fields:[...shared,['imageUrl','Symbol',true],['alt','Symbol'],['caption','Symbol']]},
    announcement: {name:'Announcement', fields:[...shared,['text','Text',true],['linkUrl','Symbol'],['linkLabel','Symbol'],['severity','Symbol'],['startsAt','Date'],['endsAt','Date']]},
    ministry: {name:'Ministry', fields:[...shared,['name','Symbol',true],['category','Symbol'],['description','Text'],['leader','Symbol'],['meetingTime','Symbol'],['contact','Symbol'],['joiningInformation','Text'],['imageUrl','Symbol'],['acceptingApplications','Boolean']]},
    serviceTime: {name:'Service time', fields:[...shared,['label','Symbol',true],['day','Symbol',true],['start','Symbol'],['end','Symbol'],['isLive','Boolean']]},
    siteSetting: {name:'Site setting', fields:[...shared,['settingKey','Symbol',true],['settingValue','Object',true]]}
  };

  async function request(path, {method='GET', body, version} = {}) {
    const headers = {Authorization:`Bearer ${token}`,Accept:'application/vnd.contentful.management.v1+json'};
    if (body) headers['Content-Type'] = 'application/vnd.contentful.management.v1+json';
    if (version) headers['X-Contentful-Version'] = String(version);
    const response = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}${path}`, {method,headers,body:body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(15000)});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${method} ${path} returned HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
    return response.status === 204 ? null : response.json();
  }

  async function configureWebhook() {
    const webhookSecret = process.env.CONTENTFUL_WEBHOOK_SECRET;
    const webhookUrl = process.env.CONTENTFUL_WEBHOOK_URL || (process.env.URL ? `${process.env.URL.replace(/\/$/,'')}/api/cms-sync` : '');
    if (!webhookSecret || !webhookUrl) {
      console.log('Webhook not changed. Set CONTENTFUL_WEBHOOK_URL and CONTENTFUL_WEBHOOK_SECRET to enable immediate Contentful-to-Supabase sync.');
      return;
    }
    const target = new URL(webhookUrl);
    if (target.protocol !== 'https:') throw new Error('CONTENTFUL_WEBHOOK_URL must use HTTPS.');
    const headers = {Authorization:`Bearer ${token}`,Accept:'application/vnd.contentful.management.v1+json','Content-Type':'application/vnd.contentful.management.v1+json'};
    const base = `https://api.contentful.com/spaces/${encodeURIComponent(space)}/webhooks`;
    const listResponse = await fetch(base,{headers,signal:AbortSignal.timeout(15000)});
    if (!listResponse.ok) throw new Error(`GET /webhooks returned HTTP ${listResponse.status}.`);
    const list = await listResponse.json();
    const current = (list.items || []).find(item => item.url === target.toString() || item.name === 'AIC Chapel website CMS sync');
    const body = {
      name:'AIC Chapel website CMS sync', url:target.toString(),
      topics:['Entry.publish','Entry.unpublish','Entry.delete'],
      filters:[{equals:[{doc:'sys.environment.sys.id',value:environment}]}],
      headers:[{key:'x-contentful-webhook-secret',value:webhookSecret}]
    };
    const response = await fetch(current ? `${base}/${encodeURIComponent(current.sys.id)}` : base,{
      method:current ? 'PUT' : 'POST', headers,
      ...(current ? {'X-Contentful-Version':String(current.sys.version)} : {}),
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Contentful webhook setup returned HTTP ${response.status}.`);
    console.log(`Ready: sync webhook (${target.toString()}).`);
  }

  const fieldShape = ([id,type,required=false]) => ({
    id,
    name:id.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`).replace(/^./, letter => letter.toUpperCase()),
    type,localized:false,required,disabled:false,omitted:false,
    ...(type === 'Array' ? {items:{type:'Symbol'}} : {}),
    ...(id === 'group' ? {validations:[{in:['lcc','women','pastoral']}]} : {}),
    ...(id === 'severity' ? {validations:[{in:['info','success','warning','urgent']}]} : {}),
    ...(id === 'settingKey' ? {validations:[{unique:true}]} : {})
  });
  try {
    for (const [id, definition] of Object.entries(definitions)) {
      const existing = await request(`/content_types/${id}`);
      const desired = definition.fields.map(fieldShape);
      const fields = existing ? [...existing.fields] : [];
      for (const field of desired) {
        const index = fields.findIndex(item => item.id === field.id);
        if (index < 0) fields.push(field);
        else fields[index] = {...fields[index], ...field};
      }
      const displayField = ['title','name','label','settingKey','text'].find(id => fields.some(field => field.id === id)) || fields[0].id;
      const description = id === 'siteSetting'
        ? 'Public website settings. Use settingKey live_stream for channelId, fallbackVideoId, fallbackTitle, liveMessage, and offlineMessage. Never store API keys or private prayer details here.'
        : 'Managed by the church website admin dashboard. Use slug, publishAt, unpublishAt, and sortOrder for website display and scheduling.';
      const body = {name:definition.name,description,displayField,fields};
      const saved = existing
        ? await request(`/content_types/${id}`,{method:'PUT',body,version:existing.sys.version})
        : await request('/content_types',{method:'POST',body:{...body,sys:{id}}});
      await request(`/content_types/${id}/published`,{method:'PUT',version:saved.sys.version});
      console.log(`Ready: ${id}`);
    }
    await configureWebhook();
    console.log(`Content models are ready in ${space}/${environment} (${locale}).`);
  } catch (error) {
    console.error(`Contentful setup stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
