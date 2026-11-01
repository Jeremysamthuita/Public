/**
 * Scheduled function: runs daily at 01:00 UTC.
 * Sets active=false on expired Contentful events in Supabase cache table (if used).
 * Since events are in Contentful, this function purges any locally-cached
 * event records that have passed their end date.
 * 
 * Schedule defined in netlify.toml:
 *   [functions."scheduled-events-cleanup"]
 *     schedule = "0 1 * * *"
 */
import { createClient } from '@supabase/supabase-js';

export const handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[events-cleanup] Supabase not configured, skipping.');
    return { statusCode: 200, body: 'Skipped (not configured)' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // If a local event_cache table exists, expire past events
  const { error, count } = await supabase
    .from('event_cache')
    .update({ active: false })
    .lt('event_date', now.split('T')[0])
    .eq('active', true);

  if (error && !error.message.includes('does not exist')) {
    console.error('[events-cleanup] Error:', error.message);
  } else {
    console.log(`[events-cleanup] Deactivated ${count || 0} expired events.`);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, processed: count || 0 }) };
};
