require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const { loadConfig, connect, initialize, replicaReady, shutdown } = require('./src/platform');
async function start() {
  const config = loadConfig('catalog', __dirname); const connection = await connect(config);
  try {
    if (!await replicaReady(connection)) throw new Error('Replica set required');
    const app = require('./src/app').createApp({ config, connection }); await initialize(app.locals.models);
    const server = app.listen(config.port); const close = shutdown(server, connection); return { app, server, close };
  } catch (error) { await connection.close(); throw error; }
}
if (require.main === module) start().catch(() => { console.error('Catalog startup failed; check public key, replica set and configuration.'); process.exitCode = 1; });
module.exports = { start };
