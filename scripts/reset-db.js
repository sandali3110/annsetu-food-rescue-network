// Deletes the database file. The next `npm start` creates a fresh one with sample data.
const fs = require('fs');
const { DB_FILE } = require('../src/config');

if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
  console.log('Database deleted. Run `npm start` to recreate it with fresh sample data.');
} else {
  console.log('No database file yet. Run `npm start` to create one.');
}
