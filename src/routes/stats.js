const express = require('express');
const db = require('../db');
const { KG_PER_MEAL, CITY } = require('../config');
const { expireOld } = require('./listings');

const router = express.Router();
const RESCUED = `status IN ('picked_up', 'delivered')`;
const DAYS = 14;

// GET /api/stats  (public impact numbers for the home page)
router.get('/', (req, res) => {
  expireOld();
  const rescued = db.get(`SELECT COUNT(*) AS donations, COALESCE(SUM(servings), 0) AS meals FROM listings WHERE ${RESCUED}`);
  const served = db.get(`SELECT COALESCE(SUM(people_served), 0) AS people FROM listings WHERE status = 'delivered'`);
  const available = db.get(`SELECT COUNT(*) AS listings, COALESCE(SUM(servings), 0) AS meals FROM listings WHERE status = 'available'`);
  const partners = db.get(`SELECT COALESCE(SUM(role = 'donor'), 0) AS donors, COALESCE(SUM(role = 'rescuer'), 0) AS rescuers FROM users`);

  // Meals rescued per day for the last 14 days (missing days filled with 0)
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (DAYS - 1));
  const rows = db.all(
    `SELECT substr(picked_up_at, 1, 10) AS day, SUM(servings) AS meals
     FROM listings WHERE ${RESCUED} AND picked_up_at >= ? GROUP BY day`,
    [start.toISOString()]
  );
  const byDay = Object.fromEntries(rows.map((r) => [r.day, r.meals]));
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    return { day, meals: byDay[day] || 0 };
  });

  const topDonors = db.all(
    `SELECT d.org_name AS orgName, SUM(l.servings) AS meals, COUNT(*) AS donations
     FROM listings l JOIN users d ON d.id = l.donor_id
     WHERE l.${RESCUED} GROUP BY d.id ORDER BY meals DESC LIMIT 5`
  );

  res.json({
    mealsRescued: rescued.meals,
    donations: rescued.donations,
    peopleServed: served.people,
    foodKgSaved: Math.round(rescued.meals * KG_PER_MEAL),
    kgPerMeal: KG_PER_MEAL,
    availableNow: { listings: available.listings, meals: available.meals },
    donors: partners.donors,
    rescuers: partners.rescuers,
    daily,
    topDonors,
    city: CITY,
  });
});

module.exports = router;
