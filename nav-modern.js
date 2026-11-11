/* Small helper for the compact mobile menu: close it when the visitor taps outside,
   presses Escape, taps a link, or rotates / resizes to a wide screen.
   It only "presses" the menu button, so it works with the menu code already on each page. */
(() => {
  'use strict';
  const toggle = () => document.getElementById('menuToggle');
  const links = () => document.getElementById('navLinks');
  const isOpen = () => Boolean(links() && links().classList.contains('active'));
  const close = () => { if (isOpen() && toggle()) toggle().click(); };

  document.addEventListener('click', event => {
    if (!isOpen()) return;
    if (event.target.closest('#menuToggle')) return;
    if (event.target.closest('#navLinks a')) { setTimeout(close, 0); return; }
    if (!event.target.closest('#navLinks')) close();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) { close(); if (toggle()) toggle().focus(); }
  });

  if (typeof matchMedia === 'function') {
    const wide = matchMedia('(min-width: 851px)');
    const onChange = event => { if (event.matches) close(); };
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    else if (wide.addListener) wide.addListener(onChange);
  }
})();