const Account = require("../models/auth.model");

module.exports = async function bookingContact(req, res) {
  res.set("Cache-Control", "no-store");
  const { id } = req.params;
  if (!/^[a-f0-9]{24}$/.test(id)) {
    return res.status(400).json({ success: false, message: "Invalid booking ID" });
  }

  let booking;
  try {
    const url = new URL("/api/staff/bookings/" + id, process.env.BOOKING_BASE_URL);
    const response = await fetch(url, {
      headers: { Authorization: req.headers.authorization },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (response.status === 401 || response.status === 403) {
      return res.status(response.status).json({ success: false, message: "Booking access denied" });
    }
    if (!response.ok) throw new Error("Booking lookup failed");
    const result = await response.json();
    if (result.success !== true) throw new Error("Invalid Booking response");
    booking = result.data?.booking;
    if (booking?.id !== id || typeof booking.owner_id !== "string" || !/^[a-f0-9]{24}$/.test(booking.owner_id)) {
      throw new Error("Invalid Booking response");
    }
  } catch {
    return res.status(503).json({ success: false, message: "Booking service is unavailable" });
  }

  const customer = await Account.findOne({ _id: booking.owner_id, role: "USER" })
    .select("full_name phone -_id").lean();
  res.json({ success: true, data: { contact: {
    full_name: customer?.full_name ?? null,
    phone: customer?.phone ?? null,
  } } });
};
