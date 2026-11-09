const defaults = {
  siteUrl: "https://aicegertonchapel.netlify.app",
  siteName: "AIC Egerton Chapel",
  contactEmail: "aicegertonchapel@gmail.com",
  whatsappNumber: "254799522418",
  phoneDisplay: "+254 799 522 418",
  locationText: "Egerton University, Njoro, Kenya",
  paybill: "522522",
  accountNumber: "7506439#Offerings/ Tithes",
  youtubeChannelId: "UCUcpLiA7EYxKzcesFtlripg",
  turnstileSiteKey: "0x4AAAAAAFxF26mEmeMGQh_I",
  supabase: { url: "https://tdtvktdqtkfdvucqlzlg.supabase.co", anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdHZrdGRxdGtmZHZ1Y3FsemxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ2MzEsImV4cCI6MjEwODc0MDYzMX0.hHlKzVlaAxXU5HHaYUheNAEnPvpN_X7UmOGOypoTams" },
  contentful: { spaceId: "em08252vzuh6", deliveryToken: "ooQsmSp49pSYFtEwn52S4U_sdjD6Tojr7KCTnWHPO8I", environment: "Church-Website" },
  content: {
    policy: "merge",
    timeoutMs: 4000,
    retries: 1,
    cacheTtlMinutes: 0,
    snapshotUrl: "/content-snapshot.json"
  },
  mapsDirectionsUrl: "https://www.google.com/maps/dir/?api=1&destination=-0.3688216353133254%2C35.94114277582281",
  mpesa: { stkEnabled: false, paybill: "522522", accountNumber: "7506439#Offerings/ Tithes" }
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
