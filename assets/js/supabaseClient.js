/**
 * AIC Egerton Chapel - Supabase Client Bridge
 * Phase 1: removed FALLBACK_SERMONS. No fake sermon data is exported.
 */

const config = (window.AIC_SITE_CONFIG && window.AIC_SITE_CONFIG.supabase) || {
    url: '',
    anonKey: ''
};

export function isSupabaseConfigured() {
    return Boolean(
        config.url &&
        config.anonKey &&
        !/YOUR_PROJECT_ID|PASTE_YOUR_REAL_ANON_KEY|sample_public_anon_key|YOUR_ANON_KEY/i.test(`${config.url} ${config.anonKey}`)
    );
}

export const supabase = (window.supabase && config.url && config.anonKey)
    ? window.supabase.createClient(config.url, config.anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    })
    : null;

export async function getCurrentAdminUser() {
    if (!supabase || !isSupabaseConfigured()) return null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        return profile?.role === 'admin' ? session.user : null;
    } catch {
        return null;
    }
}