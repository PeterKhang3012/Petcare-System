const { observability } = require('./observability');
const express = require("express");
const app = express();
observability(app, 'auth-service');
app.use(express.json({ limit: "16kb" }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/facility/contact", require("./routes/facility-contact"));
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Not found" }),
);
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res
    .status(status)
    .json({
      success: false,
      message: status === 500 ? "Internal server error" : error.message,
    });
});
module.exports = app;
