/**
 * AIC Egerton Chapel - Google Gemini AI Search & Intelligence Module
 * Phase 1: no direct API key in the browser, no localStorage copy of personal messages.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const config = window.AIC_SITE_CONFIG?.gemini || {};

function localRuleBasedParser(query) {
    const q = query.toLowerCase();
    const topics = [];
    const keywords = [];

    let preacher = null;
    if (q.includes('thuita') || q.includes('jeremiah')) preacher = 'Thuita';
    else if (q.includes('karanja') || q.includes('samuel')) preacher = 'Karanja';
    else if (q.includes('wanjiku') || q.includes('mary')) preacher = 'Wanjiku';

    const topicDictionary = ['faith', 'healing', 'prayer', 'intercession', 'grace', 'tithe', 'stewardship', 'family', 'hope', 'salvation', 'holy spirit', 'blessing', 'wisdom'];
    topicDictionary.forEach(t => {
        if (q.includes(t)) topics.push(t.charAt(0).toUpperCase() + t.slice(1));
    });

    const scriptureMatch = query.match(/(?:[123]\s)?[A-Za-z]+(?:\s\d+)(?::\d+(?:-\d+)?)?/);
    const scripture = scriptureMatch ? scriptureMatch[0] : null;

    const stopwords = new Set(['find', 'sermons', 'sermon', 'about', 'from', 'last', 'month', 'year', 'the', 'and', 'with', 'show', 'me', 'what', 'who', 'preached', 'pastor', 'rev']);
    query.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).forEach(word => {
        const lower = word.toLowerCase();
        if (lower.length > 2 && !stopwords.has(lower)) keywords.push(word);
    });

    return {
        keywords: keywords.length ? keywords : [query],
        topics,
        preacher,
        scripture,
        source: 'local-nlp'
    };
}

export async function parseSermonQuery(naturalQuery) {
    if (!naturalQuery || naturalQuery.trim().length < 2) return null;

    const trimmed = naturalQuery.trim();

    if (config.endpoint) {
        try {
            const res = await fetch(config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task: 'parse_sermon_search', prompt: trimmed })
            });
            if (res.ok) {
                const data = await res.json();
                return { ...data, source: 'gemini-cloud' };
            }
        } catch {
            /* fall through to local NLP */
        }
    }

    return localRuleBasedParser(trimmed);
}

export async function processContactSubmission(formData) {
    let classification = {
        category: 'General Inquiry',
        urgencyLevel: 'Normal',
        department: 'Pastoral Care',
        sentiment: 'Neutral',
        summary: String(formData.message || '').substring(0, 120)
    };

    const lowerMsg = `${formData.message || ''} ${formData.subject || ''}`.toLowerCase();
    if (lowerMsg.includes('hospital') || lowerMsg.includes('suicid') || lowerMsg.includes('passed away') || lowerMsg.includes('death') || lowerMsg.includes('bereave') || lowerMsg.includes('funeral') || lowerMsg.includes('emergency')) {
        classification.urgencyLevel = 'Urgent Pastoral Care';
        classification.category = lowerMsg.includes('bereave') || lowerMsg.includes('death') ? 'Bereavement' : 'Prayer Request';
        classification.department = 'Senior Pastor';
    } else if (lowerMsg.includes('pray') || lowerMsg.includes('healing') || lowerMsg.includes('sick')) {
        classification.category = 'Prayer Request';
        classification.urgencyLevel = 'High';
        classification.department = 'Pastoral Care';
    } else if (lowerMsg.includes('counsel') || lowerMsg.includes('marriage') || lowerMsg.includes('depression') || lowerMsg.includes('confused')) {
        classification.category = 'Counseling';
        classification.department = 'Pastoral Care';
    } else if (lowerMsg.includes('youth') || lowerMsg.includes('teen') || lowerMsg.includes('fellowship')) {
        classification.category = 'Youth Ministry';
        classification.department = 'Youth Ministry';
    } else if (lowerMsg.includes('thank') || lowerMsg.includes('praise') || lowerMsg.includes('testimony')) {
        classification.category = 'Thanksgiving';
        classification.department = 'Pastoral Care';
    }

    if (config.endpoint) {
        try {
            const res = await fetch(config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task: 'classify_contact_inquiry', payload: formData })
            });
            if (res.ok) {
                const aiData = await res.json();
                classification = { ...classification, ...aiData };
            }
        } catch {
            /* local classification remains */
        }
    }

    let savedToSupabase = false;
    if (supabase && isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase
                .from('contact_inquiries')
                .insert([{
                    full_name: formData.fullName || formData.from_name,
                    email: formData.email || formData.from_email,
                    phone: formData.phone,
                    message: formData.message,
                    category: classification.category,
                    urgency_level: classification.urgencyLevel,
                    assigned_department: classification.department,
                    ai_summary: classification.summary,
                    sentiment: classification.sentiment
                }])
                .select()
                .single();

            if (!error && data) savedToSupabase = true;
        } catch {
            /* Phase 2 moves this behind submit-form */
        }
    }

    return { success: true, savedToSupabase, analysis: classification };
}

export function initAISermonSearch({ inputElement, resultsContainer, onFilterApply }) {
    if (!inputElement) return;

    let debounceTimer;
    inputElement.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                resultsContainer.style.display = 'none';
            }
            if (onFilterApply) onFilterApply(null, '');
            return;
        }

        if (resultsContainer) {
            resultsContainer.innerHTML = '<div class="ai-loading-pill"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
            resultsContainer.style.display = 'block';
        }

        debounceTimer = setTimeout(async () => {
            const parsed = await parseSermonQuery(query);
            if (onFilterApply) onFilterApply(parsed, query);
        }, 350);
    });
}