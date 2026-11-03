/* Public browser configuration. Keep secrets in Netlify environment variables. */
(function () {
  const defaults = {
    siteUrl: "https://aicegertonchapel.netlify.app",
    siteName: "AIC Egerton Chapel",
    contactEmail: "aicegertonchapel@gmail.com",
    whatsappNumber: "254799522418",
    phoneDisplay: "+254 799 522 418",
    locationText: "Egerton University, Njoro, Kenya",
    paybill: "522522",
    accountNumber: "7506439",
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
    mpesa: { stkEnabled: false, paybill: "522522", accountNumber: "7506439" }
  };

  const isLocalhost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname);
  let local = {};
  if (isLocalhost) {
    try {
      const saved = localStorage.getItem("aic_supabase_override");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) local = parsed;
      }
    } catch (error) {
      console.warn("[site-config] Local override could not be read.", error);
    }

    try {
      const url = localStorage.getItem("AIC_SUPABASE_URL");
      const anonKey = localStorage.getItem("AIC_SUPABASE_ANON_KEY");
      if (url || anonKey) local.supabase = { ...(local.supabase || {}), url: url || "", anonKey: anonKey || "" };
    } catch (error) {
      console.warn("[site-config] Legacy local override could not be read.", error);
    }
  }

  const config = {
    ...defaults,
    ...local,
    supabase: { ...defaults.supabase, ...(local.supabase || {}) },
    contentful: { ...defaults.contentful, ...(local.contentful || {}) },
    content: { ...defaults.content, ...(local.content || {}) },
    mpesa: { ...defaults.mpesa, ...(local.mpesa || {}) },
    isLocalhost
  };

  window.AIC_SITE_CONFIG = Object.freeze(config);
})();
