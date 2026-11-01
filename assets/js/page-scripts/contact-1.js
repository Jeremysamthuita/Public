document.getElementById('copyrightYear').textContent = new Date().getFullYear();

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

        // Close modal when clicking outside or pressing ESC
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
    