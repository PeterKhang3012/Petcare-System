const { Schema } = require("mongoose");
function models(connection) {
  const options = {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
    strict: "throw",
  };
  const visit = new Schema(
    {
      booking_id: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
      },
      owner_id: { type: String, required: true, immutable: true },
      pet_id: { type: String, required: true, immutable: true },
      snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
      state: {
        type: String,
        enum: ["PENDING", "IN_CARE", "COMPLETED"],
        default: "PENDING",
      },
      sync_state: {
        type: String,
        enum: ["PENDING", "SYNCED", "REJECTED"],
        default: "PENDING",
      },
      pending_request_id: { type: String, default: null },
      intake: Schema.Types.Mixed,
      handover: Schema.Types.Mixed,
      checked_in_at: Date,
      completed_at: Date,
      checked_in_recorded_at: Date,
      completed_recorded_at: Date,
      demo_clock: { type: new Schema({ is_demo: Boolean, version: Number }, { _id: false }), default: undefined },
      intake_actor_id: String,
      handover_actor_id: String,
      revision: { type: Number, default: 0 },
    },
    options,
  );
  visit.index({ owner_id: 1, created_at: -1, _id: -1 });
  visit.index({ state: 1, created_at: -1 });
  const request = new Schema(
    {
      _id: String,
      visit_id: { type: Schema.Types.ObjectId, required: true },
      action: {
        type: String,
        required: true,
        enum: ["CHECK_IN", "CHECK_OUT"],
        immutable: true,
      },
      fingerprint: { type: String, required: true, immutable: true },
      payload: { type: Schema.Types.Mixed, required: true, immutable: true },
      draft: { type: Schema.Types.Mixed, required: true, immutable: true },
      status: {
        type: String,
        enum: ["PENDING", "SUCCEEDED", "REJECTED"],
        default: "PENDING",
      },
      result: Schema.Types.Mixed,
      attempts: { type: Number, default: 0 },
      next_attempt_at: { type: Date, required: true },
      lease_until: { type: Date, default: null },
      lease_token: String,
      completed_at: Date,
      last_error: String,
    },
    options,
  );
  request.index({ status: 1, next_attempt_at: 1, lease_until: 1 });
  request.index({ visit_id: 1, created_at: 1 });
  const log = new Schema(
    {
      visit_id: { type: Schema.Types.ObjectId, required: true },
      request_id: { type: String, required: true },
      fingerprint: { type: String, required: true, immutable: true },
      activity: {
        type: String,
        enum: ["BATH", "FEED", "CLEAN", "REST", "OBSERVE", "PREPARE_HANDOVER"],
        required: true,
      },
      notes: { type: String, required: true },
      actor_id: { type: String, required: true },
      version: { type: Number, default: 1 },
      occurred_at: Date,
      demo_clock_version: Number,
      edits: {
        type: [
          new Schema(
            {
              before: Schema.Types.Mixed,
              after: Schema.Types.Mixed,
              actor_id: String,
              reason: String,
              at: Date,
              from_version: Number,
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
    options,
  );
  log.index({ visit_id: 1, request_id: 1 }, { unique: true });
  log.index({ visit_id: 1, created_at: 1, _id: 1 });
  return {
    Visit: connection.models.CareVisit || connection.model("CareVisit", visit),
    Request:
      connection.models.SyncRequest || connection.model("SyncRequest", request),
    Log: connection.models.CareLog || connection.model("CareLog", log),
  };
}
function visitView(row) {
  const {
    _id,
    booking_id,
    owner_id,
    pet_id,
    snapshot,
    state,
    sync_state,
    pending_request_id,
    intake,
    handover,
    checked_in_at,
    completed_at,
    checked_in_recorded_at,
    completed_recorded_at,
    demo_clock,
    intake_actor_id,
    handover_actor_id,
    created_at,
    updated_at,
  } = row.toObject ? row.toObject() : row;
  return {
    id: String(_id),
    booking_id,
    owner_id,
    pet_id,
    snapshot,
    state,
    sync_state,
    request_id: pending_request_id,
    intake,
    handover,
    checked_in_at,
    completed_at,
    ...(demo_clock ? { demo_clock, checked_in_recorded_at, completed_recorded_at } : {}),
    intake_actor_id,
    handover_actor_id,
    created_at,
    updated_at,
  };
}
function requestView(row) {
  return {
    request_id: row._id,
    visit_id: String(row.visit_id),
    action: row.action,
    status: row.status,
    result: row.result,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}
function logView(row) {
  const {
    _id,
    visit_id,
    request_id,
    activity,
    notes,
    actor_id,
    version,
    occurred_at,
    demo_clock_version,
    edits,
    created_at,
    updated_at,
  } = row.toObject ? row.toObject() : row;
  return {
    id: String(_id),
    visit_id: String(visit_id),
    request_id,
    activity,
    notes,
    actor_id,
    version,
    ...(occurred_at ? { occurred_at, demo_clock_version } : {}),
    edits,
    created_at,
    updated_at,
  };
}
module.exports = { models, visitView, requestView, logView };
