import assert from "node:assert/strict";
import test from "node:test";
import { handler, parseYouTubeFeed } from "../netlify/functions/live-status.js";

const feed = `
  <feed>
    <entry>
      <yt:videoId>AbCdEfGhIjK</yt:videoId>
      <title>Sunday &amp; Thanksgiving Service</title>
      <published>2025-01-05T06:00:00+00:00</published>
    </entry>
    <entry>
      <yt:videoId>not-a-video-id</yt:videoId>
      <title>Invalid video</title>
    </entry>
  </feed>
`;

test("parses public channel feed recordings and decodes titles", () => {
  assert.deepEqual(parseYouTubeFeed(feed), [{
    videoId: "AbCdEfGhIjK",
    title: "Sunday & Thanksgiving Service",
    publishedAt: "2025-01-05T06:00:00+00:00",
    thumbnail: "https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg"
  }]);
});

test("loads recent recordings without a YouTube API key", async t => {
  const originalFetch = globalThis.fetch;
  const env = ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .map(key => [key, process.env[key]]);
  process.env.YOUTUBE_API_KEY = "";
  process.env.YOUTUBE_CHANNEL_ID = "";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  globalThis.fetch = async url => {
    assert.match(String(url), /channel_id=UCUcpLiA7EYxKzcesFtlripg/);
    return new Response(feed, {status: 200});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of env) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const result = await handler();
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.configured, true);
  assert.equal(body.channelId, "UCUcpLiA7EYxKzcesFtlripg");
  assert.equal(body.liveStatusAvailable, false);
  assert.equal(body.isLive, false);
  assert.equal(body.latest.videoId, "AbCdEfGhIjK");
  assert.equal(body.videos.length, 1);
});
