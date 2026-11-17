const service = require("../services/auth.service");
const handle = (method, status, message) => async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const data = await service[method](username, password);
    res.status(status).json({ success: true, message, data });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  register: handle("register", 201, "Registration successful"),
  login: handle("login", 200, "Login successful"),
};
