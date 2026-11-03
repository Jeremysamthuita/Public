/**
 * POST /api/submit-form
 * Handles contact, prayer, ministry and newsletter submissions.
 * Pipeline: validation → Turnstile → rate limit → Supabase (service role) → email.
 */
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './_shared/email.js';
import { verifyTurnstile } from './_shared/turnstile.js';
import { checkRateLimit } from './_shared/rate-limit.js';
import {
    str,
    validateContact,
    validateMinistry,
    validateNewsletter,
    validatePrayer
} from './_shared/form-validation.js';

const MAX_BODY = 50000;

function json(status, body) {
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

function allowedOrigins() {
    const env = process.env.ALLOWED_ORIGINS || process.env.URL || '';
    return env.split(',').map(s => s.trim()).filter(Boolean);
}

function originOk(event) {
    const origin = event.headers.origin || event.headers.referer || '';
    if (!origin) return true; // server-to-server
    return allowedOrigins().some(o => origin === o || origin.startsWith(o + '/'));
}

function clientIp(event) {
    return (
        event.headers['x-nf-client-connection-ip'] ||
        (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        ''
    );
}

async function hashIp(ip) {
    if (!ip) return '';
    // Hash with Web Crypto so the raw IP is never stored.
    const data = new TextEncoder().encode(`aic:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24);
}

function emailBody({ type, fields }) {
    const lines = [`Form: ${type}`, ''];
    for (const [k, v] of Object.entries(fields)) {
        if (v === '' || v == null) continue;
        lines.push(`${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${v}`);
    }
    return lines.join('\n');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

async function store(supabase, type, fields) {
    if (type === 'contact') {
        const { error } = await supabase.from('contact_inquiries').insert([{
            full_name: fields.name,
            email: fields.email,
            phone: fields.phone,
            subject: fields.subject,
            message: fields.message,
            category: fields.category,
            follow_up: fields.followUp,
            urgency_level: 'Normal',
            assigned_department: 'Pastoral Care',
            status: 'new'
        }]);
        if (error) throw new Error(`contact_inquiries insert failed: ${error.message}`);
        return;
    }
    if (type === 'prayer') {
        const { error } = await supabase.from('prayer_requests').insert([{
            display_name: fields.name,
            category: fields.category,
            request_text: fields.message,
            is_approved: fields.isPrivate ? true : false,
            private: fields.isPrivate,
            prayed_count: 0
        }]);
        if (error) throw new Error(`prayer_requests insert failed: ${error.message}`);
        return;
    }
    if (type === 'ministry') {
        const { error } = await supabase.from('ministry_applications').insert([{
            name: fields.name,
            phone: fields.phone,
            age: fields.age ? Number(fields.age) : null,
            baptism_year: fields.baptismYear ? Number(fields.baptismYear) : null,
            ministry: fields.ministry,
            status: 'new'
        }]);
        if (error) throw new Error(`ministry_applications insert failed: ${error.message}`);
        return;
    }
    if (type === 'newsletter') {
        const { error } = await supabase.from('subscribers').upsert(
            [{ email: fields.email, source: 'site', confirmed: false }],
            { onConflict: 'email', ignoreDuplicates: true }
        );
        if (error) throw new Error(`subscribers upsert failed: ${error.message}`);
    }
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed.' });
    if ((event.body || '').length > MAX_BODY) return json(413, { ok: false, message: 'Payload too large.' });
    if (!originOk(event)) return json(403, { ok: false, message: 'Origin not allowed.' });

    let payload;
    try { payload = JSON.parse(event.body || '{}'); }
    catch { return json(400, { ok: false, message: 'Invalid JSON body.' }); }

    const formType = str(payload.formType, 20).toLowerCase();

    // Honeypot: silently accept and drop.
    if (str(payload.website, 200)) {
        return json(200, { ok: true, message: 'Thank you. Your message was received.' });
    }

    const turnstile = await verifyTurnstile(
        payload.cfTurnstileResponse || payload.turnstileToken || payload['cf-turnstile-response'] || '',
        clientIp(event)
    );
    if (!turnstile.ok) {
        if (turnstile.error === 'not_configured') {
            return json(503, {
                ok: false,
                message: 'Online forms are not configured yet. Please WhatsApp +254 799 522 418 or email aicegertonchapel@gmail.com.',
                code: 'turnstile_unconfigured'
            });
        }
        return json(400, {
            ok: false,
            message: 'Please complete the verification and try again.',
            code: 'turnstile_failed'
        });
    }

    const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const hasEmail = Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_API_KEY);

    if (!hasSupabase || !hasEmail) {
        return json(503, {
            ok: false,
            message: 'Online forms are not fully configured yet. Please WhatsApp +254 799 522 418 or email aicegertonchapel@gmail.com.',
            code: 'unconfigured'
        });
    }

    const supabase = hasSupabase
        ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        })
        : null;

    const ipHash = await hashIp(clientIp(event));

    try {
        let fields, subject, replyTo, confirmation;
        if (formType === 'contact') {
            fields = validateContact(payload);
            subject = `Website contact (${fields.category}): ${fields.subject}`;
            replyTo = fields.email;
            confirmation = 'Thank you. Your message has been sent to the church team.';
            const rl = await checkRateLimit(supabase, `contact:${ipHash}`, 5, 600);
            if (!rl.ok) return json(429, { ok: false, message: 'Please wait a moment before sending another message.', code: 'rate_limited' });
        } else if (formType === 'prayer') {
            fields = validatePrayer(payload);
            subject = fields.isPrivate ? 'Private prayer request' : 'Prayer request (pending approval)';
            replyTo = null;
            confirmation = fields.isPrivate
                ? 'Thank you. Your private prayer request was received by the pastoral team.'
                : 'Thank you — your prayer request was received and will be reviewed before appearing on the wall.';
            const rl = await checkRateLimit(supabase, `prayer:${ipHash}`, 3, 600);
            if (!rl.ok) return json(429, { ok: false, message: 'Please wait a moment before submitting another request.', code: 'rate_limited' });
        } else if (formType === 'ministry') {
            fields = validateMinistry(payload);
            subject = `Ministry application: ${fields.ministry}`;
            replyTo = null;
            confirmation = 'Thank you. Your ministry application has been sent to the church team.';
            const rl = await checkRateLimit(supabase, `ministry:${ipHash}`, 3, 600);
            if (!rl.ok) return json(429, { ok: false, message: 'Please wait a moment before submitting another application.', code: 'rate_limited' });
        } else if (formType === 'newsletter') {
            fields = validateNewsletter(payload);
            subject = 'Newsletter subscription';
            replyTo = fields.email;
            confirmation = 'Thank you. Please check your email to confirm your subscription.';
            const rl = await checkRateLimit(supabase, `newsletter:${ipHash}`, 5, 600);
            if (!rl.ok) return json(429, { ok: false, message: 'Please wait a moment before subscribing again.', code: 'rate_limited' });
        } else {
            return json(400, { ok: false, message: 'Unknown form type.', code: 'validation' });
        }

        let stored = false;
        let emailed = false;
        let storeError = null;
        let emailError = null;

        if (supabase) {
            try { await store(supabase, formType, fields); stored = true; }
            catch (err) { storeError = err.message; }
        }

        if (hasEmail) {
            try {
                const church = process.env.CHURCH_EMAIL || 'aicegertonchapel@gmail.com';
                await sendEmail({
                    to: church,
                    subject,
                    text: emailBody({ type: formType, fields }),
                    html: `<pre>${escapeHtml(emailBody({ type: formType, fields }))}</pre>`,
                    replyTo
                });
                emailed = true;
            } catch (err) { emailError = err.message; }
        }

        if (!stored && !emailed) {
            console.error('submit-form failed', { storeError, emailError });
            return json(500, {
                ok: false,
                message: 'We could not deliver your message. Please try again, or contact us on WhatsApp +254 799 522 418.',
                code: 'delivery_failed'
            });
        }

        if (!stored && emailed) {
            console.error('submit-form: email sent but database write failed', storeError);
            return json(502, {
                ok: false,
                message: 'Your message reached the church email but could not be saved to the inbox. Please contact us if you do not hear back.',
                code: 'partial_delivery'
            });
        }
        if (stored && !emailed) {
            console.error('submit-form: database write succeeded but email delivery failed', emailError);
            return json(502, {
                ok: false,
                message: 'Your message was saved, but the church email notification failed. Please contact us if it is urgent.',
                code: 'partial_delivery'
            });
        }

        return json(200, { ok: true, message: confirmation });
    } catch (err) {
        if (err.message === 'Rate limiting is temporarily unavailable.') {
            return json(503, {
                ok: false,
                message: 'The form service is temporarily unavailable. Please contact the church directly.',
                code: 'rate_limit_unavailable'
            });
        }
        return json(400, { ok: false, message: err.message || 'Invalid request.', code: 'validation' });
    }
};
