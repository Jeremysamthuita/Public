const config = window.AIC_SITE_CONFIG || {};
const iframe = document.getElementById("liveIframe");
const status = document.getElementById("liveStatus");
const statusText = document.getElementById("liveStatusText");
const pastEmpty = document.getElementById("pastEmpty");

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

function setLatestStream(stream) {
  if (!stream?.videoId) {
    pastEmpty.hidden = false;
    return;
  }
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(stream.videoId)}`;
  const link = document.createElement("a");
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(stream.videoId)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = stream.title || "Watch the latest recorded service";
  pastEmpty.replaceChildren(document.createTextNode("Latest recorded service: "), link);
}

async function loadLiveStatus() {
  const channelId = config.youtubeChannelId || "";
  if (!channelId) {
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
      setStatus("live", "We're LIVE now — join us in worship!");
      pastEmpty.hidden = true;
      return;
    }

    setStatus("offline", `No live broadcast right now. ${nextScheduledService()}`);
    setLatestStream(result.latest);
  } catch (error) {
    console.error("Could not retrieve live-stream status.", error);
    setStatus("offline", `Live status is temporarily unavailable. ${nextScheduledService()}`);
  }
}

loadLiveStatus();
