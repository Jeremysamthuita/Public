/* Home page helpers:
   - marks the active hero slide (for text/zoom animations)
   - reveals sections as they scroll into view
   - gently auto-scrolls the Recent Sermons and Get Involved carousels on
     desktop, pausing on hover/focus/touch and honouring prefers-reduced-motion.
   Does not change how the carousel, events, sermons or ticker work. */
(() => {
  'use strict';
  const body = document.body;
  if (!body || !body.classList.contains('hm')) return;
  body.classList.add('hm-js');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktop = () => typeof matchMedia === 'function' && matchMedia('(min-width: 901px)').matches;

  // 1. active hero slide — follow the carousel dots
  const slides = [...document.querySelectorAll('.hero-stage .carousel-slide')];
  const dots = [...document.querySelectorAll('[data-carousel-slide]')];
  const sync = () => {
    const index = Math.max(0, dots.findIndex(dot => dot.getAttribute('aria-current') === 'true'));
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
  };
  sync();
  dots.forEach(dot => new MutationObserver(sync).observe(dot, { attributes: true, attributeFilter: ['aria-current'] }));

  // 2. reveal on scroll
  const items = [...document.querySelectorAll('[data-reveal]')];
  const show = el => el.classList.add('hm-in');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(show);
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { show(entry.target); observer.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(el => observer.observe(el));
    // never leave content hidden if something goes wrong
    setTimeout(() => items.forEach(show), 4000);
  }

  // 3. gentle auto-scroll for horizontal tracks
  function autoScroll(track, intervalMs) {
    if (!track || reduce) return;
    let timer = null;
    let paused = false;

    function step() {
      const first = track.firstElementChild;
      if (!first) return 0;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      return first.getBoundingClientRect().width + gap;
    }

    function advance() {
      if (paused || !isDesktop()) return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 16) return;            // content already fits — nothing to scroll
      const stepPx = step();
      if (stepPx <= 0) return;                // content not yet rendered (CMS loading)
      const next = track.scrollLeft + stepPx;
      if (next >= maxScroll - 8) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        track.scrollTo({ left: next, behavior: 'smooth' });
      }
    }

    function start() {
      if (timer) return;
      timer = setInterval(advance, intervalMs);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    // pause on interaction — hovering, focusing, or touching the track
    track.addEventListener('mouseenter', () => { paused = true; });
    track.addEventListener('mouseleave', () => { paused = false; });
    track.addEventListener('focusin',   () => { paused = true; });
    track.addEventListener('focusout',  () => { paused = false; });
    track.addEventListener('touchstart', () => { paused = true; },  { passive: true });
    track.addEventListener('touchend',   () => { paused = false; }, { passive: true });
    track.addEventListener('pointerdown', () => { paused = true; });
    track.addEventListener('pointerup',   () => { paused = false; });

    // pause while the tab is hidden
    document.addEventListener('visibilitychange', () => {
      document.hidden ? stop() : start();
    });

    // reset on resize (e.g. rotating to portrait)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        track.scrollTo({ left: 0, behavior: 'auto' });
        stop();
        start();
      }, 200);
    });

    start();
  }

  autoScroll(document.querySelector('#sermons-container'), 6000);
  autoScroll(document.querySelector('.hm-involved-grid'), 7000);

  // 4. copyright year
  const year = document.getElementById('copyrightYear');
  if (year) year.textContent = new Date().getFullYear();
})();