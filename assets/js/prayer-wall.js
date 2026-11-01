/**
 * Prayer wall: load approved prayers from Supabase, submit new
 * requests through /api/submit-form (no direct anon insert).
 */
import { supabase, isSupabaseConfigured } from '../../supabaseClient.js';

const list   = document.getElementById('pwList');
const count  = document.getElementById('pwCount');
const form   = document.getElementById('prayerForm');
const status = document.getElementById('pwStatus');

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function renderPrayers(items) {
    if (!items.length) {
        list.innerHTML = '<div class="pw-empty"><i class="fas fa-hands-praying"></i>No published prayers yet. Be the first to share.</div>';
        count.textContent = '0 requests';
        return;
    }
    count.textContent = items.length + ' request' + (items.length === 1 ? '' : 's');
    list.innerHTML = items.map(p => {
        const initial = escapeHtml((p.display_name || 'Anonymous').trim().charAt(0).toUpperCase() || 'A');
        const name = escapeHtml(p.display_name || 'Anonymous');
        const msg = escapeHtml(p.request_text);
        const cat = escapeHtml(p.category || 'Other');
        const id = escapeHtml(p.id);
        const prayed = safeGet('prayed_' + p.id) === '1';
        return `
            <article class="pw-item" data-id="${id}">
                <div class="pw-item-header">
                    <div class="pw-avatar">${initial}</div>
                    <div class="pw-meta">
                        <strong>${name}</strong>
                        <small>${timeAgo(p.created_at)}</small>
                    </div>
                    <span class="pw-category">${cat}</span>
                </div>
                <p class="pw-msg">${msg}</p>
                <div class="pw-actions">
                    <button class="pw-pray-btn ${prayed ? 'prayed' : ''}" ${prayed ? 'disabled' : ''} data-action="pray">
                        <i class="fas fa-hands-praying"></i>
                        <span data-count="${p.prayed_count || 0}">${p.prayed_count || 0}</span> prayed
                    </button>
                </div>
            </article>`;
    }).join('');

    list.querySelectorAll('[data-action="pray"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.pw-item');
            const id = item.dataset.id;
            if (safeGet('prayed_' + id) === '1') return;
            btn.disabled = true;
            safeSet('prayed_' + id, '1');
            btn.classList.add('prayed');
            const span = btn.querySelector('[data-count]');
            const current = Number(span.dataset.count || 0) + 1;
            span.dataset.count = current;
            span.textContent = current;
            if (supabase && isSupabaseConfigured()) {
                try { await supabase.rpc('increment_prayed', { prayer_id: id }); } catch { /* indicative only */ }
            }
        });
    });
}

async function loadPrayers() {
    if (!supabase || !isSupabaseConfigured()) {
        list.innerHTML = '<div class="pw-empty"><i class="fas fa-circle-info"></i>The prayer wall is not connected yet. Please WhatsApp +254 799 522 418.</div>';
        count.textContent = '—';
        return;
    }
    const { data, error } = await supabase
        .from('prayer_requests')
        .select('id, display_name, category, request_text, created_at, prayed_count')
        .eq('is_approved', true)
        .eq('private', false)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) {
        list.innerHTML = '<div class="pw-empty"><i class="fas fa-circle-exclamation"></i>Could not load prayers right now.</div>';
        return;
    }
    renderPrayers(data || []);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'pw-status';
    status.textContent = '';

    const name = document.getElementById('pwName').value.trim();
    const category = document.getElementById('pwCategory').value;
    const message = document.getElementById('pwMessage').value.trim();
    const isPrivate = document.getElementById('pwPrivate')?.checked ? 'true' : 'false';

    if (!name || !message) {
        status.className = 'pw-status err';
        status.textContent = 'Please fill in your name and prayer request.';
        return;
    }

    const submit = document.getElementById('pwSubmit');
    submit.disabled = true;
    status.className = 'pw-status';
    status.textContent = 'Submitting your request…';

    try {
        const res = await fetch('/api/submit-form', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                formType: 'prayer',
                name,
                category,
                message,
                private: isPrivate,
                website: '',
                cfTurnstileResponse: document.querySelector('input[name="cf-turnstile-response"]')?.value || ''
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
            status.className = 'pw-status ok';
            status.textContent = data.message || 'Thank you — your prayer request was received and will be reviewed.';
            form.reset();
            if (window.turnstile) {
                const widget = form.querySelector('.cf-turnstile');
                if (widget?.dataset.widgetId) try { window.turnstile.reset(widget.dataset.widgetId); } catch { /* ignore */ }
            }
        } else {
            status.className = 'pw-status err';
            status.textContent = data.message || 'Could not submit. Please try again or contact us on WhatsApp.';
        }
    } catch {
        status.className = 'pw-status err';
        status.textContent = 'Network error. Please try again or WhatsApp +254 799 522 418.';
    } finally {
        submit.disabled = false;
    }
});

loadPrayers();