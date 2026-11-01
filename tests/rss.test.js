import test from "node:test";
import assert from "node:assert/strict";
import {
  dateToRfc822,
  emptyFeed,
  escapeXml,
  feedItem
} from "../netlify/functions/sermons-rss.js";

test("RSS XML escapes metadata and contains valid podcast channel metadata", () => {
  const xml = emptyFeed("https://aicegertonchapel.netlify.app");
  assert.match(xml, /<language>en-KE<\/language>/);
  assert.match(xml, /<itunes:owner>/);
  assert.match(xml, /<itunes:explicit>false<\/itunes:explicit>/);
  assert.match(xml, /itunes:image href="https:\/\/aicegertonchapel\.netlify\.app\/assets\/img\/podcast-cover-1400\.png"/);
  assert.equal(escapeXml(`A & B < "C"`), "A &amp; B &lt; &quot;C&quot;");
});

test("RSS sermon output includes an enclosure with its size and mime type", () => {
  const asset = {
    sys: { id: "audio-asset" },
    fields: {
      file: {
        url: "//assets.ctfassets.net/audio.mp3",
        contentType: "audio/mpeg",
        details: { size: 1024 }
      }
    }
  };
  const item = feedItem({
    sys: { id: "sermon-id", createdAt: "2026-10-30T12:00:00Z" },
    fields: { title: "Test & Trust", preacher: "AIC Chapel", date: "2026-10-30", audio: { sys: { id: "audio-asset" } } }
  }, new Map([[asset.sys.id, asset]]), "https://aicegertonchapel.netlify.app");
  assert.match(item, /<title>Test &amp; Trust<\/title>/);
  assert.match(item, /<enclosure url="https:\/\/assets\.ctfassets\.net\/audio\.mp3" length="1024" type="audio\/mpeg"\/>/);
  assert.match(item, /<guid isPermaLink="false">sermon-id<\/guid>/);
  assert.equal(dateToRfc822("2026-10-30"), "Fri, 30 Oct 2026 00:00:00 GMT");
});
