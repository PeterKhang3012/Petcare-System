const {
  baseApp,
  finishApp,
  authenticate,
  requireRole,
  internalAuth,
  id,
  pagination,
  fail,
  invalid,
  object,
} = require("./platform");
const { petModel, validatePet, present } = require("./pet");
function createApp({ config, connection, logger, clock = () => new Date() }) {
  const Pet = connection.models.Pet || petModel(connection);
  const app = baseApp({ service: "pet", connection, logger });
  app.locals.models = { Pet };
  app.get(
    "/internal/pets/:id/booking-context",
    internalAuth({ booking: config.tokens.BOOKING_TO_PET_TOKEN }, ["booking"]),
    async (req, res) => {
      object(req.query, ["owner_id"]);
      const pet = await Pet.findOne({
        _id: id(req.params.id),
        owner_id: id(req.query.owner_id, "owner_id"),
        status: "ACTIVE",
      }).lean();
      if (!pet)
        fail(
          404,
          "NOT_FOUND",
          "An active pet owned by this user was not found",
        );
      const { owner_id, name, species, breed, weight_kg, care_notes, version } =
        pet;
      res.json({
        success: true,
        data: {
          pet: {
            id: String(pet._id),
            owner_id,
            name,
            species,
            breed,
            weight_kg,
            care_notes,
            version,
          },
        },
      });
    },
  );
  app.use("/api/pets", authenticate(config), requireRole("USER"));
  app.post("/api/pets", async (req, res) => {
    const data = validatePet(req.body, false, clock());
    const pet = await Pet.create({ ...data, owner_id: req.user.id });
    res.status(201).json({ success: true, data: { pet: present(pet) } });
  });
  app.get("/api/pets", async (req, res) => {
    object(req.query, ["page", "limit", "status"]);
    const { page, limit, skip } = pagination(req.query);
    const status = req.query.status || "ACTIVE";
    if (!["ACTIVE", "ARCHIVED", "ALL"].includes(status))
      invalid("status must be ACTIVE, ARCHIVED or ALL");
    const filter = {
      owner_id: req.user.id,
      ...(status === "ALL" ? {} : { status }),
    };
    const [pets, total] = await Promise.all([
      Pet.find(filter)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Pet.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: { pets: pets.map(present), page, limit, total },
    });
  });
  const ownPet = async (req) => {
    const pet = await Pet.findOne({
      _id: id(req.params.id),
      owner_id: req.user.id,
    }).lean();
    if (!pet) fail(404, "NOT_FOUND", "Pet not found");
    return pet;
  };
  app.get("/api/pets/:id", async (req, res) =>
    res.json({ success: true, data: { pet: present(await ownPet(req)) } }),
  );
  app.patch("/api/pets/:id", async (req, res) => {
    const data = validatePet(req.body, true, clock());
    const pet = await Pet.findOneAndUpdate(
      { _id: id(req.params.id), owner_id: req.user.id, status: "ACTIVE" },
      { $set: data, $inc: { version: 1 } },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!pet) {
      await ownPet(req);
      fail(409, "INVALID_PET_STATE", "Archived pets cannot be edited");
    }
    res.json({ success: true, data: { pet: present(pet) } });
  });
  app.post("/api/pets/:id/archive", async (req, res) => {
    object(req.body || {}, []);
    const pet = await Pet.findOneAndUpdate(
      { _id: id(req.params.id), owner_id: req.user.id, status: "ACTIVE" },
      {
        $set: { status: "ARCHIVED", archived_at: clock() },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    ).lean();
    res.json({
      success: true,
      data: { pet: present(pet || (await ownPet(req))) },
    });
  });
  return finishApp(app);
}
module.exports = { createApp };
