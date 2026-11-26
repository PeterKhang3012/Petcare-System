const { randomUUID } = require('node:crypto');
const { Schema } = require('mongoose');
const { fail, object, text, key, integer, transaction } = require('./platform');
function models(connection) {
  const priceRule = new Schema({
    price_rule_id: String, species: String, coat_type: String,
    min_weight_kg: Number, max_weight_kg: Number,
    max_inclusive: Boolean, unit_price: Number,
  }, { _id: false });
  const service = new Schema({ _id: String, name: { type: String, required: true }, type: { type: String, enum: ['CARE', 'BOARDING'], required: true },
    allowed_species: [{ type: String, enum: ['DOG', 'CAT'] }], min_weight_kg: Number, max_weight_kg: Number,
    unit: { type: String, enum: ['SERVICE', 'NIGHT'] }, duration_minutes: { type: Number, default: null }, active: { type: Boolean, default: true }, current_price_version_id: { type: String, required: true }
  }, { versionKey: false, strict: 'throw' });
  service.index({ active: 1, type: 1, _id: 1 });
  const version = new Schema({ _id: String, service_id: { type: String, required: true, immutable: true },
    unit_price: { type: Number, required: true, immutable: true, validate: v => Number.isSafeInteger(v) && v > 0 },
    price_rules: { type: [priceRule], default: undefined, immutable: true },
    price_rule_id: { type: String, immutable: true },
    currency: { type: String, enum: ['VND'], immutable: true, required: true }, old_unit_price: { type: Number, default: null, immutable: true },
    previous_price_version_id: { type: String, default: null, immutable: true }, actor_id: { type: String, required: true, immutable: true },
    reason: { type: String, required: true, immutable: true }, created_at: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw' });
  version.index({ service_id: 1, created_at: -1, _id: -1 });
  return { Service: connection.models.CatalogService || connection.model('CatalogService', service), Price: connection.models.PriceVersion || connection.model('PriceVersion', version) };
}
function presentVersion(row) {
  const { _id, price_rules, ...data } = row.toObject ? row.toObject() : row; return { price_version_id: _id, ...data };
}
class Catalog {
  constructor(connection, data = models(connection), clock = () => new Date()) { Object.assign(this, { connection, data, clock }); }
  async quote(serviceId, pet) {
    const service = await this.data.Service.findOne({ _id: serviceId, active: true }).lean();
    if (!service) fail(404, 'NOT_FOUND', 'Active service not found');
    // Old versions are immutable and retained: a concurrent pointer change cannot tear this quote.
    const price = await this.data.Price.findById(service.current_price_version_id).lean();
    if (!price || price.service_id !== serviceId) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Price data is not ready');
    const { _id, active, current_price_version_id, ...details } = service;
    const view = { service_id: _id, ...details, price_version_id: price._id, unit_price: price.unit_price, currency: price.currency };
    if (!price.price_rules?.length) return view;
    if (!pet) return { ...view, price_rules: price.price_rules };
    const { species, weight_kg, coat_type } = pet;
    if (!coat_type) fail(400, 'PET_COAT_REQUIRED', 'Update the pet profile with its coat type');
    const matching = price.price_rules.filter(rule => rule.species === species &&
      (!rule.coat_type || rule.coat_type === coat_type) &&
      weight_kg >= rule.min_weight_kg &&
      (rule.max_inclusive ? weight_kg <= rule.max_weight_kg : weight_kg < rule.max_weight_kg));
    if (!matching.length) fail(400, 'PET_PRICE_NOT_SUPPORTED', 'No price group supports this pet');
    if (matching.length !== 1) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Overlapping Catalog price groups');
    const rule = matching[0];
    return { ...view, unit_price: rule.unit_price, price_rule_id: rule.price_rule_id };
  }
  async update(serviceId, body, actorId) {
    object(body, ['unit_price', 'reason', 'expected_price_version', 'price_rule_id']);
    const unitPrice = integer(body.unit_price, 'unit_price'), reason = text(body.reason, 'reason', 500), expected = key(body.expected_price_version, 'expected_price_version', 100);
    return transaction(this.connection, async session => {
      const service = await this.data.Service.findOne({ _id: serviceId, active: true }).session(session).lean();
      if (!service) fail(404, 'NOT_FOUND', 'Active service not found');
      if (service.current_price_version_id !== expected) fail(409, 'PRICE_VERSION_CONFLICT', 'Reload the current price version before updating');
      const old = await this.data.Price.findById(expected).session(session).lean();
      if (!old || old.service_id !== serviceId) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Price data is not ready');
      let priceRules, ruleId, previousUnitPrice = old.unit_price;
      if (old.price_rules?.length) {
        ruleId = key(body.price_rule_id, 'price_rule_id', 100);
        const rule = old.price_rules.find(item => item.price_rule_id === ruleId);
        if (!rule) fail(400, 'VALIDATION_ERROR', 'Unknown price group');
        previousUnitPrice = rule.unit_price;
        priceRules = old.price_rules.map(item => item.price_rule_id === ruleId ? { ...item, unit_price: unitPrice } : item);
      } else if (body.price_rule_id !== undefined) {
        fail(400, 'VALIDATION_ERROR', 'This service has a single price');
      }
      const [price] = await this.data.Price.create([{ _id: `price-${randomUUID()}`, service_id: serviceId, unit_price: unitPrice, currency: 'VND',
        price_rules: priceRules, price_rule_id: ruleId, old_unit_price: previousUnitPrice, previous_price_version_id: old._id,
        actor_id: actorId, reason, created_at: this.clock() }], { session });
      const changed = await this.data.Service.updateOne({ _id: serviceId, current_price_version_id: expected }, { $set: { current_price_version_id: price._id } }, { session });
      if (changed.modifiedCount !== 1) fail(409, 'PRICE_VERSION_CONFLICT', 'The price changed concurrently');
      return presentVersion(price);
    });
  }
}
module.exports = { models, Catalog, presentVersion };
