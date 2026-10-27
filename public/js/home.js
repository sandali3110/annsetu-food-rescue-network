/* Home page: live list, impact numbers, chart and public map */

let publicMap;
let markerLayer;

function renderLive(listings, city) {
  $('#city-name').textContent = `in ${city.name}`;
  const list = $('#live-list');
  if (!listings.length) {
    list.innerHTML = '<li class="live-empty">All food has been claimed. Check back after the next meal service.</li>';
    $('#live-more').hidden = true;
    return;
  }
  list.innerHTML = listings
    .slice(0, 4)
    .map(
      (l) => `
      <li class="live-item">
        <div class="live-top">
          ${foodTag(l.foodType, { showLabel: false })}
          <strong class="live-title">${esc(l.title)}</strong>
          <span class="live-servings">${fmt.meals(l.servings)}</span>
        </div>
        <p class="live-from">${esc(l.donor.orgName)}</p>
        ${freshnessBar(l)}
      </li>`
    )
    .join('');
  const more = listings.length - 4;
  $('#live-more').textContent = more > 0 ? `See ${more} more on the map` : 'See them on the map';
}

function renderStats(s) {
  $('#stat-meals').textContent = fmt.number(s.mealsRescued);
  $('#stat-people').textContent = fmt.number(s.peopleServed);
  $('#stat-kg').textContent = fmt.number(s.foodKgSaved);
  $('#stat-partners').textContent = fmt.number(s.donors + s.rescuers);
  $('#kg-note').textContent = `*Estimated at ${s.kgPerMeal} kg of food per meal.`;

  // Bar chart drawn as SVG, no chart library needed
  const W = 700, H = 230, padL = 36, padB = 28, padT = 14;
  const max = Math.max(10, ...s.daily.map((d) => d.meals));
  const niceMax = Math.ceil(max / 50) * 50;
  const bw = (W - padL) / s.daily.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / niceMax);
  const grid = [0, niceMax / 2, niceMax]
    .map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 8}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`)
    .join('');
  const bars = s.daily
    .map((d, i) => {
      const x = padL + i * bw + bw * 0.18;
      const date = new Date(`${d.day}T00:00:00`);
      const label = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
      const isLast = i === s.daily.length - 1;
      return `
        <g>
          <title>${label}: ${d.meals} meals</title>
          <rect x="${x}" y="${y(d.meals)}" width="${bw * 0.64}" height="${Math.max(0, y(0) - y(d.meals))}" rx="3" class="${isLast ? 'bar bar-today' : 'bar'}"/>
          ${i % 2 === 1 || isLast ? `<text x="${x + bw * 0.32}" y="${H - 8}" class="axis" text-anchor="middle">${isLast ? 'Today' : date.getDate()}</text>` : ''}
        </g>`;
    })
    .join('');
  const total = s.daily.reduce((sum, d) => sum + d.meals, 0);
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${total} meals rescued in the last 14 days">${grid}${bars}</svg>`;

  $('#leaderboard').innerHTML = s.topDonors.length
    ? s.topDonors
        .map(
          (d) => `
        <li>
          <span class="lb-name">${esc(d.orgName)}</span>
          <span class="lb-meals">${fmt.meals(d.meals)}</span>
          <span class="lb-bar" style="--w:${(d.meals / s.topDonors[0].meals) * 100}%"></span>
        </li>`
        )
        .join('')
    : '<li class="muted">The first donations will appear here.</li>';
}

function renderMap(listings, city) {
  if (!publicMap) {
    publicMap = Maps.create($('#public-map'), city, 12);
    markerLayer = L.layerGroup().addTo(publicMap);
  }
  markerLayer.clearLayers();
  listings.forEach((l) => {
    L.marker([l.lat, l.lng], { icon: Maps.foodIcon(l), title: l.title })
      .bindPopup(
        `<div class="popup">
          <strong>${esc(l.title)}</strong>
          <span>${esc(l.donor.orgName)}</span>
          <span>${fmt.meals(l.servings)}, safe until ${fmt.time(l.safeUntil)}</span>
        </div>`
      )
      .addTo(markerLayer);
  });
  if (!publicMap.fitted && listings.length) {
    publicMap.fitted = true;
    publicMap.fitBounds(listings.map((l) => [l.lat, l.lng]), { padding: [50, 50], maxZoom: 14 });
  }
}

async function load() {
  try {
    const [stats, listings] = await Promise.all([api('/stats'), api('/listings/available')]);
    renderLive(listings, stats.city);
    renderStats(stats);
    renderMap(listings, stats.city);
    startTicker();
  } catch (err) {
    $('#live-list').innerHTML = `<li class="live-empty">${esc(err.message)} Check that the server is running.</li>`;
  }
}

(async () => {
  const user = await initPage();
  if (user) {
    // Logged-in users get a shortcut to their dashboard instead of sign-up buttons
    const primary = $('#cta-donate');
    const secondary = $('#cta-rescue');
    if (user.role === 'donor') {
      primary.textContent = 'Post extra food';
      primary.href = '/donor?new=1';
      secondary.textContent = 'My donations';
      secondary.href = '/donor';
    } else {
      primary.textContent = 'Find food to collect';
      primary.href = '/rescue';
      secondary.textContent = 'My pickups';
      secondary.href = '/rescue#mine';
    }
  }
  await load();
  setInterval(load, 30000);
})();
