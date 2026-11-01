const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  subject: 180,
  message: 2000,
  ministry: 120,
  age: 3,
  baptismYear: 4,
  category: 80,
  followUp: 10
};

export function str(value, max = 1000) {
  const result = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (result.length > max) throw new Error("One or more fields exceed the allowed length.");
  return result;
}

function multi(value, max = 2000) {
  const result = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (result.length > max) throw new Error("One or more fields exceed the allowed length.");
  return result;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value) {
  return /^[+0-9()\s.-]{7,40}$/.test(value);
}

export function validateContact(payload) {
  const name = str(payload.from_name || payload.name, LIMITS.name);
  const phone = str(payload.phone, LIMITS.phone);
  const email = str(payload.from_email || payload.email, LIMITS.email);
  const subject = str(payload.subject, LIMITS.subject);
  const message = multi(payload.message, LIMITS.message);
  const category = str(payload.category, LIMITS.category) || "General Inquiry";
  const followUp = str(payload.follow_up || payload.followUp, LIMITS.followUp) || "Not specified";

  if (!name) throw new Error("Please enter your name.");
  if (!phone || !isPhone(phone)) throw new Error("Please enter a valid phone number.");
  if (!email || !isEmail(email)) throw new Error("Please enter a valid email address.");
  if (!subject) throw new Error("Please enter a subject.");
  if (!message) throw new Error("Please enter a message.");
  if (!["Yes", "No", "Not specified"].includes(followUp)) {
    throw new Error("Please choose whether you would like a follow-up.");
  }
  return { name, phone, email, subject, message, category, followUp };
}

export function validatePrayer(payload) {
  const name = str(payload.name, LIMITS.name);
  const category = str(payload.category, LIMITS.category) || "Other";
  const message = multi(payload.message, LIMITS.message);
  const isPrivate = String(payload.private || "").toLowerCase() === "true";
  if (!name) throw new Error('Please enter your name, or "Anonymous".');
  if (!message) throw new Error("Please enter your prayer request.");
  return { name, category, message, isPrivate };
}

export function validateMinistry(payload) {
  const name = str(payload.name, LIMITS.name);
  const phone = str(payload.phone, LIMITS.phone);
  const age = str(payload.age, LIMITS.age) || "";
  const baptismYear = str(payload.baptismYear, LIMITS.baptismYear) || "";
  const ministry = str(payload.ministry, LIMITS.ministry);
  if (!name) throw new Error("Please enter your name.");
  if (!phone || !isPhone(phone)) throw new Error("Please enter a valid phone number.");
  if (!ministry) throw new Error("Please choose a ministry.");
  if (age && !/^\d{2,3}$/.test(age)) throw new Error("Please enter a valid age.");
  if (baptismYear && !/^\d{4}$/.test(baptismYear)) throw new Error("Please enter a valid baptism year.");
  return { name, phone, age, baptismYear, ministry };
}

export function validateNewsletter(payload) {
  const email = str(payload.email || payload.from_email, LIMITS.email);
  if (!email || !isEmail(email)) throw new Error("Please enter a valid email address.");
  return { email };
}
