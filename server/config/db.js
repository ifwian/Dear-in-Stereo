const mysql = require('mysql2/promise');

// One shared connection pool. `timezone: 'Z'` makes mysql2 read/write DATETIME values as UTC.
function createPool(dbConfig) {
  const pool = mysql.createPool({
    ...dbConfig,
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
  });
  // CURRENT_TIMESTAMP column defaults use the MySQL *session* time zone, so pin every connection to UTC.
  pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

module.exports = { createPool };
