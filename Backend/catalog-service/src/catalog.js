const { randomUUID } = require('node:crypto');
const { Schema } = require('mongoose');
const { fail, object, text, key, integer, transaction } = require('./platform');
function models(connection) {
  const service = new Schema({ _id: String, name: { type: String, required: true }, type: { type: String, enum: ['CARE', 'BOARDING'], required: true },
    allowed_species: [{ type: String, enum: ['DOG', 'CAT'] }], min_weight_kg: Number, max_weight_kg: Number,
    unit: { type: String, enum: ['SERVICE', 'NIGHT'] }, duration_minutes: { type: Number, default: null }, active: { type: Boolean, default: true }, current_price_version_id: { type: String, required: true }
  }, { versionKey: false, strict: 'throw' });
  service.index({ active: 1, type: 1, _id: 1 });
  const version = new Schema({ _id: String, service_id: { type: String, required: true, immutable: true },
    unit_price: { type: Number, required: true, immutable: true, validate: v => Number.isSafeInteger(v) && v > 0 },
    currency: { type: String, enum: ['VND'], immutable: true, required: true }, old_unit_price: { type: Number, default: null, immutable: true },
    previous_price_version_id: { type: String, default: null, immutable: true }, actor_id: { type: String, required: true, immutable: true },
    reason: { type: String, required: true, immutable: true }, created_at: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw' });
  version.index({ service_id: 1, created_at: -1, _id: -1 });
  return { Service: connection.models.CatalogService || connection.model('CatalogService', service), Price: connection.models.PriceVersion || connection.model('PriceVersion', version) };
}
function presentVersion(row) {
  const { _id, ...data } = row.toObject ? row.toObject() : row; return { price_version_id: _id, ...data };
}
class Catalog {
  constructor(connection, data = models(connection), clock = () => new Date()) { Object.assign(this, { connection, data, clock }); }
  async quote(serviceId) {
    const service = await this.data.Service.findOne({ _id: serviceId, active: true }).lean();
    if (!service) fail(404, 'NOT_FOUND', 'Active service not found');
    // Old versions are immutable and retained: a concurrent pointer change cannot tear this quote.
    const price = await this.data.Price.findById(service.current_price_version_id).lean();
    if (!price || price.service_id !== serviceId) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Price data is not ready');
    const { _id, active, current_price_version_id, ...details } = service;
    return { service_id: _id, ...details, price_version_id: price._id, unit_price: price.unit_price, currency: price.currency };
  }
  async update(serviceId, body, actorId) {
    object(body, ['unit_price', 'reason', 'expected_price_version']);
    const unitPrice = integer(body.unit_price, 'unit_price'), reason = text(body.reason, 'reason', 500), expected = key(body.expected_price_version, 'expected_price_version', 100);
    return transaction(this.connection, async session => {
      const service = await this.data.Service.findOne({ _id: serviceId, active: true }).session(session).lean();
      if (!service) fail(404, 'NOT_FOUND', 'Active service not found');
      if (service.current_price_version_id !== expected) fail(409, 'PRICE_VERSION_CONFLICT', 'Reload the current price version before updating');
      const old = await this.data.Price.findById(expected).session(session).lean();
      if (!old || old.service_id !== serviceId) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Price data is not ready');
      const [price] = await this.data.Price.create([{ _id: `price-${randomUUID()}`, service_id: serviceId, unit_price: unitPrice, currency: 'VND',
        old_unit_price: old.unit_price, previous_price_version_id: old._id, actor_id: actorId, reason, created_at: this.clock() }], { session });
      const changed = await this.data.Service.updateOne({ _id: serviceId, current_price_version_id: expected }, { $set: { current_price_version_id: price._id } }, { session });
      if (changed.modifiedCount !== 1) fail(409, 'PRICE_VERSION_CONFLICT', 'The price changed concurrently');
      return presentVersion(price);
    });
  }
}
module.exports = { models, Catalog, presentVersion };
