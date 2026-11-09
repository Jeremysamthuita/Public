/**
 * POST /api/mpesa-stkpush
 * Starts a Daraja STK request and records the checkout as pending.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifyTurnstile } from "./_shared/turnstile.js";
import { normalizeKenyanPhone } from "./_shared/mpesa.js";

const PURPOSES = new Set(["Offering", "Tithe", "Thanksgiving", "Missions", "Other"]);
const WINDOW_SECONDS = 600;

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || process.env.URL || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      try { return new URL(value).origin; } catch { return ""; }
    })
    .filter(Boolean);
}

function originOf(event) {
  const origin = event.headers?.origin;
  if (origin) {
    try { return new URL(origin).origin; } catch { return ""; }
  }
  const referer = event.headers?.referer;
  if (referer) {
    try { return new URL(referer).origin; } catch { return ""; }
  }
  return "";
}

function response(statusCode, body, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

async function bumpLimit(supabase, key, maxCount) {
  const windowStart = new Date(
    Math.floor(Date.now() / (WINDOW_SECONDS * 1000)) * WINDOW_SECONDS * 1000
  ).toISOString();
  const { data, error } = await supabase.rpc("bump_rate_limit", {
    p_key: `mpesa:${key}:${WINDOW_SECONDS}`,
    p_window: windowStart
  });
  if (error) throw new Error("Payment rate-limit check failed.");
  return Number(data) <= maxCount;
}

function getTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export const handler = async event => {
  const origin = originOf(event);
  const allowed = allowedOrigins();
  if (!origin || !allowed.includes(origin)) {
    return response(403, { error: "This payment request is not allowed from this site." });
  }
  if (event.httpMethod === "OPTIONS") return response(204, {}, origin);
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed." }, origin);

  if (String(process.env.MPESA_STK_ENABLED).toLowerCase() !== "true") {
    return response(503, { error: "Online M-Pesa is not enabled. Use the Paybill instructions below." }, origin);
  }
  if (!process.env.TURNSTILE_SECRET_KEY || !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DARAJA_CALLBACK_SECRET) {
    return response(503, { error: "The online payment service is not fully configured. Use the Paybill instructions below." }, origin);
  }

  let input;
  try { input = JSON.parse(event.body || "{}"); }
  catch { return response(400, { error: "Invalid request body." }, origin); }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return response(400, { error: "Invalid request body." }, origin);
  }

  const phone = normalizeKenyanPhone(input.phone);
  const amount = Number(input.amount);
  const purpose = String(input.purpose || "");
  if (!phone) return response(400, { error: "Enter a valid Kenyan mobile number." }, origin);
  if (!Number.isInteger(amount) || amount < 1 || amount > 250000) {
    return response(400, { error: "Enter an amount between KES 1 and KES 250,000." }, origin);
  }
  if (!PURPOSES.has(purpose)) return response(400, { error: "Choose a valid giving purpose." }, origin);

  const ip = event.headers?.["x-nf-client-connection-ip"] ||
    (event.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (!ip) return response(400, { error: "Unable to validate this payment request. Please use Paybill instead." }, origin);

  const turnstile = await verifyTurnstile(
    input.turnstileToken || input["cf-turnstile-response"] || "",
    ip
  );
  if (!turnstile.ok) {
    return response(400, { error: "Complete the security check and try again." }, origin);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    const [ipAllowed, phoneAllowed] = await Promise.all([
      bumpLimit(supabase, `ip:${hash(ip)}`, 10),
      bumpLimit(supabase, `phone:${hash(phone)}`, 3)
    ]);
    if (!ipAllowed || !phoneAllowed) {
      return response(429, { error: "Too many payment attempts. Wait a few minutes or use Paybill." }, origin);
    }

    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
    const passkey = process.env.DARAJA_PASSKEY;
    const shortcode = process.env.DARAJA_SHORTCODE;
    const accountReference = String(process.env.DARAJA_ACCOUNT_REFERENCE || "").trim();
    if (!consumerKey || !consumerSecret || !passkey || !shortcode ||
      !accountReference || accountReference.length > 12 ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(process.env.DARAJA_CALLBACK_SECRET)) {
      return response(503, { error: "The online payment service is not fully configured. Use the Paybill instructions below." }, origin);
    }

    const darajaEnvironment = process.env.DARAJA_ENV || "sandbox";
    if (!["sandbox", "production"].includes(darajaEnvironment)) {
      return response(503, { error: "The online payment service is not fully configured. Use the Paybill instructions below." }, origin);
    }
    const base = darajaEnvironment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenResponse = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!tokenResponse.ok) throw new Error("Daraja authentication failed.");
    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) throw new Error("Daraja returned no access token.");

    const timestamp = getTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const callbackUrl = new URL(
      `/.netlify/functions/mpesa-callback/${process.env.DARAJA_CALLBACK_SECRET}`,
      process.env.URL || "https://aicegertonchapel.netlify.app"
    ).toString();
    const stkResponse = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: purpose
      })
    });
    const stkResult = await stkResponse.json().catch(() => ({}));
    if (!stkResponse.ok || stkResult.ResponseCode !== "0" ||
        !stkResult.CheckoutRequestID || !stkResult.MerchantRequestID) {
      console.error("Daraja STK request rejected.", { status: stkResponse.status });
      return response(502, { error: "Safaricom could not start the payment. Use the Paybill instructions below." }, origin);
    }

    const { error: insertError } = await supabase.from("mpesa_payments").insert({
      checkout_request_id: stkResult.CheckoutRequestID,
      merchant_request_id: stkResult.MerchantRequestID,
      phone_number: phone,
      amount,
      purpose,
      status: "pending"
    });
    if (insertError) {
      console.error("Could not save pending M-Pesa checkout.", insertError.message);
      return response(502, {
        error: "An M-Pesa prompt may have been sent but cannot be tracked. Do not retry until you receive an SMS; contact the church if needed."
      }, origin);
    }

    return response(200, { checkoutRequestId: stkResult.CheckoutRequestID }, origin);
  } catch (error) {
    console.error("M-Pesa STK initiation failed.", error.message);
    return response(502, { error: "The payment service is temporarily unavailable. Use the Paybill instructions below." }, origin);
  }
};
