/**
 * GET /api/health
 * Reports which integrations are configured. Never returns secrets.
 */
export const handler = async () => {
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const darajaConfigured = Boolean(
        process.env.DARAJA_CONSUMER_KEY &&
        process.env.DARAJA_CONSUMER_SECRET &&
        process.env.DARAJA_PASSKEY &&
        process.env.DARAJA_SHORTCODE &&
        process.env.DARAJA_CALLBACK_SECRET &&
        process.env.TURNSTILE_SECRET_KEY &&
        process.env.SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const checks = {
        supabase: supabaseConfigured,
        supabaseAnon: Boolean(process.env.SUPABASE_ANON_KEY),
        email: Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_API_KEY),
        turnstile: Boolean(process.env.TURNSTILE_SECRET_KEY),
        contentful: Boolean(process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_DELIVERY_TOKEN),
        daraja: darajaConfigured,
        darajaEnabled: darajaConfigured && String(process.env.MPESA_STK_ENABLED || 'false').toLowerCase() === 'true',
        youtube: Boolean(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_CHANNEL_ID),
        gemini: Boolean(process.env.GEMINI_API_KEY)
    };
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ ok: true, checks, at: new Date().toISOString() })
    };
};