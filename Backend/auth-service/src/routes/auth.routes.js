const router = require("express").Router();
const controller = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const bookingContact = require("../controllers/booking-contact.controller");
router.post("/register", controller.register);
router.post("/login", controller.login);
router.get(
  "/me",
  authenticate,
  (req, res) => {
    const { id, username, role, permissions, full_name, phone } = req.user;
    res.json({
      success: true,
      data: { user: { id, username, role, permissions, full_name, phone } },
    });
  },
);
router.get("/staff/bookings/:id/contact", authenticate, requireRole("STAFF"), bookingContact);
module.exports = router;
