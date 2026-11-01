import { supabase, isSupabaseConfigured } from '/assets/js/supabaseClient.js';
import { initCmsAdmin } from '/assets/js/content/cms-admin.js';

        const loginView = document.getElementById('loginView');
        const dashView = document.getElementById('dashView');
        const loginForm = document.getElementById('loginForm');
        const loginStatus = document.getElementById('loginStatus');
        const connectionForm = document.getElementById('connectionForm');
        const connectionStatus = document.getElementById('connectionStatus');
        const siteConfig = window.AIC_SITE_CONFIG?.supabase || {};

        // Phase 1: the connection card is a local development tool only.
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const connectionCard = document.getElementById('connectionCard');
        if (!isLocal && connectionCard) connectionCard.style.display = 'none';

        document.getElementById('supabaseUrl').value = siteConfig.url || '';
        document.getElementById('supabaseAnonKey').value = siteConfig.anonKey || '';

        function esc(value) {
            return String(value ?? '').replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        connectionForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const url = document.getElementById('supabaseUrl').value.trim().replace(/\/$/, '');
            const anonKey = document.getElementById('supabaseAnonKey').value.trim();
            const button = document.getElementById('connectionBtn');
            button.disabled = true;
            connectionStatus.textContent = 'Checking the Supabase Auth service…';

            try {
                const response = await fetch(`${url}/auth/v1/health`, {
                    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) {
                    const detail = await response.json().catch(() => ({}));
                    throw new Error(detail.message || `Supabase returned HTTP ${response.status}`);
                }
                try {
                    window.localStorage.setItem('AIC_SUPABASE_URL', url);
                    window.localStorage.setItem('AIC_SUPABASE_ANON_KEY', anonKey);
                } catch {
                    throw new Error('The connection worked but this browser blocked local storage. Use a normal browser window.');
                }
                connectionStatus.textContent = 'Connected. Settings saved; reloading the site…';
                window.location.reload();
            } catch (error) {
                connectionStatus.textContent = `Connection failed: ${esc(error.message)}`;
            } finally {
                button.disabled = false;
            }
        });

        if (!isSupabaseConfigured()) {
            loginStatus.textContent = 'Connect Supabase above before signing in.';
            loginForm.querySelector('button').disabled = true;
        }

        async function isAdmin() {
            if (!supabase) return false;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return false;
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
            return profile?.role === 'admin';
        }

        async function boot() {
            if (!supabase) return;
            const admin = await isAdmin();
            if (admin) {
                const { data: { session } } = await supabase.auth.getSession();
                document.getElementById('adminUser').textContent = session.user.email;
                loginView.style.display = 'none';
                dashView.style.display = 'block';
                loadAll();
                initCmsAdmin(supabase, session);
            }
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginStatus.textContent = 'Sending…';
            const email = document.getElementById('adminEmail').value.trim();
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.origin + '/admin.html' }
            });
            loginStatus.textContent = error ? ('Error: ' + esc(error.message)) : 'Check your inbox for the magic link.';
        });

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });

        document.querySelectorAll('.adm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
            });
        });

        async function loadInquiries() {
            const { data, error } = await supabase.from('contact_inquiries').select('*').order('created_at', { ascending: false }).limit(200);
            const tbody = document.querySelector('#inquiriesTable tbody');
            if (error) { tbody.innerHTML = `<tr><td colspan="5">${esc(error.message)}</td></tr>`; return; }
            tbody.innerHTML = (data || []).map(i => `
                <tr>
                    <td><strong>${esc(i.full_name || '—')}</strong><br><small>${esc(i.email || '')}</small></td>
                    <td>${esc(i.category || '—')}</td>
                    <td><span class="adm-badge ${i.urgency_level === 'Urgent Pastoral Care' ? 'err' : i.urgency_level === 'High' ? 'warn' : 'info'}">${esc(i.urgency_level || 'Normal')}</span></td>
                    <td style="max-width:340px">${esc((i.message || '').slice(0, 180))}${(i.message || '').length > 180 ? '…' : ''}</td>
                    <td>${esc(new Date(i.created_at).toLocaleDateString())}</td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--aic-muted)">No inquiries yet.</td></tr>';
        }

        async function loadPayments() {
            const { data, error } = await supabase.from('mpesa_payments').select('*').order('created_at', { ascending: false }).limit(200);
            const tbody = document.querySelector('#paymentsTable tbody');
            if (error) { tbody.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`; return; }
            tbody.innerHTML = (data || []).map(p => `
                <tr>
                    <td>${esc(p.mpesa_receipt_number || '—')}</td>
                    <td>${esc(p.phone_number || '—')}</td>
                    <td>KES ${esc(p.amount || 0)}</td>
                    <td>${esc(p.purpose || '—')}</td>
                    <td><span class="adm-badge ${p.status === 'completed' ? 'ok' : p.status === 'failed' ? 'err' : 'warn'}">${esc(p.status)}</span></td>
                    <td>${esc(new Date(p.created_at).toLocaleDateString())}</td>
                </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--aic-muted)">No payments yet.</td></tr>';
        }

        async function loadPrayers() {
            const { data, error } = await supabase.from('prayer_requests').select('*').order('created_at', { ascending: false }).limit(200);
            const tbody = document.querySelector('#prayersTable tbody');
            if (error) { tbody.innerHTML = `<tr><td colspan="5">${esc(error.message)}</td></tr>`; return; }
            tbody.innerHTML = (data || []).map(p => `
                <tr>
                    <td>${esc(p.display_name || 'Anonymous')}</td>
                    <td>${esc(p.category || '—')}</td>
                    <td style="max-width:340px">${esc((p.request_text || '').slice(0, 160))}</td>
                    <td>${p.is_approved ? '<span class="adm-badge ok">Approved</span>' : '<span class="adm-badge warn">Pending</span>'}</td>
                    <td class="adm-actions">
                        ${!p.is_approved ? `<button data-approve="${esc(p.id)}">Approve</button>` : ''}
                        <button class="danger" data-del-prayer="${esc(p.id)}">Delete</button>
                    </td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--aic-muted)">No prayer requests.</td></tr>';

            tbody.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
                await supabase.from('prayer_requests').update({ is_approved: true }).eq('id', b.dataset.approve);
                loadPrayers();
            }));
            tbody.querySelectorAll('[data-del-prayer]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm('Delete this prayer request?')) return;
                await supabase.from('prayer_requests').delete().eq('id', b.dataset.delPrayer);
                loadPrayers();
            }));
        }

        function loadAll() { loadInquiries(); loadPayments(); loadPrayers(); }

        supabase?.auth.onAuthStateChange(() => boot());
        boot();
    