document.getElementById('copyrightYear').textContent = new Date().getFullYear();

        const directionsLink = document.querySelector('.btn-get-directions');
        if (directionsLink) {
            const mapsUrl = window.AIC_SITE_CONFIG && window.AIC_SITE_CONFIG.mapsDirectionsUrl
                ? window.AIC_SITE_CONFIG.mapsDirectionsUrl
                : 'https://www.google.com/maps/dir/?api=1&destination=-0.3688216353133254%2C35.94114277582281';
            directionsLink.href = mapsUrl;
        }

        const eventGrid = document.getElementById('eventsGrid');
        window.upcomingEvents = Array.isArray(window.upcomingEvents) ? window.upcomingEvents : [];
        const {spaceId: spaceID, deliveryToken: accessToken, environment} = window.AIC_SITE_CONFIG.contentful;

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

        renderUpcomingEvents(window.upcomingEvents);
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
        const indicatorsContainer = document.getElementById('carouselIndicators');
        const slides = document.querySelectorAll('.carousel-slide');
        const carousel = document.querySelector('.hero-carousel');
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let currentIndex = 0;
        let autoSlide;
        
        // Create indicators
        slides.forEach((_, index) => {
            const indicator = document.createElement('button');
            indicator.classList.add('indicator');
            indicator.type = 'button';
            indicator.setAttribute('aria-label', `Show slide ${index + 1}`);
            indicator.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            if (index === 0) indicator.classList.add('active');
            indicator.addEventListener('click', () => {
                goToSlide(index);
                restartAutoSlide();
            });
            indicatorsContainer.appendChild(indicator);
        });
        
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
            
            document.querySelectorAll('.indicator').forEach((indicator, i) => {
                indicator.classList.toggle('active', i === currentIndex);
                indicator.setAttribute('aria-pressed', i === currentIndex ? 'true' : 'false');
            });
        }
        
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

        // Load recent sermons from Contentful
        async function loadRecentSermons() {
            try {
                const sermonsContainer = document.getElementById('sermons-container');
                const res = await fetch(`https://cdn.contentful.com/spaces/${spaceID}/environments/${environment}/entries?access_token=${accessToken}&content_type=sermons&include=2`);
                const data = await res.json();

                const assets = data.includes?.Asset || [];
                const sermons = data.items.map(item => {
                    const fields = item.fields;
                    const title = fields.title;
                    const preacher = fields.preacher;
                    const date = fields.date;

                    const pptLinks = (fields.powerpoint || []).map(file => {
                        const asset = assets.find(asset => asset.sys.id === file.sys.id);
                        return {
                            url: asset?.fields?.file?.url ? `https:${asset.fields.file.url}` : '#',
                            name: asset?.fields?.title || 'Download File'
                        };
                    });

                    return { title, preacher, date, pptLinks };
                });

                // Sort by most recent date and select only the top 3
                const recentSermons = sermons
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 3);

                // Clear loading state
                sermonsContainer.innerHTML = '';

                // Add sermons to the page
                recentSermons.forEach(sermon => {
                    const pptLinksHTML = sermon.pptLinks.map(link =>
                        `<a href="${link.url}" target="_blank">${link.name}</a>`).join('<br>');

                    const sermonHTML = `
                        <div class="sermon-item">
                            <h3>${sermon.title}</h3>
                            <p><strong>Preacher:</strong> ${sermon.preacher}</p>
                            <p><strong>Date:</strong> ${new Date(sermon.date).toDateString()}</p>
                            <div class="downloads">${pptLinksHTML}</div>
                        </div>
                    `;
                    sermonsContainer.innerHTML += sermonHTML;
                });

            } catch (error) {
                document.getElementById('sermons-container').innerHTML = `
                    <div class="error-message">
                        <p>Failed to load sermons. Please try again later.</p>
                    </div>
                `;
                console.error('Failed to load recent sermons:', error);
            }
        }

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
    