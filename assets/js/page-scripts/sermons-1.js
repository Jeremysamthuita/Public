document.getElementById('copyrightYear').textContent = new Date().getFullYear();

        // Global variables
        let allSermons = [];
        
        // DOM elements
        const searchInput = document.getElementById('searchInput');
        const monthFilter = document.getElementById('monthFilter');
        const yearFilter = document.getElementById('yearFilter');
        const sermonContainer = document.getElementById('sermon-container');
        const sermonPreviewModal = document.getElementById('sermonPreviewModal');
        const sermonPreviewFrame = document.getElementById('sermonPreviewFrame');
        const sermonPreviewTitle = document.getElementById('sermonPreviewTitle');
        const sermonPreviewClose = document.getElementById('sermonPreviewClose');
        
        async function loadSermons() {
            try {
                if (typeof window.AICSermonCards?.fetchSermons !== 'function') {
                    throw new Error('The shared sermon service is unavailable.');
                }
                allSermons = await window.AICSermonCards.fetchSermons();
                populateDateFilters();
                displaySermons(allSermons);
            } catch (error) {
                console.error('Failed to load sermons:', error);
                if (sermonContainer.querySelector('.sermon-card')) return;
                sermonContainer.replaceChildren();
                const message = document.createElement('p');
                message.className = 'sermon-load-error';
                message.textContent = 'Sermons could not be loaded. Please try again later.';
                sermonContainer.appendChild(message);
            }
        }

        function displaySermons(sermons) {
            sermonContainer.replaceChildren();
            if (!sermons.length) {
                const empty = document.createElement('p');
                empty.className = 'sermon-empty';
                empty.textContent = 'No sermons match these filters. Try changing your search or date selection.';
                sermonContainer.appendChild(empty);
                return;
            }

            [...sermons]
                .sort((a, b) => new Date(b.date) - new Date(a.date) ||
                    new Date(b.updatedAt) - new Date(a.updatedAt))
                .forEach(sermon => sermonContainer.appendChild(
                    window.AICSermonCards.createCard(sermon, {onPreview: openSermonPreview})
                ));
        }
        
        function populateDateFilters() {
            const monthNames = new Intl.DateTimeFormat('en', {month: 'long'});
            const dates = allSermons.map(sermon => new Date(`${sermon.date}T00:00:00`));
            const months = [...new Set(dates.map(date => date.getMonth()))].sort((a, b) => a - b);
            const years = [...new Set(dates.map(date => date.getFullYear()))].sort((a, b) => b - a);

            monthFilter.replaceChildren(new Option('All months', ''));
            months.forEach(month => monthFilter.add(new Option(monthNames.format(new Date(2020, month, 1)), String(month + 1).padStart(2, '0'))));

            yearFilter.replaceChildren(new Option('All years', ''));
            years.forEach(year => yearFilter.add(new Option(String(year), String(year))));
        }

        function openSermonPreview(fileUrl, title) {
            sermonPreviewTitle.textContent = title;
            sermonPreviewFrame.src = fileUrl;
            sermonPreviewModal.classList.add('is-open');
            document.body.style.overflow = 'hidden';
            sermonPreviewClose.focus();
        }
        window.openSermonPreview = openSermonPreview;

        function closeSermonPreview() {
            sermonPreviewModal.classList.remove('is-open');
            sermonPreviewFrame.src = 'about:blank';
            document.body.style.overflow = '';
        }

        sermonPreviewClose.addEventListener('click', closeSermonPreview);
        sermonPreviewModal.addEventListener('click', event => {
            if (event.target === sermonPreviewModal) closeSermonPreview();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && sermonPreviewModal.classList.contains('is-open')) closeSermonPreview();
        });

        // Apply search and month/year filters.
        function applyFilters() {
            const query = searchInput.value.toLowerCase();
            const selectedMonth = monthFilter.value;
            const selectedYear = yearFilter.value;

            const filtered = allSermons.filter(sermon => {
                const date = new Date(`${sermon.date}T00:00:00`);
                return (!selectedMonth || String(date.getMonth() + 1).padStart(2, '0') === selectedMonth) &&
                    (!selectedYear || String(date.getFullYear()) === selectedYear) &&
                (sermon.title.toLowerCase().includes(query) ||
                    sermon.preacher.toLowerCase().includes(query) ||
                    sermon.scriptureReference.toLowerCase().includes(query));
            });

            displaySermons(filtered);
        }
        window.__aiApply = (parsed) => {
    const topicBlob = (parsed.topics || []).join(' ').toLowerCase();
    const keywordBlob = (parsed.keywords || []).join(' ').toLowerCase();
    const preacher = (parsed.preacher || '').toLowerCase();
    const scripture = (parsed.scripture || '').toLowerCase();

    const filtered = allSermons.filter(s => {
        const haystack = `${s.title} ${s.preacher} ${s.scriptureReference || ''}`.toLowerCase();
        if (preacher && !s.preacher.toLowerCase().includes(preacher)) return false;
        if (scripture && !(s.scriptureReference || '').toLowerCase().includes(scripture)) return false;
        if (topicBlob && !haystack.includes(topicBlob.split(' ')[0])) return false;
        if (keywordBlob && !haystack.includes(keywordBlob.split(' ')[0])) return false;
        return true;
    });
    displaySermons(filtered);
};

window.__aiRestore = () => {
    document.querySelector('.search-filter')?.removeAttribute('style');
    displaySermons(allSermons);
};

        // Initialize the page
        document.addEventListener('DOMContentLoaded', () => {
            // Load sermons
            loadSermons();
            window.addEventListener('aic:content-updated', event => {
                if (event.detail?.type === 'sermons') loadSermons();
            });
            
            // Set up event listeners
            searchInput.addEventListener('input', applyFilters);
            monthFilter.addEventListener('change', applyFilters);
            yearFilter.addEventListener('change', applyFilters);
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
        
        // Close modals when clicking outside or pressing ESC
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
    