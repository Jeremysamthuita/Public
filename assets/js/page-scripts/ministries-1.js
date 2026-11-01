document.getElementById('copyrightYear').textContent = new Date().getFullYear();
        document.getElementById('baptismYear').max = new Date().getFullYear();

        document.querySelectorAll('.ministry-img').forEach(image => {
            const showPlaceholder = () => {
                const placeholder = document.createElement('div');
                placeholder.className = 'ministry-photo-placeholder';
                placeholder.setAttribute('role', 'img');
                placeholder.setAttribute('aria-label', image.alt);
                placeholder.textContent = 'Photo unavailable';
                image.replaceWith(placeholder);
            };

            if (image.complete && image.naturalWidth === 0) {
                showPlaceholder();
            } else {
                image.addEventListener('error', showPlaceholder, { once: true });
            }
        });
        
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
        
        // Join Ministry Modal
        function openJoinModal() {
            document.getElementById('joinModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
            document.getElementById('name').focus();
        }

        function closeJoinModal() {
            document.getElementById('joinModal').style.display = 'none';
            document.body.style.overflow = '';
        }
        
        document.getElementById('joinForm').addEventListener('aic:submitted', () => {
            closeJoinModal();
        });
        document.getElementById('baptismYear').max = String(new Date().getFullYear());

        // Close modals when clicking outside or pressing ESC
        window.onclick = function(event) {
            const donationModal = document.getElementById('donationModal');
            const joinModal = document.getElementById('joinModal');
            
            if (event.target === donationModal) {
                closeDonationModal();
            }
            if (event.target === joinModal) {
                closeJoinModal();
            }
        };
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDonationModal();
                closeJoinModal();
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
    