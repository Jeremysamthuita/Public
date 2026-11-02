import {isSupabaseConfigured, supabase} from '../supabaseClient.js';

const root = document.documentElement;
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signInButton = document.getElementById('signInButton');
const forgotButton = document.getElementById('forgotPasswordButton');
const loginStatus = document.getElementById('loginStatus');
const resetForm = document.getElementById('resetForm');
const resetStatus = document.getElementById('resetStatus');
const mfaPanel = document.getElementById('mfaPanel');
const mfaStatus = document.getElementById('mfaStatus');
const FAILED_ATTEMPTS_KEY = 'aic-admin-login-attempts';

function showStatus(element, message, kind = '') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function revealPage() {
  root.classList.remove('auth-checking');
}

function showPasswordReset() {
  loginForm.hidden = true;
  forgotButton.hidden = true;
  resetForm.hidden = false;
  mfaPanel.hidden = true;
  document.getElementById('newPassword').focus();
}

function displayFriendlyError(error) {
  if (error?.status === 429 || /rate limit/i.test(error?.message || '')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (/network|fetch/i.test(error?.message || '')) return 'We could not reach the sign-in service. Check your connection and try again.';
  return 'We could not complete that request. Check your details and try again.';
}

async function getAccessToken() {
  const {data, error} = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Please sign in again.');
  return data.session.access_token;
}

function failedAttemptState() {
  try { return JSON.parse(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '{"count":0,"until":0}'); }
  catch { return {count:0,until:0}; }
}
function saveFailedAttempt(count, until = 0) {
  try { localStorage.setItem(FAILED_ATTEMPTS_KEY,JSON.stringify({count,until})); } catch {}
}
function wait(ms) { return new Promise(resolve => window.setTimeout(resolve,ms)); }

async function verifyAdminSession() {
  const token = await getAccessToken();
  const response = await fetch('/.netlify/functions/admin-session', {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) throw Object.assign(new Error(result.error || 'No access'), {noAccess: true});
    throw new Error(result.error || 'Session verification failed');
  }
  return result;
}

function redirectForRole(profile) {
  window.location.replace(profile.role === 'admin' ? '/admin/console.html' : '/admin/dashboard.html');
}

async function continueWithSession() {
  const profile = await verifyAdminSession();
  if (profile.mfaRequired) {
    await beginAdminMfa();
    return;
  }
  redirectForRole(profile);
}

async function beginAdminMfa() {
  loginForm.hidden = true;
  forgotButton.hidden = true;
  resetForm.hidden = true;
  mfaPanel.hidden = false;
  const qr = document.getElementById('mfaQr');
  const instructions = document.getElementById('mfaInstructions');
  const {data, error} = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const verified = (data.totp || []).find(factor => factor.status === 'verified');
  let factorId = verified?.id;
  if (factorId) {
    instructions.textContent = 'Open your authenticator app and enter the current code for this account.';
    qr.hidden = true;
  } else {
    for (const factor of data.totp || []) {
      if (factor.status === 'unverified') await supabase.auth.mfa.unenroll({factorId: factor.id});
    }
    const enrollment = await supabase.auth.mfa.enroll({factorType: 'totp', friendlyName: 'AIC Chapel Admin'});
    if (enrollment.error) throw enrollment.error;
    factorId = enrollment.data.totp.id;
    qr.src = enrollment.data.totp.qr_code;
    qr.hidden = false;
    instructions.textContent = 'Scan this code with an authenticator app, then enter the 6-digit code it shows.';
  }

  document.getElementById('verifyMfaButton').onclick = async event => {
    const button = event.currentTarget;
    const code = document.getElementById('mfaCode').value.trim();
    if (!/^\d{6}$/.test(code)) {
      showStatus(mfaStatus, 'Enter the 6-digit code from your authenticator app.', 'error');
      return;
    }
    button.disabled = true;
    showStatus(mfaStatus, 'Checking your code…');
    try {
      const challenge = await supabase.auth.mfa.challenge({factorId});
      if (challenge.error) throw challenge.error;
      const result = await supabase.auth.mfa.verify({factorId, challengeId: challenge.data.id, code});
      if (result.error) throw result.error;
      showStatus(mfaStatus, 'Verified. Opening your dashboard…');
      const profile = await verifyAdminSession();
      redirectForRole(profile);
    } catch {
      showStatus(mfaStatus, 'That code was not accepted. Check the time on your phone and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById('mfaCode').focus();
}

async function handleSignedInSession() {
  try {
    await continueWithSession();
  } catch (error) {
    if (error.noAccess) {
      await supabase.auth.signOut();
      showStatus(loginStatus, 'Your account does not have access. Please contact the website administrator.', 'error');
      return;
    }
    throw error;
  }
}

for (const button of document.querySelectorAll('[data-toggle-password]')) {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
  });
}

if (!supabase || !isSupabaseConfigured()) {
  showStatus(loginStatus, 'Sign-in is not set up on this website yet. Please contact the website administrator.', 'error');
  signInButton.disabled = true;
  forgotButton.disabled = true;
  revealPage();
} else {
  const params = new URLSearchParams(window.location.search);
  const notice = params.get('notice');
  const noticeText = {
    timeout:'You were signed out after a period of inactivity. Sign in again when ready.',
    'no-access':'Your account does not have access. Please contact the website administrator.',
    unavailable:'Admin sign-in is temporarily unavailable. Please try again shortly.'
  };
  if (noticeText[notice]) showStatus(loginStatus,noticeText[notice],notice==='no-access'?'error':'');
  if (params.get('flow')==='forgot') {
    showStatus(loginStatus,'Enter your email address, then choose “Forgot password?”.');
    emailInput.focus();
  }
  supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      window.setTimeout(showPasswordReset, 0);
    }
  });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const priorAttempts = failedAttemptState();
    if (priorAttempts.until > Date.now()) {
      const seconds = Math.ceil((priorAttempts.until - Date.now())/1000);
      showStatus(loginStatus,`Too many attempts. Wait ${seconds} seconds, then try again.`, 'error');
      return;
    }
    signInButton.disabled = true;
    showStatus(loginStatus, 'Signing in…');
    try {
      const {error} = await supabase.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });
      if (error) {
        if (/invalid login credentials/i.test(error.message || '')) {
          const count = priorAttempts.count + 1;
          const cooldown = count >= 6 ? Date.now() + 60_000 : 0;
          saveFailedAttempt(count,cooldown);
          if(count===6){
            fetch('/.netlify/functions/admin-login-attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:emailInput.value.trim()}),cache:'no-store'}).catch(()=>{});
          }
          await wait(Math.min(300 * (2 ** Math.min(count - 1,4)),5000));
        }
        showStatus(loginStatus, 'Email or password is incorrect. Try again or reset your password.', 'error');
      } else {
        saveFailedAttempt(0,0);
        await handleSignedInSession();
      }
    } catch (error) {
      showStatus(loginStatus, error.noAccess
        ? 'Your account does not have access. Please contact the website administrator.'
        : displayFriendlyError(error), 'error');
    } finally {
      signInButton.disabled = false;
    }
  });

  forgotButton.addEventListener('click', async () => {
    if (!emailInput.reportValidity()) return;
    forgotButton.disabled = true;
    showStatus(loginStatus, 'Requesting a password reset…');
    try {
      const {error} = await supabase.auth.resetPasswordForEmail(emailInput.value.trim(), {
        redirectTo: `${window.location.origin}/admin/`
      });
      showStatus(loginStatus, error
        ? displayFriendlyError(error)
        : 'If an account matches that email, a reset link will arrive shortly.');
    } catch (error) {
      showStatus(loginStatus, displayFriendlyError(error), 'error');
    } finally {
      forgotButton.disabled = false;
    }
  });

  resetForm.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    if (password !== document.getElementById('confirmPassword').value) {
      showStatus(resetStatus, 'The passwords do not match.', 'error');
      return;
    }
    const button = document.getElementById('savePasswordButton');
    button.disabled = true;
    showStatus(resetStatus, 'Saving your new password…');
    try {
      const {error} = await supabase.auth.updateUser({password});
      if (error) throw error;
      showStatus(resetStatus, 'Password saved. Opening your dashboard…');
      await handleSignedInSession();
    } catch (error) {
      showStatus(resetStatus, displayFriendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  try {
    const {data} = await supabase.auth.getSession();
    const recoveryFlow=params.get('flow')==='reset'||window.location.hash.includes('type=recovery');
    if(recoveryFlow){
      if(window.location.hash.includes('type=recovery')) showPasswordReset();
      else showStatus(loginStatus,'Open the password reset link from your email to choose a new password.','error');
    }else if (data.session) await handleSignedInSession();
  } catch (error) {
    if (error.noAccess) await supabase.auth.signOut();
  } finally {
    revealPage();
  }
}
