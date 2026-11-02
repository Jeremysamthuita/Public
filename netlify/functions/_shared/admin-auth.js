import {createHash} from 'node:crypto';

const SAFE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Origin'
};

export function allowedOrigins() {
  return [...new Set([
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    process.env.URL,
    'https://aicegertonchapel.netlify.app',
    'http://localhost:8888',
    'http://127.0.0.1:8888'
  ].filter(Boolean).map(value => value.replace(/\/$/, '')))];
}

export function response(event, statusCode, body) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const headers = {...SAFE_HEADERS};
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, content-type, idempotency-key';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  return {statusCode, headers, body: JSON.stringify(body)};
}

export function checkOrigin(event, {required = false} = {}) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  if ((!origin && required) || (origin && !allowedOrigins().includes(origin))) {
    const error = new Error('This request is not allowed from this website.');
    error.statusCode = 403;
    throw error;
  }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    const error = new Error('Admin services are not configured.');
    error.statusCode = 503;
    throw error;
  }
  return {baseUrl: new URL(url).origin, anonKey, serviceKey};
}

async function getProfile(baseUrl, serviceKey, userId) {
  const query = new URLSearchParams({
    select: 'id,role,is_active,display_name,can_moderate_prayers,can_view_inbox,can_view_payments,last_login_at',
    id: `eq.${userId}`,
    limit: '1'
  });
  const result = await fetch(`${baseUrl}/rest/v1/profiles?${query}`, {
    headers: {apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json'},
    signal: AbortSignal.timeout(7000)
  });
  if (!result.ok) throw new Error(`Profile lookup failed with HTTP ${result.status}.`);
  return (await result.json())[0] || null;
}

function jwtClaims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { return {}; }
}

export async function authenticate(event, {roles = ['admin', 'editor'], permission = null, allowMfaPending = false} = {}) {
  const settings = config();
  const authorization = event?.headers?.authorization || event?.headers?.Authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    const error = new Error('Please sign in again.');
    error.statusCode = 401;
    throw error;
  }

  const userResponse = await fetch(`${settings.baseUrl}/auth/v1/user`, {
    headers: {apikey: settings.anonKey, Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(7000)
  });
  if (!userResponse.ok) {
    const error = new Error('Please sign in again.');
    error.statusCode = 401;
    throw error;
  }
  const user = await userResponse.json();
  const profile = await getProfile(settings.baseUrl, settings.serviceKey, user.id);
  if (!profile?.is_active || !roles.includes(profile.role)) {
    const error = new Error('Your account does not have access to this area.');
    error.statusCode = 403;
    throw error;
  }
  await enforceAdminRateLimit(settings,event,user.id);
  const mfaRequired = profile.role === 'admin' && String(process.env.ADMIN_MFA_REQUIRED || 'true').toLowerCase() !== 'false' && jwtClaims(token).aal !== 'aal2';
  if (mfaRequired && !allowMfaPending) {
    const error = new Error('Complete the authenticator check before continuing.');
    error.statusCode = 403;
    error.code = 'MFA_REQUIRED';
    throw error;
  }
  if (permission && profile.role !== 'admin' && !profile[permission]) {
    const error = new Error('Your account does not have permission for this action.');
    error.statusCode = 403;
    throw error;
  }
  return {user, profile, token, settings, mfaRequired};
}

export async function serviceRequest(settings, table, {method = 'GET', query = {}, body = null, prefer = ''} = {}) {
  const params = new URLSearchParams(query);
  const url = `${settings.baseUrl}/rest/v1/${table}${params.size ? `?${params}` : ''}`;
  const headers = {
    apikey: settings.serviceKey,
    Authorization: `Bearer ${settings.serviceKey}`,
    Accept: 'application/json'
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const result = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(9000)
  });
  if (!result.ok) {
    let detail = `HTTP ${result.status}`;
    try {
      const data = await result.json();
      detail = data.message || data.details || detail;
    } catch {}
    const error = new Error(detail);
    error.statusCode = result.status;
    throw error;
  }
  if (result.status === 204) return null;
  const text = await result.text();
  return text ? JSON.parse(text) : null;
}

export async function audit(settings, actorId, action, targetType = null, targetId = null, metadata = {}) {
  await serviceRequest(settings, 'audit_log', {
    method: 'POST',
    query: {select: 'id'},
    body: {actor_id: actorId, action, target_type: targetType, target_id: targetId, metadata},
    prefer: 'return=minimal'
  });
}

export function tableForType(type) {
  const tables = {
    sermons: 'cms_sermons',
    events: 'cms_events',
    announcements: 'cms_announcements',
    gallery: 'cms_gallery',
    leadership: 'cms_leadership',
    ministries: 'cms_ministries',
    service_times: 'cms_service_times',
    settings: 'cms_settings'
  };
  return tables[type] || null;
}

function requestIp(event) {
  const raw = event?.headers?.['x-nf-client-connection-ip'] || event?.headers?.['X-Nf-Client-Connection-Ip'] || event?.headers?.['x-forwarded-for'] || '';
  return String(raw).split(',')[0].trim().slice(0,100);
}

async function bumpRateLimit(settings, key, windowSeconds) {
  const start = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  const result = await fetch(`${settings.baseUrl}/rest/v1/rpc/bump_rate_limit`, {
    method:'POST',
    headers:{apikey:settings.serviceKey,Authorization:`Bearer ${settings.serviceKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_key:`${key}:${windowSeconds}`,p_window:start}),
    signal:AbortSignal.timeout(5000)
  });
  if (!result.ok) throw new Error(`Rate limit check returned HTTP ${result.status}.`);
  return Number(await result.json()) || 1;
}

export async function enforceAdminRateLimit(settings, event, userId) {
  const ip = requestIp(event);
  const keys = [[`admin:user:${userId}`,120]];
  if (ip) keys.push([`admin:ip:${createHash('sha256').update(ip).digest('hex')}`,300]);
  const counts = await Promise.all(keys.map(([key])=>bumpRateLimit(settings,key,60)));
  if (counts.some((count,index)=>count>keys[index][1])) {
    const error = new Error('Too many requests. Wait a minute and try again.');
    error.statusCode = 429;
    throw error;
  }
}
