require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
  quiet: true,
});
const mongoose = require("mongoose");
const { connectDatabase } = require("./src/config/database");
async function start() {
  require("./src/config/jwt").validateConfig();
  await connectDatabase();
  const server = require("./src/app").listen(process.env.PORT || 3001, () =>
    console.log("Auth Service started"),
  );
  const shutdown = () =>
    server.close(async () => {
      await mongoose.disconnect();
    });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
if (require.main === module)
  start().catch(async (error) => {
    console.error("Startup failed:", error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
module.exports = { start };
