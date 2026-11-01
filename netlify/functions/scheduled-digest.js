/**
 * Scheduled: Monday 06:00 UTC — weekly digest email to pastor inbox.
 * Summarises new prayer requests, contact inquiries, and payments from the past week.
 *
 * Schedule in netlify.toml:
 *   [functions."scheduled-digest"]
 *     schedule = "0 6 * * 1"
 */
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './_shared/email.js';

export const handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[digest] Supabase not configured, skipping.');
    return { statusCode: 200, body: 'Skipped' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [prayers, contacts, payments] = await Promise.all([
    supabase.from('prayer_requests').select('id, category, is_urgent, created_at').gte('created_at', since),
    supabase.from('contact_inquiries').select('id, category, created_at').gte('created_at', since),
    supabase.from('mpesa_payments').select('id, amount, purpose, status, created_at').gte('created_at', since).eq('status', 'completed')
  ]);

  const urgentPrayers = (prayers.data || []).filter(p => p.is_urgent).length;
  const totalPayments = (payments.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  const body = `
Weekly Summary — AIC Egerton Chapel
=====================================
Period: last 7 days

Prayer Requests:  ${(prayers.data || []).length} new (${urgentPrayers} urgent)
Contact Inquiries: ${(contacts.data || []).length} new
Completed Giving:  KES ${totalPayments.toLocaleString('en-KE')} from ${(payments.data || []).length} transactions

Log in to the admin dashboard to review details:
https://aicegertonchapel.netlify.app/admin.html

— AIC Egerton Chapel automated system
`.trim();

  const to = process.env.PASTOR_DIGEST_EMAIL || process.env.ADMIN_EMAIL || 'aicegertonchapel@gmail.com';
  await sendEmail({ to, subject: 'Weekly Summary — AIC Egerton Chapel', text: body });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
