import {supabase, isSupabaseConfigured} from '../supabaseClient.js';

const html = document.documentElement;
let idleTimer = null;
let warningTimer = null;
let remainingTimer = null;
let currentProfile = null;

export function setStatus(element, message, kind = '') {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

export async function requestFunction(name, {method = 'GET', body, query = {}} = {}) {
  if (!supabase) throw new Error('Admin sign-in is not configured.');
  const {data} = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const url = new URL(`/.netlify/functions/${name}`, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    await supabase.auth.signOut();
    window.location.replace('/admin/');
  }
  if (!response.ok) {
    const error = new Error(result.error || 'We could not complete that request. Try again.');
    error.status = response.status;
    error.details = currentProfile?.role === 'admin' ? result.details : undefined;
    throw error;
  }
  return result;
}

function stopTimers() {
  clearTimeout(idleTimer);
  clearTimeout(warningTimer);
  clearInterval(remainingTimer);
}

async function signOutForIdle() {
  stopTimers();
  await supabase.auth.signOut();
  window.location.replace('/admin/?notice=timeout');
}

function startIdleTimer() {
  stopTimers();
  const timeoutMs = currentProfile.role === 'admin' ? 30 * 60_000 : 60 * 60_000;
  const warning = document.getElementById('idleWarning');
  const countdown = document.getElementById('idleCountdown');
  warningTimer = setTimeout(() => {
    if (!warning) return signOutForIdle();
    warning.hidden = false;
    let seconds = 120;
    countdown.textContent = String(seconds);
    remainingTimer = setInterval(() => {
      seconds -= 1;
      countdown.textContent = String(Math.max(seconds, 0));
      if (seconds <= 0) signOutForIdle();
    }, 1000);
  }, timeoutMs - 120_000);
  idleTimer = setTimeout(signOutForIdle, timeoutMs);
}

function enableActivityTracking() {
  const reset = () => {
    const warning = document.getElementById('idleWarning');
    if (warning) warning.hidden = true;
    startIdleTimer();
  };
  for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(eventName, reset, {passive: true});
  }
  document.getElementById('staySignedIn')?.addEventListener('click', () => {
    document.getElementById('idleWarning').hidden = true;
    startIdleTimer();
  });
  startIdleTimer();
}

export async function protectAdminPage({adminOnly = false} = {}) {
  const showLogin = notice => {
    window.location.replace(`/admin/${notice ? `?notice=${encodeURIComponent(notice)}` : ''}`);
  };
  if (!supabase || !isSupabaseConfigured()) {
    html.classList.remove('auth-checking');
    showLogin('unavailable');
    return null;
  }
  try {
    const {data} = await supabase.auth.getSession();
    if (!data.session) {
      showLogin('signed-out');
      return null;
    }
    const profile = await requestFunction('admin-session', {method: 'POST', body: {}});
    if (profile.mfaRequired) {
      showLogin('mfa');
      return null;
    }
    if (!['admin', 'editor'].includes(profile.role) || (adminOnly && profile.role !== 'admin')) {
      if (profile.role === 'editor' && adminOnly) {
        window.location.replace('/admin/dashboard.html');
      } else {
        await supabase.auth.signOut();
        showLogin('no-access');
      }
      return null;
    }
    currentProfile = profile;
    document.querySelectorAll('[data-admin-name]').forEach(element => {
      element.textContent = profile.displayName || 'Admin';
    });
    document.getElementById('signOutButton')?.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.replace('/admin/');
    });
    enableActivityTracking();
    html.classList.remove('auth-checking');
    return profile;
  } catch {
    await supabase.auth.signOut();
    showLogin('unavailable');
    return null;
  }
}

export {supabase};
