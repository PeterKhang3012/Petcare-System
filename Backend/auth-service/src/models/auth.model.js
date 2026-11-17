const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["USER", "STAFF"], default: "USER", required: true },
    permissions: {
      type: [{ type: String, enum: ["UPDATE_SERVICE_PRICE"] }],
      default: [],
      validate: {
        validator: function (values) { return !values.length || this.role === "STAFF"; },
        message: "Only STAFF can hold additional permissions",
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  },
);
module.exports = mongoose.model("Auth", schema);
