import test from "node:test";
import assert from "node:assert/strict";
import {
  validateContact,
  validateMinistry,
  validatePrayer
} from "../netlify/functions/_shared/form-validation.js";

test("contact form accepts valid fields and rejects invalid email", () => {
  const valid = validateContact({
    name: "Alex",
    phone: "+254 799 522 418",
    email: "alex@example.com",
    subject: "Prayer",
    message: "Please pray for my family."
  });
  assert.equal(valid.name, "Alex");
  assert.equal(valid.followUp, "Not specified");
  assert.throws(() => validateContact({
    name: "Alex",
    phone: "0799522418",
    email: "not-an-email",
    subject: "Prayer",
    message: "Please pray."
  }), /valid email/);
});

test("form validators reject oversized input instead of truncating it", () => {
  assert.throws(() => validatePrayer({
    name: "Visitor",
    message: "x".repeat(2001)
  }), /exceed the allowed length/);
  assert.throws(() => validateMinistry({
    name: "x".repeat(121),
    phone: "0712345678",
    ministry: "Youth"
  }), /exceed the allowed length/);
});

test("prayer privacy selection is parsed explicitly", () => {
  assert.equal(validatePrayer({ name: "Anonymous", message: "Please pray.", private: "true" }).isPrivate, true);
  assert.equal(validatePrayer({ name: "Anonymous", message: "Please pray.", private: "false" }).isPrivate, false);
});
