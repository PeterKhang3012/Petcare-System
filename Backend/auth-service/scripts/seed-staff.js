require("dotenv").config({
  path: require("node:path").join(__dirname, "../.env"),
  quiet: true,
});
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Auth = require("../src/models/auth.model");
const { connectDatabase } = require("../src/config/database");
const { validateCredentials } = require("../src/utils/validation");
const { validatePermissions } = require("../src/config/authorization");

async function seedStaff(username, password, permissions = []) {
  permissions = validatePermissions("STAFF", permissions);
  username = validateCredentials(username, password);
  const existing = await Auth.findOne({ username });
  if (existing) {
    if (existing.role.toUpperCase() !== "STAFF")
      throw new Error("Username belongs to a non-STAFF account; unchanged");
    if (JSON.stringify(existing.permissions || []) !== JSON.stringify(permissions))
      throw new Error("Existing STAFF permissions differ; review database explicitly; unchanged");
    return { created: false };
  }
  try {
    await Auth.create({
      username,
      password: await bcrypt.hash(password, 12),
      role: "STAFF",
      permissions,
    });
    return { created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await Auth.findOne({ username });
    if (!winner || winner.role.toUpperCase() !== "STAFF")
      throw new Error("Username conflict; unchanged");
    if (JSON.stringify(winner.permissions || []) !== JSON.stringify(permissions))
      throw new Error("Existing STAFF permissions differ; unchanged");
    return { created: false };
  }
}

async function main() {
  try {
    validateCredentials(process.env.STAFF_USERNAME, process.env.STAFF_PASSWORD);
    const permissions = (process.env.STAFF_PERMISSIONS || "")
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean);
    validatePermissions("STAFF", permissions);
    await connectDatabase();
    const result = await seedStaff(
      process.env.STAFF_USERNAME,
      process.env.STAFF_PASSWORD,
      permissions,
    );
    console.log(
      result.created
        ? "STAFF account created"
        : "STAFF account already exists; unchanged",
    );
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error("Staff seed failed:", error.message);
    process.exitCode = 1;
  });
module.exports = { seedStaff };
