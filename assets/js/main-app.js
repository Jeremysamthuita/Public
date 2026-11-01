/**
 * AIC Egerton Chapel - Master Orchestrator
 *
 * Shared page bootstrap for features that are ready to use.
 */

function setupLandingPage() {
    const sermonsContainer = document.getElementById('sermons-container');
    if (!sermonsContainer || !window.AICSermonCards) return;
    window.AICSermonCards.render(sermonsContainer, { limit: 3 });
}

document.addEventListener('DOMContentLoaded', () => {
    setupLandingPage();
});

window.addEventListener('aic:content-updated', event => {
    if (event.detail?.type === 'sermons') setupLandingPage();
});