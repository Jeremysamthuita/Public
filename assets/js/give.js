import {
  getGivingAvailability,
  initiateMpesaGiving,
  waitForPaymentStatus
} from "./mpesa-checkout.js";

const config = window.AIC_SITE_CONFIG || {};
const byId = id => document.getElementById(id);

function setStatus(element, state, message) {
  element.dataset.state = state;
  element.textContent = message;
}

function initPaybill() {
  const paybill = config.mpesa?.paybill || config.paybill || "522522";
  const account = config.mpesa?.accountNumber || config.accountNumber || "7506439#Offerings/ Tithes";
  byId("paybillValue").textContent = paybill;
  byId("accountValue").textContent = account;
  byId("copyAccount").addEventListener("click", async event => {
    try {
      await navigator.clipboard.writeText(account);
      setStatus(byId("copyStatus"), "success", "Account number copied.");
    } catch {
      setStatus(byId("copyStatus"), "error", `Copy failed. Enter account number ${account} manually.`);
    }
  });
  byId("whatsappHelp").href =
    `https://wa.me/${encodeURIComponent(config.whatsappNumber || "254799522418")}` +
    `?text=${encodeURIComponent("Hello AIC Egerton Chapel, I need help with giving. I understand the website does not confirm manual payments.")}`;
}

async function initStk() {
  const section = byId("stkSection");
  const unavailable = byId("stkUnavailable");
  const siteKey = config.turnstileSiteKey || "";
  const available = siteKey && await getGivingAvailability();
  section.hidden = !available;
  unavailable.hidden = Boolean(available);
  if (!available) return;

  const form = byId("stkForm");
  const submit = byId("stkSubmit");
  const status = byId("stkStatus");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    status.removeAttribute("data-state");
    status.textContent = "";
    try {
      const { checkoutRequestId } = await initiateMpesaGiving({
        phone: byId("givePhone").value,
        amount: Number(byId("giveAmount").value),
        purpose: byId("givePurpose").value,
        onStatusChange: update => setStatus(status, "info", update.message)
      });
      const result = await waitForPaymentStatus(
        checkoutRequestId,
        update => setStatus(status, "info", update.message)
      );
      if (result.status === "completed") {
        setStatus(
          status,
          "success",
          result.receipt
            ? `Safaricom confirmed payment. Receipt: ${result.receipt}.`
            : "Safaricom confirmed the payment."
        );
        form.reset();
        if (window.turnstile) {
          try { window.turnstile.reset(); } catch { /* widget may not be ready */ }
        }
      } else if (result.status === "failed") {
        setStatus(status, "error", "Safaricom did not complete this payment. You can use the Paybill instructions above.");
      } else {
        setStatus(status, "info", "If you entered your PIN, confirmation will follow by SMS. The website has not confirmed this payment; please do not retry immediately.");
      }
    } catch (error) {
      setStatus(status, "error", `${error.message} Paybill instructions remain available above.`);
      if (window.turnstile) {
        try { window.turnstile.reset(); } catch { /* widget may not be ready */ }
      }
    } finally {
      submit.disabled = false;
    }
  });
}

initPaybill();
initStk().catch(error => {
  console.error("Could not check M-Pesa availability.", error);
  byId("stkUnavailable").hidden = false;
});
