require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const { connect, shutdown } = require('./src/platform');
const { configFor } = require('./src/config');
const { initialize } = require('./src/models');
const { supportsTransactions } = require('./src/transactions');
async function start() {
  const config = configFor(__dirname); let connection;
  try {
    connection = await connect(config);
    if (!await supportsTransactions(connection)) throw new Error('A writable MongoDB replica set is required');
    const app = require('./src/app').createApp({ config, connection });
    await initialize(app.locals.models);
    const stop = config.workerEnabled ? app.locals.workers.start() : async () => {};
    const server = app.listen(config.port); const close = shutdown(server, connection, stop);
    return { app, server, close };
  } catch (error) { if (connection) await connection.close(); throw error; }
}
if (require.main === module) start().catch(() => { console.error('Booking startup failed; check replica set, public key and configuration.'); process.exitCode = 1; });
module.exports = { start };
