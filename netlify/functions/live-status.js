/**
 * Public channel recordings plus optional YouTube API live-broadcast status.
 */
const DEFAULT_CHANNEL_ID = "UCUcpLiA7EYxKzcesFtlripg";

async function findVideos({ channelId, apiKey, eventType, maxResults = 1 }) {
  const query = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: String(maxResults),
    key: apiKey
  });
  if (eventType) query.set("eventType", eventType);
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${query}`, {
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.items || []).map(result => ({
    videoId: result.id?.videoId || "",
    title: result.snippet?.title || "",
    publishedAt: result.snippet?.publishedAt || "",
    thumbnail: result.snippet?.thumbnails?.medium?.url || result.snippet?.thumbnails?.default?.url || ""
  })).filter(video => video.videoId);
}

async function findUploadsPage(channelId, apiKey, pageToken = "") {
  const query = new URLSearchParams({
    part: "snippet",
    playlistId: `UU${channelId.slice(2)}`,
    maxResults: "50",
    key: apiKey
  });
  if (pageToken) query.set("pageToken", pageToken);
  const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${query}`, {
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`YouTube uploads playlist returned HTTP ${response.status}`);
  const data = await response.json();
  return {
    videos: (data.items || []).map(result => ({
      videoId: result.snippet?.resourceId?.videoId || "",
      title: result.snippet?.title || "",
      publishedAt: result.snippet?.publishedAt || "",
      thumbnail: result.snippet?.thumbnails?.medium?.url || result.snippet?.thumbnails?.default?.url || ""
    })).filter(video => /^[A-Za-z0-9_-]{11}$/.test(video.videoId)),
    nextPageToken: typeof data.nextPageToken === "string" ? data.nextPageToken : ""
  };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseYouTubeFeed(xml) {
  return [...String(xml || '').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)]
    .map(([, entry]) => {
      const videoId = entry.match(/<yt:videoId\b[^>]*>([^<]+)<\/yt:videoId>/i)?.[1]?.trim() || '';
      const title = entry.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
      const publishedAt = entry.match(/<published\b[^>]*>([^<]+)<\/published>/i)?.[1] || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
      return {
        videoId,
        title: decodeXml(title.replace(/<[^>]*>/g, '')).slice(0, 300),
        publishedAt: decodeXml(publishedAt),
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    })
    .filter(Boolean)
    .slice(0, 15);
}

async function findRecentVideos(channelId) {
  const feedUrl = new URL('https://www.youtube.com/feeds/videos.xml');
  feedUrl.searchParams.set('channel_id', channelId);
  const response = await fetch(feedUrl, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error(`YouTube channel feed returned HTTP ${response.status}`);
  return parseYouTubeFeed(await response.text());
}

export const handler = async (event = {}) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=15, stale-while-revalidate=15"
  };
  const cmsSettings = await loadStreamSettings();
  const channelId = cleanChannelId(cmsSettings.channelId || process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID);
  const apiKey = process.env.YOUTUBE_API_KEY;
  const fallbackVideoId = cleanVideoId(cmsSettings.fallbackVideoId);
  const pageToken = event.queryStringParameters?.pageToken || "";
  if (!channelId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ configured: false, isLive: false, latest: null })
    };
  }

  if (pageToken) {
    if (typeof pageToken !== "string" || pageToken.length > 1024 || !apiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({error: "A valid YouTube API page token is required."})
      };
    }
    try {
      const page = await findUploadsPage(channelId, apiKey, pageToken);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({configured: true, videos: page.videos, nextPageToken: page.nextPageToken})
      };
    } catch (error) {
      console.error("Could not load more YouTube recordings.", error.message);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({error: "Could not load more YouTube recordings."})
      };
    }
  }

  try {
    let liveStatusAvailable = Boolean(apiKey);
    const livePromise = apiKey
      ? findVideos({channelId, apiKey, eventType: "live"}).catch(error => {
          console.error("Could not check YouTube live status.", error.message);
          liveStatusAvailable = false;
          return [];
        })
      : Promise.resolve([]);
    const [recordingsPage, liveResults] = await Promise.all([
      apiKey
        ? findUploadsPage(channelId, apiKey).catch(async error => {
            console.error("Could not load YouTube uploads playlist; using the public feed.", error.message);
            return {videos: await findRecentVideos(channelId), nextPageToken: ""};
          })
        : findRecentVideos(channelId).then(videos => ({videos, nextPageToken: ""})),
      livePromise
    ]);
    const live = liveResults[0] || null;
    const recentVideos = [...recordingsPage.videos];
    if (live && !recentVideos.some(video => video.videoId === live.videoId)) recentVideos.unshift(live);
    const latest = recentVideos[0] || (fallbackVideoId
      ? {videoId:fallbackVideoId,title:String(cmsSettings.fallbackTitle || 'Latest recorded service').slice(0,160)}
      : null);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        configured: true,
        channelId,
        liveStatusAvailable,
        isLive: Boolean(live?.videoId),
        live: live || null,
        latest: live ? null : latest,
        videos: recentVideos,
        nextPageToken: recordingsPage.nextPageToken,
        liveMessage:String(cmsSettings.liveMessage || '').slice(0,200),
        offlineMessage:String(cmsSettings.offlineMessage || '').slice(0,200)
      })
    };
  } catch (error) {
    console.error("Could not check YouTube broadcast status.", error.message);
    return {
      statusCode: 502,
      headers: { ...headers, "Cache-Control": "public, max-age=15, stale-while-revalidate=15" },
      body: JSON.stringify({ configured: true, channelId, liveStatusAvailable: false, isLive: false, latest: null, videos: [] })
    };
  }
};

function cleanChannelId(value) {
  const id = String(value || '').trim();
  return /^UC[A-Za-z0-9_-]{22}$/.test(id) ? id : '';
}

function cleanVideoId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

async function loadStreamSettings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  try {
    const endpoint = new URL('/rest/v1/cms_settings', url);
    endpoint.search = new URLSearchParams({select:'setting_value',setting_key:'eq.live_stream',is_published:'eq.true',limit:'1'}).toString();
    const response = await fetch(endpoint, {
      headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},
      signal:AbortSignal.timeout(2500)
    });
    if (!response.ok) return {};
    const rows = await response.json();
    const value = rows?.[0]?.setting_value;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
