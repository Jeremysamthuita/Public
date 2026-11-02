import {timingSafeEqual} from 'node:crypto';
import {runCmsSync, supportedContentTypes} from './_shared/cms-sync-core.js';
import {authenticate, checkOrigin} from './_shared/admin-auth.js';

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

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, {error: 'Method not allowed.'});

  const webhook = matchesWebhookSecret(
    event.headers?.['x-contentful-webhook-secret'] || event.headers?.['X-Contentful-Webhook-Secret'],
    process.env.CONTENTFUL_WEBHOOK_SECRET
  );
  let user = null;
  if (!webhook) {
    try {
      checkOrigin(event,{required:true});
      ({user} = await authenticate(event,{roles:['admin']}));
    } catch (error) {
      console.error('[cms-sync] Admin authentication failed.', error);
      return response(error.statusCode || 503, {error: error.statusCode === 401 || error.statusCode === 403 ? error.message : 'Could not verify CMS administrator access.'});
    }
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
