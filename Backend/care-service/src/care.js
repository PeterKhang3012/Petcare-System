const {
  fail,
  invalid,
  object,
  text,
  key,
  integer,
  fingerprint,
  transaction,
} = require("./platform");
const activities = [
  "BATH",
  "FEED",
  "CLEAN",
  "REST",
  "OBSERVE",
  "PREPARE_HANDOVER",
];
const optionalText = (value, name, max = 2000) => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > max)
    invalid(`Invalid ${name}`);
  return value.trim();
};
function belongings(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) invalid(`Invalid ${name}`);
  return value.map((v) => text(v, name, 100));
}
function input(action, body) {
  object(body, [
    "request_id",
    "reason",
    ...(action === "CHECK_IN"
      ? ["initial_condition", "care_instructions", "belongings"]
      : ["recipient_name", "returned_belongings", "notes"]),
  ]);
  const draft =
    action === "CHECK_IN"
      ? {
          initial_condition: text(
            body.initial_condition,
            "initial_condition",
            2000,
          ),
          care_instructions: optionalText(
            body.care_instructions,
            "care_instructions",
          ),
          belongings: belongings(body.belongings, "belongings"),
        }
      : {
          recipient_name: text(body.recipient_name, "recipient_name"),
          returned_belongings: belongings(
            body.returned_belongings,
            "returned_belongings",
          ),
          notes: optionalText(body.notes, "notes"),
        };
  return {
    request_id: key(body.request_id, "request_id"),
    reason: text(body.reason, "reason", 500),
    draft,
  };
}
function snapshot(b) {
  const p = b.pet_snapshot,
    s = b.service_snapshot;
  return {
    pet: {
      id: b.pet_id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      weight_kg: p.weight_kg,
      care_notes: p.care_notes,
      version: b.pet_version,
    },
    service: {
      service_id: b.service_id,
      name: s.name,
      type: s.type,
      duration_minutes: b.duration_minutes,
    },
    resource_id: b.resource_id,
    start_at: b.start_at,
    end_at: b.end_at,
  };
}
class Care {
  constructor({ connection, models, client, clock = () => new Date() }) {
    Object.assign(this, { connection, models, client, clock });
  }
  same(request, hash) {
    if (request.fingerprint !== hash)
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "request_id was already used with different content or actor",
      );
  }
  async queue(action, bookingId, body, actorId, bearer, correlationId) {
    const parsed = input(action, body),
      hash = fingerprint({
        action,
        booking_id: bookingId,
        actor_id: actorId,
        ...parsed,
      });
    const replay = await this.models.Request.findById(parsed.request_id).lean();
    if (replay) {
      this.same(replay, hash);
      return { requestId: replay._id, replayed: true };
    }
    const b = await this.client.context(bookingId, bearer, correlationId);
    if (b.status !== (action === "CHECK_IN" ? "CONFIRMED" : "CHECKED_IN"))
      fail(
        409,
        "INVALID_BOOKING_STATE",
        "Booking is not ready for this operation",
      );
    return transaction(this.connection, async (session) => {
      const old = await this.models.Request.findById(parsed.request_id)
        .session(session)
        .lean();
      if (old) {
        this.same(old, hash);
        return { requestId: old._id, replayed: true };
      }
      let visit = await this.models.Visit.findOne({ booking_id: bookingId })
        .session(session)
        .lean();
      if (visit)
        visit = await this.models.Visit.findOneAndUpdate(
          { _id: visit._id },
          { $inc: { revision: 1 } },
          { session, returnDocument: "after" },
        ).lean();
      else {
        if (action !== "CHECK_IN")
          fail(
            409,
            "INVALID_CARE_STATE",
            "Reception must complete before handover",
          );
        [visit] = await this.models.Visit.create(
          [
            {
              booking_id: bookingId,
              owner_id: b.owner_id,
              pet_id: b.pet_id,
              snapshot: snapshot(b),
              state: "PENDING",
              sync_state: "PENDING",
            },
          ],
          { session },
        );
      }
      if (visit.owner_id !== b.owner_id || visit.pet_id !== b.pet_id)
        fail(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "Booking ownership does not match the reception snapshot",
        );
      if (visit.pending_request_id)
        fail(
          409,
          "SYNC_IN_PROGRESS",
          "Recover the existing request before creating another one",
        );
      if (visit.state !== (action === "CHECK_IN" ? "PENDING" : "IN_CARE"))
        fail(
          409,
          "INVALID_CARE_STATE",
          "The visit cannot perform this operation",
        );
      const payload = {
        request_id: parsed.request_id,
        booking_id: bookingId,
        actor_id: actorId,
        reason: parsed.reason,
      };
      await this.models.Request.create(
        [
          {
            _id: parsed.request_id,
            visit_id: visit._id,
            action,
            fingerprint: hash,
            payload,
            draft: parsed.draft,
            status: "PENDING",
            next_attempt_at: this.clock(),
          },
        ],
        { session },
      );
      await this.models.Visit.updateOne(
        { _id: visit._id },
        {
          $set: {
            pending_request_id: parsed.request_id,
            sync_state: "PENDING",
          },
        },
        { session },
      );
      return { requestId: parsed.request_id, replayed: false };
    });
  }
  async ownVisit(visitId, user, session) {
    const row = await this.models.Visit.findOne({
      _id: visitId,
      ...(user.role === "USER" ? { owner_id: user.id } : {}),
    })
      .session(session || null)
      .lean();
    if (!row) fail(404, "NOT_FOUND", "Visit not found");
    return row;
  }
  async addLog(visitId, body, actorId) {
    object(body, ["request_id", "activity", "notes"]);
    const data = {
      request_id: key(body.request_id, "request_id"),
      activity: body.activity,
      notes: text(body.notes, "notes", 2000),
    };
    if (!activities.includes(data.activity)) invalid("Invalid activity");
    const hash = fingerprint({ ...data, actor_id: actorId });
    return transaction(this.connection, async (session) => {
      const old = await this.models.Log.findOne({
        visit_id: visitId,
        request_id: data.request_id,
      })
        .session(session)
        .lean();
      if (old) {
        this.same(old, hash);
        return old;
      }
      const visit = await this.models.Visit.findOneAndUpdate(
        { _id: visitId },
        { $inc: { revision: 1 } },
        { session, returnDocument: "after" },
      ).lean();
      if (!visit) fail(404, "NOT_FOUND", "Visit not found");
      if (visit.state !== "IN_CARE" || visit.pending_request_id)
        fail(
          409,
          "INVALID_CARE_STATE",
          "New activity requires an active visit without a pending handover",
        );
      const [log] = await this.models.Log.create(
        [
          {
            ...data,
            visit_id: visitId,
            actor_id: actorId,
            fingerprint: hash,
            version: 1,
          },
        ],
        { session },
      );
      return log;
    });
  }
  async editLog(visitId, logId, body, actorId) {
    object(body, ["activity", "notes", "expected_version", "reason"]);
    const expected = integer(body.expected_version, "expected_version"),
      reason = text(body.reason, "reason", 500),
      changes = {};
    if (body.activity !== undefined) {
      if (!activities.includes(body.activity)) invalid("Invalid activity");
      changes.activity = body.activity;
    }
    if (body.notes !== undefined)
      changes.notes = text(body.notes, "notes", 2000);
    if (!Object.keys(changes).length)
      invalid("An activity or notes change is required");
    const old = await this.models.Log.findOne({
      _id: logId,
      visit_id: visitId,
    }).lean();
    if (!old) fail(404, "NOT_FOUND", "Log not found");
    if (old.version !== expected)
      fail(
        409,
        "LOG_VERSION_CONFLICT",
        "Reload the current log version before editing",
      );
    const after = {
      activity: changes.activity || old.activity,
      notes: changes.notes || old.notes,
    };
    const updated = await this.models.Log.findOneAndUpdate(
      { _id: logId, visit_id: visitId, version: expected },
      {
        $set: changes,
        $inc: { version: 1 },
        $push: {
          edits: {
            before: { activity: old.activity, notes: old.notes },
            after,
            reason,
            actor_id: actorId,
            at: this.clock(),
            from_version: expected,
          },
        },
      },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!updated)
      fail(
        409,
        "LOG_VERSION_CONFLICT",
        "Reload the current log version before editing",
      );
    return updated;
  }
}
module.exports = { Care, input };
