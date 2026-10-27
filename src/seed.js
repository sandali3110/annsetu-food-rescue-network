/**
 * Sample data so the app looks alive on first run and during your demo.
 * Times are relative to "now", so run `npm run reset-db` right before a demo.
 */
const db = require('./db');
const { hashPassword } = require('./auth');

const DEMO_PASSWORD = 'demo1234';

const USERS = [
  ['Arjun Shetty', 'donor@demo.com', 'donor', 'Hotel Saffron Kitchen', '+91 98220 11001', 'FC Road, Shivajinagar, Pune', 18.5236, 73.841],
  ['Meena Joshi', 'hostel@demo.com', 'donor', 'Sunrise Boys Hostel Mess', '+91 98220 11002', 'Paud Road, Kothrud, Pune', 18.5074, 73.8077],
  ['Farhan Khan', 'banquet@demo.com', 'donor', 'Royal Banquet Hall', '+91 98220 11003', 'North Main Road, Koregaon Park, Pune', 18.5362, 73.894],
  ['Lata Pawar', 'caterer@demo.com', 'donor', 'Green Leaf Caterers', '+91 98220 11004', 'Nagar Road, Viman Nagar, Pune', 18.5679, 73.9143],
  ['Sanjay Rao', 'canteen@demo.com', 'donor', 'College Canteen, Model Colony', '+91 98220 11005', 'Model Colony, Shivajinagar, Pune', 18.5308, 73.8475],
  ['Priya Deshmukh', 'ngo@demo.com', 'rescuer', 'Annapurna Seva Trust', '+91 98220 22001', 'Magarpatta Road, Hadapsar, Pune', 18.5089, 73.926],
  ['Riya Kulkarni', 'volunteer@demo.com', 'rescuer', 'Deccan Youth Volunteers', '+91 98220 22002', 'Deccan Gymkhana, Pune', 18.5167, 73.8414],
  ['Thomas George', 'shelter@demo.com', 'rescuer', 'Helping Hands Shelter', '+91 98220 22003', 'Yerawada, Pune', 18.5529, 73.8796],
];

const DISHES = [
  ['Veg pulao and dal', 'veg'], ['Chapati and mixed veg sabzi', 'veg'], ['Idli and sambar', 'veg'],
  ['Chicken biryani', 'non-veg'], ['Poha and upma', 'veg'], ['Egg curry and rice', 'non-veg'],
  ['Rajma chawal', 'veg'], ['Wedding buffet leftovers', 'mixed'], ['Pav bhaji', 'veg'], ['Paneer rolls', 'veg'],
];

// Small deterministic random generator so the sample data is the same every time
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const MIN = 60 * 1000;
const at = (offsetMinutes) => new Date(Date.now() + offsetMinutes * MIN).toISOString();

function seedIfEmpty() {
  if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) return false;

  db.transaction((tx) => {
    const hash = hashPassword(DEMO_PASSWORD);
    const ids = {};
    for (const [name, email, role, org, phone, address, lat, lng] of USERS) {
      ids[email] = tx.run(
        `INSERT INTO users (name, email, password_hash, role, org_name, phone, address, lat, lng, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, email, hash, role, org, phone, address, lat, lng, at(-40 * 24 * 60)]
      ).lastId;
    }
    const donors = USERS.filter((u) => u[2] === 'donor');
    const rescuers = USERS.filter((u) => u[2] === 'rescuer');
    const userByEmail = Object.fromEntries(USERS.map((u) => [u[1], u]));

    const insert = (email, l) => {
      const u = userByEmail[email];
      tx.run(
        `INSERT INTO listings (donor_id, title, description, food_type, servings, safe_until, pickup_address, lat, lng,
           status, claimed_by, claimed_at, pickup_eta, pickup_code, picked_up_at, delivered_at, people_served, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ids[email], l.title, l.description || '', l.foodType, l.servings, l.safeUntil, u[5], u[6], u[7],
         l.status || 'available', l.claimedBy ? ids[l.claimedBy] : null, l.claimedAt || null, l.pickupEta || null,
         l.pickupCode || null, l.pickedUpAt || null, l.deliveredAt || null, l.peopleServed || null, l.createdAt]
      );
    };

    // Delivered history over the last 14 days (for the impact chart)
    for (let day = 13; day >= 0; day--) {
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const [title, foodType] = pick(DISHES);
        const servings = 10 + Math.floor(rand() * 60);
        const created = -day * 24 * 60 - 600 - Math.floor(rand() * 300);
        if (day === 0 && created > -120) continue;
        insert(pick(donors)[1], {
          title, foodType, servings, createdAt: at(created), safeUntil: at(created + 300),
          status: 'delivered', claimedBy: pick(rescuers)[1], claimedAt: at(created + 20),
          pickupEta: at(created + 60), pickupCode: String(1000 + Math.floor(rand() * 9000)),
          pickedUpAt: at(created + 65), deliveredAt: at(created + 110),
          peopleServed: Math.max(1, servings - Math.floor(rand() * 6)),
        });
      }
    }

    // One expired and one cancelled listing so every status appears in the demo
    insert('caterer@demo.com', { title: 'Sweet boondi', foodType: 'veg', servings: 15, createdAt: at(-30 * 60), safeUntil: at(-26 * 60), status: 'expired' });
    insert('donor@demo.com', { title: 'Veg fried rice', foodType: 'veg', servings: 12, createdAt: at(-50 * 60), safeUntil: at(-47 * 60), status: 'cancelled' });

    // Food waiting for pickup right now
    insert('banquet@demo.com', { title: 'Veg biryani and raita', description: 'From a reception last night, kept in a chiller. Bring your own containers.', foodType: 'veg', servings: 40, createdAt: at(-30), safeUntil: at(180) });
    insert('hostel@demo.com', { title: 'Dal, rice and aloo sabzi', description: 'Extra from tonight’s mess dinner. Packed in steel containers you can return later.', foodType: 'veg', servings: 25, createdAt: at(-45), safeUntil: at(120) });
    insert('donor@demo.com', { title: 'Paneer butter masala with rotis', description: 'Rotis packed separately.', foodType: 'veg', servings: 18, createdAt: at(-20), safeUntil: at(240) });
    insert('caterer@demo.com', { title: 'Chicken curry and jeera rice', description: 'Needs pickup soon.', foodType: 'non-veg', servings: 30, createdAt: at(-105), safeUntil: at(75) });
    insert('canteen@demo.com', { title: 'Sandwiches and fruit cups', description: 'Individually packed, good for children.', foodType: 'veg', servings: 20, createdAt: at(-10), safeUntil: at(300) });

    // Claimed by the NGO demo account and waiting for the donor to confirm the code
    insert('donor@demo.com', { title: 'Mixed veg pulao', description: 'Two large vessels.', foodType: 'veg', servings: 15, createdAt: at(-35), safeUntil: at(180),
      status: 'claimed', claimedBy: 'ngo@demo.com', claimedAt: at(-15), pickupEta: at(40), pickupCode: '4821' });

    // Picked up by the NGO demo account and waiting to be marked delivered
    insert('banquet@demo.com', { title: 'Puri and chole', foodType: 'veg', servings: 60, createdAt: at(-120), safeUntil: at(120),
      status: 'picked_up', claimedBy: 'ngo@demo.com', claimedAt: at(-100), pickupEta: at(-50), pickupCode: '7314', pickedUpAt: at(-45) });
  });
  return true;
}

module.exports = { seedIfEmpty, DEMO_PASSWORD };
