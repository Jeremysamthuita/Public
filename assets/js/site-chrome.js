/**
 * Shared behavior for the statically synchronized site header and footer.
 */
(function () {
    if (window.__aicChrome) return;
    window.__aicChrome = true;

    const config = window.AIC_SITE_CONFIG || {};

    function initMenu() {
        const toggle = document.getElementById('menuToggle');
        const links = document.getElementById('navLinks');
        if (!toggle || !links) return;

        function setOpen(open, returnFocus = false) {
            toggle.classList.toggle('active', open);
            links.classList.toggle('active', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
            document.body.style.overflow = open ? 'hidden' : '';
            if (!open && returnFocus) toggle.focus();
        }

        toggle.addEventListener('click', () => setOpen(!links.classList.contains('active')));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && links.classList.contains('active')) {
                setOpen(false, true);
            }
        });
        document.addEventListener('click', event => {
            if (!links.classList.contains('active')) return;
            if (toggle.contains(event.target) || links.contains(event.target)) return;
            setOpen(false);
        });
        links.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1250) setOpen(false);
            });
        });
    }

    function initDialogActions() {
        document.addEventListener('click', event => {
            const action = event.target.closest('[data-action]');
            if (!action) return;
            switch (action.dataset.action) {
                case 'donation-close':
                    window.closeDonationModal?.();
                    break;
                case 'donation-submit':
                    window.submitDonation?.();
                    break;
                case 'join-open':
                    window.openJoinModal?.();
                    break;
                case 'join-close':
                    window.closeJoinModal?.();
                    break;
                default:
                    return;
            }
        });

        document.querySelectorAll('[data-open-donate]').forEach(link => {
            link.addEventListener('click', event => {
                const modal = document.getElementById('donationModal');
                if (!modal || typeof window.openDonationModal !== 'function') return;
                event.preventDefault();
                window.openDonationModal();
            });
        });
    }

    function initMaps() {
        if (config.mapsEmbedUrl) {
            document.querySelectorAll('.footer-map iframe, .contact-map iframe, .contact-map-panel iframe')
                .forEach(map => {
                    if (!map.getAttribute('src') || map.getAttribute('src') === 'about:blank') {
                        map.src = config.mapsEmbedUrl;
                    }
                });
        }
        if (config.mapsDirectionsUrl) {
            document.querySelectorAll('.btn-get-directions').forEach(link => {
                link.href = config.mapsDirectionsUrl;
            });
        }
    }

    function initFooterYear() {
        const year = String(new Date().getFullYear());
        ['copyrightYear', 'year'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = year;
        });
    }

    function initCmsCards() {
        const contentfulLink = document.querySelector('[data-cms="contentful"]');
        const supabaseLink = document.querySelector('[data-cms="supabase"]');
        const contentful = config.contentful || {};
        const supabase = config.supabase || {};

        if (contentfulLink) {
            const spaceId = encodeURIComponent(contentful.spaceId || '');
            const environment = encodeURIComponent(contentful.environment || 'master');
            contentfulLink.href = spaceId
                ? `https://app.contentful.com/spaces/${spaceId}/environments/${environment}/content`
                : 'https://app.contentful.com/';
            contentfulLink.target = '_blank';
            contentfulLink.rel = 'noopener noreferrer';
        }
        if (supabaseLink) {
            let projectRef = '';
            try {
                projectRef = new URL(supabase.url).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1] || '';
            } catch {
                projectRef = '';
            }
            supabaseLink.href = projectRef
                ? `https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}`
                : 'https://supabase.com/dashboard/';
            supabaseLink.target = '_blank';
            supabaseLink.rel = 'noopener noreferrer';
        }

        const status = document.querySelector('[data-cms-status]');
        if (status) {
            const contentfulReady = Boolean(contentful.spaceId && contentful.deliveryToken);
            const supabaseReady = Boolean(supabase.url && supabase.anonKey);
            if (contentfulReady && supabaseReady) {
                status.textContent = 'Contentful is primary; Supabase is configured as the content backup.';
            } else {
                const missing = [
                    !contentfulReady && 'Contentful content connection',
                    !supabaseReady && 'Supabase content connection'
                ].filter(Boolean);
                status.textContent = `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not configured. Automatic content failover is unavailable until the site administrator completes setup.`;
            }
        }
    }

    function initTurnstile() {
        const widgets = document.querySelectorAll('.cf-turnstile');
        const sitekey = config.turnstileSiteKey || '';
        if (!widgets.length || !sitekey) return;
        widgets.forEach(widget => { widget.dataset.sitekey = sitekey; });
        const renderWidgets = () => {
            if (!window.turnstile) return;
            widgets.forEach(widget => {
                if (!widget.dataset.widgetId) {
                    widget.dataset.widgetId = window.turnstile.render(widget, {
                        sitekey,
                        theme: widget.dataset.theme || 'light'
                    });
                }
            });
        };
        if (window.turnstile) {
            renderWidgets();
            return;
        }
        if (document.querySelector('script[data-aic-turnstile]')) return;
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.aicTurnstile = '1';
        script.addEventListener('load', renderWidgets);
        document.head.appendChild(script);
    }

    function init() {
        initMenu();
        initMaps();
        initFooterYear();
        initCmsCards();
        initDialogActions();
        initTurnstile();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
