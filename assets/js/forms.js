/**
 * Submits contact, prayer and ministry forms to the server-side form function.
 */
const ENDPOINT = "/api/submit-form";

function getStatus(form) {
  const statusId = form.dataset.statusId;
  return (statusId && document.getElementById(statusId)) ||
    form.querySelector("[data-form-status], .aic-form-status, .form-status");
}

function setStatus(element, state, message) {
  if (!element) return;
  element.dataset.state = state;
  element.classList.remove("form-status-warning", "form-status-error", "form-status-success");
  if (state === "info") element.classList.add("form-status-warning");
  if (state === "error") element.classList.add("form-status-error");
  if (state === "success") element.classList.add("form-status-success");
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
  const payload = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") payload[key] = value;
  }
  payload.formType = formType;
  payload.website = payload.website || "";
  payload.turnstileToken = getTurnstileToken(form);

  if (button) button.disabled = true;
  setStatus(status, "info", "Sending…");
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      setStatus(status, "error", result.message || "We could not deliver your message. Please try again.");
      return;
    }
    form.reset();
    resetTurnstile(form);
    setStatus(status, "success", result.message || "Thank you. Your message was received.");
    form.dispatchEvent(new CustomEvent("aic:submitted", { bubbles: true, detail: result }));
  } catch {
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
