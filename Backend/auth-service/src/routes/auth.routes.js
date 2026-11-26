const router = require("express").Router();
const controller = require("../controllers/auth.controller");
router.post("/register", controller.register);
router.post("/login", controller.login);
router.get(
  "/me",
  require("../middleware/auth.middleware").authenticate,
  (req, res) => {
    const { id, username, role, permissions, full_name, phone } = req.user;
    res.json({
      success: true,
      data: { user: { id, username, role, permissions, full_name, phone } },
    });
  },
);
module.exports = router;
