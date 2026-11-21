const { Schema } = require('mongoose');
function createModels(connection) {
  const timestamps = { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false, strict: 'throw' };
  const money = { type: Number, required: true, validate: v => Number.isSafeInteger(v) && v > 0 };
  const resource = new Schema({
    code: { type: String, unique: true, required: true }, group: { type: String, enum: ['CARE', 'BOARDING'], required: true },
    species: [{ type: String, enum: ['DOG', 'CAT'] }], max_weight_kg: { type: Number, required: true },
    state: { type: String, enum: ['READY', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE'], default: 'READY' },
    occupied_booking_id: { type: Schema.Types.ObjectId, default: null }, schedule_version: { type: Number, default: 0 }
  }, timestamps);
  resource.index({ group: 1, species: 1, max_weight_kg: 1 });
  const booking = new Schema({
    owner_id: { type: String, required: true, immutable: true }, pet_id: { type: String, required: true, immutable: true },
    pet_version: { type: Number, required: true }, pet_snapshot: { type: Schema.Types.Mixed, required: true },
    service_id: { type: String, required: true }, service_snapshot: { type: Schema.Types.Mixed, required: true },
    price_version_id: { type: String, required: true }, unit_price: money, total_amount: money,
    currency: { type: String, enum: ['VND'], required: true }, quantity: Number, nights: Number,
    duration_minutes: { type: Number, required: true }, preparation_minutes: Number, cleaning_minutes: Number,
    start_at: { type: Date, required: true }, end_at: { type: Date, required: true },
    allocation_start_at: { type: Date, required: true }, allocation_end_at: { type: Date, required: true },
    resource_id: { type: Schema.Types.ObjectId, required: true }, expires_at: { type: Date, required: true },
    status: { type: String, required: true, enum: ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED'] },
    accepted_payment_id: String, confirmed_at: Date, checked_in_at: Date, completed_at: Date, cancelled_at: Date, expired_at: Date
  }, timestamps);
  booking.index({ owner_id: 1, created_at: -1, _id: -1 });
  booking.index({ pet_id: 1, status: 1, start_at: 1, end_at: 1 });
  booking.index({ status: 1, expires_at: 1 });
  booking.index({ start_at: 1, end_at: 1, _id: 1 });
  const allocation = new Schema({
    resource_id: { type: Schema.Types.ObjectId, required: true }, pet_id: String,
    booking_id: Schema.Types.ObjectId, maintenance_id: Schema.Types.ObjectId,
    type: { type: String, enum: ['BOOKING', 'MAINTENANCE'], required: true },
    start_at: { type: Date, required: true }, end_at: { type: Date, required: true },
    active: { type: Boolean, default: true }, hold_until: { type: Date, default: null }
  }, timestamps);
  allocation.index({ resource_id: 1, active: 1, start_at: 1, end_at: 1 });
  allocation.index({ booking_id: 1 }, { unique: true, partialFilterExpression: { booking_id: { $type: 'objectId' } } });
  const guard = new Schema({ _id: String, version: { type: Number, default: 0 } }, { versionKey: false });
  const processed = new Schema({ scope: String, key: String, fingerprint: String, result: Schema.Types.Mixed }, timestamps);
  processed.index({ scope: 1, key: 1 }, { unique: true });
  const history = new Schema({ booking_id: Schema.Types.ObjectId, resource_id: Schema.Types.ObjectId,
    action: String, from: String, to: String, actor_id: String, actor_type: String, reason: String, at: Date }, { versionKey: false });
  history.index({ booking_id: 1, at: 1, _id: 1 });
  history.index({ resource_id: 1, at: -1, _id: -1 });
  const maintenance = new Schema({ resource_id: { type: Schema.Types.ObjectId, required: true }, start_at: Date, end_at: Date,
    reason: String, actor_id: String, status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' }, cancelled_by: String, cancelled_at: Date }, timestamps);
  maintenance.index({ resource_id: 1, status: 1, start_at: 1, end_at: 1 });
  const paymentClaim = new Schema({ _id: String, booking_id: { type: Schema.Types.ObjectId, required: true } }, timestamps);
  const outbox = new Schema({ event_id: { type: String, unique: true, required: true }, type: { type: String, enum: ['REFUND_REQUESTED'] },
    payload: Schema.Types.Mixed, status: { type: String, enum: ['PENDING', 'DELIVERED'], default: 'PENDING' },
    attempts: { type: Number, default: 0 }, next_attempt_at: Date, lease_until: Date, lease_owner: String, delivered_at: Date }, timestamps);
  outbox.index({ status: 1, next_attempt_at: 1, lease_until: 1 });
  const schemas = { Resource: resource, Booking: booking, Allocation: allocation, PetGuard: guard, Processed: processed,
    History: history, Maintenance: maintenance, PaymentClaim: paymentClaim, Outbox: outbox };
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, connection.models[name] || connection.model(name, schema)]));
}
async function initialize(models) { for (const model of Object.values(models)) { await model.init(); await model.createIndexes(); } }
const present = row => { const result = row.toObject ? row.toObject() : { ...row }; result.id = String(result._id); delete result._id; return result; };
module.exports = { createModels, initialize, present };
