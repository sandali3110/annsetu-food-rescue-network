/* Rescuer dashboard: find food on a map, claim it, collect and deliver */

const state = { available: [], mine: [], claiming: null };
let user;
let map;
let foodLayer;
const markers = new Map();

/* ---------- Find food ---------- */

function findCard(l) {
  return `
    <li class="card card-find" data-id="${l.id}">
      <div class="card-top">
        ${foodTag(l.foodType)}
        <span class="distance">${fmt.km(l.distanceKm)}</span>
      </div>
      <h3 class="card-title">${esc(l.title)}</h3>
      <p class="card-meta"><strong>${fmt.meals(l.servings)}</strong> from ${esc(l.donor.orgName)}</p>
      <p class="card-address">${esc(l.pickupAddress)}</p>
      ${l.description ? `<p class="card-notes">${esc(l.description)}</p>` : ''}
      ${freshnessBar(l)}
      <div class="card-foot">
        <button type="button" class="link-btn" data-show-on-map="${l.id}">Show on map</button>
        <button type="button" class="btn btn-primary" data-claim="${l.id}">Claim pickup</button>
      </div>
    </li>`;
}

function renderFind() {
  const list = state.available;
  $('#count-find').textContent = list.length;
  $('#find-list').innerHTML = list.map(findCard).join('');
  $('#find-empty').hidden = list.length > 0;
  const servings = list.reduce((sum, l) => sum + l.servings, 0);
  $('#find-status').textContent = list.length
    ? `${list.length} ${list.length === 1 ? 'pickup' : 'pickups'} waiting, enough for ${fmt.meals(servings)}`
    : '';

  foodLayer.clearLayers();
  markers.clear();
  list.forEach((l) => {
    const marker = L.marker([l.lat, l.lng], { icon: Maps.foodIcon(l), title: l.title })
      .bindPopup(
        `<div class="popup">
          <strong>${esc(l.title)}</strong>
          <span>${fmt.meals(l.servings)} from ${esc(l.donor.orgName)}</span>
          <span>${fmt.km(l.distanceKm)}, safe until ${fmt.time(l.safeUntil)}</span>
          <button type="button" class="btn btn-primary btn-small" data-claim="${l.id}">Claim pickup</button>
        </div>`
      )
      .addTo(foodLayer);
    markers.set(l.id, marker);
  });
  // On first load, zoom the map so every pin and your base are visible
  if (!state.fitted && list.length) {
    state.fitted = true;
    const points = list.map((l) => [l.lat, l.lng]).concat([[user.lat, user.lng]]);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
  }
  updateFreshness();
}

async function loadAvailable() {
  const params = new URLSearchParams({ sort: $('#filter-sort').value });
  if ($('#filter-type').value) params.set('foodType', $('#filter-type').value);
  if ($('#filter-km').value) params.set('maxKm', $('#filter-km').value);
  try {
    state.available = await api(`/listings/available?${params}`);
    renderFind();
  } catch (err) {
    $('#find-status').textContent = err.message;
  }
}

/* ---------- My pickups ---------- */

function mineCard(l) {
  const donorPhone = esc(l.donor.phone);
  if (l.status === 'claimed') {
    return `
      <li class="card card-claimed card-pickup">
        <div class="pickup-code">
          <span>Pickup code</span>
          <strong>${esc(l.pickupCode)}</strong>
        </div>
        <div class="pickup-info">
          <div class="card-top">${foodTag(l.foodType)}${statusPill('claimed')}</div>
          <h3 class="card-title">${esc(l.title)}</h3>
          <p class="card-meta"><strong>${fmt.meals(l.servings)}</strong>. You said you’d arrive around <strong>${fmt.time(l.pickupEta)}</strong>.</p>
          <p class="card-address">${esc(l.donor.orgName)}, ${esc(l.pickupAddress)}</p>
          <p class="card-meta">Ask for ${esc(l.donor.name)}: <a href="tel:${donorPhone.replace(/\s/g, '')}">${donorPhone}</a></p>
          ${l.description ? `<p class="card-notes">${esc(l.description)}</p>` : ''}
          ${freshnessBar(l)}
          <div class="card-foot">
            <button type="button" class="btn btn-quiet-danger btn-small" data-release="${l.id}">I can’t make it</button>
            <a class="btn btn-ghost" href="${Maps.directionsUrl(l.lat, l.lng)}" target="_blank" rel="noopener">Get directions</a>
          </div>
        </div>
      </li>`;
  }
  // picked_up
  return `
    <li class="card card-picked_up">
      <div class="card-top">${foodTag(l.foodType)}${statusPill('picked_up')}</div>
      <h3 class="card-title">${esc(l.title)}</h3>
      <p class="card-meta">Collected from ${esc(l.donor.orgName)} at ${fmt.time(l.pickedUpAt)}.</p>
      <form class="deliver" data-id="${l.id}" novalidate>
        <label for="people-${l.id}">Once it’s served, how many people did it feed?</label>
        <div class="handover-row">
          <input id="people-${l.id}" name="peopleServed" type="number" min="1" max="10000" inputmode="numeric" value="${l.servings}" required>
          <button class="btn btn-primary" type="submit">Mark as delivered</button>
        </div>
      </form>
    </li>`;
}

function renderMine() {
  const active = state.mine.filter((l) => l.status === 'claimed' || l.status === 'picked_up');
  const delivered = state.mine.filter((l) => l.status === 'delivered');
  const rescued = state.mine.filter((l) => l.status === 'picked_up' || l.status === 'delivered');

  $('#r-meals').textContent = fmt.number(rescued.reduce((sum, l) => sum + l.servings, 0));
  $('#r-people').textContent = fmt.number(delivered.reduce((sum, l) => sum + (l.peopleServed || 0), 0));
  $('#r-active').textContent = active.length;
  $('#count-mine').textContent = active.length || '';

  $('#mine-list').innerHTML = active.map(mineCard).join('');
  $('#mine-empty').hidden = active.length > 0;
  $('#mine-history-title').hidden = delivered.length === 0;
  $('#mine-history').innerHTML = delivered
    .map(
      (l) => `
      <li>
        <span class="h-date">${fmt.day(l.deliveredAt)}</span>
        <span class="h-title">${esc(l.title)}</span>
        <span class="h-servings">${fmt.meals(l.servings)}</span>
        <span class="h-outcome">${statusPill('delivered')} <span class="muted">Fed ${fmt.number(l.peopleServed)} people. From ${esc(l.donor.orgName)}</span></span>
      </li>`
    )
    .join('');
  updateFreshness();
}

async function loadMine() {
  if (document.activeElement && document.activeElement.closest('.deliver')) return;
  try {
    state.mine = await api('/listings/mine');
    renderMine();
  } catch (err) {
    toast(err.message, 'error');
  }
}

const refresh = () => Promise.all([loadAvailable(), loadMine()]);

/* ---------- Tabs ---------- */

function showTab(name) {
  const find = name !== 'mine';
  $('#tab-find').setAttribute('aria-selected', String(find));
  $('#tab-mine').setAttribute('aria-selected', String(!find));
  $('#panel-find').hidden = !find;
  $('#panel-mine').hidden = find;
  $('#dash-title').textContent = find ? 'Find food' : 'My pickups';
  history.replaceState(null, '', find ? '#find' : '#mine');
  if (find) setTimeout(() => map.invalidateSize(), 30);
}
$('#tab-find').addEventListener('click', () => showTab('find'));
$('#tab-mine').addEventListener('click', () => showTab('mine'));

/* ---------- Claim dialog ---------- */

const ETA_OPTIONS = [15, 30, 45, 60, 90];

function openClaim(id) {
  const l = state.available.find((x) => x.id === Number(id));
  if (!l) return;
  state.claiming = l;
  map.closePopup();
  $('#claim-step-choose').hidden = false;
  $('#claim-step-done').hidden = true;
  $('#claim-error').textContent = '';
  $('#claim-from').textContent = l.donor.orgName;
  $('#claim-title').textContent = l.title;
  $('#claim-summary').innerHTML = `
    <p class="card-meta"><strong>${fmt.meals(l.servings)}</strong>, ${fmt.km(l.distanceKm)}</p>
    <p class="card-address">${esc(l.pickupAddress)}</p>
    ${freshnessBar(l)}`;

  const minutesLeft = (Date.parse(l.safeUntil) - Date.now()) / 60000;
  const options = ETA_OPTIONS.filter((m) => m < minutesLeft);
  $('#eta-choices').innerHTML =
    '<legend>When will you reach the pickup point?</legend>' +
    (options.length
      ? options
          .map(
            (m, i) =>
              `<label><input type="radio" name="eta" value="${m}" ${i === Math.min(1, options.length - 1) ? 'checked' : ''}><span>${m < 60 ? `${m} min` : m === 60 ? '1 hour' : '1½ hours'}</span></label>`
          )
          .join('')
      : '<p class="muted">This food expires very soon. Only claim it if you can reach right away.</p><label><input type="radio" name="eta" value="5" checked><span>Leaving now</span></label>');
  $('#claim-confirm').disabled = false;
  $('#claim-dialog').showModal();
  updateFreshness($('#claim-dialog'));
}

$('#claim-confirm').addEventListener('click', async () => {
  const l = state.claiming;
  const minutes = Number($('input[name="eta"]:checked', $('#eta-choices'))?.value || 30);
  const button = $('#claim-confirm');
  setBusy(button, true, 'Claiming…');
  try {
    const claimed = await post(`/listings/${l.id}/claim`, {
      pickupEta: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    });
    $('#claim-step-choose').hidden = true;
    $('#claim-step-done').hidden = false;
    $('#claim-code').textContent = claimed.pickupCode;
    $('#claim-done-text').textContent = `${claimed.donor.name} at ${claimed.donor.orgName} knows you’re coming around ${fmt.time(claimed.pickupEta)}. You’ll also find this code under My pickups.`;
    $('#claim-directions').href = Maps.directionsUrl(claimed.lat, claimed.lng);
    refresh();
  } catch (err) {
    $('#claim-error').textContent = err.message;
    if (err.status === 409) refresh();
  } finally {
    setBusy(button, false);
  }
});

$('#claim-go-mine').addEventListener('click', () => {
  $('#claim-dialog').close();
  showTab('mine');
});

/* ---------- Clicks and forms inside lists ---------- */

document.addEventListener('click', async (e) => {
  const claimBtn = e.target.closest('[data-claim]');
  if (claimBtn) return openClaim(claimBtn.dataset.claim);

  const mapBtn = e.target.closest('[data-show-on-map]');
  if (mapBtn) {
    const marker = markers.get(Number(mapBtn.dataset.showOnMap));
    if (marker) {
      map.setView(marker.getLatLng(), 15);
      marker.openPopup();
      if (window.innerWidth < 900) $('#rescue-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const releaseBtn = e.target.closest('[data-release]');
  if (releaseBtn) {
    if (!confirm('Give up this pickup? The food goes back on the map for other rescuers.')) return;
    try {
      await post(`/listings/${releaseBtn.dataset.release}/release`);
      toast('Released. Other rescuers can claim it now.');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
});

$('#mine-list').addEventListener('submit', async (e) => {
  const form = e.target.closest('.deliver');
  if (!form) return;
  e.preventDefault();
  const people = Number(form.elements.peopleServed.value);
  const button = $('button', form);
  setBusy(button, true, 'Saving…');
  try {
    await post(`/listings/${form.dataset.id}/deliver`, { peopleServed: people });
    form.elements.peopleServed.blur();
    toast(`Delivered. ${fmt.number(people)} people fed. Thank you!`);
    loadMine();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(button, false);
  }
});

['#filter-type', '#filter-km', '#filter-sort'].forEach((sel) => $(sel).addEventListener('change', loadAvailable));

(async () => {
  user = await initPage({ role: 'rescuer' });
  $('#dash-kicker').textContent = user.orgName;
  map = Maps.create($('#rescue-map'), user, 12);
  L.marker([user.lat, user.lng], { icon: Maps.baseIcon(), title: 'Your base', keyboard: false }).addTo(map);
  foodLayer = L.layerGroup().addTo(map);
  showTab(location.hash === '#mine' ? 'mine' : 'find');
  await refresh();
  startTicker();
  setInterval(refresh, 20000);
})();
