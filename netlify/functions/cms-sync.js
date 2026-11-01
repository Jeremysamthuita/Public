import {timingSafeEqual} from 'node:crypto';
import {runCmsSync, supportedContentTypes} from './_shared/cms-sync-core.js';

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function matchesWebhookSecret(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function adminUser(authorization) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const {SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY} = process.env;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const baseUrl = new URL(SUPABASE_URL).origin;
  const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(5000)
  });
  if (!authResponse.ok) return null;
  const user = await authResponse.json();
  if (!user?.id) return null;
  const params = new URLSearchParams({select: 'role', id: `eq.${user.id}`, limit: '1'});
  const profileResponse = await fetch(`${baseUrl}/rest/v1/profiles?${params}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(5000)
  });
  if (!profileResponse.ok) throw new Error(`Admin profile lookup returned HTTP ${profileResponse.status}.`);
  const profiles = await profileResponse.json();
  return profiles?.[0]?.role === 'admin' ? user : null;
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, {error: 'Method not allowed.'});

  const webhook = matchesWebhookSecret(
    event.headers?.['x-contentful-webhook-secret'] || event.headers?.['X-Contentful-Webhook-Secret'],
    process.env.CONTENTFUL_WEBHOOK_SECRET
  );
  let user = null;
  if (!webhook) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return response(503, {error: 'CMS administrator authentication is not configured.'});
    }
    try {
      user = await adminUser(event.headers?.authorization || event.headers?.Authorization);
    } catch (error) {
      console.error('[cms-sync] Admin authentication failed.', error);
      return response(503, {error: 'Could not verify CMS administrator access.'});
    }
    if (!user) return response(401, {error: 'CMS administrator authentication is required.'});
  }

  let payload = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return response(400, {error: 'Request body must be valid JSON.'});
  }

  let requestedTypes = payload.types;
  if (webhook) {
    const contentType = payload.sys?.contentType?.sys?.id;
    const mapping = {
      sermons: 'sermons',
      upcomingEvent: 'events',
      leadershipProfile: 'leadership',
      galleryImage: 'gallery',
      announcement: 'announcements',
      ministry: 'ministries',
      serviceTime: 'service_times',
      siteSetting: 'settings'
    };
    requestedTypes = contentType && mapping[contentType]
      ? [mapping[contentType]]
      : supportedContentTypes();
  }
  if (!Array.isArray(requestedTypes) || requestedTypes.some(type => !supportedContentTypes().includes(type))) {
    return response(400, {error: 'Request includes an unsupported CMS content type.'});
  }

  try {
    const result = await runCmsSync(requestedTypes, user?.id || null);
    return response(result.failures.length ? 502 : 200, result);
  } catch (error) {
    console.error('[cms-sync] Synchronization failed.', error);
    return response(500, {error: error.message || 'CMS synchronization failed.'});
  }
};
