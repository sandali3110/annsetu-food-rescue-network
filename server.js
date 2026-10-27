const path = require('path');
const express = require('express');
const db = require('./src/db');
const { PORT, CITY } = require('./src/config');
const { loadUser } = require('./src/auth');
const { seedIfEmpty } = require('./src/seed');
const authRoutes = require('./src/routes/auth');
const { router: listingRoutes, expireOld } = require('./src/routes/listings');
const statsRoutes = require('./src/routes/stats');

const app = express();

app.use(express.json({ limit: '50kb' }));
app.use(loadUser);

// Frontend files. extensions lets /donor serve donor.html
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Leaflet (map library) served from node_modules so the app works without a CDN
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));

// API
app.get('/api/config', (req, res) => res.json({ city: CITY }));
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'No API endpoint at this address.' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'The server ran into a problem. Try again.' });
});

db.init()
  .then(() => {
    if (seedIfEmpty()) console.log('First run: added sample data. Demo password for all accounts: demo1234');
    setInterval(expireOld, 60 * 1000); // expire old food every minute
    app.listen(PORT, () => console.log(`AnnSetu is running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not start the database:', err);
    process.exit(1);
  });
