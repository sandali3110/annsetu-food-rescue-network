const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireRole } = require('../auth');
const { validateListing, FOOD_TYPES } = require('../validate');
const { distanceKm } = require('../geo');

const router = express.Router();

const BASE_SELECT = `
  SELECT l.*,
         d.org_name AS donor_org, d.name AS donor_name, d.phone AS donor_phone,
         r.org_name AS rescuer_org, r.name AS rescuer_name, r.phone AS rescuer_phone
  FROM listings l
  JOIN users d ON d.id = l.donor_id
  LEFT JOIN users r ON r.id = l.claimed_by`;

const STATUS_MESSAGES = {
  claimed: 'Another team has already claimed this food.',
  picked_up: 'This food has already been picked up.',
  delivered: 'This food has already been delivered.',
  expired: 'This food has passed its safe-until time.',
  cancelled: 'The donor cancelled this listing.',
};

/** Marks listings whose safe-until time has passed as expired. */
function expireOld() {
  const now = new Date().toISOString();
  const due = db.get(
    `SELECT COUNT(*) AS n FROM listings WHERE status IN ('available', 'claimed') AND safe_until <= ?`,
    [now]
  );
  if (due.n > 0) {
    db.run(`UPDATE listings SET status = 'expired' WHERE status IN ('available', 'claimed') AND safe_until <= ?`, [now]);
  }
}

/** Converts a database row into the JSON the browser sees. Contact details only go to the two people involved. */
function shape(row, viewer) {
  const isDonor = Boolean(viewer && viewer.id === row.donor_id);
  const isRescuer = Boolean(viewer && viewer.id === row.claimed_by);
  const listing = {
    id: row.id,
    title: row.title,
    description: row.description,
    foodType: row.food_type,
    servings: row.servings,
    safeUntil: row.safe_until,
    pickupAddress: row.pickup_address,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    pickupEta: row.pickup_eta,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    peopleServed: row.people_served,
    donor: { orgName: row.donor_org },
    isMine: isDonor,
    claimedByMe: isRescuer,
  };
  if (isDonor && row.claimed_by) {
    listing.rescuer = { name: row.rescuer_name, orgName: row.rescuer_org, phone: row.rescuer_phone };
  }
  if (isRescuer) {
    listing.donor = { orgName: row.donor_org, name: row.donor_name, phone: row.donor_phone };
    listing.pickupCode = row.pickup_code;
  }
  if (viewer) {
    listing.distanceKm = Math.round(distanceKm(viewer.lat, viewer.lng, row.lat, row.lng) * 10) / 10;
  }
  return listing;
}

function findListing(id) {
  expireOld();
  return db.get(`${BASE_SELECT} WHERE l.id = ?`, [Number(id)]);
}

const notFound = (res) => res.status(404).json({ error: 'This listing no longer exists.' });
const conflict = (res, status) => res.status(409).json({ error: STATUS_MESSAGES[status] || 'This listing has changed. Refresh the page.' });

// GET /api/listings/available?foodType=veg&maxKm=5&sort=distance
router.get('/available', (req, res) => {
  expireOld();
  let listings = db
    .all(`${BASE_SELECT} WHERE l.status = 'available' ORDER BY l.safe_until ASC`)
    .map((row) => shape(row, req.user));

  const { foodType, maxKm, sort } = req.query;
  if (FOOD_TYPES.includes(foodType)) listings = listings.filter((l) => l.foodType === foodType);
  if (req.user && Number(maxKm) > 0) listings = listings.filter((l) => l.distanceKm <= Number(maxKm));
  if (req.user && sort === 'distance') listings.sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(listings);
});

// GET /api/listings/mine  (donor: food I posted, rescuer: food I claimed)
router.get('/mine', requireRole(), (req, res) => {
  expireOld();
  const rows =
    req.user.role === 'donor'
      ? db.all(`${BASE_SELECT} WHERE l.donor_id = ? ORDER BY l.created_at DESC`, [req.user.id])
      : db.all(`${BASE_SELECT} WHERE l.claimed_by = ? ORDER BY l.claimed_at DESC`, [req.user.id]);
  res.json(rows.map((row) => shape(row, req.user)));
});

// POST /api/listings  (donor posts extra food)
router.post('/', requireRole('donor'), (req, res) => {
  const { valid, errors, data } = validateListing(req.body);
  if (!valid) return res.status(422).json({ error: 'Some details need fixing.', fields: errors });

  const { lastId } = db.run(
    `INSERT INTO listings (donor_id, title, description, food_type, servings, safe_until, pickup_address, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, data.title, data.description, data.foodType, data.servings, data.safeUntil,
     data.pickupAddress, data.lat, data.lng, new Date().toISOString()]
  );
  res.status(201).json(shape(findListing(lastId), req.user));
});

// POST /api/listings/:id/cancel  (donor withdraws food nobody has claimed)
router.post('/:id/cancel', requireRole('donor'), (req, res) => {
  const row = findListing(req.params.id);
  if (!row || row.donor_id !== req.user.id) return notFound(res);
  if (row.status !== 'available') return conflict(res, row.status);
  db.run(`UPDATE listings SET status = 'cancelled' WHERE id = ?`, [row.id]);
  res.json(shape(findListing(row.id), req.user));
});

// POST /api/listings/:id/claim  body: { pickupEta }
router.post('/:id/claim', requireRole('rescuer'), (req, res) => {
  const row = findListing(req.params.id);
  if (!row) return notFound(res);
  if (row.status !== 'available') return conflict(res, row.status);

  const eta = Date.parse(req.body?.pickupEta);
  if (Number.isNaN(eta) || eta < Date.now() - 5 * 60 * 1000) {
    return res.status(422).json({ error: 'Choose when you will reach the pickup point.' });
  }
  if (eta > Date.parse(row.safe_until)) {
    return res.status(422).json({ error: 'Pick a time before the food’s safe-until time.' });
  }

  const code = String(crypto.randomInt(1000, 10000));
  // The status check inside WHERE makes sure two teams can never claim the same food
  const { changes } = db.run(
    `UPDATE listings SET status = 'claimed', claimed_by = ?, claimed_at = ?, pickup_eta = ?, pickup_code = ?
     WHERE id = ? AND status = 'available'`,
    [req.user.id, new Date().toISOString(), new Date(eta).toISOString(), code, row.id]
  );
  if (!changes) return conflict(res, 'claimed');
  res.json(shape(findListing(row.id), req.user));
});

// POST /api/listings/:id/release  (rescuer can no longer make it)
router.post('/:id/release', requireRole('rescuer'), (req, res) => {
  const row = findListing(req.params.id);
  if (!row || row.claimed_by !== req.user.id) return notFound(res);
  if (row.status !== 'claimed') return conflict(res, row.status);
  db.run(
    `UPDATE listings SET status = 'available', claimed_by = NULL, claimed_at = NULL, pickup_eta = NULL, pickup_code = NULL
     WHERE id = ?`,
    [row.id]
  );
  res.json({ ok: true });
});

// POST /api/listings/:id/pickup  body: { code }  (donor confirms handover with the rescuer's code)
router.post('/:id/pickup', requireRole('donor'), (req, res) => {
  const row = findListing(req.params.id);
  if (!row || row.donor_id !== req.user.id) return notFound(res);
  if (row.status !== 'claimed') return conflict(res, row.status);
  if (String(req.body?.code || '').trim() !== row.pickup_code) {
    return res.status(422).json({ error: 'That code doesn’t match. Ask the rescuer to check the code in their app.' });
  }
  db.run(`UPDATE listings SET status = 'picked_up', picked_up_at = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
  res.json(shape(findListing(row.id), req.user));
});

// POST /api/listings/:id/deliver  body: { peopleServed }
router.post('/:id/deliver', requireRole('rescuer'), (req, res) => {
  const row = findListing(req.params.id);
  if (!row || row.claimed_by !== req.user.id) return notFound(res);
  if (row.status !== 'picked_up') return conflict(res, row.status);
  const people = Number(req.body?.peopleServed);
  if (!Number.isInteger(people) || people < 1 || people > 10000) {
    return res.status(422).json({ error: 'Enter how many people were fed, as a whole number.' });
  }
  db.run(`UPDATE listings SET status = 'delivered', delivered_at = ?, people_served = ? WHERE id = ?`, [
    new Date().toISOString(), people, row.id,
  ]);
  res.json(shape(findListing(row.id), req.user));
});

module.exports = { router, expireOld };
