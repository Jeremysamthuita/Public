document.getElementById('copyrightYear').textContent = new Date().getFullYear();

        // Mobile dropdown toggle
        document.querySelectorAll('.dropdown > a').forEach(dropdownLink => {
            dropdownLink.addEventListener('click', function(e) {
                if (window.innerWidth <= 850) {
                    e.preventDefault();
                    const dropdownContent = this.nextElementSibling;
                    dropdownContent.classList.toggle('show');
                }
            });
        });

        // ====== DONATION MODAL FUNCTIONALITY ======
        const donationModal = document.getElementById('donationModal');
        const reasonInput = document.getElementById('donationReason');
        
        function openDonationModal() {
            donationModal.style.display = "flex";
            reasonInput.style.borderColor = "#e0e0e0";
        }
        
        function closeDonationModal() {
            donationModal.style.display = "none";
            reasonInput.value = "";
        }
        
        function submitDonation() {
            const reason = reasonInput.value.trim();
            const message = `Hello AIC Egerton Chapel, please share the current donation details${reason ? ` for ${reason}` : ''}.`;
            window.location.href = `https://wa.me/254799522418?text=${encodeURIComponent(message)}`;
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === donationModal) {
                closeDonationModal();
            }
        });

        // ====== CAROUSEL FUNCTIONALITY ======
        let currentSlide = 0;
        let slides = [];
        let dots = [];
        let autoSlideInterval;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const galleryGridModal = document.getElementById('galleryGridModal');
        const galleryGrid = document.getElementById('galleryGrid');

        function stopAutoSlide() {
            clearInterval(autoSlideInterval);
            autoSlideInterval = undefined;
        }

        function initCarousel() {
            const dotsContainer = document.getElementById('dots');
            dotsContainer.innerHTML = '';
            document.getElementById('galleryPrev').disabled = slides.length < 2;
            document.getElementById('galleryNext').disabled = slides.length < 2;
            document.getElementById('galleryGridOpen').disabled = slides.length === 0;
            
            slides.forEach((_, i) => {
                const dot = document.createElement('button');
                dot.classList.add('dot');
                dot.type = 'button';
                dot.setAttribute('aria-label', `Show gallery photo ${i + 1}`);
                dot.addEventListener('click', () => {
                    goToSlide(i);
                });
                dotsContainer.appendChild(dot);
            });
            
            dots = document.querySelectorAll('.dot');
            updateCarousel();
            
            // Auto-advance slides
            startAutoSlide();
        }

        function changeSlide(n) {
            currentSlide += n;
            if (currentSlide < 0) {
                currentSlide = slides.length - 1;
            } else if (currentSlide >= slides.length) {
                currentSlide = 0;
            }
            updateCarousel();
            resetAutoSlide();
        }

        function goToSlide(n) {
            currentSlide = n;
            updateCarousel();
            resetAutoSlide();
        }

        function updateCarousel() {
            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === currentSlide);
            });
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
                dot.setAttribute('aria-current', i === currentSlide ? 'true' : 'false');
            });
        }

        function startAutoSlide() {
            if (prefersReducedMotion.matches || autoSlideInterval || !slides.length) return;
            autoSlideInterval = setInterval(() => {
                changeSlide(1);
            }, 6000);
        }

        function resetAutoSlide() {
            stopAutoSlide();
            startAutoSlide();
        }

        document.getElementById('galleryPrev').addEventListener('click', () => changeSlide(-1));
        document.getElementById('galleryNext').addEventListener('click', () => changeSlide(1));
        document.getElementById('galleryGridOpen').addEventListener('click', () => {
            galleryGrid.replaceChildren();
            slides.forEach((slide, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'gallery-grid-item';
                button.setAttribute('aria-label', `View ${slide.alt}`);
                const image = document.createElement('img');
                image.src = slide.src;
                image.alt = slide.alt;
                image.loading = 'lazy';
                button.appendChild(image);
                button.addEventListener('click', () => {
                    goToSlide(index);
                    closeGalleryGrid();
                });
                galleryGrid.appendChild(button);
            });
            galleryGridModal.classList.add('is-open');
            document.body.style.overflow = 'hidden';
            document.getElementById('galleryGridClose').focus();
        });

        function closeGalleryGrid() {
            galleryGridModal.classList.remove('is-open');
            document.body.style.overflow = '';
        }

        document.getElementById('galleryGridClose').addEventListener('click', closeGalleryGrid);
        galleryGridModal.addEventListener('click', event => {
            if (event.target === galleryGridModal) closeGalleryGrid();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && galleryGridModal.classList.contains('is-open')) closeGalleryGrid();
        });

        const galleryCarousel = document.querySelector('.carousel');
        galleryCarousel.addEventListener('mouseenter', stopAutoSlide);
        galleryCarousel.addEventListener('mouseleave', startAutoSlide);
        galleryCarousel.addEventListener('focusin', stopAutoSlide);
        galleryCarousel.addEventListener('focusout', event => {
            if (!galleryCarousel.contains(event.relatedTarget)) startAutoSlide();
        });

        // ====== CMS CONTENT ======
        async function loadGallery() {
            try {
                const {getContent} = await import('/assets/js/content/content-service.js');
                const entries = await getContent('gallery');
                const container = document.getElementById('carousel-images');
                container.replaceChildren();
                const images = entries.flatMap(entry =>
                    (entry.images || [entry.imageUrl]).filter(Boolean).map(url => ({
                        url,
                        alt: entry.alt || entry.caption || 'AIC Egerton Chapel gallery photo'
                    }))
                );

                if (images.length === 0) {
                    const message = document.createElement('p');
                    message.textContent = 'Gallery photos are not available right now.';
                    container.replaceChildren(message);
                    return;
                }
                for (const item of images) {
                    const img = document.createElement('img');
                    img.src = item.url;
                    img.alt = item.alt;
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    container.appendChild(img);
                }
                slides = [...container.querySelectorAll('img')];
                slides[0].classList.add('active');
                initCarousel();
            } catch (error) {
                console.error('Error loading gallery:', error);
                const container = document.getElementById('carousel-images');
                const message = document.createElement('p');
                message.textContent = 'Unable to load gallery images at this time.';
                container.replaceChildren(message);
            }
        }

        async function loadLeadership() {
            const targets = {
                lcc: document.getElementById('lccLeaders'),
                women: document.getElementById('womenLeaders'),
                pastoral: document.getElementById('pastoralLeaders')
            };
            const pastoralFallback = document.getElementById('pastoralFallback');

            try {
                const {getContent} = await import('/assets/js/content/content-service.js');
                const profiles = await getContent('leadership');

                const makeCard = profile => {
                    const card = document.createElement('article');
                    card.className = 'cms-leader-card';
                    if (profile.photoUrl) {
                        const image = document.createElement('img');
                        image.src = profile.photoUrl;
                        image.alt = profile.name ? `Photo of ${profile.name}` : 'Church leader';
                        image.loading = 'lazy';
                        card.appendChild(image);
                    }

                    const name = document.createElement('h3');
                    name.textContent = profile.name || 'Church leader';
                    card.appendChild(name);
                    if (profile.role) {
                        const role = document.createElement('p');
                        role.className = 'cms-leader-role';
                        role.textContent = profile.role;
                        card.appendChild(role);
                    }
                    const descriptionText = profile.bio || profile.message;
                    if (descriptionText) {
                        const description = document.createElement('p');
                        description.textContent = descriptionText;
                        card.appendChild(description);
                    }
                    return card;
                };

                Object.entries(targets).forEach(([group, target]) => {
                    if (!target) return;
                    const groupProfiles = profiles.filter(profile => String(profile.group || '').toLowerCase() === group);
                    if (!groupProfiles.length) return;
                    const entries = groupProfiles
                        .filter(profile => profile.active !== false)
                        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
                    target.replaceChildren(...entries.map(makeCard));
                    if (group === 'pastoral' && pastoralFallback) {
                        target.hidden = entries.length === 0;
                        pastoralFallback.hidden = true;
                    }
                });
            } catch (error) {
                console.error('Error loading leadership profiles:', error);
            }
        }

        // ====== SMOOTH SCROLLING ======
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                if (this.getAttribute('href') === '#') return;
                
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth'
                    });
                    
                }
            });
        });

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            loadGallery();
            loadLeadership();
            window.addEventListener('aic:content-updated', event => {
                if (event.detail?.type === 'gallery') loadGallery();
                if (event.detail?.type === 'leadership') loadLeadership();
            });
            
            // Highlight active section in dropdown
            const dropdownLinks = document.querySelectorAll('.dropdown-content a');
            const sections = document.querySelectorAll('section');
            
            function highlightActiveSection() {
                let current = '';
                
                sections.forEach(section => {
                    const sectionTop = section.offsetTop;
                    const sectionHeight = section.clientHeight;
                    
                    if (pageYOffset >= (sectionTop - sectionHeight / 3)) {
                        current = section.getAttribute('id');
                    }
                });
                
                dropdownLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${current}`) {
                        link.classList.add('active');
                    }
                });
            }
            
            window.addEventListener('scroll', highlightActiveSection);
            highlightActiveSection(); // Initial call
        });
    