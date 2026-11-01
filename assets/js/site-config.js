const defaults = {
  siteUrl: "https://aicegertonchapel.netlify.app",
  siteName: "AIC Egerton Chapel",
  contactEmail: "aicegertonchapel@gmail.com",
  whatsappNumber: "254799522418",
  phoneDisplay: "+254 799 522 418",
  locationText: "Egerton University, Njoro, Kenya",
  paybill: "522522",
  accountNumber: "7506439",
  youtubeChannelId: "",
  turnstileSiteKey: "",
  supabase: { url: "", anonKey: "" },
  contentful: { spaceId: "", deliveryToken: "", environment: "Church-Website" },
  content: {
    policy: "merge",
    timeoutMs: 4000,
    retries: 1,
    cacheTtlMinutes: 30,
    snapshotUrl: "/content-snapshot.json"
  },
  mapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3989.7356577284563!2d35.94114277582281!3d-0.3688216353133254!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x182987bf970d254d%3A0x385834a695a103c7!2sA.I.C%20Egerton%20Chapel!5e0!3m2!1sen!2ske!4v1793572628423!5m2!1sen!2ske",
  mapsDirectionsUrl: "https://www.google.com/maps/dir/?api=1&destination=-0.3688216353133254%2C35.94114277582281",
  mpesa: { stkEnabled: false, paybill: "522522", accountNumber: "7506439" }
};

const browserConfig = typeof window !== "undefined" ? window.AIC_SITE_CONFIG : null;
export const siteConfig = Object.freeze(browserConfig || defaults);

function safeStorage(action) {
  try {
    return action(localStorage);
  } catch {
    return null;
  }
}

export const configOverride = {
  get: () => safeStorage(storage => storage.getItem("aic_supabase_override")),
  set(value) {
    if (!siteConfig.isLocalhost) return false;
    if (value === null) {
      safeStorage(storage => storage.removeItem("aic_supabase_override"));
      return true;
    }
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
      safeStorage(storage => storage.setItem("aic_supabase_override", JSON.stringify(parsed)));
      return true;
    } catch {
      return false;
    }
  }
};

export function assertConfigured() {
  const missing = [];
  if (!siteConfig.supabase?.url) missing.push("Supabase URL");
  if (!siteConfig.supabase?.anonKey || /^(YOUR|PLACEHOLDER|xxx)/i.test(siteConfig.supabase.anonKey)) {
    missing.push("Supabase anon key");
  }
  if (!siteConfig.contentful?.spaceId) missing.push("Contentful space ID");
  if (!siteConfig.contentful?.deliveryToken) missing.push("Contentful delivery token");
  return missing;
}
