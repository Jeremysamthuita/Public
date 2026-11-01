/**
 * M-Pesa giving client. Payment status is confirmed only by the server callback.
 */
export function formatKenyanPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

export function isValidKenyanPhone(phone) {
  return /^254[17]\d{8}$/.test(formatKenyanPhone(phone));
}

export async function getGivingAvailability() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) return false;
    const result = await response.json();
    return result.checks?.darajaEnabled === true;
  } catch {
    return false;
  }
}

export async function initiateMpesaGiving({ phone, amount, purpose, onStatusChange }) {
  const formattedPhone = formatKenyanPhone(phone);
  if (!isValidKenyanPhone(formattedPhone)) {
    throw new Error("Enter a valid Kenyan mobile number, e.g. 0712 345 678.");
  }
  if (!Number.isInteger(Number(amount)) || Number(amount) < 1 || Number(amount) > 250000) {
    throw new Error("Enter an amount between KES 1 and KES 250,000.");
  }

  const turnstileToken = window.turnstile?.getResponse?.() || "";
  if (!turnstileToken) throw new Error("Complete the security check before continuing.");
  onStatusChange?.({ stage: "initiating", message: "Requesting an M-Pesa prompt…" });

  let response;
  try {
    response = await fetch("/api/mpesa-stkpush", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: Number(amount),
        purpose,
        turnstileToken
      })
    });
  } catch {
    throw new Error("The payment service could not be reached. Use the Paybill instructions below.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Safaricom could not start the payment. Use Paybill instead.");
  }
  if (!result.checkoutRequestId) {
    throw new Error("The payment service returned no checkout ID. Use Paybill instead.");
  }

  onStatusChange?.({
    stage: "pending",
    message: "Prompt sent. Enter your M-Pesa PIN, then wait for confirmation."
  });
  return { checkoutRequestId: result.checkoutRequestId, status: "pending" };
}

export async function waitForPaymentStatus(checkoutRequestId, onStatusChange) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const url = `/api/mpesa-status?id=${encodeURIComponent(checkoutRequestId)}`;
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not check the payment status.");
    if (result.status === "completed") {
      return { status: result.status, receipt: result.receipt || null };
    }
    if (result.status === "failed") return { status: "failed" };
    onStatusChange?.({ stage: "pending", message: "Waiting for Safaricom confirmation…" });
  }
  return { status: "pending_timeout" };
}
