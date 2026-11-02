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
    "Cache-Control": "public, max-age=60, stale-while-revalidate=30"
  };
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!channelId || !apiKey) {
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
        latest: live ? null : latest,
        videos: recentVideos.slice(0, 8)
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
