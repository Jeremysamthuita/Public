/**
 * Daraja callback. The callback URL includes a secret path segment.
 * Safaricom receives an acknowledgement even when a callback cannot be applied.
 */
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeKenyanPhone, parseDarajaCallback } from "./_shared/mpesa.js";

function acknowledge() {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" })
  };
}

function callbackSecret(event) {
  const expected = process.env.DARAJA_CALLBACK_SECRET || "";
  const segments = String(event.path || "").split("/").filter(Boolean);
  const received = segments.at(-1) || "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(expected) || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export const handler = async event => {
  if (event.httpMethod !== "POST" || !callbackSecret(event)) return acknowledge();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("M-Pesa callback received without Supabase service configuration.");
    return acknowledge();
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch {
    console.error("M-Pesa callback contained invalid JSON.");
    return acknowledge();
  }

  const callback = parseDarajaCallback(payload);
  if (!callback) {
    console.error("M-Pesa callback did not contain a valid STK callback.");
    return acknowledge();
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    const { data: payment, error: lookupError } = await supabase
      .from("mpesa_payments")
      .select("id, amount, phone_number, status")
      .eq("checkout_request_id", callback.checkoutRequestId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment || payment.status !== "pending") return acknowledge();

    let update;
    if (callback.resultCode === 0) {
      const callbackPhone = normalizeKenyanPhone(callback.phone);
      if (!Number.isFinite(callback.amount) || callback.amount !== Number(payment.amount) ||
          !callbackPhone || callbackPhone !== normalizeKenyanPhone(payment.phone_number) ||
          !callback.receipt || !callback.transactionDate) {
        update = {
          status: "failed",
          result_code: -1,
          result_desc: "Payment callback did not match the pending payment.",
          raw_callback: payload
        };
      } else {
        update = {
          status: "completed",
          mpesa_receipt_number: callback.receipt,
          transaction_date: callback.transactionDate,
          result_code: callback.resultCode,
          result_desc: callback.resultDesc,
          raw_callback: payload
        };
      }
    } else {
      update = {
        status: "failed",
        result_code: callback.resultCode,
        result_desc: callback.resultDesc,
        raw_callback: payload
      };
    }

    const { error: updateError } = await supabase
      .from("mpesa_payments")
      .update(update)
      .eq("id", payment.id)
      .eq("status", "pending");
    if (updateError) throw updateError;
  } catch (error) {
    console.error("M-Pesa callback update failed.", error.message);
  }
  return acknowledge();
};
