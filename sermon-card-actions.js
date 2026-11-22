/* =========================================================================
   Sermon Card Actions
   • Top-right eye → preview (any file, new tab)
   • Bottom icons  → share (left) | download (right), bare icons
   • Scripture pill → opens BibleGateway in a new tab (no modal)
   ========================================================================= */
(function () {
  'use strict';

  var ENHANCED = 'data-sermon-enhanced';

  var scriptureModalEl = null;   // unused now, kept off the API surface
  var lastScriptureTrigger = null;
  var hashHandled = false;
  var toastTimer = null;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function $(selector, ctx) { return (ctx || document).querySelector(selector); }
  function $$(selector, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sermon';
  }

  function normalizeReference(raw) {
    return String(raw || '')
      .replace(/^\s*scripture\s*[:\-\u2013\u2014]\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*[-\u2013\u2014]\s*/g, '-')
      .trim();
  }

  function bibleGatewayUrl(reference, version) {
    return 'https://www.biblegateway.com/passage/?search=' +
      encodeURIComponent(reference) +
      '&version=' + encodeURIComponent(version || 'WEB');
  }

  /* ------------------------------------------------------------------ */
  /* Preview URL — handles ANY file type                                */
  /* ------------------------------------------------------------------ */
  function getViewerUrl(url) {
    if (!url) return '';

    var clean = String(url).split('#')[0].split('?')[0].toLowerCase();

    /* Office documents → Google Docs Viewer (native iframe blocked by
       Microsoft, and .pptx/.docx/.xlsx cannot be rendered by the browser) */
    var officeExts = [
      '.pptx', '.ppt',
      '.docx', '.doc',
      '.xlsx', '.xls',
      '.odt', '.ods', '.odp',
      '.rtf', '.csv', '.tsv'
    ];
    var isOffice = officeExts.some(function (ext) {
      return clean.slice(-ext.length) === ext;
    });

    if (isOffice) {
      return 'https://docs.google.com/viewer?url=' +
        encodeURIComponent(url) + '&embedded=true';
    }

    /* PDFs, images, txt, audio, video, html, etc. open natively */
    return url;
  }

  function openPreviewInNewTab(url) {
    if (!url) return;
    window.open(getViewerUrl(url), '_blank', 'noopener,noreferrer');
  }

  /* ------------------------------------------------------------------ */
  /* Scripture → redirect to BibleGateway (no modal)                    */
  /* ------------------------------------------------------------------ */
  function openScriptureInBibleGateway(reference) {
    var ref = normalizeReference(reference);
    if (!ref) return;
    window.open(bibleGatewayUrl(ref, 'WEB'), '_blank', 'noopener,noreferrer');
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                              */
  /* ------------------------------------------------------------------ */
  function toast(message) {
    var el = document.getElementById('aicToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aicToast';
      el.className = 'aic-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove('is-visible');
    void el.offsetWidth;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2800);
  }

  /* ------------------------------------------------------------------ */
  /* Sharing                                                            */
  /* ------------------------------------------------------------------ */
  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(function () { return true; },
                                                       function () { return legacyCopy(value); });
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    var textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    textarea.remove();
    return ok;
  }

  function shareSermon(payload) {
    var shareUrl = payload.url || window.location.href;
    var lines = [
      '\uD83D\uDCD6 ' + (payload.title || 'Sermon'),
      '\uD83D\uDC64 ' + (payload.preacher || 'Preacher not listed'),
      '\uD83D\uDCC5 ' + (payload.date || 'Date not listed'),
      '\uD83D\uDCDC ' + (payload.scripture || 'Scripture not listed'),
      '\uD83D\uDD17 ' + shareUrl
    ];
    var shareText = lines.join('\n');

    if (navigator.share) {
      var shareData = {
        title: (payload.title || 'Sermon') + ' \u2014 AIC Egerton Chapel',
        text: shareText,
        url: shareUrl
      };
      if (!navigator.canShare || navigator.canShare(shareData)) {
        navigator.share(shareData).catch(function (error) {
          if (error && error.name === 'AbortError') return;
          fallbackShare(shareText, payload);
        });
        return;
      }
    }
    fallbackShare(shareText, payload);
  }

  function fallbackShare(text, payload) {
    copyText(text).then(function (ok) {
      if (!ok) {
        toast('Unable to copy. Please copy the link manually.');
        return;
      }
      showSharePreview(payload);
    });
  }

  function showSharePreview(payload) {
    var existing = document.getElementById('sharePreviewToast');
    if (existing) existing.remove();

    var preview = document.createElement('div');
    preview.id = 'sharePreviewToast';
    preview.className = 'share-preview-toast';
    preview.setAttribute('role', 'status');
    preview.setAttribute('aria-live', 'polite');
    preview.innerHTML =
      '<div class="share-preview-header">' +
        '<i class="fas fa-check-circle" aria-hidden="true"></i>' +
        '<strong>Copied to clipboard</strong>' +
      '</div>' +
      '<p class="share-preview-title">' + escapeHtml(payload.title || 'Sermon') + '</p>' +
      '<p class="share-preview-meta">' +
        '<span><i class="fas fa-user" aria-hidden="true"></i> ' + escapeHtml(payload.preacher || '\u2014') + '</span>' +
        '<span><i class="fas fa-calendar" aria-hidden="true"></i> ' + escapeHtml(payload.date || '\u2014') + '</span>' +
        (payload.scripture
          ? '<span><i class="fas fa-book-bible" aria-hidden="true"></i> ' + escapeHtml(payload.scripture) + '</span>'
          : '') +
      '</p>' +
      '<p class="share-preview-link"><i class="fas fa-link" aria-hidden="true"></i> ' +
        escapeHtml(payload.url) +
      '</p>';

    document.body.appendChild(preview);
    window.setTimeout(function () { preview.classList.add('is-visible'); }, 10);
    window.setTimeout(function () {
      preview.classList.remove('is-visible');
      window.setTimeout(function () { preview.remove(); }, 300);
    }, 5000);
  }

  /* ------------------------------------------------------------------ */
  /* Card enhancement                                                   */
  /* ------------------------------------------------------------------ */
  function enhanceCard(card) {
  if (!card || !card.classList.contains('sermon-card')) return;
  if (card.getAttribute(ENHANCED) === 'true') return; 

    var titleEl = card.querySelector('.sermon-card-title');
    var title = titleEl ? titleEl.textContent.trim() : 'Sermon';

    var downloadLink = card.querySelector('.sermon-download-link');
    var downloadUrl = downloadLink ? (downloadLink.getAttribute('href') || '').trim() : '';
    var downloadName = downloadLink ? (downloadLink.getAttribute('download') || '') : '';

    if (!card.id) {
      var baseId = 'sermon-' + slugify(title);
      var id = baseId;
      var suffix = 2;
      while (document.getElementById(id) && document.getElementById(id) !== card) {
        id = baseId + '-' + suffix;
        suffix += 1;
      }
      card.id = id;
    }

    /* ---- scripture pill → link to BibleGateway (new tab) ---- */
    var scriptureEl = card.querySelector('.sermon-scripture-reference');
    var scriptureText = '';

    if (scriptureEl) {
      scriptureText = normalizeReference(scriptureEl.textContent);

      if (scriptureText && scriptureEl.tagName !== 'A') {
        var scriptureLink = document.createElement('a');
        scriptureLink.className = 'sermon-scripture-reference is-clickable';
        scriptureLink.href = bibleGatewayUrl(scriptureText, 'WEB');
        scriptureLink.target = '_blank';
        scriptureLink.rel = 'noopener noreferrer';
        scriptureLink.title = 'Open ' + scriptureText + ' on BibleGateway';
        scriptureLink.setAttribute('aria-label', 'Open scripture ' + scriptureText + ' on BibleGateway');
        scriptureLink.innerHTML =
          '<i class="fas fa-book-bible" aria-hidden="true"></i>' +
          '<span>' + escapeHtml(scriptureText) + '</span>' +
          '<i class="fas fa-arrow-up-right-from-square scripture-chevron" aria-hidden="true"></i>';
        scriptureLink.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        scriptureEl.replaceWith(scriptureLink);
      }
    }

    /* ---- Top-right preview eye (single control) ---- */
    if (downloadUrl && !card.querySelector('.sermon-preview-corner')) {
      var corner = document.createElement('button');
      corner.type = 'button';
      corner.className = 'sermon-preview-corner';
      corner.setAttribute('aria-label', 'Preview ' + title);
      corner.title = 'Preview this sermon';
      corner.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
      corner.addEventListener('click', function (event) {
        event.stopPropagation();
        openPreviewInNewTab(downloadUrl);
      });
      card.appendChild(corner);
    }

    /* ---- Bottom row: Share (left) | Download (right) — bare icons ---- */
    var actions = card.querySelector('.sermon-actions');

    if (actions && downloadUrl && !actions.querySelector('.sermon-action-icon--share')) {
      var titleAttr = escapeHtml(title);

      actions.innerHTML =
        '<button type="button" class="sermon-action-icon sermon-action-icon--share" ' +
          'aria-label="Share ' + titleAttr + '" title="Share this sermon">' +
          '<i class="fas fa-share-nodes" aria-hidden="true"></i>' +
        '</button>' +
        '<a class="sermon-action-icon sermon-action-icon--download sermon-download-link" ' +
          'href="' + escapeHtml(downloadUrl) + '"' +
          (downloadName ? ' download="' + escapeHtml(downloadName) + '"' : '') +
          ' target="_blank" rel="noopener noreferrer" ' +
          'aria-label="Download ' + titleAttr + '" title="Download sermon file">' +
          '<i class="fas fa-download" aria-hidden="true"></i>' +
        '</a>';

      var shareBtn    = actions.querySelector('.sermon-action-icon--share');
      var downloadBtn = actions.querySelector('.sermon-action-icon--download');

      if (shareBtn) {
        shareBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          var preacherEl = card.querySelector('.sermon-meta div:first-child span');
          var dateEl     = card.querySelector('.sermon-meta div:last-child span');
          shareSermon({
            title: title,
            preacher: preacherEl ? preacherEl.textContent.trim() : '',
            date: dateEl ? dateEl.textContent.trim() : '',
            scripture: scriptureText,
            url: window.location.origin + window.location.pathname + '#' + card.id
          });
        });
      }

      if (downloadBtn) {
        downloadBtn.addEventListener('click', function (event) {
          event.stopPropagation();
        });
      }
    }

    if (actions && downloadUrl) card.classList.add('is-clickable');
    card.setAttribute(ENHANCED, 'true');
  }

  function enhanceAll(root) {
    $$('.sermon-card', root || document).forEach(enhanceCard);
  }

/* ------------------------------------------------------------------ */
/* Card click → preview (delegated across both containers)            */
/* ------------------------------------------------------------------ */
function initCardClickDelegation() {
  ['sermon-container', 'sermons-container'].forEach(function (id) {
    var container = document.getElementById(id);
    if (!container || container.dataset.aicClickBound === 'true') return;
    container.dataset.aicClickBound = 'true';

    container.addEventListener('click', function (event) {
      if (event.target.closest('a, button, input, select, textarea, label')) return;
      var card = event.target.closest('.sermon-card');
      if (!card) return;
      if (window.getSelection && String(window.getSelection()).trim()) return;

      var link = card.querySelector('.sermon-download-link');
      var url = link ? (link.getAttribute('href') || '').trim() : '';
      if (!url) return;

      openPreviewInNewTab(url);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Watch BOTH containers for re-rendered cards                        */
/* ------------------------------------------------------------------ */
function initObserver() {
  var observer = new MutationObserver(function (mutations) {
    var added = false;
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        added = true;
        if (node.matches && node.matches('.sermon-card')) enhanceCard(node);
        if (node.querySelectorAll) $$('.sermon-card', node).forEach(enhanceCard);
      });
    });
    if (added) checkHash();
  });

  ['sermon-container', 'sermons-container'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || el.dataset.aicObserved === 'true') return;
    el.dataset.aicObserved = 'true';
    observer.observe(el, { childList: true, subtree: true });
  });
}

  function checkHash() {
    if (hashHandled || !window.location.hash) return;
    var target = document.getElementById(window.location.hash.slice(1));
    if (!target || !target.classList.contains('sermon-card')) return;
    hashHandled = true;
    window.setTimeout(function () {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('is-highlighted');
      window.setTimeout(function () { target.classList.remove('is-highlighted'); }, 2600);
    }, 200);
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */
  function init() {
    initCardClickDelegation();
    enhanceAll();
    initObserver();
    checkHash();

    window.addEventListener('hashchange', function () {
      hashHandled = false;
      checkHash();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();