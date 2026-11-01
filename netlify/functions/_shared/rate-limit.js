/**
 * Fixed-window rate limiter backed by the public.rate_limits table
 * via the public.bump_rate_limit RPC (see Phase 2 migration).
 */
export async function checkRateLimit(supabase, key, maxCount, windowSeconds) {
    if (!key) return { ok: true };
    const windowStart = new Date(
        Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds * 1000
    ).toISOString();
    const bucketKey = `${key}:${windowSeconds}`;
    const { data, error } = await supabase.rpc('bump_rate_limit', {
        p_key: bucketKey,
        p_window: windowStart
    });
    if (error) {
        console.error('Rate limit RPC failed:', error.message);
        throw new Error('Rate limiting is temporarily unavailable.');
    }
    const count = Number(data) || 1;
    return { ok: count <= maxCount, count };
}