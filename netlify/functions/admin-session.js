import {authenticate, audit, checkOrigin, response, serviceRequest} from './_shared/admin-auth.js';

function claimsFromJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return response(event, 204, {});
  if (event.httpMethod !== 'POST') return response(event, 405, {error: 'Use POST to verify your admin session.'});
  try {
    checkOrigin(event, {required: true});
    const {user, profile, token, settings, mfaRequired} = await authenticate(event, {roles: ['admin', 'editor'], allowMfaPending: true});
    const claims = claimsFromJwt(token);
    const requiresMfa = profile.role === 'admin' && String(process.env.ADMIN_MFA_REQUIRED || 'true').toLowerCase() !== 'false';
    const requiresSecondFactor = requiresMfa && (mfaRequired || claims.aal !== 'aal2');
    await serviceRequest(settings, 'profiles', {
      method: 'PATCH',
      query: {id: `eq.${user.id}`},
      body: {last_login_at: new Date().toISOString()},
      prefer: 'return=minimal'
    });
    await audit(settings, user.id, 'admin_session', 'profile', user.id, {role: profile.role});
    return response(event, 200, {
      ok: true,
      role: profile.role,
      permissions: {
        moderatePrayers: profile.role === 'admin' || Boolean(profile.can_moderate_prayers),
        viewInbox: profile.role === 'admin' || Boolean(profile.can_view_inbox),
        viewPayments: profile.role === 'admin' || Boolean(profile.can_view_payments)
      },
      displayName: profile.display_name || user.email || 'Admin user',
      mfaRequired:requiresSecondFactor
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[admin-session] Session verification failed.', error.message);
    return response(event, status, {ok: false, error: status === 401 || status === 403 ? error.message : 'Could not verify your account. Please try again.'});
  }
};
