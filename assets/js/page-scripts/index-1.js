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
        function renderUpcomingEvents(events) {
            eventGrid.replaceChildren();
            events = Array.isArray(events) ? events : [];

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
                    const flyer = document.createElement('img');
                    flyer.src = event.flyer;
                    flyer.alt = event.flyerAlt || `${event.title} event flyer`;
                    flyer.loading = 'lazy';
                    card.appendChild(flyer);
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

                const reminder = document.createElement('a');
                const message = `Hello, please remind me about ${event.title}${event.date ? ` on ${event.date}` : ''}${event.time ? ` at ${event.time}` : ''}.`;
                reminder.className = 'event-reminder';
                reminder.href = event.registrationUrl ||
                    `https://wa.me/254799522418?text=${encodeURIComponent(message)}`;
                reminder.target = '_blank';
                reminder.rel = 'noopener noreferrer';
                reminder.textContent = event.registrationUrl ? 'Register' : 'Remind Me';
                content.appendChild(reminder);

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

        if (window.upcomingEvents.length) renderUpcomingEvents(window.upcomingEvents);
        window.addEventListener('aic:content-updated', event => {
            if (event.detail?.type === 'events') loadUpcomingEvents();
        });

        async function loadUpcomingEvents() {
            try {
                const {getContent} = await import('/assets/js/content/content-service.js');
                const events = await getContent('events');
                renderUpcomingEvents(events.map(event => ({
                    ...event,
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
            if (e.key === 'Escape') closeDonationModal();
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