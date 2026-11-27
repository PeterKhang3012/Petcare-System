const { requestJson, fail, HttpError } = require('./platform');
const fixture = JSON.parse(JSON.stringify(require('../fixtures/catalog.json')));
for (const item of fixture) { Object.freeze(item.allowed_species); Object.freeze(item); } Object.freeze(fixture);
function validQuote(quote, serviceId) {
  if (!quote || quote.service_id !== serviceId || !['CARE', 'BOARDING'].includes(quote.type) || typeof quote.name !== 'string' || !quote.name || quote.name.length > 100 ||
    typeof quote.price_version_id !== 'string' || !quote.price_version_id || quote.price_version_id.length > 100 ||
    !Number.isSafeInteger(quote.unit_price) || quote.unit_price <= 0 || quote.currency !== 'VND' ||
    !Array.isArray(quote.allowed_species) || !quote.allowed_species.length || quote.allowed_species.some(s => !['DOG', 'CAT'].includes(s)) ||
    !Number.isFinite(quote.min_weight_kg) || quote.min_weight_kg < 0 || !Number.isFinite(quote.max_weight_kg) || quote.max_weight_kg <= quote.min_weight_kg ||
    (quote.type === 'CARE' && (quote.unit !== 'SERVICE' || !Number.isSafeInteger(quote.duration_minutes) || quote.duration_minutes < 1 || quote.duration_minutes > 600)) ||
    (quote.type === 'BOARDING' && ((!['NIGHT', 'DAY'].includes(quote.unit) || (quote.unit === 'DAY' && (!quote.room_tier || quote.unit_price % 2 !== 0))) || quote.duration_minutes !== null))) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Catalog quote');
  // Whitelist snapshots even for a remote dependency.
  if (quote.room_tier !== undefined && (quote.type !== 'BOARDING' || !['S', 'M', 'L', 'XL'].includes(quote.room_tier)
      || typeof quote.max_weight_inclusive !== 'boolean' || quote.allowed_species.length !== 1))
    fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Catalog room tier');
  const { room_tier, max_weight_inclusive, service_id, name, type, price_version_id, unit_price, currency, unit, duration_minutes, allowed_species, min_weight_kg, max_weight_kg, price_rule_id } = quote;
  if (price_rule_id !== undefined && (typeof price_rule_id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(price_rule_id)))
    fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Catalog price group');
  return { service_id, name, type, price_version_id, unit_price, currency, unit, duration_minutes, allowed_species: [...allowed_species], min_weight_kg, max_weight_kg,
    ...(room_tier ? { room_tier, max_weight_inclusive } : {}),
    ...(price_rule_id ? { price_rule_id } : {}) };
}
function adapters(config) {
  return {
    async pet(petId, ownerId, correlationId) {
      let result;
      try { result = await requestJson(`${config.petBaseUrl}/internal/pets/${petId}/booking-context?owner_id=${encodeURIComponent(ownerId)}`, { headers: { 'X-Service-Token': config.tokens.BOOKING_TO_PET_TOKEN, 'X-Correlation-ID': correlationId }, timeoutMs: config.timeoutMs }); }
      catch { fail(503, 'DEPENDENCY_UNAVAILABLE', 'Pet is unavailable'); }
      if (result.status === 404) fail(404, 'NOT_FOUND', 'An active pet owned by this user was not found');
      const pet = result.body?.data?.pet;
      if (result.status !== 200 || result.body.success !== true || !pet || pet.id !== petId || pet.owner_id !== ownerId ||
        !['DOG', 'CAT'].includes(pet.species) || !Number.isFinite(pet.weight_kg) || pet.weight_kg <= 0 || !Number.isSafeInteger(pet.version) || pet.version < 1 ||
        typeof pet.name !== 'string' || !pet.name || pet.name.length > 100 || (pet.breed !== undefined && (typeof pet.breed !== 'string' || pet.breed.length > 100)) ||
        (pet.care_notes !== undefined && (typeof pet.care_notes !== 'string' || pet.care_notes.length > 2000))) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Pet response');
      const { id, owner_id, name, species, breed, weight_kg, coat_type, care_notes, version } = pet;
      if (coat_type !== undefined && !['SHORT', 'LONG'].includes(coat_type)) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Pet coat type');
      return { id, owner_id, name, species, breed, weight_kg, coat_type, care_notes, version };
    },
    async catalog(serviceId, pet, correlationId) {
      let quote;
      if (config.catalogMode === 'fixture') {
        quote = fixture.find(item => item.service_id === serviceId);
        if (!quote) fail(404, 'NOT_FOUND', 'Demo service not found');
      } else {
        if (!config.catalogBaseUrl) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog has not been configured');
        let result;
        try { result = await requestJson(config.catalogBaseUrl + '/internal/catalog/quotes', { method: 'POST', body: { service_id: serviceId, species: pet.species, weight_kg: pet.weight_kg, coat_type: pet.coat_type },
          headers: { 'X-Service-Token': config.tokens.BOOKING_TO_CATALOG_TOKEN, 'X-Correlation-ID': correlationId }, timeoutMs: config.timeoutMs }); }
        catch { fail(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog is unavailable'); }
        if (result.status === 404) fail(404, 'NOT_FOUND', 'Service not found');
        if (result.status === 400 && ['PET_COAT_REQUIRED', 'PET_PRICE_NOT_SUPPORTED'].includes(result.body?.code))
          fail(400, result.body.code, result.body.message);
        if (result.status !== 200 || result.body.success !== true) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog is unavailable');
        quote = result.body.data?.quote;
      }
      return validQuote(quote, serviceId);
    },
    async refund(event) {
      if (!config.paymentBaseUrl) return false;
      try {
        const result = await requestJson(config.paymentBaseUrl + '/internal/payment/refund-requests', { method: 'POST', body: { event_id: event.event_id, ...event.payload },
          headers: { 'X-Service-Token': config.tokens.BOOKING_TO_PAYMENT_TOKEN, 'X-Correlation-ID': event.event_id }, timeoutMs: config.timeoutMs });
        return [200, 201, 202].includes(result.status) && result.body.success === true && result.body.data?.event_id === event.event_id;
      } catch { return false; }
    }
  };
}
module.exports = { adapters, validQuote };
