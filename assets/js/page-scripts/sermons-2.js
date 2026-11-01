import { initAISermonSearch } from '/assets/js/gemini-ai.js';

    const aiInput = document.getElementById('aiSermonSearch');
    const aiResults = document.getElementById('aiSermonResults');

    if (aiInput) {
        initAISermonSearch({
            inputElement: aiInput,
            resultsContainer: aiResults,
            onFilterApply: (parsed, rawQuery) => {
                if (!parsed) {
                    aiResults.style.display = 'none';
                    // restore full list
                    if (window.__aiRestore) window.__aiRestore();
                    return;
                }
                // Hide the standard search+month+year filter bar
                document.querySelector('.search-filter')?.setAttribute('style', 'display:none');
                aiResults.style.display = 'block';
                const chips = [
                    ...(parsed.topics || []).map(t => `#${t}`),
                    ...(parsed.keywords || []).map(k => k),
                    parsed.scripture ? `📖 ${parsed.scripture}` : '',
                    parsed.preacher ? `👤 ${parsed.preacher}` : ''
                ].filter(Boolean);
                aiResults.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                        <strong style="color:var(--aic-purple)"><i class="fas fa-sparkles"></i> AI understood:</strong>
                        ${chips.map(c => `<span class="sermon-tag">${c}</span>`).join('') || '<em>general search</em>'}
                    </div>
                    <small style="color:var(--aic-muted)">Filters applied automatically below.</small>`;

                // Apply the parsed filter using the existing AICSermonCards pipeline
                window.__aiApply?.(parsed);
            }
        });
    }
