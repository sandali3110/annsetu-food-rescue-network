/* Log in and create account */

const params = new URLSearchParams(location.search);
const loginForm = $('#login-form');
const registerForm = $('#register-form');
let picker;
let pickedLocation = null;

function goToDashboard(user) {
  const next = params.get('next');
  location.href = next && next.startsWith('/') ? next : user.role === 'donor' ? '/donor' : '/rescue';
}

function updateRoleCopy() {
  const role = registerForm.elements.role.value;
  $('#org-label').textContent = role === 'donor' ? 'Business name' : 'NGO or group name';
  $('#r-org').placeholder = role === 'donor' ? 'Hotel Saffron Kitchen' : 'Annapurna Seva Trust';
  $('#address-label').textContent = role === 'donor' ? 'Pickup address' : 'Address of your base';
  $('#pin-label').textContent = role === 'donor' ? 'Pin your kitchen' : 'Pin your base, so we can show food near you';
}

async function ensurePicker() {
  if (picker) {
    picker.map.invalidateSize();
    return;
  }
  const { city } = await api('/config');
  picker = Maps.picker($('#register-map'), city, (loc) => {
    pickedLocation = loc;
  });
  pickedLocation = null; // the user must confirm by clicking, dragging or locating
  setTimeout(() => picker.map.invalidateSize(), 50);
}

function showTab(mode) {
  const isLogin = mode !== 'register';
  $('#tab-login').setAttribute('aria-selected', String(isLogin));
  $('#tab-register').setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  $('#auth-heading').textContent = isLogin ? 'Welcome back.' : 'Join AnnSetu.';
  $('#auth-sub').textContent = isLogin
    ? 'Log in to post food or find food to collect.'
    : 'Kitchens post extra food. NGOs and volunteers collect it. It’s free for both.';
  if (!isLogin) ensurePicker();
}

$('#tab-login').addEventListener('click', () => showTab('login'));
$('#tab-register').addEventListener('click', () => showTab('register'));
$$('[data-switch]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.switch)));

$$('[data-demo]').forEach((btn) =>
  btn.addEventListener('click', () => {
    showTab('login');
    loginForm.elements.email.value = btn.dataset.demo;
    loginForm.elements.password.value = 'demo1234';
    loginForm.requestSubmit();
  })
);

registerForm.addEventListener('change', (e) => {
  if (e.target.name === 'role') updateRoleCopy();
});

$('#locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Your browser can’t share its location. Click the map instead.');
  const btn = $('#locate-btn');
  btn.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      picker.set(pos.coords.latitude, pos.coords.longitude);
      btn.textContent = 'Use my current location';
    },
    () => {
      toast('Couldn’t get your location. Click the map to drop the pin instead.');
      btn.textContent = 'Use my current location';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(loginForm);
  const button = $('button[type="submit"]', loginForm);
  setBusy(button, true, 'Logging in…');
  try {
    const { user } = await post('/auth/login', Object.fromEntries(new FormData(loginForm)));
    goToDashboard(user);
  } catch (err) {
    showErrors(loginForm, err);
    setBusy(button, false);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(registerForm);
  const data = Object.fromEntries(new FormData(registerForm));
  if (pickedLocation) Object.assign(data, pickedLocation);
  const button = $('button[type="submit"]', registerForm);
  setBusy(button, true, 'Creating account…');
  try {
    const { user } = await post('/auth/register', data);
    goToDashboard(user);
  } catch (err) {
    showErrors(registerForm, err);
    setBusy(button, false);
  }
});

(async () => {
  const user = await initPage();
  if (user) return goToDashboard(user);
  const role = params.get('role');
  if (role === 'donor' || role === 'rescuer') registerForm.elements.role.value = role;
  updateRoleCopy();
  showTab(params.get('mode'));
})();
