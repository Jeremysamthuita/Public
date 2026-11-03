/**
 * Cached YouTube live status and latest completed live broadcast.
 */
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

export const handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=15, stale-while-revalidate=15"
  };
  const cmsSettings = await loadStreamSettings();
  const channelId = cleanChannelId(cmsSettings.channelId || process.env.YOUTUBE_CHANNEL_ID);
  const apiKey = process.env.YOUTUBE_API_KEY;
  const fallbackVideoId = cleanVideoId(cmsSettings.fallbackVideoId);
  if (!channelId || !apiKey) {
    if (fallbackVideoId) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          configured: true, isLive: false,
          latest: {videoId:fallbackVideoId,title:String(cmsSettings.fallbackTitle || 'Latest recorded service').slice(0,160)},
          videos: [], liveMessage:String(cmsSettings.liveMessage || '').slice(0,200),
          offlineMessage:String(cmsSettings.offlineMessage || '').slice(0,200)
        })
      };
    }
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ configured: false, isLive: false, latest: null })
    };
  }

  try {
    const [liveResults, videos] = await Promise.all([
      findVideos({ channelId, apiKey, eventType: "live" }),
      findVideos({ channelId, apiKey, maxResults: 8 })
    ]);
    const live = liveResults[0] || null;
    const recentVideos = [...videos];
    if (live && !recentVideos.some(video => video.videoId === live.videoId)) recentVideos.unshift(live);
    const latest = recentVideos[0] || null;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        configured: true,
        isLive: Boolean(live?.videoId),
        live: live || null,
        latest: live ? null : (latest || (fallbackVideoId ? {videoId:fallbackVideoId,title:String(cmsSettings.fallbackTitle || 'Latest recorded service').slice(0,160)} : null)),
        videos: recentVideos.slice(0, 8),
        liveMessage:String(cmsSettings.liveMessage || '').slice(0,200),
        offlineMessage:String(cmsSettings.offlineMessage || '').slice(0,200)
      })
    };
  } catch (error) {
    console.error("Could not check YouTube broadcast status.", error.message);
    return {
      statusCode: 502,
      headers: { ...headers, "Cache-Control": "public, max-age=15" },
      body: JSON.stringify({ configured: true, isLive: false, latest: null })
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
