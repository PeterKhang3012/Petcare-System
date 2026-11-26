const service = require("../services/auth.service");
const handle = (action, status, message) => async (req, res, next) => {
  try {
    const data = await action(req.body || {});
    res.status(status).json({ success: true, message, data });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  register: handle(service.register, 201, "Registration successful"),
  login: handle(({ username, password }) => service.login(username, password), 200, "Login successful"),
};
