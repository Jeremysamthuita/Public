const copyrightYear = document.getElementById('copyrightYear');
if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

        const directionsLink = document.querySelector('.btn-get-directions');
        if (directionsLink) {
            const mapsUrl = window.AIC_SITE_CONFIG && window.AIC_SITE_CONFIG.mapsDirectionsUrl
                ? window.AIC_SITE_CONFIG.mapsDirectionsUrl
                : 'https://www.google.com/maps/dir/?api=1&destination=-0.3688216353133254%2C35.94114277582281';
            directionsLink.href = mapsUrl;
        }

        const eventGrid = document.getElementById('eventsGrid');
        window.upcomingEvents = Array.isArray(window.upcomingEvents) ? window.upcomingEvents : [];

        // Global flyer modal state
        let currentFlyerEvent = null;
        let lastFlyerFocusedElement = null;

        function getFlyerFilename(event) {
            const safeTitle = (event?.title || 'event')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            let ext = 'png';
            try {
                const url = new URL(event?.flyer || '', window.location.href);
                const match = url.pathname.match(/\.(png|jpe?g|webp|gif|svg|avif)($|\?)/i);
                if (match) ext = match[1].toLowerCase().replace('jpeg', 'jpg');
            } catch {}
            return `${safeTitle || 'event'}-flyer.${ext}`;
        }

        async function downloadFlyerFile(url, filename) {
            if (!url) return;
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename || 'event-flyer.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            } catch (error) {
                console.warn('[events] Direct blob download failed, falling back to direct link:', error);
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.download = filename || 'event-flyer.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }

        function ensureFlyerModal() {
            let modal = document.getElementById('eventFlyerModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'eventFlyerModal';
                modal.className = 'event-flyer-modal';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-labelledby', 'eventFlyerModalTitle');
                modal.hidden = true;
                modal.innerHTML = `
                    <div class="event-flyer-modal-backdrop" data-flyer-close></div>
                    <div class="event-flyer-modal-dialog">
                        <div class="event-flyer-modal-header">
                            <div class="event-flyer-modal-meta">
                                <span class="event-flyer-modal-eyebrow"><i class="fas fa-calendar-check" aria-hidden="true"></i> Event Flyer</span>
                                <h3 id="eventFlyerModalTitle" class="event-flyer-modal-title">Event Flyer</h3>
                                <p id="eventFlyerModalDate" class="event-flyer-modal-date"></p>
                            </div>
                            <div class="event-flyer-modal-actions">
                                <button type="button" id="eventFlyerModalDownloadBtn" class="event-flyer-btn-download" aria-label="Download full flyer image">
                                    <i class="fas fa-download" aria-hidden="true"></i> <span>Download</span>
                                </button>
                                <button type="button" class="event-flyer-modal-close" data-flyer-close aria-label="Close flyer preview">&times;</button>
                            </div>
                        </div>
                        <div class="event-flyer-modal-body">
                            <div class="event-flyer-spinner" id="eventFlyerSpinner" aria-hidden="true"><i class="fas fa-spinner fa-spin"></i></div>
                            <img id="eventFlyerModalImage" src="" alt="" class="event-flyer-modal-image">
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                modal.addEventListener('click', (e) => {
                    if (e.target.hasAttribute('data-flyer-close') || e.target.closest('[data-flyer-close]')) {
                        closeEventFlyerModal();
                    }
                });

                const modalDownloadBtn = modal.querySelector('#eventFlyerModalDownloadBtn');
                if (modalDownloadBtn) {
                    modalDownloadBtn.addEventListener('click', async () => {
                        if (!currentFlyerEvent || !currentFlyerEvent.flyer) return;
                        modalDownloadBtn.disabled = true;
                        const originalHtml = modalDownloadBtn.innerHTML;
                        modalDownloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>Saving...</span>';
                        await downloadFlyerFile(currentFlyerEvent.flyer, getFlyerFilename(currentFlyerEvent));
                        modalDownloadBtn.disabled = false;
                        modalDownloadBtn.innerHTML = originalHtml;
                    });
                }
            }
            return modal;
        }

        function openEventFlyerModal(event) {
            if (!event || !event.flyer) return;
            currentFlyerEvent = event;
            lastFlyerFocusedElement = document.activeElement;
            const modal = ensureFlyerModal();
            const titleEl = modal.querySelector('#eventFlyerModalTitle');
            const dateEl = modal.querySelector('#eventFlyerModalDate');
            const imgEl = modal.querySelector('#eventFlyerModalImage');
            const spinner = modal.querySelector('#eventFlyerSpinner');

            if (titleEl) titleEl.textContent = event.title || 'Event Flyer';
            if (dateEl) {
                const details = [event.date, event.time, event.location].filter(Boolean).join(' · ');
                dateEl.textContent = details;
                dateEl.style.display = details ? 'block' : 'none';
            }

            if (spinner) spinner.style.display = 'flex';
            if (imgEl) {
                imgEl.style.display = 'none';
                imgEl.onload = () => {
                    if (spinner) spinner.style.display = 'none';
                    imgEl.style.display = 'block';
                };
                imgEl.onerror = () => {
                    if (spinner) spinner.style.display = 'none';
                    imgEl.style.display = 'block';
                };
                imgEl.src = event.flyer;
                imgEl.alt = event.flyerAlt || `${event.title || 'Event'} full flyer`;
            }

            modal.hidden = false;
            document.body.style.overflow = 'hidden';
            const closeBtn = modal.querySelector('.event-flyer-modal-close');
            if (closeBtn) closeBtn.focus();
        }

        function closeEventFlyerModal() {
            const modal = document.getElementById('eventFlyerModal');
            if (modal) {
                modal.hidden = true;
                const imgEl = modal.querySelector('#eventFlyerModalImage');
                if (imgEl) imgEl.src = '';
            }
            document.body.style.overflow = '';
            currentFlyerEvent = null;
            if (lastFlyerFocusedElement && typeof lastFlyerFocusedElement.focus === 'function') {
                lastFlyerFocusedElement.focus();
            }
        }

        function renderUpcomingEvents(events) {
            if (!eventGrid) return;
            eventGrid.replaceChildren();
            events = Array.isArray(events) ? events : [];

            // Filter out events that have expired (past midnight EAT after event date)
            const todayEAT = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10);
            events = events.filter(event => {
                if (!event || !event.title) return false;
                // Keep if no date (can't determine expiry), or if date >= today EAT
                if (!event._rawDate) return true;
                return event._rawDate >= todayEAT;
            });

            if (events.length === 0) {
                const emptyState = document.createElement('p');
                emptyState.className = 'events-empty';
                emptyState.textContent = 'No upcoming events at the moment. Please check back soon.';
                eventGrid.appendChild(emptyState);
                return;
            }

            events.forEach(event => {
                if (!event || !event.title || !event.date) return;

                const card = document.createElement('article');
                card.className = 'event-card';

                if (event.flyer) {
                    const media = document.createElement('div');
                    media.className = 'event-card-media';
                    media.setAttribute('role', 'button');
                    media.setAttribute('tabindex', '0');
                    media.setAttribute('aria-label', `Preview full flyer for ${event.title}`);
                    media.title = 'Click to preview full uncropped flyer';

                    const flyer = document.createElement('img');
                    flyer.src = event.flyer;
                    flyer.alt = event.flyerAlt || `${event.title} event flyer`;
                    flyer.loading = 'lazy';
                    media.appendChild(flyer);

                    const badge = document.createElement('span');
                    badge.className = 'event-media-badge';
                    badge.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i> View Flyer';
                    media.appendChild(badge);

                    media.addEventListener('click', () => openEventFlyerModal(event));
                    media.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openEventFlyerModal(event);
                        }
                    });

                    card.appendChild(media);
                }

                const content = document.createElement('div');
                content.className = 'event-card-content';

                const date = document.createElement('p');
                date.className = 'event-date';
                date.textContent = [event.date, event.time].filter(Boolean).join(' · ');
                content.appendChild(date);

                const title = document.createElement('h3');
                title.textContent = event.title;
                content.appendChild(title);

                if (event.location) {
                    const venue = document.createElement('p');
                    venue.className = 'event-venue';
                    venue.textContent = `\u{1F4CD} ${event.location}`;
                    content.appendChild(venue);
                }

                if (event.description) {
                    const description = document.createElement('p');
                    description.textContent = event.description;
                    content.appendChild(description);
                }

                const actions = document.createElement('div');
                actions.className = 'event-card-actions';

                const reminder = document.createElement('a');
                const message = `Hello, please remind me about ${event.title}${event.date ? ` on ${event.date}` : ''}${event.time ? ` at ${event.time}` : ''}.`;
                reminder.className = 'event-reminder';
                reminder.href = event.registrationUrl ||
                    `https://wa.me/254799522418?text=${encodeURIComponent(message)}`;
                reminder.target = '_blank';
                reminder.rel = 'noopener noreferrer';
                reminder.textContent = event.registrationUrl ? 'Register' : 'Remind Me';
                actions.appendChild(reminder);

                if (event.flyer) {
                    const imageActions = document.createElement('div');
                    imageActions.className = 'event-image-actions';

                    const previewBtn = document.createElement('button');
                    previewBtn.type = 'button';
                    previewBtn.className = 'event-action-btn event-preview-btn';
                    previewBtn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i> Preview';
                    previewBtn.setAttribute('aria-label', `Preview full flyer for ${event.title}`);
                    previewBtn.title = 'View full uncropped flyer';
                    previewBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEventFlyerModal(event);
                    });

                    const downloadBtn = document.createElement('button');
                    downloadBtn.type = 'button';
                    downloadBtn.className = 'event-action-btn event-download-btn';
                    downloadBtn.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i> Download';
                    downloadBtn.setAttribute('aria-label', `Download flyer for ${event.title}`);
                    downloadBtn.title = 'Download flyer image file';
                    downloadBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        downloadBtn.disabled = true;
                        const origHtml = downloadBtn.innerHTML;
                        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Saving...';
                        await downloadFlyerFile(event.flyer, getFlyerFilename(event));
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = origHtml;
                    });

                    imageActions.appendChild(previewBtn);
                    imageActions.appendChild(downloadBtn);
                    actions.appendChild(imageActions);
                }

                content.appendChild(actions);
                card.appendChild(content);
                eventGrid.appendChild(card);
            });

            if (eventGrid.children.length === 0) {
                const emptyState = document.createElement('p');
                emptyState.className = 'events-empty';
                emptyState.textContent = 'No upcoming events at the moment. Please check back soon.';
                eventGrid.appendChild(emptyState);
            }
        }

        // Handle clicks on static/prerendered action buttons via delegation
        if (eventGrid) {
            eventGrid.addEventListener('click', (e) => {
                const previewBtn = e.target.closest('[data-action="preview-flyer"]');
                if (previewBtn) {
                    e.preventDefault();
                    const flyerUrl = previewBtn.dataset.flyerUrl;
                    const title = previewBtn.dataset.eventTitle;
                    const date = previewBtn.dataset.eventDate;
                    if (flyerUrl) {
                        openEventFlyerModal({ flyer: flyerUrl, title, date });
                    }
                    return;
                }
                const downloadBtn = e.target.closest('[data-action="download-flyer"]');
                if (downloadBtn) {
                    e.preventDefault();
                    const flyerUrl = downloadBtn.dataset.flyerUrl;
                    const title = downloadBtn.dataset.eventTitle;
                    if (flyerUrl) {
                        downloadFlyerFile(flyerUrl, getFlyerFilename({ flyer: flyerUrl, title }));
                    }
                    return;
                }
                const media = e.target.closest('.event-card-media[data-flyer-url]');
                if (media) {
                    e.preventDefault();
                    const flyerUrl = media.dataset.flyerUrl;
                    const title = media.dataset.eventTitle;
                    const date = media.dataset.eventDate;
                    if (flyerUrl) {
                        openEventFlyerModal({ flyer: flyerUrl, title, date });
                    }
                }
            });
        }

        if (window.upcomingEvents.length) renderUpcomingEvents(window.upcomingEvents);
        window.addEventListener('aic:content-updated', event => {
            if (event.detail?.type === 'events') loadUpcomingEvents();
        });

        // Purge any pre-rendered event cards that have already expired (date < today EAT).
        // Runs immediately so stale snapshot cards are removed before loadUpcomingEvents resolves.
        (function pruneExpiredPrerenderedEvents() {
            if (!eventGrid) return;
            const todayEAT = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10);
            const cards = [...eventGrid.querySelectorAll('article.event-card')];
            cards.forEach(card => {
                const mediaEl = card.querySelector('[data-event-date]');
                if (!mediaEl) return;
                // data-event-date format: "6 December 2026 · 9:30 AM"
                const datePart = (mediaEl.dataset.eventDate || '').split('\u00b7')[0].trim();
                if (!datePart) return;
                const parsed = new Date(datePart);
                if (Number.isNaN(parsed.getTime())) return;
                const cardDateEAT = parsed.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10);
                if (cardDateEAT < todayEAT) card.remove();
            });
            if (!eventGrid.querySelector('article.event-card') && !eventGrid.querySelector('.events-empty')) {
                const empty = document.createElement('p');
                empty.className = 'events-empty';
                empty.textContent = 'No upcoming events at the moment. Please check back soon.';
                eventGrid.appendChild(empty);
            }
        })();

        // Schedule auto-refresh at midnight EAT so expired events vanish without a page reload.
        (function scheduleMidnightRefresh() {
            function msUntilMidnightEAT() {
                const nowEAT = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
                const midnight = new Date(nowEAT);
                midnight.setHours(24, 0, 0, 0);
                return midnight - nowEAT;
            }
            function refreshAtMidnight() {
                loadUpcomingEvents();
                setTimeout(refreshAtMidnight, msUntilMidnightEAT());
            }
            setTimeout(refreshAtMidnight, msUntilMidnightEAT());
        })();

        let renderedEventsCount = 0;
        async function loadUpcomingEvents() {
            try {
                const {getContent} = await import('/assets/js/content/content-service.js');
                const events = await getContent('events');
                const list = Array.isArray(events) ? events : [];
                // Prevent temporary empty response from wiping out already displayed events
                if (list.length === 0 && renderedEventsCount > 0) {
                    console.warn('[events] Received empty events list after previously rendering events; keeping current display.');
                    return;
                }
                renderedEventsCount = list.length;
                renderUpcomingEvents(list.map(event => ({
                    ...event,
                    _rawDate: event.date || '',
                    date: event.date
                        ? new Date(`${event.date}T12:00:00`).toLocaleDateString('en-KE', {year: 'numeric', month: 'long', day: 'numeric'})
                        : '',
                    flyer: event.flyerUrl
                })));
            } catch (error) {
                console.error('Error loading upcoming events:', error);
            }
        }

        loadUpcomingEvents();
        
        // Modal functionality
        function openDonationModal() {
            document.getElementById('donationModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
            document.getElementById('donationReason').focus();
        }

        function closeDonationModal() {
            document.getElementById('donationModal').style.display = 'none';
            document.body.style.overflow = '';
        }

        function submitDonation() {
            const reason = document.getElementById('donationReason').value.trim();
            const message = `Hello AIC Egerton Chapel, please share the current donation details${reason ? ` for ${reason}` : ''}.`;
            window.location.href = `https://wa.me/254799522418?text=${encodeURIComponent(message)}`;
        }

        // Close modal when clicking outside the content
        window.onclick = function(event) {
            const modal = document.getElementById('donationModal');
            if (event.target === modal) {
                closeDonationModal();
            }
        };
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDonationModal();
                closeEventFlyerModal();
            }
        });

        // Sticky header effect
        window.addEventListener('scroll', () => {
            const header = document.querySelector('header');
            if (window.scrollY > 100) {
                header.style.padding = '10px 20px';
                header.style.boxShadow = '0px 8px 25px rgba(0, 0, 0, 0.2)';
                header.style.backdropFilter = 'blur(10px)';
            } else {
                header.style.padding = '12px 20px';
            }
        });

        // Carousel functionality
        const carouselContainer = document.getElementById('carouselContainer');
        const slides = document.querySelectorAll('.carousel-slide');
        const carousel = document.querySelector('.hero-carousel');
        const slideStatus = document.getElementById('heroSlideStatus');
        const slideIndicators = document.querySelectorAll('[data-carousel-slide]');
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let currentIndex = 0;
        let autoSlide;
        
        // Navigation controls
        document.querySelector('.carousel-control.prev').addEventListener('click', () => {
            goToSlide(currentIndex - 1);
            restartAutoSlide();
        });
        
        document.querySelector('.carousel-control.next').addEventListener('click', () => {
            goToSlide(currentIndex + 1);
            restartAutoSlide();
        });
        
        function goToSlide(index) {
            if (index < 0) index = slides.length - 1;
            if (index >= slides.length) index = 0;
            
            currentIndex = index;
            carouselContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
            if (slideStatus) slideStatus.textContent = `Slide ${currentIndex + 1} of ${slides.length}`;
            slideIndicators.forEach((indicator, indicatorIndex) => {
                indicator.setAttribute('aria-current', String(indicatorIndex === currentIndex));
            });
        }

        if (slideStatus) slideStatus.textContent = `Slide 1 of ${slides.length}`;
        slideIndicators.forEach(indicator => {
            indicator.addEventListener('click', () => {
                goToSlide(Number(indicator.dataset.carouselSlide));
                restartAutoSlide();
            });
        });
        
        function stopAutoSlide() {
            clearInterval(autoSlide);
            autoSlide = undefined;
        }

        function startAutoSlide() {
            if (prefersReducedMotion.matches || autoSlide) return;
            autoSlide = setInterval(() => {
                goToSlide(currentIndex + 1);
            }, 6000);
        }

        function restartAutoSlide() {
            stopAutoSlide();
            startAutoSlide();
        }

        carousel.addEventListener('mouseenter', stopAutoSlide);
        carousel.addEventListener('mouseleave', startAutoSlide);
        carousel.addEventListener('focusin', stopAutoSlide);
        carousel.addEventListener('focusout', event => {
            if (!carousel.contains(event.relatedTarget)) startAutoSlide();
        });
        carousel.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            if (event.target.closest('button, a, input, select, textarea')) return;
            event.preventDefault();
            goToSlide(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
            restartAutoSlide();
        });
        let touchStartX = null;
        carousel.addEventListener('touchstart', event => {
            touchStartX = event.changedTouches[0]?.screenX ?? null;
        }, {passive: true});
        carousel.addEventListener('touchend', event => {
            if (touchStartX === null) return;
            const distance = event.changedTouches[0].screenX - touchStartX;
            touchStartX = null;
            if (Math.abs(distance) < 48) return;
            goToSlide(currentIndex + (distance < 0 ? 1 : -1));
            restartAutoSlide();
        }, {passive: true});
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopAutoSlide();
            else startAutoSlide();
        });
        startAutoSlide();
        
        // Active link management
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.href === window.location.href) {
                link.classList.add('active');
            }
        });

        // Keep the build-rendered sermons visible while the shared CMS service refreshes.
        async function loadRecentSermons() {
            const sermonsContainer = document.getElementById('sermons-container');
            if (!sermonsContainer) return;
            if (typeof window.AICSermonCards?.render !== 'function') {
                console.error('The shared sermon renderer is unavailable.');
                return;
            }
            await window.AICSermonCards.render(sermonsContainer, {limit: 3});
        }
        window.addEventListener('aic:content-updated', event => {
            if (event.detail?.type === 'sermons') loadRecentSermons();
        });
        loadRecentSermons();

        // Load about carousel images from Contentful
        async function loadAboutGallery() {
            try {
                const aboutCarousel = document.getElementById('about-carousel');
                const {getContent} = await import('/assets/js/content/content-service.js');
                const entries = await getContent('gallery');
                const images = entries.flatMap(entry => entry.images || [entry.imageUrl])
                    .filter(Boolean);
                if (!images.length) {
                    aboutCarousel.replaceChildren();
                    return;
                }
                startBlindsSlideshow(images);

            } catch (error) {
                document.getElementById('about-carousel').innerHTML = `
                    <div class="error-message">
                        <p>Failed to load images. Please try again later.</p>
                    </div>
                `;
                console.error('Failed to load about gallery:', error);
            }
        }

        function startBlindsSlideshow(images) {
            const aboutCarousel = document.getElementById('about-carousel');
            let current = 0;
            let interval;

            function showImage(index) {
                const image = document.createElement('img');
                image.src = images[index];
                image.alt = 'AIC Egerton Chapel';
                image.loading = 'lazy';
                image.className = 'blinds';
                aboutCarousel.replaceChildren(image);
            }

            function nextImage() {
                current = (current + 1) % images.length;
                showImage(current);
            }

            // Start slideshow
            showImage(current);
            interval = setInterval(nextImage, 5000);

            // Pause on hover
            aboutCarousel.addEventListener('mouseenter', () => {
                clearInterval(interval);
            });

            aboutCarousel.addEventListener('mouseleave', () => {
                interval = setInterval(nextImage, 5000);
            });
        }

        // Initialize the page
        document.addEventListener('DOMContentLoaded', () => {
            // Handled dynamically by assets/js/main-app.js
            loadAboutGallery();
        });