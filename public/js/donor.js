/* Donor dashboard: post food, confirm handovers, see history */

let user;
let listings = [];
let picker;
let pin = null;

const ACTIVE = ['claimed', 'available', 'picked_up'];

function donorCard(l) {
  let body = '';
  if (l.status === 'available') {
    body = `
      ${freshnessBar(l)}
      <div class="card-foot">
        <p class="muted">Visible to NGOs and volunteers nearby.</p>
        <button type="button" class="btn btn-quiet-danger btn-small" data-cancel="${l.id}">Cancel listing</button>
      </div>`;
  } else if (l.status === 'claimed') {
    const phone = esc(l.rescuer.phone);
    body = `
      ${freshnessBar(l)}
      <div class="notice">
        <p><strong>${esc(l.rescuer.name)}</strong> from ${esc(l.rescuer.orgName)} is coming around <strong>${fmt.time(l.pickupEta)}</strong>.</p>
        <p><a href="tel:${phone.replace(/\s/g, '')}">Call ${phone}</a></p>
      </div>
      <form class="handover" data-id="${l.id}" novalidate>
        <label for="code-${l.id}">When they arrive, enter the 4-digit code from their app</label>
        <div class="handover-row">
          <input id="code-${l.id}" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]{4}" placeholder="0000" required>
          <button class="btn btn-primary" type="submit">Confirm handover</button>
        </div>
      </form>`;
  } else if (l.status === 'picked_up') {
    body = `<p class="notice notice-done">Handed to ${esc(l.rescuer.orgName)} at ${fmt.time(l.pickedUpAt)}. They’ll confirm once it reaches people.</p>`;
  }
  return `
    <li class="card card-${l.status}">
      <div class="card-top">
        ${foodTag(l.foodType)}
        ${statusPill(l.status)}
      </div>
      <h3 class="card-title">${esc(l.title)}</h3>
      <p class="card-meta">${fmt.meals(l.servings)} <span aria-hidden="true">/</span> posted ${fmt.dayTime(l.createdAt).toLowerCase()}</p>
      ${body}
    </li>`;
}

function historyRow(l) {
  const outcome = {
    delivered: `Fed ${fmt.number(l.peopleServed)} people via ${esc(l.rescuer?.orgName || 'a rescuer')}`,
    expired: 'Nobody could collect it in time',
    cancelled: 'You cancelled this listing',
  }[l.status];
  return `
    <li>
      <span class="h-date">${fmt.day(l.createdAt)}</span>
      <span class="h-title">${esc(l.title)}</span>
      <span class="h-servings">${fmt.meals(l.servings)}</span>
      <span class="h-outcome">${statusPill(l.status)} <span class="muted">${outcome}</span></span>
    </li>`;
}

function render() {
  const rescued = listings.filter((l) => l.status === 'picked_up' || l.status === 'delivered');
  $('#d-meals').textContent = fmt.number(rescued.reduce((sum, l) => sum + l.servings, 0));
  $('#d-people').textContent = fmt.number(listings.reduce((sum, l) => sum + (l.peopleServed || 0), 0));

  const active = listings
    .filter((l) => ACTIVE.includes(l.status))
    .sort((a, b) => ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status));
  const history = listings.filter((l) => !ACTIVE.includes(l.status));

  $('#d-active').textContent = active.filter((l) => l.status !== 'picked_up').length;
  $('#active-list').innerHTML = active.map(donorCard).join('');
  $('#active-empty').hidden = active.length > 0;
  $('#history-list').innerHTML = history.map(historyRow).join('');
  $('#history-empty').hidden = history.length > 0;
  updateFreshness();
}

async function load() {
  // Don't redraw while the donor is typing a pickup code
  if (document.activeElement && document.activeElement.closest('.handover')) return;
  try {
    listings = await api('/listings/mine');
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- Post food dialog ---------- */

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function safeUntilValue() {
  const form = $('#listing-form');
  const choice = form.elements.safeFor.value;
  if (choice === 'custom') {
    const v = $('#f-safe-until').value;
    return v ? new Date(v).toISOString() : '';
  }
  return new Date(Date.now() + Number(choice) * 60 * 1000).toISOString();
}

function updateSafeSummary() {
  const form = $('#listing-form');
  const custom = form.elements.safeFor.value === 'custom';
  $('#custom-time-field').hidden = !custom;
  const iso = safeUntilValue();
  $('#safe-summary').textContent = iso ? `Rescuers will see it as safe until ${fmt.dayTime(iso).toLowerCase()}.` : '';
}

function openListingDialog() {
  const form = $('#listing-form');
  form.reset();
  clearErrors(form);
  form.elements.pickupAddress.value = user.address;
  $('#f-safe-until').value = toLocalInput(Date.now() + 3 * 60 * 60 * 1000);
  $('#f-safe-until').min = toLocalInput(Date.now() + 30 * 60 * 1000);
  updateSafeSummary();
  pin = { lat: user.lat, lng: user.lng };
  $('#listing-dialog').showModal();
  if (!picker) {
    picker = Maps.picker($('#listing-map'), pin, (loc) => (pin = loc));
  }
  setTimeout(() => {
    picker.map.invalidateSize();
    picker.set(user.lat, user.lng);
  }, 60);
  form.elements.title.focus();
}

$('#listing-form').addEventListener('change', updateSafeSummary);
$('#f-safe-until').addEventListener('input', updateSafeSummary);

$('#listing-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  delete data.safeFor;
  data.servings = Number(data.servings);
  data.safeUntil = safeUntilValue();
  Object.assign(data, pin);
  const button = $('button[type="submit"]', form);
  setBusy(button, true, 'Posting…');
  try {
    const listing = await post('/listings', data);
    $('#listing-dialog').close();
    toast(`Posted. Rescuers nearby can now see your ${fmt.meals(listing.servings)}.`);
    await load();
  } catch (err) {
    showErrors(form, err);
  } finally {
    setBusy(button, false);
  }
});

/* ---------- Card actions ---------- */

$('#active-list').addEventListener('submit', async (e) => {
  const form = e.target.closest('.handover');
  if (!form) return;
  e.preventDefault();
  const code = form.elements.code.value.trim();
  if (!/^\d{4}$/.test(code)) {
    toast('Enter the 4-digit code shown in the rescuer’s app.', 'error');
    form.elements.code.focus();
    return;
  }
  const button = $('button', form);
  setBusy(button, true, 'Checking…');
  try {
    const listing = await post(`/listings/${form.dataset.id}/pickup`, { code });
    form.elements.code.blur();
    toast(`Handover confirmed. Thank you for donating ${fmt.meals(listing.servings)}.`);
    await load();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(button, false);
    form.elements.code.select();
  }
});

$('#active-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cancel]');
  if (!btn) return;
  if (!confirm('Cancel this listing? Rescuers will no longer see it.')) return;
  try {
    await post(`/listings/${btn.dataset.cancel}/cancel`);
    toast('Listing cancelled.');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#new-listing-btn').addEventListener('click', openListingDialog);
$$('[data-new-listing]').forEach((b) => b.addEventListener('click', openListingDialog));

(async () => {
  user = await initPage({ role: 'donor' });
  $('#dash-kicker').textContent = user.orgName;
  await load();
  startTicker();
  setInterval(load, 15000);
  if (new URLSearchParams(location.search).get('new')) openListingDialog();
})();
