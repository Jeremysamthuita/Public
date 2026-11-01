/**
 * Ministries page: open/close the Join-a-Ministry modal.
 */
(function () {
    const modal = document.getElementById('joinModal');
    if (!modal) return;

    function open() {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const first = modal.querySelector('input, select, button');
        if (first) first.focus();
    }

    function close() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-open-join]').forEach(el => el.addEventListener('click', open));
    modal.querySelectorAll('[data-close-join]').forEach(el => el.addEventListener('click', close));

    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });

    const form = modal.querySelector('form');
    if (form) {
        form.addEventListener('aic:submitted', () => {
            setTimeout(close, 1500);
        });
    }
})();