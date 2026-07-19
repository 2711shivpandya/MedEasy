/* ================================================================
   MedEasy — Auth Page Logic
   - Tab switching (sign in / sign up)
   - API calls to backend
   - JWT storage + auth guard
   - Password strength meter
   - Animated particles
   ================================================================ */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3001';

// ── If already logged in, redirect to dashboard ───────────────────────────
(function guardAuth() {
  const token = localStorage.getItem('medeasy_token');
  if (token) {
    // Quickly verify token isn't expired by decoding payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 > Date.now()) {
        window.location.href = 'index.html';
        return;
      }
    } catch (_) {}
    // Token invalid/expired — clear it
    localStorage.removeItem('medeasy_token');
    localStorage.removeItem('medeasy_user');
  }
})();

// ── DOM refs ──────────────────────────────────────────────────────────────
const tabSignin    = document.getElementById('tab-signin');
const tabSignup    = document.getElementById('tab-signup');
const tabSlider    = document.getElementById('tab-slider');
const formSignin   = document.getElementById('form-signin');
const formSignup   = document.getElementById('form-signup');
const authAlert    = document.getElementById('auth-alert');

const btnSignin    = document.getElementById('btn-signin');
const btnSignup    = document.getElementById('btn-signup');

// ── Particle background ───────────────────────────────────────────────────
(function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const count = window.innerWidth > 768 ? 40 : 20;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size  = Math.random() * 2 + 1;
    const dur   = Math.random() * 20 + 15;
    const delay = Math.random() * 20;
    const left  = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 100;
    p.style.cssText = `
      left: ${left}%;
      width: ${size}px; height: ${size}px;
      animation-duration: ${dur}s;
      animation-delay: -${delay}s;
      --drift: ${drift}px;
      opacity: ${Math.random() * 0.5 + 0.1};
    `;
    container.appendChild(p);
  }
})();

// ── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type = 'error') {
  const icon = type === 'error' ? '⚠️' : '✅';
  authAlert.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  authAlert.className = `auth-alert ${type} show`;
  authAlert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearAlert() {
  authAlert.className = 'auth-alert';
  authAlert.innerHTML = '';
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchToTab(tab) {
  clearAlert();
  if (tab === 'signin') {
    tabSignin.classList.add('active'); tabSignin.setAttribute('aria-selected', 'true');
    tabSignup.classList.remove('active'); tabSignup.setAttribute('aria-selected', 'false');
    tabSlider.classList.remove('right');
    formSignin.classList.add('active');
    formSignup.classList.remove('active');
    formSignin.style.animation = 'none';
    requestAnimationFrame(() => { formSignin.style.animation = ''; });
  } else {
    tabSignup.classList.add('active'); tabSignup.setAttribute('aria-selected', 'true');
    tabSignin.classList.remove('active'); tabSignin.setAttribute('aria-selected', 'false');
    tabSlider.classList.add('right');
    formSignup.classList.add('active');
    formSignin.classList.remove('active');
    formSignup.style.animation = 'none';
    requestAnimationFrame(() => { formSignup.style.animation = ''; });
  }
}

tabSignin.addEventListener('click', () => switchToTab('signin'));
tabSignup.addEventListener('click', () => switchToTab('signup'));
document.getElementById('switch-to-signup').addEventListener('click', () => switchToTab('signup'));
document.getElementById('switch-to-signin').addEventListener('click', () => switchToTab('signin'));

// ── Password visibility toggles ────────────────────────────────────────────
function setupToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    btn.querySelector('.eye-icon').style.opacity = isHidden ? '0.5' : '1';
  });
}
setupToggle('toggle-pw-signin', 'signin-password');
setupToggle('toggle-pw-signup', 'signup-password');

// ── Password strength meter ────────────────────────────────────────────────
const pwInput   = document.getElementById('signup-password');
const pwBar     = document.getElementById('pw-strength-bar');
const pwLabel   = document.getElementById('pw-strength-label');

function calcStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0–5
}

pwInput.addEventListener('input', () => {
  const pw = pwInput.value;
  if (!pw) { pwBar.style.width = '0%'; pwLabel.textContent = ''; return; }
  const score = calcStrength(pw);
  const levels = [
    { label: 'Too short',  color: '#ef4444', pct: '15%' },
    { label: 'Weak',       color: '#f59e0b', pct: '30%' },
    { label: 'Fair',       color: '#eab308', pct: '50%' },
    { label: 'Good',       color: '#22c55e', pct: '75%' },
    { label: 'Strong',     color: '#10b981', pct: '100%' },
    { label: '✅ Excellent', color: '#06b6d4', pct: '100%' },
  ];
  const lvl = levels[Math.min(score, 5)];
  pwBar.style.width    = lvl.pct;
  pwBar.style.background = lvl.color;
  pwLabel.textContent  = lvl.label;
  pwLabel.style.color  = lvl.color;
});

// ── Button loading state ───────────────────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── API helper ────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ── Persist auth ──────────────────────────────────────────────────────────
function persistAuth(token, user) {
  localStorage.setItem('medeasy_token', token);
  localStorage.setItem('medeasy_user', JSON.stringify(user));
}

// ── SIGN IN ────────────────────────────────────────────────────────────────
formSignin.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;

  if (!email || !password) {
    showAlert('Please fill in all fields.');
    return;
  }

  setLoading(btnSignin, true);
  try {
    const data = await apiPost('/api/auth/login', { email, password });
    persistAuth(data.token, data.user);
    showAlert('Welcome back! Redirecting…', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  } catch (err) {
    showAlert(err.message);
    setLoading(btnSignin, false);
  }
});

// ── SIGN UP ────────────────────────────────────────────────────────────────
formSignup.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm  = document.getElementById('signup-confirm').value;
  const terms    = document.getElementById('signup-terms').checked;

  // Client-side validation
  if (!name || !email || !password || !confirm) {
    showAlert('Please fill in all fields.'); return;
  }
  if (password.length < 8) {
    showAlert('Password must be at least 8 characters.'); return;
  }
  if (password !== confirm) {
    showAlert('Passwords do not match.'); return;
  }
  if (!terms) {
    showAlert('Please accept the Terms of Service to continue.'); return;
  }

  setLoading(btnSignup, true);
  try {
    const data = await apiPost('/api/auth/register', { name, email, password });
    persistAuth(data.token, data.user);
    showAlert('Account created! Redirecting…', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  } catch (err) {
    showAlert(err.message);
    setLoading(btnSignup, false);
  }
});

// ── Google sign-in placeholder ──────────────────────────────────────────────
document.getElementById('btn-google-signin').addEventListener('click', () => {
  showAlert('Google sign-in coming soon! Use email/password for now.', 'error');
});

// ── Forgot password placeholder ─────────────────────────────────────────────
document.getElementById('forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  showAlert('Password reset coming soon! Please contact support.', 'error');
});
