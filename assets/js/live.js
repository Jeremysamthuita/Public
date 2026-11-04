const config = window.AIC_SITE_CONFIG || {};
const iframe = document.getElementById("liveIframe");
const status = document.getElementById("liveStatus");
const statusText = document.getElementById("liveStatusText");
const pastEmpty = document.getElementById("pastEmpty");
const recentVideos = document.getElementById("recentVideos");
const loadMoreButton = document.getElementById("loadMoreVideos");
const recordingsError = document.getElementById("recordingsError");
let nextPageToken = "";

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nairobiNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: WEEKDAYS[values.weekday],
    minute: Number(values.hour) * 60 + Number(values.minute)
  };
}

function nextScheduledService() {
  const now = nairobiNow();
  const services = [...document.querySelectorAll(".live-service")].map(card => {
    const startHour = Number(card.dataset.startH || 0);
    const startMinute = Number(card.dataset.startM || 0);
    const day = Number(card.dataset.day);
    return {
      card,
      day,
      start: startHour * 60 + startMinute
    };
  });
  if (!services.length || !Number.isInteger(now.day)) return "";

  const next = services
    .map(service => {
      let days = (service.day - now.day + 7) % 7;
      if (days === 0 && now.minute >= service.start) days = 7;
      return { ...service, days };
    })
    .sort((a, b) => a.days - b.days || a.start - b.start)[0];
  const label = next.card.querySelector(".live-service__label")?.textContent.trim() || "Service";
  const time = next.card.querySelector(".live-service__time")?.textContent.trim() || "";
  return `Next scheduled service: ${label}${time ? ` — ${time}` : ""}.`;
}

function setStatus(state, message) {
  status.dataset.state = state;
  statusText.textContent = message;
}

function playVideo(videoId, title) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1`;
  iframe.title = title ? `${title} — AIC Egerton Chapel` : "AIC Egerton Chapel video";
  iframe.hidden = false;
  document.getElementById("livePlayer").scrollIntoView({behavior: "smooth", block: "center"});
}

function setLatestStream(stream) {
  if (!stream?.videoId) {
    pastEmpty.hidden = false;
    return;
  }
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(stream.videoId)}`;
  iframe.title = `${stream.title || "Latest recorded service"} — AIC Egerton Chapel`;
  const link = document.createElement("a");
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(stream.videoId)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = stream.title || "Watch the latest recorded service";
  link.addEventListener("click", event => {
    event.preventDefault();
    playVideo(stream.videoId, stream.title);
  });
  pastEmpty.replaceChildren(document.createTextNode("Latest recorded service: "), link);
}

function renderRecentVideos(videos = [], {append = false} = {}) {
  if (!append) recentVideos.replaceChildren();
  for (const video of videos) {
    if (!video.videoId) continue;
    if (recentVideos.querySelector(`[data-video-id="${CSS.escape(video.videoId)}"]`)) continue;
    const card = document.createElement("a");
    card.className = "live-video-card";
    card.dataset.videoId = video.videoId;
    card.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.addEventListener("click", event => {
      event.preventDefault();
      playVideo(video.videoId, video.title);
    });
    if (video.thumbnail) {
      const thumbnail = document.createElement("img");
      thumbnail.src = video.thumbnail;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      card.appendChild(thumbnail);
    }
    const title = document.createElement("strong");
    title.textContent = video.title || "Watch on YouTube";
    card.appendChild(title);
    if (video.publishedAt) {
      const date = document.createElement("span");
      date.textContent = new Date(video.publishedAt).toLocaleDateString();
      card.appendChild(date);
    }
    recentVideos.appendChild(card);
  }
}

function updateRecordingPagination(pageToken = "") {
  nextPageToken = pageToken;
  loadMoreButton.hidden = !nextPageToken;
  recordingsError.hidden = true;
}

async function loadMoreRecordings() {
  if (!nextPageToken || loadMoreButton.disabled) return;
  const pageToken = nextPageToken;
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Loading videos…";
  recordingsError.hidden = true;
  try {
    const response = await fetch(`/api/live-status?pageToken=${encodeURIComponent(pageToken)}`, {cache: "no-store"});
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.configured) {
      throw new Error(result.error || `YouTube recordings request failed with HTTP ${response.status}`);
    }
    renderRecentVideos(result.videos, {append: true});
    updateRecordingPagination(result.nextPageToken);
  } catch (error) {
    console.error("Could not load more YouTube recordings.", error);
    recordingsError.hidden = false;
  } finally {
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = "Load more videos";
  }
}

function videosForDisplay(result) {
  const videos = Array.isArray(result.videos) ? [...result.videos] : [];
  const featuredVideo = result.isLive ? result.live : result.latest;
  if (featuredVideo?.videoId && !videos.some(video => video.videoId === featuredVideo.videoId)) {
    videos.unshift(featuredVideo);
  }
  return videos;
}

async function loadLiveStatus() {
  const channelId = config.youtubeChannelId || "";
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    iframe.hidden = true;
    setStatus("offline", "Live stream status is not configured yet.");
    pastEmpty.hidden = false;
    return;
  }

  try {
    const response = await fetch("/api/live-status", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.configured) {
      iframe.hidden = true;
      setStatus("offline", "Live status is not available yet. " + nextScheduledService());
      return;
    }

    iframe.hidden = false;
    if (result.isLive && result.live?.videoId) {
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(result.live.videoId)}?autoplay=0`;
      setStatus("live", result.liveMessage || "We're LIVE now — join us in worship!");
      const recordings = videosForDisplay(result);
      renderRecentVideos(recordings);
      pastEmpty.hidden = recordings.length > 0;
      updateRecordingPagination(result.nextPageToken);
      return;
    }

    const liveMessage = result.liveStatusAvailable === false
      ? "Recent recordings are synced; live status is unavailable."
      : (result.offlineMessage || "No live broadcast right now.");
    setStatus("offline", `${liveMessage} ${nextScheduledService()}`.trim());
    setLatestStream(result.latest || result.videos?.[0]);
    const recordings = videosForDisplay(result);
    renderRecentVideos(recordings);
    pastEmpty.hidden = recordings.length > 0;
    updateRecordingPagination(result.nextPageToken);
  } catch (error) {
    console.error("Could not retrieve live-stream status.", error);
    setStatus("offline", `Live status is temporarily unavailable. ${nextScheduledService()}`);
  }
}

loadMoreButton.addEventListener("click", loadMoreRecordings);
loadLiveStatus();
