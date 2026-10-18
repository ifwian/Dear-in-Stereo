const { createApp } = require('./app');

let instance;
try {
  instance = createApp();
} catch (err) {
  console.error(`\nCould not start Dear, in Stereo:\n${err.message}\n`);
  process.exit(1);
}
const { app, pool, config } = instance;

// Fail early with a clear message if MySQL is unreachable or the schema was not imported.
pool.query('SELECT COUNT(*) AS n FROM users').then(() => {
  app.listen(config.port, () => console.log(`Dear, in Stereo is running at ${config.baseUrl}`));
}).catch((err) => {
  const hint = err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR'
    ? 'The database or tables are missing. Import database.sql first (README step 4).'
    : err.code === 'ER_ACCESS_DENIED_ERROR' ? 'MySQL rejected the username/password in your .env file.'
    : err.code === 'ECONNREFUSED' ? 'MySQL is not running or DB_HOST/DB_PORT are wrong.' : err.message;
  console.error(`\nDatabase check failed (${err.code || 'error'}): ${hint}\n`);
  process.exit(1);
});
