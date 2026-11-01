import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeKenyanPhone,
  parseDarajaCallback,
  parseNairobiTransactionDate
} from "../netlify/functions/_shared/mpesa.js";

test("normalizes supported Kenyan mobile number formats", () => {
  assert.equal(normalizeKenyanPhone("0712 345 678"), "254712345678");
  assert.equal(normalizeKenyanPhone("+254 110 123 456"), "254110123456");
  assert.equal(normalizeKenyanPhone("071234567"), null);
});

test("converts Daraja transaction date from Nairobi time to UTC", () => {
  assert.equal(
    parseNairobiTransactionDate("20261030193005"),
    "2026-10-30T16:30:05.000Z"
  );
  assert.equal(parseNairobiTransactionDate("20260230120000"), null);
});

test("parses successful and failed Daraja callbacks without inventing fields", () => {
  const parsed = parseDarajaCallback({
    Body: {
      stkCallback: {
        CheckoutRequestID: "ws_CO_12345678",
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 500 },
            { Name: "MpesaReceiptNumber", Value: "QAB1234567" },
            { Name: "TransactionDate", Value: 20261030193005 },
            { Name: "PhoneNumber", Value: 254712345678 }
          ]
        }
      }
    }
  });
  assert.equal(parsed.amount, 500);
  assert.equal(parsed.receipt, "QAB1234567");
  assert.equal(parsed.phone, "254712345678");
  assert.equal(parsed.resultCode, 0);

  assert.equal(parseDarajaCallback({ Body: { stkCallback: { ResultCode: 1032 } } }), null);
  const failed = parseDarajaCallback({
    Body: { stkCallback: { CheckoutRequestID: "ws_CO_12345678", ResultCode: 1032 } }
  });
  assert.equal(failed.resultCode, 1032);
  assert.equal(failed.receipt, null);
});
