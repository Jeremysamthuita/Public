const space = process.env.CONTENTFUL_SPACE_ID;
const environment = process.env.CONTENTFUL_ENV || process.env.CONTENTFUL_ENVIRONMENT || 'master';
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const locale = process.env.CONTENTFUL_LOCALE || 'en-US';

if (!space || !token) {
  console.error('Set CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN before running this command.');
  process.exitCode = 1;
} else {
  const definitions = {
    sermons: {name:'Sermon', fields:[['title','Symbol',true],['preacher','Symbol',true],['ministryTitle','Symbol'],['scriptureReference','Symbol'],['series','Symbol'],['date','Date',true],['description','Text'],['previewImageUrl','Symbol'],['pdfUrl','Symbol'],['audioUrl','Symbol'],['videoUrl','Symbol'],['tags','Array'],['featured','Boolean']]},
    upcomingEvent: {name:'Upcoming event', fields:[['title','Symbol',true],['date','Date',true],['endDate','Date'],['time','Symbol'],['location','Symbol'],['description','Text'],['flyerUrl','Symbol'],['flyerAlt','Symbol'],['registrationUrl','Symbol'],['category','Symbol'],['active','Boolean']]},
    leadershipProfile: {name:'Leadership profile', fields:[['group','Symbol',true],['name','Symbol',true],['role','Symbol'],['bio','Text'],['message','Text'],['photoUrl','Symbol'],['active','Boolean']]},
    galleryImage: {name:'Gallery image', fields:[['imageUrl','Symbol',true],['alt','Symbol'],['caption','Symbol']]},
    announcement: {name:'Announcement', fields:[['text','Text',true],['linkUrl','Symbol'],['linkLabel','Symbol'],['severity','Symbol'],['startsAt','Date'],['endsAt','Date']]},
    ministry: {name:'Ministry', fields:[['name','Symbol',true],['description','Text'],['leader','Symbol'],['meetingTime','Symbol'],['contact','Symbol'],['imageUrl','Symbol'],['acceptingApplications','Boolean']]},
    serviceTime: {name:'Service time', fields:[['label','Symbol',true],['day','Symbol',true],['start','Symbol'],['end','Symbol'],['isLive','Boolean']]},
    siteSetting: {name:'Site setting', fields:[['settingKey','Symbol',true],['settingValue','Object',true]]}
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

  const fieldShape = ([id,type,required=false]) => ({id,name:id.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`).replace(/^./, letter => letter.toUpperCase()),type,localized:false,required,disabled:false,omitted:false,...(type === 'Array' ? {items:{type:'Symbol'}} : {})});
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
      const body = {name:definition.name,description:'Managed by the church website admin dashboard.',displayField:fields.some(field => field.id === 'title') ? 'title' : (fields.some(field => field.id === 'name') ? 'name' : fields[0].id),fields};
      const saved = existing
        ? await request(`/content_types/${id}`,{method:'PUT',body,version:existing.sys.version})
        : await request('/content_types',{method:'POST',body:{...body,sys:{id}}});
      await request(`/content_types/${id}/published`,{method:'PUT',version:saved.sys.version});
      console.log(`Ready: ${id}`);
    }
    console.log(`Content models are ready in ${space}/${environment} (${locale}).`);
  } catch (error) {
    console.error(`Contentful setup stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
