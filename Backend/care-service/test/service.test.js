const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, generateKeyPairSync } = require('node:crypto');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { models } = require('../src/models');
const { SyncWorker } = require('../src/workers');
const { bookingClient } = require('../src/booking-client');
const { initialize, databaseConfig } = require('../src/platform');
const { input } = require('../src/care');

test('Care validates drafts without trusting ownership or actor fields', () => {
  const valid = { request_id: 'request-1', reason: 'Reception', initial_condition: 'Healthy' };
  assert.equal(input('CHECK_IN', valid).draft.initial_condition, 'Healthy');
  for (const extra of [{ actor_id: 'x' }, { owner_id: 'x' }, { reason: ' ' }, { belongings: ['x'.repeat(101)] }]) assert.throws(() => input('CHECK_IN', { ...valid, ...extra }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => databaseConfig('care', { MONGODB_URI: 'mongodb://127.0.0.1/booking_db' }), /care_db/);
});
test('Care recovers and audits against live Booking/Catalog on a real replica set', { skip: !process.env.TEST_MONGODB_URI && 'Set TEST_MONGODB_URI to a disposable replica set (no DB mock is used)' }, async t => {
  const connections = [], servers = [], suffix = randomBytes(6).toString('hex');
  t.after(async () => { for (const s of servers.reverse()) { s.closeAllConnections(); await new Promise(r => s.close(r)); } for (const c of connections.reverse()) await c.close(); });
  const connect = async name => { const c = await mongoose.createConnection(process.env.TEST_MONGODB_URI, { dbName: `${name}_test_${suffix}`, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise(); connections.push(c); return c; };
  const listen = async app => { const s = app.listen(0, '127.0.0.1'); servers.push(s); await new Promise(r => s.once('listening', r)); return `http://127.0.0.1:${s.address().port}`; };
  const request = async (base, path, { method = 'GET', body, token, credential, key } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(credential ? { 'X-Service-Token': credential } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  let now = new Date('2030-01-01T02:00:00Z'), sequence = 1, authStatus = 200, authCalls = 0, malformedAuth = false;
  const clock = () => new Date(now), logger = { info() {}, error() {} };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const people = Object.fromEntries(['alice', 'bob', 'staff'].map(name => [name, { id: randomBytes(12).toString('hex'), username: name, role: name === 'staff' ? 'STAFF' : 'USER', permissions: [] }]));
  const tokens = Object.fromEntries(Object.entries(people).map(([name, user]) => [name, jwt.sign({ username: name, role: user.role, permissions: [] }, pair.privateKey, { algorithm: 'RS256', subject: user.id, issuer: 'care-test', expiresIn: '1h' })]));
  const auth = http.createServer((req, res) => {
    authCalls++; let identity;
    try { const sub = jwt.verify((req.headers.authorization || '').slice(7), pair.publicKey, { algorithms: ['RS256'], issuer: 'care-test' }).sub; identity = Object.values(people).find(p => p.id === sub); } catch {}
    res.setHeader('Content-Type', 'application/json'); res.statusCode = identity ? authStatus : 401; res.end(malformedAuth ? 'null' : JSON.stringify({ success: res.statusCode === 200, data: { user: identity } }));
  });
  await new Promise(r => auth.listen(0, '127.0.0.1', r)); servers.push(auth);
  const common = { publicKey, issuer: 'care-test', authBaseUrl: `http://127.0.0.1:${auth.address().port}`, timeoutMs: 1000 };
  const catalogConnection = await connect('catalog');
  const catalogApp = require('../../catalog-service/src/app').createApp({ connection: catalogConnection, config: { ...common, token: 'q'.repeat(40) }, clock, logger });
  await initialize(catalogApp.locals.models); await require('../../catalog-service/scripts/seed').seed(catalogConnection, catalogApp.locals.models);
  const catalogBase = await listen(catalogApp), petRows = new Map();
  const pet = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'), row = petRows.get(url.pathname.split('/')[3]);
    res.setHeader('Content-Type', 'application/json'); res.statusCode = row && row.owner_id === url.searchParams.get('owner_id') ? 200 : 404;
    res.end(JSON.stringify({ success: res.statusCode === 200, data: { pet: row } }));
  });
  await new Promise(r => pet.listen(0, '127.0.0.1', r)); servers.push(pet);
  const bookingConnection = await connect('booking'), careToken = 'c'.repeat(40), paymentToken = 'y'.repeat(40);
  const bookingConfig = { ...common, catalogMode: 'http', catalogBaseUrl: catalogBase, petBaseUrl: `http://127.0.0.1:${pet.address().port}`, tokens: { BOOKING_TO_CATALOG_TOKEN: 'q'.repeat(40), BOOKING_TO_PET_TOKEN: 'p'.repeat(40), PAYMENT_TO_BOOKING_TOKEN: paymentToken, CARE_TO_BOOKING_TOKEN: careToken },
    hours: { open: '08:00', close: '18:00', boardingIn: '14:00', boardingOut: '12:00' }, preparationMinutes: 15, cleaningMinutes: 30, checkInEarlyMinutes: 60, checkInLateMinutes: 120, workerIntervalMs: 5000 };
  const bapp = require('../../booking-service/src/app').createApp({ connection: bookingConnection, config: bookingConfig, clock, logger });
  await require('../../booking-service/src/models').initialize(bapp.locals.models); await require('../../booking-service/scripts/seed-resources').seed(bapp.locals.models);
  const bookingBase = await listen(bapp), faults = { dropPost: false, internalDown: false, malformedContext: false, sawPersistedBeforeHttp: false };
  let data;
  const proxy = http.createServer(async (req, res) => {
    if (faults.malformedContext && req.url.startsWith('/api/staff/bookings/')) { res.setHeader('Content-Type', 'application/json'); res.end('null'); return; }
    if (faults.internalDown && req.url.startsWith('/internal/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: false })); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    if (req.method === 'POST' && req.url.startsWith('/internal/bookings/check-')) {
      const p = JSON.parse(body); faults.sawPersistedBeforeHttp = Boolean(await data.Request.exists({ _id: p.request_id, status: 'PENDING' }));
    }
    const r = await fetch(bookingBase + req.url, { method: req.method, headers: { ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}), ...(req.headers['x-service-token'] ? { 'X-Service-Token': req.headers['x-service-token'] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body || undefined });
    const payload = await r.text();
    if (faults.dropPost && req.method === 'POST' && req.url.startsWith('/internal/bookings/check-')) { faults.dropPost = false; res.destroy(); return; }
    res.statusCode = r.status; res.setHeader('Content-Type', 'application/json'); res.end(payload);
  });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r)); servers.push(proxy);
  const careConnection = await connect('care'), config = { ...common, bookingBaseUrl: `http://127.0.0.1:${proxy.address().port}`, token: careToken, leaseMs: 4000, workerIntervalMs: 1000 };
  const app = createApp({ connection: careConnection, config, clock, logger }); data = app.locals.models; await initialize(data);
  const base = await listen(app), staff = options => ({ token: tokens.staff, ...options });
  const intake = () => ({ request_id: randomUUID(), initial_condition: 'Healthy and alert', care_instructions: 'Own food', belongings: ['Collar'], reason: 'Staff checked reception' });
  const checkout = () => ({ request_id: randomUUID(), recipient_name: 'Verified owner', returned_belongings: ['Collar'], notes: 'All belongings returned', reason: 'Staff checked handover' });
  const arrive = (b, body = intake(), token = tokens.staff) => request(base, `/api/care/bookings/${b.id}/check-in`, { method: 'POST', token, body });
  const depart = (b, body = checkout()) => request(base, `/api/care/bookings/${b.id}/check-out`, staff({ method: 'POST', body }));
  const clean = async b => request(bookingBase, `/api/staff/resources/${b.resource_id}/cleaning-complete`, staff({ method: 'POST', body: { reason: 'Physical cleaning complete' } }));
  const confirmed = async () => {
    const day = String(++sequence).padStart(2, '0'); now = new Date(`2030-01-${day}T02:00:00Z`);
    const petId = randomBytes(12).toString('hex'); petRows.set(petId, { id: petId, owner_id: people.alice.id, name: 'Original Mimi', species: 'CAT', weight_kg: 3, care_notes: 'Original care note', version: 1 });
    const q = await request(catalogBase, '/internal/catalog/quotes', { method: 'POST', credential: 'q'.repeat(40), body: { service_id: 'bath', species: 'CAT', weight_kg: 3 } });
    const made = await request(bookingBase, '/api/bookings', { method: 'POST', token: tokens.alice, key: randomUUID(), body: { pet_id: petId, service_id: 'bath', expected_price_version: q.body.data.quote.price_version_id, start_at: `2030-01-${day}T09:05:00+07:00` } });
    assert.equal(made.status, 201, JSON.stringify(made.body)); const b = made.body.data.booking;
    const paid = await request(bookingBase, '/internal/bookings/payment-events', { method: 'POST', credential: paymentToken, body: { event_id: randomUUID(), booking_id: b.id, payment_id: randomUUID(), amount: b.total_amount, currency: 'VND', result: 'SUCCEEDED' } });
    assert.equal(paid.body.data.booking_status, 'CONFIRMED'); return b;
  };
  let active, visitId;
  await t.test('a lost response after Booking success stays pending, then a new worker recovers the exact request', async () => {
    active = await confirmed(); const body = intake(); faults.dropPost = true;
    const queued = await arrive(active, body); assert.equal(queued.status, 202); assert.equal(queued.body.data.visit.state, 'PENDING'); assert.equal(queued.body.data.request.status, 'PENDING');
    assert.equal(faults.sawPersistedBeforeHttp, true); visitId = queued.body.data.visit.id;
    const b = await request(bookingBase, '/api/bookings/' + active.id, { token: tokens.alice }); assert.equal(b.body.data.booking.status, 'CHECKED_IN');
    const original = await data.Request.findById(body.request_id).lean(); assert.equal(JSON.stringify(original).includes(tokens.staff), false);
    now = new Date(+now + 2000);
    const recoveredConnection = await connect('care'), recovered = new SyncWorker({ connection: recoveredConnection, models: models(recoveredConnection), config, client: bookingClient(config), clock, logger });
    await Promise.all([recovered.process(body.request_id), app.locals.worker.process(body.request_id)]);
    const replay = await arrive(active, body); assert.equal(replay.status, 200); assert.equal(replay.body.data.visit.state, 'IN_CARE');
    assert.equal(await data.Visit.countDocuments({ booking_id: active.id }), 1);
    assert.equal(await bapp.locals.models.History.countDocuments({ booking_id: active.id, action: 'CHECKED_IN' }), 1);
    assert.deepEqual((await data.Request.findById(body.request_id).lean()).payload, original.payload);
    assert.equal((await arrive(active, { ...body, initial_condition: 'Different' })).status, 409);
  });
  await t.test('owners only read their own visit and request; no internal payload/lease is exposed', async () => {
    assert.equal((await request(base, '/api/care/visits/' + visitId, { token: tokens.alice })).status, 200);
    assert.equal((await request(base, '/api/care/visits/' + visitId, { token: tokens.bob })).status, 404);
    assert.equal((await request(base, '/api/care/visits', { token: tokens.bob })).body.data.total, 0);
    const local = await data.Request.findOne({ visit_id: visitId }).lean();
    const result = await request(base, '/api/care/requests/' + local._id, { token: tokens.alice });
    assert.equal(result.status, 200); for (const forbidden of ['lease_token', 'lease_until', 'payload', 'fingerprint']) assert.equal(JSON.stringify(result.body).includes(forbidden), false);
    assert.equal((await request(base, '/api/care/requests/' + local._id, { token: tokens.bob })).status, 404);
    assert.equal((await arrive(active, intake(), tokens.alice)).status, 403);
    assert.equal((await depart(active, { ...checkout(), owner_id: people.bob.id })).status, 400);
    authStatus = 500; assert.equal((await request(base, '/api/care/visits', staff())).status, 503); authStatus = 200;
    malformedAuth = true; assert.equal((await request(base, '/api/care/visits', staff())).status, 503); malformedAuth = false;
  });
  await t.test('activity creation is idempotent; concurrent edits preserve before/after audit and reject stale versions', async () => {
    const body = { request_id: randomUUID(), activity: 'FEED', notes: 'Ate own food' }, path = `/api/care/visits/${visitId}/logs`;
    assert.equal((await request(base, path, { method: 'POST', body, token: tokens.alice })).status, 403);
    const made = await request(base, path, staff({ method: 'POST', body })); assert.equal(made.status, 201);
    assert.equal((await request(base, path, staff({ method: 'POST', body }))).body.data.log.id, made.body.data.log.id);
    assert.equal((await request(base, path, staff({ method: 'POST', body: { ...body, notes: 'Changed' } }))).status, 409);
    const logId = made.body.data.log.id;
    const result = await Promise.all(['Finished meal', 'Left half the meal'].map(notes => request(base, path + '/' + logId, staff({ method: 'PATCH', body: { expected_version: 1, notes, reason: 'Corrected observation' } }))));
    assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
    const row = await data.Log.findById(logId).lean(); assert.equal(row.version, 2); assert.equal(row.edits.length, 1); assert.equal(row.edits[0].before.notes, body.notes); assert.equal(row.edits[0].after.notes, row.notes); assert.equal(row.edits[0].actor_id, people.staff.id);
    assert.equal((await request(base, path, { token: tokens.bob })).status, 404);
  });
  await t.test('handover completes only after Booking accepts; snapshots and cleaning state are retained', async () => {
    petRows.get(active.pet_id).name = 'Changed pet profile';
    const body = checkout(), done = await depart(active, body); assert.equal(done.status, 201); assert.equal(done.body.data.visit.state, 'COMPLETED');
    assert.equal(done.body.data.visit.snapshot.pet.name, 'Original Mimi'); assert.equal(done.body.data.visit.handover.recipient_name, body.recipient_name);
    assert.equal((await depart(active, body)).status, 200); assert.equal(await data.Request.countDocuments({ visit_id: visitId, action: 'CHECK_OUT' }), 1);
    const resource = await bapp.locals.models.Resource.findById(active.resource_id).lean(); assert.equal(resource.state, 'CLEANING');
    assert.equal((await request(base, `/api/care/visits/${visitId}/logs`, staff({ method: 'POST', body: { request_id: randomUUID(), activity: 'FEED', notes: 'After handover' } }))).status, 409);
    assert.equal((await clean(active)).status, 200);
  });
  await t.test('Booking business rejection is durable and stops retry; a new ID can succeed after resolving the cause', async () => {
    const b = await confirmed(); await bapp.locals.models.Resource.updateOne({ _id: b.resource_id }, { $set: { state: 'CLEANING' } }); // isolated test preparation
    const body = intake(), refused = await arrive(b, body); assert.equal(refused.status, 409);
    const r = await data.Request.findById(body.request_id).lean(); assert.equal(r.status, 'REJECTED');
    const v = await data.Visit.findById(r.visit_id).lean(); assert.equal(v.state, 'PENDING'); assert.equal(v.sync_state, 'REJECTED');
    const attempts = r.attempts; now = new Date(+now + 10000); await app.locals.worker.tick(); assert.equal((await data.Request.findById(body.request_id).lean()).attempts, attempts);
    assert.equal((await arrive(b, body)).status, 409); await clean(b);
    assert.equal((await arrive(b)).status, 201); assert.equal(await data.Visit.countDocuments({ booking_id: b.id }), 1);
    assert.equal((await depart(b)).status, 201); await clean(b);
  });
  await t.test('concurrent reception requests cannot create two visits or Booking transitions', async () => {
    const b = await confirmed();
    const results = await Promise.all([arrive(b), arrive(b)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    assert.equal(await data.Visit.countDocuments({ booking_id: b.id }), 1); assert.equal(await bapp.locals.models.History.countDocuments({ booking_id: b.id, action: 'CHECKED_IN' }), 1);
    assert.equal((await depart(b)).status, 201); await clean(b);
  });
  await t.test('persisted pending work recovers with service credential only; worker never stores or reuses a Bearer token', async () => {
    const b = await confirmed(), body = intake(); faults.internalDown = true;
    assert.equal((await arrive(b, body)).status, 202); faults.internalDown = false; now = new Date(+now + 2000);
    const count = authCalls; authStatus = 500;
    await app.locals.worker.process(body.request_id); assert.equal(authCalls, count);
    assert.equal((await data.Request.findById(body.request_id).lean()).status, 'SUCCEEDED'); authStatus = 200;
    assert.equal((await depart(b)).status, 201); await clean(b);
  });
  await t.test('an expired lease can be reclaimed without a late worker overwriting the accepted result', async () => {
    const b = await confirmed(), body = intake();
    faults.malformedContext = true;
    assert.equal((await arrive(b, body)).status, 503); assert.equal(await data.Visit.countDocuments({ booking_id: b.id }), 0);
    faults.malformedContext = false; faults.internalDown = true;
    assert.equal((await arrive(b, body)).status, 202); faults.internalDown = false; now = new Date(+now + 2000);
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
    const remote = bookingClient(config);
    const oldWorker = new SyncWorker({ connection: careConnection, models: data, config, clock, logger, client: { execute: async (...args) => { entered(); await blocked; return remote.execute(...args); } } });
    const late = oldWorker.process(body.request_id); await started;
    now = new Date(+now + config.leaseMs + 1);
    const newerConnection = await connect('care'), newerModels = models(newerConnection);
    const newer = new SyncWorker({ connection: newerConnection, models: newerModels, config, clock, logger, client: remote });
    await newer.process(body.request_id);
    const accepted = await data.Request.findById(body.request_id).lean(); assert.equal(accepted.status, 'SUCCEEDED');
    release(); await late;
    const final = await data.Request.findById(body.request_id).lean();
    assert.equal(final.lease_token, accepted.lease_token); assert.deepEqual(final.result, accepted.result);
    assert.equal(final.attempts, 3); assert.equal(await bapp.locals.models.History.countDocuments({ booking_id: b.id, action: 'CHECKED_IN' }), 1);
    assert.equal((await depart(b)).status, 201); await clean(b);
  });
});
