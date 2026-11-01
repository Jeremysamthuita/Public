/**
 * GET /api/mpesa-status?id=<checkout-request-id>
 * Exposes only payment status and, after success, the receipt number.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function originAllowed(event) {
  const raw = event.headers?.origin || event.headers?.referer || "";
  if (!raw) return false;
  let origin;
  try { origin = new URL(raw).origin; } catch { return false; }
  const allowed = (process.env.ALLOWED_ORIGINS || process.env.URL || "")
    .split(",").map(value => {
      try { return new URL(value.trim()).origin; } catch { return ""; }
    });
  return allowed.includes(origin);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

export const handler = async event => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
  if (!originAllowed(event)) return json(403, { error: "Origin not allowed." });
  const id = String(event.queryStringParameters?.id || "");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) return json(400, { error: "Invalid checkout ID." });

  const ip = event.headers?.["x-nf-client-connection-ip"] ||
    (event.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (!ip || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { error: "Payment status is temporarily unavailable." });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    const hash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
    const windowSeconds = 600;
    const windowStart = new Date(
      Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000
    ).toISOString();
    const { data: count, error: limitError } = await supabase.rpc("bump_rate_limit", {
      p_key: `mpesa-status:${hash}:${windowSeconds}`,
      p_window: windowStart
    });
    if (limitError) throw limitError;
    if (Number(count) > 40) return json(429, { error: "Too many status checks. Please wait a few minutes." });

    const { data, error } = await supabase
      .from("mpesa_payments")
      .select("status, mpesa_receipt_number")
      .eq("checkout_request_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json(404, { error: "Payment request was not found." });

    return json(200, {
      status: data.status,
      ...(data.status === "completed" && data.mpesa_receipt_number
        ? { receipt: data.mpesa_receipt_number }
        : {})
    });
  } catch (error) {
    console.error("Could not retrieve M-Pesa status.", error.message);
    return json(500, { error: "Payment status is temporarily unavailable." });
  }
};
