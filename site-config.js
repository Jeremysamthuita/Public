/* Public browser configuration. Keep secrets in Netlify environment variables. */
(function () {
  const defaults = {
    siteUrl: "https://aicegertonchapel.netlify.app",
    siteName: "AIC Egerton Chapel",
    contactEmail: "aicegertonchapel@gmail.com",
    whatsappNumber: "254799522418",
    phoneDisplay: "+254 799 522 418",
    locationText: "Egerton University, Njoro, Kenya",
    mapsCenter: "-0.3688216353133254,35.94114277582281",
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
    mapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3989.7356577284563!2d35.94114277582281!3d-0.3688216353133254!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x182987bf970d254d%3A0x385834a695a103c7!2sA.I.C%20Egerton%20Chapel!5e0!3m2!1sen!2ske!4v1793572628423!5m2!1sen!2ske",
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
