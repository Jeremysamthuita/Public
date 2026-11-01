/**
 * DEPRECATED — Phase 1.
 * The site uses Contentful through assets/js/sermon-cards.js.
 * This file is retained only so old references do not 404 during the
 * Phase 2 file cleanup. Do not import it in new code.
 */
export async function fetchPublishedSermons() {
    return [];
}

export function createSermonCard() {
    throw new Error('content-loader.js is deprecated. Use assets/js/sermon-cards.js.');
}