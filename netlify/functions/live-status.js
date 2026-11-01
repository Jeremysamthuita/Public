/**
 * Cached YouTube live status and latest completed live broadcast.
 */
async function findVideo({ channelId, apiKey, eventType }) {
  const query = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: "1",
    key: apiKey
  });
  if (eventType) query.set("eventType", eventType);
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${query}`, {
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);
  const data = await response.json();
  const result = data.items?.[0];
  return result ? {
    videoId: result.id?.videoId || "",
    title: result.snippet?.title || "",
    publishedAt: result.snippet?.publishedAt || ""
  } : null;
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
    const live = await findVideo({ channelId, apiKey, eventType: "live" });
    const latest = live || await findVideo({ channelId, apiKey, eventType: "completed" });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        configured: true,
        isLive: Boolean(live?.videoId),
        live: live || null,
        latest: live ? null : latest
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
