/* Map helpers built on Leaflet (https://leafletjs.com) with OpenStreetMap data */

const Maps = {
  create(el, center, zoom = 12) {
    const map = L.map(el, { scrollWheelZoom: false }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    return map;
  },

  /** A pin showing the number of servings, coloured by how fresh the food is. */
  foodIcon(listing) {
    const { level } = freshness(listing.safeUntil, listing.createdAt);
    return L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin pin-${level}"><b>${listing.servings}</b></span>`,
      iconSize: [42, 42],
      iconAnchor: [21, 42],
      popupAnchor: [0, -38],
    });
  },

  baseIcon() {
    return L.divIcon({
      className: 'pin-wrap',
      html: '<span class="base-pin" title="Your base"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  },

  /** A map where clicking or dragging sets a location. Calls onChange({ lat, lng }). */
  picker(el, start, onChange) {
    const map = Maps.create(el, start, 13);
    const marker = L.marker([start.lat, start.lng], { draggable: true, icon: Maps.baseIcon() }).addTo(map);
    const set = (latlng, pan) => {
      marker.setLatLng(latlng);
      if (pan) map.setView(latlng, 15);
      onChange({ lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) });
    };
    map.on('click', (e) => set(e.latlng));
    marker.on('dragend', () => set(marker.getLatLng()));
    return { map, set: (lat, lng, pan = true) => set(L.latLng(lat, lng), pan) };
  },

  directionsUrl: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
};
