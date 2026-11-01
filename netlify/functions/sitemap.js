/**
 * Dynamic sitemap for published static pages.
 * The archive's last modification is taken from the merged CMS sources.
 */
import {fetchContentful} from "../../assets/js/content/contentful-provider.js";
import {fetchSupabase} from "../../assets/js/content/supabase-provider.js";
const STATIC_PATHS = [
  "/",
  "/about.html",
  "/contact.html",
  "/ministries.html",
  "/sermons.html",
  "/live.html",
  "/prayer-wall.html",
  "/give.html",
  "/privacy.html",
  "/accessibility.html"
];

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"
  }[character]));
}

async function latestSermonUpdatedAt() {
  const config = {
    contentful: {
      spaceId: process.env.CONTENTFUL_SPACE_ID,
      environment: process.env.CONTENTFUL_ENV || process.env.CONTENTFUL_ENVIRONMENT || "master",
      deliveryToken: process.env.CONTENTFUL_DELIVERY_TOKEN
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    }
  };
  const results = await Promise.allSettled([
    fetchContentful("sermons", {signal: AbortSignal.timeout(5000), config}),
    fetchSupabase("sermons", {signal: AbortSignal.timeout(5000), config})
  ]);
  const items = results.filter(result => result.status === "fulfilled").flatMap(result => result.value);
  if (!items.length && results.every(result => result.status === "rejected")) {
    throw new AggregateError(results.map(result => result.reason), "No CMS source could provide sermons.");
  }
  const timestamps = items.map(item => Date.parse(item.updatedAt || item.date)).filter(value => !Number.isNaN(value));
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString().slice(0, 10) : null;
}

export const handler = async () => {
  const siteUrl = (process.env.URL || "https://aicegertonchapel.netlify.app").replace(/\/+$/, "");
  const today = new Date().toISOString().slice(0, 10);
  let archiveLastmod = today;
  try {
    archiveLastmod = (await latestSermonUpdatedAt()) || today;
  } catch (error) {
    console.error("Sitemap could not read CMS update time.", error.message);
    try {
      const response = await fetch(`${siteUrl}/content-snapshot.json`, {signal: AbortSignal.timeout(2500)});
      if (!response.ok) throw new Error(`Snapshot returned HTTP ${response.status}.`);
      const snapshot = await response.json();
      const timestamps = (snapshot.sermons || [])
        .map(item => Date.parse(item.updatedAt || item.date))
        .filter(value => !Number.isNaN(value));
      if (timestamps.length) archiveLastmod = new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
    } catch (snapshotError) {
      console.error("Sitemap could not read content snapshot.", snapshotError.message);
    }
  }

  const urls = STATIC_PATHS.map(path => {
    const lastmod = path === "/sermons.html" ? archiveLastmod : today;
    return `<url><loc>${escapeXml(siteUrl + path)}</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join("");
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900"
    },
    body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  };
};
