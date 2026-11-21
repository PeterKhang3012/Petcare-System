require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const { connect } = require('./src/platform');
const { configFor } = require('./src/config');
const { initialize } = require('./src/models');
const { supportsTransactions } = require('./src/transactions');
async function main() {
  const config = configFor(__dirname); const connection = await connect(config);
  try {
    if (!await supportsTransactions(connection)) throw new Error('Replica set required');
    const app = require('./src/app').createApp({ config, connection }); await initialize(app.locals.models);
    const stop = app.locals.workers.start();
    const close = async () => { await stop(); await connection.close(); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    // Keep a standalone worker alive; the shared worker timer is intentionally unref'ed.
    const keepAlive = setInterval(() => {}, 60000);
    process.once('SIGINT', () => clearInterval(keepAlive)); process.once('SIGTERM', () => clearInterval(keepAlive));
  } catch (error) { await connection.close(); throw error; }
}
if (require.main === module) main().catch(() => { console.error('Worker startup failed; check replica set and configuration.'); process.exitCode = 1; });
