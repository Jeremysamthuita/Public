/**
 * Shared email sender. Uses Resend or Brevo. Throws on failure.
 */
export async function sendEmail({ to, subject, text, html, replyTo }) {
    const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
    const from = process.env.EMAIL_FROM || process.env.CHURCH_EMAIL;
    if (!from) throw new Error('EMAIL_FROM or CHURCH_EMAIL must be set.');
    if (!to) throw new Error('A recipient is required.');

    if (provider === 'resend') {
        const apiKey = process.env.EMAIL_API_KEY;
        if (!apiKey) throw new Error('EMAIL_API_KEY is required for Resend.');
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                from,
                to: [to],
                subject,
                text,
                html,
                reply_to: replyTo || undefined
            })
        });
        if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${await res.text()}`);
        return;
    }

    if (provider === 'brevo') {
        const apiKey = process.env.EMAIL_API_KEY;
        if (!apiKey) throw new Error('EMAIL_API_KEY is required for Brevo.');
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                sender: { email: from, name: 'AIC Egerton Chapel' },
                to: [{ email: to }],
                subject,
                textContent: text,
                htmlContent: html,
                replyTo: replyTo ? { email: replyTo } : undefined
            })
        });
        if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${await res.text()}`);
        return;
    }

    throw new Error(`EMAIL_PROVIDER must be "resend" or "brevo". Got "${provider}".`);
}