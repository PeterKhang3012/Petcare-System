const { Schema } = require("mongoose");
const { object, text, invalid, dateOnly } = require("./platform");
function petModel(connection) {
  const schema = new Schema(
    {
      owner_id: { type: String, required: true, immutable: true },
      name: { type: String, required: true, maxlength: 100 },
      species: { type: String, required: true, enum: ["DOG", "CAT"] },
      coat_type: { type: String, enum: ["SHORT", "LONG"] },
      breed: { type: String, maxlength: 100 },
      date_of_birth: String,
      weight_kg: {
        type: Number,
        required: true,
        min: Number.MIN_VALUE,
        validate: Number.isFinite,
      },
      care_notes: { type: String, maxlength: 2000 },
      status: {
        type: String,
        enum: ["ACTIVE", "ARCHIVED"],
        default: "ACTIVE",
        required: true,
      },
      version: { type: Number, default: 1, required: true },
      archived_at: { type: Date, default: null },
    },
    {
      timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
      versionKey: false,
      strict: "throw",
    },
  );
  schema.index({ owner_id: 1, status: 1, created_at: -1, _id: -1 });
  return connection.model("Pet", schema);
}
function validatePet(body, partial = false, now = new Date()) {
  const fields = [
    "name",
    "species",
    "coat_type",
    "breed",
    "date_of_birth",
    "weight_kg",
    "care_notes",
  ];
  object(body, fields);
  const data = {};
  if (!partial || body.name !== undefined) data.name = text(body.name, "name");
  if (!partial || body.species !== undefined) {
    if (!["DOG", "CAT"].includes(body.species))
      invalid("species must be DOG or CAT");
    data.species = body.species;
  }
  if (body.coat_type !== undefined) {
    if (!["SHORT", "LONG"].includes(body.coat_type))
      invalid("coat_type must be SHORT or LONG");
    data.coat_type = body.coat_type;
  }
  if (!partial || body.weight_kg !== undefined) {
    if (
      typeof body.weight_kg !== "number" ||
      !Number.isFinite(body.weight_kg) ||
      body.weight_kg <= 0 ||
      body.weight_kg > 500
    )
      invalid("weight_kg must be finite and greater than 0 (maximum 500)");
    data.weight_kg = body.weight_kg;
  }
  for (const [field, max] of [
    ["breed", 100],
    ["care_notes", 2000],
  ]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > max)
        invalid(`Invalid ${field}`);
      data[field] = body[field].trim();
    }
  }
  if (body.date_of_birth !== undefined) {
    const day = dateOnly(body.date_of_birth, "date_of_birth");
    const today = new Date(+now + 7 * 3600000).toISOString().slice(0, 10);
    if (day > today) invalid("date_of_birth cannot be in the future");
    data.date_of_birth = day;
  }
  if (partial && !Object.keys(data).length)
    invalid("At least one editable field is required");
  return data;
}
function present(pet) {
  const data = pet.toObject ? pet.toObject() : { ...pet };
  data.id = String(data._id);
  delete data._id;
  return data;
}
module.exports = { petModel, validatePet, present };
