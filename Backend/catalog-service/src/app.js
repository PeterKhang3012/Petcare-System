const { baseApp, finishApp, authenticate, staffOnly, internalAuth, object, key, invalid, pagination, fail } = require('./platform');
const { models, Catalog, presentVersion } = require('./catalog');
const serviceView = quote => ({ ...quote, active: true, current_price_version_id: quote.price_version_id });
function createApp({ config, connection, logger, clock }) {
  const data = models(connection), catalog = new Catalog(connection, data, clock);
  const app = baseApp('catalog', connection, logger); Object.assign(app.locals, { models: data, catalog });
  app.post('/internal/catalog/quotes', internalAuth(config.token), async (req, res) => {
    object(req.body, ['service_id', 'species', 'weight_kg']);
    const serviceId = key(req.body.service_id, 'service_id', 100);
    if (!['DOG', 'CAT'].includes(req.body.species) || typeof req.body.weight_kg !== 'number' || !Number.isFinite(req.body.weight_kg) || req.body.weight_kg <= 0) invalid('Invalid pet species or weight');
    // Booking applies these conditions as well as its own scheduling/resource rules.
    res.json({ success: true, data: { quote: await catalog.quote(serviceId) } });
  });
  app.use('/api/catalog', authenticate(config));
  app.get('/api/catalog/services', async (req, res) => {
    object(req.query, ['page', 'limit', 'type', 'species']); const filter = { active: true };
    if (req.query.type) { if (!['CARE', 'BOARDING'].includes(req.query.type)) invalid('Invalid type'); filter.type = req.query.type; }
    if (req.query.species) { if (!['DOG', 'CAT'].includes(req.query.species)) invalid('Invalid species'); filter.allowed_species = req.query.species; }
    const { page, limit, skip } = pagination(req.query);
    const [rows, total] = await Promise.all([data.Service.find(filter).sort({ _id: 1 }).skip(skip).limit(limit).lean(), data.Service.countDocuments(filter)]);
    const services = await Promise.all(rows.map(async row => serviceView(await catalog.quote(row._id))));
    res.json({ success: true, data: { services, page, limit, total } });
  });
  app.get('/api/catalog/services/:serviceId', async (req, res) => res.json({ success: true, data: { service: serviceView(await catalog.quote(key(req.params.serviceId, 'service_id', 100))) } }));
  app.get('/api/catalog/services/:serviceId/price-history', staffOnly, async (req, res) => {
    const serviceId = key(req.params.serviceId, 'service_id', 100); object(req.query, ['page', 'limit']);
    if (!await data.Service.exists({ _id: serviceId })) fail(404, 'NOT_FOUND', 'Service not found');
    const { page, limit, skip } = pagination(req.query), filter = { service_id: serviceId };
    const [rows, total] = await Promise.all([data.Price.find(filter).sort({ created_at: -1, _id: -1 }).skip(skip).limit(limit).lean(), data.Price.countDocuments(filter)]);
    res.json({ success: true, data: { history: rows.map(presentVersion), page, limit, total } });
  });
  app.patch('/api/catalog/services/:serviceId/price', staffOnly, async (req, res) => {
    if (!req.user.permissions.includes('UPDATE_SERVICE_PRICE')) fail(403, 'FORBIDDEN', 'UPDATE_SERVICE_PRICE required');
    const version = await catalog.update(key(req.params.serviceId, 'service_id', 100), req.body, req.user.id);
    res.json({ success: true, data: { price: version } });
  });
  return finishApp(app);
}
module.exports = { createApp };
