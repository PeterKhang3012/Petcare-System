const { baseApp, finishApp, authenticate, staffOnly, object, pagination, id, key, fail } = require('./platform');
const { models, visitView, requestView, logView } = require('./models');
const { bookingClient } = require('./booking-client');
const { Care } = require('./care');
const { SyncWorker } = require('./workers');
function createApp({ config, connection, logger, clock, client = bookingClient(config) }) {
  const data = models(connection), service = new Care({ connection, models: data, client, clock }), worker = new SyncWorker({ connection, models: data, client, config, clock, logger });
  const app = baseApp('care', connection, logger); Object.assign(app.locals, { models: data, service, worker });
  app.use('/api/care', authenticate(config));
  for (const [path, action] of [['check-in', 'CHECK_IN'], ['check-out', 'CHECK_OUT']]) app.post(`/api/care/bookings/:bookingId/${path}`, staffOnly, async (req, res) => {
    const queued = await service.queue(action, id(req.params.bookingId, 'booking_id'), req.body, req.user.id, req.bearer, req.correlationId);
    await worker.process(queued.requestId);
    const request = await data.Request.findById(queued.requestId).lean(), visit = await data.Visit.findById(request.visit_id).lean();
    if (request.status === 'REJECTED') return res.status(request.result.status).json({ success: false, code: request.result.code, message: request.result.message, details: { request_id: request._id, visit_id: String(visit._id) } });
    res.status(request.status === 'PENDING' ? 202 : queued.replayed ? 200 : 201).json({ success: true, data: { visit: visitView(visit), request: requestView(request) } });
  });
  app.get('/api/care/visits', async (req, res) => {
    object(req.query, ['page', 'limit', 'state']); const filter = req.user.role === 'USER' ? { owner_id: req.user.id } : {};
    if (req.query.state) { if (!['PENDING', 'IN_CARE', 'COMPLETED'].includes(req.query.state)) fail(400, 'VALIDATION_ERROR', 'Invalid state'); filter.state = req.query.state; }
    const { page, limit, skip } = pagination(req.query);
    const [rows, total] = await Promise.all([data.Visit.find(filter).sort({ created_at: -1, _id: -1 }).skip(skip).limit(limit).lean(), data.Visit.countDocuments(filter)]);
    res.json({ success: true, data: { visits: rows.map(visitView), page, limit, total } });
  });
  app.get('/api/care/visits/:id', async (req, res) => res.json({ success: true, data: { visit: visitView(await service.ownVisit(id(req.params.id), req.user)) } }));
  app.get('/api/care/requests/:requestId', async (req, res) => {
    const request = await data.Request.findById(key(req.params.requestId, 'request_id')).lean();
    if (!request) fail(404, 'NOT_FOUND', 'Request not found');
    await service.ownVisit(request.visit_id, req.user); res.json({ success: true, data: { request: requestView(request) } });
  });
  app.get('/api/care/visits/:id/logs', async (req, res) => {
    const visitId = id(req.params.id); await service.ownVisit(visitId, req.user); object(req.query, ['page', 'limit']);
    const { page, limit, skip } = pagination(req.query), filter = { visit_id: visitId };
    const [rows, total] = await Promise.all([data.Log.find(filter).sort({ created_at: 1, _id: 1 }).skip(skip).limit(limit).lean(), data.Log.countDocuments(filter)]);
    res.json({ success: true, data: { logs: rows.map(logView), page, limit, total } });
  });
  app.post('/api/care/visits/:id/logs', staffOnly, async (req, res) => res.status(201).json({ success: true, data: { log: logView(await service.addLog(id(req.params.id), req.body, req.user.id)) } }));
  app.patch('/api/care/visits/:id/logs/:logId', staffOnly, async (req, res) => res.json({ success: true, data: { log: logView(await service.editLog(id(req.params.id), id(req.params.logId), req.body, req.user.id)) } }));
  return finishApp(app);
}
module.exports = { createApp };
