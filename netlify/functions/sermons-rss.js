/**
 * Cached podcast-valid RSS feed generated from the merged CMS sources.
 * The host header is never used to construct public URLs.
 */
import {fetchContentful} from "../../assets/js/content/contentful-provider.js";
import {mergeContent} from "../../assets/js/content/content-service.js";
import {fetchSupabase} from "../../assets/js/content/supabase-provider.js";

const CACHE_SECONDS = 900;

export function escapeXml(value = "") {
  return String(value).replace(/[<>&'"]/g, character => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"
  }[character]));
}

function assetLinks(field) {
  if (!field) return [];
  return (Array.isArray(field) ? field : [field])
    .map(item => item?.sys?.id)
    .filter(Boolean);
}

export function dateToRfc822(value) {
  const date = String(value || "");
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toUTCString() : parsed.toUTCString();
}

async function loadEntries() {
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
  const records = results
    .filter(result => result.status === "fulfilled")
    .flatMap(result => result.value.map(item => ({...item, type: "sermons"})));
  if (!records.length) {
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
    throw new AggregateError(errors, "No CMS source could provide sermons.");
  }
  return mergeContent(records);
}

export function feedItem(item, assets, siteUrl) {
  const fields = item.fields || {};
  const normalized = Boolean(item.source);
  const assetIds = [...assetLinks(fields.audio), ...assetLinks(fields.audioFile)];
  const audio = assetIds.map(id => assets.get(id)).find(asset =>
    (asset?.fields?.file?.contentType || "").startsWith("audio/"));
  const file = audio?.fields?.file || {};
  const audioUrl = normalized ? item.audioUrl || "" : file.url
    ? (file.url.startsWith("//") ? `https:${file.url}` : file.url)
    : "";
  const enclosure = audioUrl
    ? `<enclosure url="${escapeXml(audioUrl)}" length="${Number(file.details?.size) || 0}" type="${escapeXml(file.contentType || "audio/mpeg")}"/>`
    : "";
  const date = normalized ? item.date || item.updatedAt : fields.date || item.sys?.createdAt;
  const id = normalized ? item.externalKey || item.id : item.sys?.id || fields.slug || fields.title || "sermon";
  const title = normalized ? item.title : fields.title || "Sermon";
  const description = normalized ? item.description || item.scriptureReference || "" :
    fields.description || fields.scriptureReference || "";
  const preacher = normalized ? item.preacher || "AIC Egerton Chapel" :
    fields.preacher || "AIC Egerton Chapel";

  return `<item>
    <title>${escapeXml(title)}</title>
    <description>${escapeXml(description)}</description>
    <link>${escapeXml(`${siteUrl}/sermons.html`)}</link>
    <guid isPermaLink="false">${escapeXml(id)}</guid>
    <pubDate>${escapeXml(dateToRfc822(date))}</pubDate>
    <author>${escapeXml(preacher)}</author>
    <itunes:author>${escapeXml(preacher)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    ${enclosure}
  </item>`;
}

export function emptyFeed(siteUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>AIC Egerton Chapel — Sermons</title><link>${escapeXml(siteUrl + "/sermons.html")}</link>
<description>Teaching from AIC Egerton Chapel, Njoro, Kenya.</description><language>en-KE</language>
<itunes:author>AIC Egerton Chapel</itunes:author>
<itunes:owner><itunes:name>AIC Egerton Chapel</itunes:name><itunes:email>aicegertonchapel@gmail.com</itunes:email></itunes:owner>
<itunes:category text="Religion &amp; Spirituality"/><itunes:explicit>false</itunes:explicit>
<itunes:image href="${escapeXml(siteUrl + "/assets/img/podcast-cover-1400.png")}"/>
</channel></rss>`;
}

export const handler = async () => {
  const siteUrl = (process.env.URL || "https://aicegertonchapel.netlify.app").replace(/\/+$/, "");
  let xml = emptyFeed(siteUrl);
  try {
    const sermons = await loadEntries();
    const items = [...sermons]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(item => feedItem(item, new Map(), siteUrl)).join("");
    xml = emptyFeed(siteUrl).replace("</channel>", `${items}</channel>`);
  } catch (error) {
    console.error("Could not build sermons RSS feed from the CMS sources.", error.message);
    try {
      const response = await fetch(`${siteUrl}/content-snapshot.json`, {signal: AbortSignal.timeout(2500)});
      if (!response.ok) throw new Error(`Snapshot returned HTTP ${response.status}.`);
      const snapshot = await response.json();
      const items = (snapshot.sermons || [])
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map(item => feedItem(item, new Map(), siteUrl)).join("");
      xml = emptyFeed(siteUrl).replace("</channel>", `${items}</channel>`);
    } catch (snapshotError) {
      console.error("Could not build sermons RSS feed from the content snapshot.", snapshotError.message);
    }
  }
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`
    },
    body: xml
  };
};
