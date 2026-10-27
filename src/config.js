// Central settings. Change these to suit your city or your project report.
module.exports = {
  PORT: process.env.PORT || 3000,
  DB_FILE: process.env.DB_FILE || require('path').join(__dirname, '..', 'data', 'annsetu.db'),
  SESSION_DAYS: 7,
  COOKIE_NAME: 'annsetu_session',

  // Default map centre (Pune, India). Change to your own city.
  CITY: { name: 'Pune', lat: 18.5204, lng: 73.8567 },

  // Assumptions used for the impact numbers. Replace them with figures
  // from a source you cite in your project report.
  KG_PER_MEAL: 0.4,
};
