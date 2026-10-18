// Creates the database from database.sql using the credentials in .env.
// Usage: npm run db:setup           (create if missing)
//        npm run db:setup -- --reset (DROP the database first — deletes all data)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const name = process.env.DB_NAME || 'dear_in_stereo_db';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  if (process.argv.includes('--reset')) {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    console.log(`Dropped database ${name}.`);
  }
  let sql = fs.readFileSync(path.join(__dirname, '..', 'database.sql'), 'utf8');
  if (name !== 'dear_in_stereo_db') sql = sql.replace(/dear_in_stereo_db/g, name);
  await conn.query(sql);
  console.log(`Database ${name} is ready.`);
  await conn.end();
})().catch((err) => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
