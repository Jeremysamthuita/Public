/**
 * Submits contact, prayer and ministry forms to Web3Forms and server-side handlers.
 */
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const BACKEND_ENDPOINT = "/api/submit-form";
const DEFAULT_ACCESS_KEY = "1881d2e0-7c1e-4f59-8fcb-cf8f69825625";

function getStatus(form) {
  const statusId = form.dataset.statusId;
  return (statusId && document.getElementById(statusId)) ||
    form.querySelector("[data-form-status], .aic-form-status, .form-status, .contact-form-status");
}

function setStatus(element, state, message) {
  if (!element) return;
  element.dataset.state = state;
  element.classList.remove("form-status-warning", "form-status-error", "form-status-success", "err", "ok");
  if (state === "info") element.classList.add("form-status-warning");
  if (state === "error") element.classList.add("form-status-error", "err");
  if (state === "success") element.classList.add("form-status-success", "ok");
  element.textContent = message || "";
}

function getFormType(form) {
  return form.dataset.formType || form.elements.namedItem("formType")?.value || "";
}

function getTurnstileToken(form) {
  const widget = form.querySelector(".cf-turnstile");
  if (widget?.dataset.widgetId && window.turnstile) {
    return window.turnstile.getResponse(widget.dataset.widgetId);
  }
  return form.querySelector('input[name="cf-turnstile-response"]')?.value ||
    window.turnstile?.getResponse?.() ||
    "";
}

function resetTurnstile(form) {
  if (!window.turnstile) return;
  const widget = form.querySelector(".cf-turnstile");
  if (widget?.dataset.widgetId) {
    try { window.turnstile.reset(widget.dataset.widgetId); } catch { /* widget may not be ready */ }
  }
}

async function submitForm(form) {
  const button = form.querySelector('[type="submit"]');
  const status = getStatus(form);
  const formType = getFormType(form);

  // Honeypot check: silent discard for bots
  const honeypot = form.elements.namedItem("website")?.value;
  if (honeypot) {
    form.reset();
    setStatus(status, "success", "Thank you. Your message was received.");
    return;
  }

  const formData = new FormData(form);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") payload[key] = value;
  }

  // Ensure Web3Forms access key is always present
  if (!payload.access_key) {
    payload.access_key = DEFAULT_ACCESS_KEY;
  }

  // Normalize sender name and email
  if (payload.from_name && !payload.name) payload.name = payload.from_name;
  if (payload.from_email && !payload.email) payload.email = payload.from_email;

  // Set descriptive subject if not already provided
  if (!payload.subject) {
    const titles = {
      prayer: "New Prayer Request — AIC Egerton Chapel",
      contact: "New Contact Form Inquiry — AIC Egerton Chapel",
      ministry: "New Ministry Application — AIC Egerton Chapel"
    };
    payload.subject = titles[formType] || "New Website Submission — AIC Egerton Chapel";
  }

  payload.turnstileToken = getTurnstileToken(form);

  if (button) button.disabled = true;
  setStatus(status, "info", "Sending your message…");

  try {
    const response = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && (result.success || result.ok)) {
      form.reset();
      resetTurnstile(form);
      setStatus(status, "success", result.message || "Thank you! Your message has been sent successfully.");
      form.dispatchEvent(new CustomEvent("aic:submitted", { bubbles: true, detail: result }));

      // Best effort background sync to Supabase/serverless backend
      fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
      return;
    }

    setStatus(status, "error", result.message || "We could not deliver your message. Please try again.");
  } catch (err) {
    console.warn("[forms] Web3Forms request failed, falling back to local handler:", err);
    try {
      const fbResponse = await fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const fbResult = await fbResponse.json().catch(() => ({}));
      if (fbResponse.ok && fbResult.ok) {
        form.reset();
        resetTurnstile(form);
        setStatus(status, "success", fbResult.message || "Thank you. Your message was received.");
        return;
      }
    } catch {}

    setStatus(status, "error", "Network error. Please try again or contact the church on WhatsApp (+254 799 522 418).");
  } finally {
    if (button) button.disabled = false;
  }
}

document.querySelectorAll("form.google-mail-form").forEach(form => {
  form.addEventListener("submit", event => {
    event.preventDefault();
    submitForm(form);
  });
  form.addEventListener("reset", () => {
    setStatus(getStatus(form), "", "");
    resetTurnstile(form);
  });
});

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy || "");
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
});
