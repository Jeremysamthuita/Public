/**
 * Verify a Cloudflare Turnstile token.
 * Verification is skipped only in local Netlify development. Production fails closed.
 */
export async function verifyTurnstile(token, remoteIp) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        if (process.env.NETLIFY_DEV === 'true' || process.env.CONTEXT === 'dev') {
            return { ok: true, skipped: true };
        }
        return { ok: false, error: 'not_configured' };
    }
    if (!token) {
        return { ok: false, error: 'missing_token' };
    }
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body
        });
        const data = await res.json();
        return { ok: data.success === true, raw: data };
    } catch (err) {
        return { ok: false, error: 'network', detail: err.message };
    }
}