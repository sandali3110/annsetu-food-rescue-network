const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s-]{8,15}$/;
const FOOD_TYPES = ['veg', 'non-veg', 'mixed'];
const ROLES = ['donor', 'rescuer'];

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' ? v : Number(v));
const result = (errors, data) => ({ valid: Object.keys(errors).length === 0, errors, data });

function checkLocation(body, errors) {
  const lat = num(body.lat);
  const lng = num(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    errors.location = 'Drop a pin on the map to set the location.';
  }
  return { lat, lng };
}

function validateRegister(body = {}) {
  const errors = {};
  const data = {
    name: text(body.name),
    email: text(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password : '',
    role: text(body.role),
    orgName: text(body.orgName),
    phone: text(body.phone),
    address: text(body.address),
  };
  if (!ROLES.includes(data.role)) errors.role = 'Choose whether you donate or collect food.';
  if (data.name.length < 2 || data.name.length > 60) errors.name = 'Add your name, up to 60 characters.';
  if (data.orgName.length < 2 || data.orgName.length > 80) errors.orgName = 'Add your organisation name, up to 80 characters.';
  if (!EMAIL.test(data.email)) errors.email = 'Add a valid email address.';
  if (!PHONE.test(data.phone)) errors.phone = 'Add a phone number with 8 to 15 digits.';
  if (data.password.length < 8) errors.password = 'Use at least 8 characters.';
  if (data.address.length < 5 || data.address.length > 160) errors.address = 'Add your address, up to 160 characters.';
  Object.assign(data, checkLocation(body, errors));
  return result(errors, data);
}

function validateListing(body = {}) {
  const errors = {};
  const data = {
    title: text(body.title),
    description: text(body.description),
    foodType: text(body.foodType),
    servings: num(body.servings),
    safeUntil: text(body.safeUntil),
    pickupAddress: text(body.pickupAddress),
  };
  if (data.title.length < 3 || data.title.length > 80) errors.title = 'Describe the food in 3 to 80 characters.';
  if (data.description.length > 300) errors.description = 'Keep notes under 300 characters.';
  if (!FOOD_TYPES.includes(data.foodType)) errors.foodType = 'Choose veg, non-veg or mixed.';
  if (!Number.isInteger(data.servings) || data.servings < 1 || data.servings > 2000) {
    errors.servings = 'Servings must be a whole number from 1 to 2000.';
  }
  const safeUntil = Date.parse(data.safeUntil);
  if (Number.isNaN(safeUntil)) {
    errors.safeUntil = 'Choose until when the food stays safe to eat.';
  } else if (safeUntil < Date.now() + 30 * 60 * 1000) {
    errors.safeUntil = 'Allow at least 30 minutes so someone can reach you.';
  } else if (safeUntil > Date.now() + 48 * 60 * 60 * 1000) {
    errors.safeUntil = 'Cooked food can be listed for up to 48 hours.';
  } else {
    data.safeUntil = new Date(safeUntil).toISOString();
  }
  if (data.pickupAddress.length < 5 || data.pickupAddress.length > 160) {
    errors.pickupAddress = 'Add the pickup address, up to 160 characters.';
  }
  Object.assign(data, checkLocation(body, errors));
  return result(errors, data);
}

module.exports = { validateRegister, validateListing, FOOD_TYPES, EMAIL };
