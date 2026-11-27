const { baseApp, finishApp, authenticate, requireRole, internalAuth, id, object, pagination, requestKey, fail, invalid, timestamp, dateOnly } = require('./platform');
const { createModels, present } = require('./models');
const { adapters } = require('./adapters');
const { supportsTransactions } = require('./transactions');
const { bookingInput, overlap, DAY } = require('./time');
const { BookingService } = require('./booking');
const { ResourceOperations } = require('./operations');
const { createWorkers } = require('./workers');
function outcome(res, result) {
  if (result.status >= 400) return res.status(result.status).json({ success: false, code: result.code, message: result.message });
  return res.status(result.status).json({ success: true, data: result.data });
}
function createApp({ config, connection, logger, clock, clients = adapters(config) }) {
  const models = createModels(connection);
  const service = new BookingService({ config, connection, models, clients, clock });
  const operations = new ResourceOperations(service), workers = createWorkers(service, operations, logger);
  const app = baseApp({ service: 'booking', connection, logger, ready: () => supportsTransactions(connection) });
  Object.assign(app.locals, { models, service, operations, workers });
  const credential = { payment: config.tokens.PAYMENT_TO_BOOKING_TOKEN, care: config.tokens.CARE_TO_BOOKING_TOKEN };
  app.get('/internal/bookings/:id/payment-context', internalAuth(credential, ['payment']), async (req, res) => res.json({ success: true, data: { booking: await service.paymentContext(id(req.params.id)) } }));
  app.post('/internal/bookings/payment-events', internalAuth(credential, ['payment']), async (req, res) => res.json({ success: true, data: await service.payment(req.body) }));
  app.get('/internal/bookings/:id/care-time', internalAuth(credential, ['care']), async (req, res) => res.json({ success: true, data: await service.careTime(id(req.params.id)) }));
  for (const operation of ['check-in', 'check-out']) app.post(`/internal/bookings/${operation}`, internalAuth(credential, ['care']), async (req, res) => outcome(res, await service.care(operation, req.body)));
  app.get('/internal/care/requests/:requestId', internalAuth(credential, ['care']), async (req, res) => {
    const found = await models.Processed.findOne({ scope: 'CARE', key: requestKey(req.params.requestId, 'request_id') }).lean();
    if (!found) fail(404, 'NOT_FOUND', 'Care request not found');
    res.json({ success: true, data: { request_id: found.key, result: found.result } });
  });
  app.use('/api', authenticate(config));
  app.use('/api/bookings', requireRole('USER'));
  app.post('/api/bookings/quotes', async (req, res) => res.json({ success: true, data: { quote: service.quoteView(await service.prepare(bookingInput(req.body), req.user.id, req.correlationId)) } }));
  app.get('/api/bookings/availability', async (req, res) => {
    if (req.query.date !== undefined) {
      object(req.query, ['date', 'pet_id', 'service_id']);
      const date = dateOnly(req.query.date, 'date');
      const input = bookingInput({ pet_id: req.query.pet_id, service_id: req.query.service_id, start_at: `${date}T08:00:00+07:00` });
      return res.json({ success: true, data: await service.dailyAvailability(date, input, req.user.id, req.correlationId) });
    }
    const prepared = await service.prepare(bookingInput(req.query), req.user.id, req.correlationId);
    res.json({ success: true, data: await service.availability(prepared) });
  });
  app.post('/api/bookings', async (req, res) => {
    const input = bookingInput(req.body, true), key = requestKey(req.headers['idempotency-key']);
    const result = await service.create(input, req.user.id, key, req.correlationId);
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  });
  app.get('/api/bookings', async (req, res) => {
    object(req.query, ['page', 'limit', 'status', 'pet_id']);
    const { page, limit, skip } = pagination(req.query);
    const filter = { owner_id: req.user.id };
    if (req.query.pet_id) filter.pet_id = id(req.query.pet_id, 'pet_id');
    if (req.query.status) {
      if (!['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(req.query.status)) invalid('Invalid status');
      if (req.query.status === 'EXPIRED') filter.$or = [{ status: 'EXPIRED' }, { status: 'PENDING_PAYMENT', expires_at: { $lte: service.clock() } }];
      else if (req.query.status === 'PENDING_PAYMENT') { filter.status = 'PENDING_PAYMENT'; filter.expires_at = { $gt: service.clock() }; }
      else filter.status = req.query.status;
    }
    const [bookings, total] = await Promise.all([models.Booking.find(filter).sort({ created_at: -1, _id: -1 }).skip(skip).limit(limit).lean(), models.Booking.countDocuments(filter)]);
    const effective = [];
    for (const booking of bookings) effective.push(present(await service.get(booking._id, req.user.id)));
    res.json({ success: true, data: { bookings: effective, page, limit, total } });
  });
  app.get('/api/bookings/pet-statuses', async (req, res) => {
    object(req.query, ['pet_ids']);
    const values = typeof req.query.pet_ids === 'string' ? req.query.pet_ids.split(',') : [];
    if (!values.length || values.length > 20) invalid('Provide 1 to 20 pet IDs');
    const petIds = values.map(value => id(value, 'pet_ids'));
    res.json({ success: true, data: { statuses: await service.petBookingStatuses(req.user.id, petIds) } });
  });
  app.get('/api/bookings/:id', async (req, res) => res.json({ success: true, data: { booking: present(await service.get(id(req.params.id), req.user.id)) } }));
  app.get('/api/bookings/:id/history', async (req, res) => {
    await service.get(id(req.params.id), req.user.id); object(req.query, ['page', 'limit']);
    const { page, limit, skip } = pagination(req.query), filter = { booking_id: req.params.id };
    const [history, total] = await Promise.all([models.History.find(filter).sort({ at: 1, _id: 1 }).skip(skip).limit(limit).lean(), models.History.countDocuments(filter)]);
    res.json({ success: true, data: { history: history.map(present), page, limit, total } });
  });
  app.post('/api/bookings/:id/cancel', async (req, res) => outcome(res, await service.cancel(id(req.params.id), req.user.id, requestKey(req.headers['idempotency-key']), req.body)));
  app.use('/api/staff', requireRole('STAFF'));
  app.get('/api/staff/bookings', async (req, res) => {
    object(req.query, ['from', 'to', 'page', 'limit']);
    const from = req.query.from ? timestamp(req.query.from, 'from') : service.clock();
    const to = req.query.to ? timestamp(req.query.to, 'to') : new Date(+from + 7 * DAY);
    if (+to <= +from || +to - +from > 31 * DAY) invalid('Schedule range must be positive and at most 31 days');
    const { page, limit, skip } = pagination(req.query), filter = overlap(from, to);
    const [bookings, total] = await Promise.all([models.Booking.find(filter).sort({ start_at: 1, _id: 1 }).skip(skip).limit(limit).lean(), models.Booking.countDocuments(filter)]);
    const effective = [];
    for (const booking of bookings) effective.push(present(await service.get(booking._id)));
    res.json({ success: true, data: { bookings: effective, page, limit, total } });
  });
  app.get('/api/staff/bookings/:id', async (req, res) => res.json({ success: true, data: service.staffView(await service.get(id(req.params.id))) }));
  app.post('/api/staff/bookings/:id/demo-clock', async (req, res) => res.json({ success: true,
    data: await service.advanceDemo(id(req.params.id), req.user, requestKey(req.headers['idempotency-key']), req.body) }));
  app.get('/api/staff/resources', async (req, res) => {
    object(req.query, ['page', 'limit', 'group', 'state']); const filter = {};
    if (req.query.group) { if (!['CARE', 'BOARDING'].includes(req.query.group)) invalid('Invalid group'); filter.group = req.query.group; }
    if (req.query.state) { if (!['READY', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE'].includes(req.query.state)) invalid('Invalid state'); filter.state = req.query.state; }
    const { page, limit, skip } = pagination(req.query);
    const [resources, total] = await Promise.all([models.Resource.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(), models.Resource.countDocuments(filter)]);
    res.json({ success: true, data: { resources: resources.map(present), page, limit, total } });
  });
  app.post('/api/staff/resources/:id/cleaning-complete', async (req, res) => res.json({ success: true, data: { resource: await operations.clean(id(req.params.id), req.user.id, req.body) } }));
  app.post('/api/staff/resources/:id/maintenance', async (req, res) => res.status(201).json({ success: true, data: { maintenance: await operations.maintenance(id(req.params.id), req.user.id, req.body) } }));
  app.post('/api/staff/resources/:id/maintenance/:maintenanceId/cancel', async (req, res) => res.json({ success: true, data: { maintenance: await operations.cancelMaintenance(id(req.params.id), id(req.params.maintenanceId), req.user.id, req.body) } }));
  for (const category of ['history', 'maintenance']) app.get(`/api/staff/resources/:id/${category}`, async (req, res) => {
    const resourceId = id(req.params.id); if (!await models.Resource.exists({ _id: resourceId })) fail(404, 'NOT_FOUND', 'Resource not found');
    object(req.query, ['page', 'limit']); const { page, limit, skip } = pagination(req.query);
    const model = category === 'history' ? models.History : models.Maintenance, filter = { resource_id: resourceId };
    const [rows, total] = await Promise.all([model.find(filter).sort(category === 'history' ? { at: -1, _id: -1 } : { start_at: -1, _id: -1 }).skip(skip).limit(limit).lean(), model.countDocuments(filter)]);
    res.json({ success: true, data: { [category]: rows.map(present), page, limit, total } });
  });
  return finishApp(app);
}
module.exports = { createApp };
