export function normalizeKenyanPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0")
    ? `254${digits.slice(1)}`
    : digits.startsWith("254")
      ? digits
      : `254${digits}`;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

export function parseNairobiTransactionDate(value) {
  const digits = String(value ?? "");
  if (!/^\d{14}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  const utc = Date.UTC(year, month - 1, day, hour - 3, minute, second);
  const date = new Date(utc);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString();
}

export function parseDarajaCallback(payload) {
  const callback = payload?.Body?.stkCallback;
  const checkoutRequestId = String(callback?.CheckoutRequestID ?? "");
  const resultCode = Number(callback?.ResultCode);
  if (!checkoutRequestId || !Number.isInteger(resultCode)) return null;

  const items = callback?.CallbackMetadata?.Item;
  const metadata = Array.isArray(items)
    ? Object.fromEntries(items.filter(item => item && item.Name).map(item => [item.Name, item.Value]))
    : {};

  return {
    checkoutRequestId,
    resultCode,
    resultDesc: String(callback.ResultDesc ?? "").slice(0, 500),
    amount: metadata.Amount == null ? null : Number(metadata.Amount),
    phone: metadata.PhoneNumber == null ? null : String(metadata.PhoneNumber),
    receipt: metadata.MpesaReceiptNumber == null ? null : String(metadata.MpesaReceiptNumber),
    transactionDate: parseNairobiTransactionDate(metadata.TransactionDate)
  };
}
