/* Shared helpers used by every page */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ---------- API ---------- */

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed with status ${res.status}.`);
    error.status = res.status;
    error.fields = data.fields;
    throw error;
  }
  return data;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

/* ---------- Formatting ---------- */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmt = {
  time: (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  day(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  },
  dayTime: (iso) => `${fmt.day(iso)}, ${fmt.time(iso)}`,
  number: (n) => Number(n || 0).toLocaleString('en-IN'),
  km: (d) => (d < 1 ? `${Math.round(d * 1000)} m away` : `${d} km away`),
  meals: (n) => `${fmt.number(n)} ${n === 1 ? 'meal' : 'meals'}`,
};

/* ---------- Freshness countdown (the draining bar on every food card) ---------- */

function freshness(safeUntil, createdAt) {
  const end = Date.parse(safeUntil);
  const start = Date.parse(createdAt);
  const left = end - Date.now();
  const fraction = Math.max(0, Math.min(1, left / Math.max(1, end - start)));
  const minutes = left / 60000;
  const level = left <= 0 ? 'gone' : minutes < 60 ? 'urgent' : minutes < 150 ? 'soon' : 'fresh';
  return { left, fraction, level };
}

function timeLeftLabel(ms) {
  if (ms <= 0) return 'Past its safe time';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m left`;
  return `${m}m ${String(s).padStart(2, '0')}s left`;
}

function freshnessBar(listing) {
  return `
    <div class="fresh" data-safe-until="${esc(listing.safeUntil)}" data-created-at="${esc(listing.createdAt)}">
      <div class="fresh-track"><div class="fresh-fill"></div></div>
      <p class="fresh-label"><span class="fresh-left"></span><span class="fresh-until">Safe until ${fmt.time(listing.safeUntil)}</span></p>
    </div>`;
}

function updateFreshness(root = document) {
  $$('.fresh', root).forEach((el) => {
    const f = freshness(el.dataset.safeUntil, el.dataset.createdAt);
    el.dataset.level = f.level;
    $('.fresh-fill', el).style.transform = `scaleX(${f.fraction})`;
    $('.fresh-left', el).textContent = timeLeftLabel(f.left);
  });
}

let tickerStarted = false;
function startTicker() {
  updateFreshness();
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => updateFreshness(), 1000);
}

/* ---------- Small UI pieces ---------- */

const FOOD_TYPES = {
  veg: { label: 'Veg', icons: ['veg'] },
  'non-veg': { label: 'Non-veg', icons: ['nonveg'] },
  mixed: { label: 'Veg and non-veg', icons: ['veg', 'nonveg'] },
};

// The square symbols printed on Indian food packets
function foodSymbol(kind) {
  const inner = kind === 'veg'
    ? '<circle cx="8" cy="8" r="3.6"/>'
    : '<path d="M8 3.8 12.2 11.4H3.8z"/>';
  return `<svg class="food-symbol food-symbol-${kind}" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="1.5"/>${inner}</svg>`;
}

function foodTag(type, { showLabel = true } = {}) {
  const t = FOOD_TYPES[type] || FOOD_TYPES.mixed;
  const label = showLabel ? `<span>${t.label}</span>` : `<span class="visually-hidden">${t.label}</span>`;
  return `<span class="food-tag">${t.icons.map(foodSymbol).join('')}${label}</span>`;
}

const STATUS = {
  available: 'Waiting for pickup',
  claimed: 'Rescuer on the way',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
const statusPill = (status) => `<span class="status status-${status}">${STATUS[status] || status}</span>`;

let toastTimer;
function toast(message, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3800);
}

/* ---------- Forms ---------- */

function clearErrors(form) {
  $$('[data-error-for]', form).forEach((el) => (el.textContent = ''));
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  const general = $('.form-error', form);
  if (general) general.textContent = '';
}

function showErrors(form, error) {
  const fields = error.fields || {};
  let first = null;
  for (const [name, message] of Object.entries(fields)) {
    const slot = $(`[data-error-for="${name}"]`, form);
    if (slot) slot.textContent = message;
    const input = form.elements[name];
    if (input && input.setAttribute) {
      input.setAttribute('aria-invalid', 'true');
      first = first || input;
    }
  }
  const general = $('.form-error', form);
  if (!Object.keys(fields).length && general) general.textContent = error.message;
  if (first) first.focus();
}

function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

/* ---------- Dialogs ---------- */

function wireDialogs() {
  $$('dialog').forEach((dialog) => {
    if (dialog.dataset.wired) return;
    dialog.dataset.wired = 'true';
    $$('[data-close]', dialog).forEach((btn) => btn.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dialog.close();
    });
  });
}

/* ---------- Page setup: header and login check ---------- */

function dashboardPath(user) {
  return user.role === 'donor' ? '/donor' : '/rescue';
}

function renderNav(user) {
  const nav = $('#nav');
  if (!nav) return;
  if (user) {
    nav.innerHTML = `
      <a class="nav-link" href="/#map">Live map</a>
      <a class="nav-link nav-dashboard" href="${dashboardPath(user)}">${user.role === 'donor' ? 'My donations' : 'Find food'}</a>
      <span class="nav-org" title="${esc(user.email)}">${esc(user.orgName)}</span>
      <button class="btn btn-ghost btn-small" type="button" id="logout-btn">Log out</button>`;
    $('#logout-btn').addEventListener('click', async () => {
      await post('/auth/logout').catch(() => {});
      location.href = '/';
    });
  } else {
    nav.innerHTML = `
      <a class="nav-link" href="/#map">Live map</a>
      <a class="nav-link" href="/auth">Log in</a>
      <a class="btn btn-primary btn-small" href="/auth?mode=register">Join AnnSetu</a>`;
  }
}

/**
 * Loads the logged-in user, fills the header, and redirects when a page needs a specific role.
 * Returns the user (or null).
 */
async function initPage({ role } = {}) {
  wireDialogs();
  let user = null;
  try {
    ({ user } = await api('/auth/me'));
  } catch {
    /* treat as logged out */
  }
  if (role && (!user || user.role !== role)) {
    location.replace(user ? dashboardPath(user) : `/auth?next=${encodeURIComponent(location.pathname)}`);
    return new Promise(() => {}); // stop the page script while redirecting
  }
  renderNav(user);
  return user;
}
