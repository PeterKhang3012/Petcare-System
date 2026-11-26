require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
  quiet: true,
});
const { loadConfig, connect, shutdown } = require("./src/platform");
async function start() {
  const config = loadConfig("pet", __dirname);
  let connection;
  try {
    connection = await connect(config);
    const app = require("./src/app").createApp({ config, connection });
    await app.locals.models.Pet.init();
    await app.locals.models.Pet.createIndexes();
    const server = app.listen(config.port);
    const close = shutdown(server, connection);
    return { server, app, close };
  } catch (error) {
    if (connection) await connection.close();
    throw error;
  }
}
if (require.main === module)
  start().catch(() => {
    console.error(
      "Pet startup failed; check database, public key and configuration.",
    );
    process.exitCode = 1;
  });
module.exports = { start };
