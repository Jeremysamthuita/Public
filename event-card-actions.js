/* =========================================================================
   Event Card Actions — Share poster (file) + event details
   • Adds the Share icon to every .event-card (idempotent)
   • Uses a MutationObserver so it survives ANY CMS re-render
   • Shares the flyer image (file) + title/date/venue/link via Web Share
     when supported; falls back to text share, then clipboard copy.
   ========================================================================= */
(function () {
  'use strict';

  var BOUND_ATTR = 'data-aic-share-bound';
  var healTimer = null;

  /* ---------------------------------------------------------------- */
  function gatherEventData(btn) {
    var card = btn.closest('.event-card');
    if (!card) return null;

    var flyerUrl = btn.dataset.flyerUrl || '';
    if (!flyerUrl) {
      var media = card.querySelector('[data-flyer-url]');
      if (media) flyerUrl = media.dataset.flyerUrl || '';
    }

    var titleEl = card.querySelector('h3');
    var title = btn.dataset.eventTitle ||
      (titleEl ? titleEl.textContent.trim() : '') || 'Event';

    var dateEl = card.querySelector('.event-date');
    var date = btn.dataset.eventDate ||
      (dateEl ? dateEl.textContent.trim() : '');

    var venueEl = card.querySelector('.event-venue');
    var venue = venueEl
      ? venueEl.textContent.replace(/^\uD83D\uDCCD\s*/, '').trim()
      : '';

    var description = '';
    card.querySelectorAll('.event-card-content > p').forEach(function (p) {
      if (description) return;
      if (p.classList.contains('event-date')) return;
      if (p.classList.contains('event-venue')) return;
      description = p.textContent.trim();
    });

    return {
      url: window.location.origin + window.location.pathname + '#events',
      title: title,
      date: date,
      venue: venue,
      description: description,
      flyerUrl: flyerUrl
    };
  }

function buildShareText(data, opts) {
  opts = opts || {};
  var lines = ['\uD83D\uDCC5 ' + data.title];
  if (data.date)        lines.push('\uD83D\uDD52 ' + data.date);
  if (data.venue)       lines.push('\uD83D\uDCCD ' + data.venue);
  if (data.description) { lines.push(''); lines.push(data.description); }

  /* Include the poster URL only when the image isn't being attached */
  if (opts.includeFlyerUrl && data.flyerUrl) {
    lines.push('');
    lines.push('\uD83D\uDDBC\uFE0F Poster: ' + data.flyerUrl);
  }

  lines.push('');
  lines.push('\uD83D\uDD17 ' + data.url);
  return lines.join('\n');
}

  /* ---------------------------------------------------------------- */
  function toast(message) {
    var el = document.getElementById('aicEventShareToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aicEventShareToast';
      el.className = 'event-share-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove('is-visible');
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2800);
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* Build a File for the flyer with reliable MIME + filename detection.  */
async function fetchFlyerFile(flyerUrl, title) {
  if (!flyerUrl) return null;

  var response;
  try {
    response = await fetch(flyerUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'default'
    });
  } catch (err) {
    console.warn('[event-share] Flyer fetch failed:', err);
    return null;
  }

  if (!response.ok) {
    console.warn('[event-share] Flyer fetch status:', response.status);
    return null;
  }

  var blob;
  try {
    blob = await response.blob();
  } catch (err) {
    console.warn('[event-share] Flyer blob failed:', err);
    return null;
  }
  if (!blob || blob.size === 0) {
    console.warn('[event-share] Flyer returned an empty body.');
    return null;
  }

  /* Resolve MIME + extension — trust blob.type first, fall back to URL */
  var mime = (blob.type || '').split(';')[0].trim().toLowerCase();
  var urlPath = '';
  try { urlPath = new URL(flyerUrl, location.href).pathname.toLowerCase(); } catch (e) {}
  var urlExt = (urlPath.match(/\.([a-z0-9]+)$/) || [])[1] || '';

  var ext = '';
  if (mime.indexOf('image/') === 0) ext = mime.slice(6).split('+')[0];
  if (!ext || ext === 'octet-stream' || ext === 'x-icon') ext = urlExt || 'png';
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';

  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    var mimeByExt = {
      jpg: 'image/jpeg',  jpeg: 'image/jpeg',
      png: 'image/png',   gif:  'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp',   avif: 'image/avif'
    };
    mime = mimeByExt[ext] || ('image/' + ext);
  }

  var safeName = 'event-' +
    String(title || 'flyer')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) +
    '.' + ext;

  try {
    return new File([blob], safeName, { type: mime });
  } catch (err) {
    console.warn('[event-share] Could not construct File:', err);
    return null;
  }
}
  /* ---------------------------------------------------------------- */
async function shareEvent(btn) {
  var data = gatherEventData(btn);
  if (!data) return;

  var shareTitle = data.title + ' \u2014 AIC Egerton Chapel';
  var file = data.flyerUrl ? await fetchFlyerFile(data.flyerUrl, data.title) : null;

  /* ---------------------------------------------------------------
     Path 1: Web Share WITH the flyer attached (mobile Chrome, Safari,
     Edge Android, Samsung Internet).  We try `canShare(files)` first,
     then fall back to `canShare(files + url)` because some platforms
     reject url-with-files.
     --------------------------------------------------------------- */
  if (file && navigator.share && typeof navigator.canShare === 'function') {
    var withUrl = {
      title: shareTitle,
      text: buildShareText(data, { includeFlyerUrl: false }),
      url: data.url,
      files: [file]
    };
    if (navigator.canShare(withUrl)) {
      try {
        await navigator.share(withUrl);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        /* Retry without `url` */
      }
    }

    var withoutUrl = {
      title: shareTitle,
      text: buildShareText(data, { includeFlyerUrl: false }),
      files: [file]
    };
    if (navigator.canShare(withoutUrl)) {
      try {
        await navigator.share(withoutUrl);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        /* fall through */
      }
    }
  }

  /* ---------------------------------------------------------------
     Path 2: Text‑only Web Share (desktop Chrome/Edge, or when the
     file couldn't be prepared).  The poster URL is injected into the
     text so the recipient can still open the flyer.
     --------------------------------------------------------------- */
  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: buildShareText(data, { includeFlyerUrl: true }),
        url: data.url
      });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  /* ---------------------------------------------------------------
     Path 3: Clipboard fallback (Firefox, browsers without share).
     --------------------------------------------------------------- */
  var ok = await copyText(buildShareText(data, { includeFlyerUrl: true }));
  toast(ok ? 'Event details copied to clipboard' : 'Unable to share right now');
}

  /* ---------------------------------------------------------------- */
  function bind() {
    document.querySelectorAll('.event-share-btn').forEach(function (btn) {
      if (btn.getAttribute(BOUND_ATTR) === 'true') return;
      btn.setAttribute(BOUND_ATTR, 'true');
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        shareEvent(btn);
      });
    });
  }

  function healCards() {
    document.querySelectorAll('.event-card').forEach(function (card) {
      /* Already injected? Skip — keeps the button stable. */
      if (card.querySelector('.event-share-btn')) return;

      var actions = card.querySelector('.event-card-actions');
      if (!actions) return;

      var media   = card.querySelector('[data-flyer-url]');
      var flyer   = media ? (media.dataset.flyerUrl || '') : '';
      var titleEl = card.querySelector('h3');
      var title   = titleEl ? titleEl.textContent.trim() : 'Event';
      var dateEl  = card.querySelector('.event-date');
      var date    = dateEl ? dateEl.textContent.trim() : '';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-share-btn';
      btn.setAttribute('aria-label', 'Share event: ' + title);
      btn.title = 'Share this event';
      btn.dataset.flyerUrl   = flyer;
      btn.dataset.eventTitle = title;
      btn.dataset.eventDate  = date;
      btn.innerHTML = '<i class="fas fa-share-nodes" aria-hidden="true"></i>';

      actions.appendChild(btn);
    });
    bind();
  }

  function scheduleHeal(delay) {
    clearTimeout(healTimer);
    healTimer = setTimeout(healCards, delay == null ? 80 : delay);
  }

  /* ---------------------------------------------------------------- */
  function watchGrid() {
    var grid = document.getElementById('eventsGrid');
    if (!grid || grid.dataset.aicWatched === 'true') return;
    grid.dataset.aicWatched = 'true';

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList' &&
            (m.addedNodes.length || m.removedNodes.length)) {
          scheduleHeal(80);
          return;
        }
      }
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  function init() {
    scheduleHeal(0);
    watchGrid();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* In case the CMS fires a known event after inserting the markup */
  ['aic:content-updated', 'aic:events-updated'].forEach(function (evt) {
    window.addEventListener(evt, function () { scheduleHeal(120); });
  });
})();