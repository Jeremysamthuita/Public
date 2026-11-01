/**
 * GET /api/premium-download?resource_id=XXX&phone=2547XXXXXXXX
 * Verifies a completed M-Pesa payment exists for this resource and phone,
 * then returns a short-lived signed URL from Supabase Storage.
 * 
 * ESM — export const handler
 */
import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://aicegertonchapel.netlify.app',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const params = event.queryStringParameters || {};
  const resourceId = String(params.resource_id || '').slice(0, 200);
  const phone = String(params.phone || '').replace(/[^0-9]/g, '').slice(0, 15);

  if (!resourceId || !phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'resource_id and phone are required.' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Download service not configured.' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Verify access grant exists and is not expired
  const { data: grant, error: grantErr } = await supabase
    .from('access_grants')
    .select('id, resource_id, expires_at')
    .eq('resource_id', resourceId)
    .eq('user_phone', phone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (grantErr) {
    console.error('Access grant lookup error:', grantErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not verify access.' }) };
  }
  if (!grant) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'No valid access found. Please complete payment first, or use the Paybill: 522522, Account 7506439.' }) };
  }

  // Fetch the resource path from premium_resources table
  const { data: resource, error: resErr } = await supabase
    .from('premium_resources')
    .select('storage_path, title')
    .eq('id', resourceId)
    .maybeSingle();

  if (resErr || !resource?.storage_path) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Resource not found.' }) };
  }

  // Generate signed URL valid for 15 minutes
  const { data: signedData, error: signErr } = await supabase
    .storage
    .from('premium-resources')
    .createSignedUrl(resource.storage_path, 900); // 900 seconds = 15 min

  if (signErr || !signedData?.signedUrl) {
    console.error('Signed URL error:', signErr?.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not generate download link.' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      url: signedData.signedUrl,
      title: resource.title,
      expiresIn: 900
    })
  };
};
