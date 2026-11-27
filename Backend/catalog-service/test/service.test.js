const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, generateKeyPairSync } = require('node:crypto');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { initialize, replicaReady, databaseConfig } = require('../src/platform');
const { seed } = require('../scripts/seed');

test('Catalog requires its own database', () => {
  assert.throws(() => databaseConfig('catalog', { MONGODB_URI: 'mongodb://127.0.0.1/auth_db' }), /catalog_db/);
  assert.equal(databaseConfig('catalog', { MONGODB_URI: 'mongodb://127.0.0.1/catalog_db' }).dbName, 'catalog_db');
});
test('Catalog transactions and live Booking contract on a real replica set', { skip: !process.env.TEST_MONGODB_URI && 'Set TEST_MONGODB_URI to a disposable replica set (no DB mock is used)' }, async t => {
  const opened = [], servers = [], suffix = randomBytes(6).toString('hex');
  t.after(async () => { for (const server of servers.reverse()) { server.closeAllConnections(); await new Promise(r => server.close(r)); } for (const c of opened.reverse()) await c.close(); });
  const connect = async name => { const c = await mongoose.createConnection(process.env.TEST_MONGODB_URI, { dbName: `${name}_test_${suffix}`, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise(); opened.push(c); return c; };
  const listen = async app => { const s = app.listen(0, '127.0.0.1'); servers.push(s); await new Promise(r => s.once('listening', r)); return `http://127.0.0.1:${s.address().port}`; };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const people = Object.fromEntries(['owner', 'staff', 'pricing'].map(name => [name, { id: randomBytes(12).toString('hex'), username: name, role: name === 'owner' ? 'USER' : 'STAFF', permissions: name === 'pricing' ? ['UPDATE_SERVICE_PRICE'] : [] }]));
  const tokens = Object.fromEntries(Object.entries(people).map(([name, user]) => [name, jwt.sign({ username: name, role: user.role, permissions: user.permissions }, pair.privateKey, { algorithm: 'RS256', subject: user.id, issuer: 'catalog-test', expiresIn: '1h' })]));
  let authStatus = 200, malformedAuth = false;
  const auth = http.createServer((req, res) => {
    let identity; try { const sub = jwt.verify((req.headers.authorization || '').slice(7), pair.publicKey, { algorithms: ['RS256'], issuer: 'catalog-test' }).sub; identity = Object.values(people).find(p => p.id === sub); } catch {}
    res.setHeader('Content-Type', 'application/json'); res.statusCode = identity ? authStatus : 401; res.end(malformedAuth ? 'null' : JSON.stringify({ success: res.statusCode === 200, data: { user: identity } }));
  });
  await new Promise(r => auth.listen(0, '127.0.0.1', r)); servers.push(auth);
  const config = { publicKey, issuer: 'catalog-test', authBaseUrl: `http://127.0.0.1:${auth.address().port}`, timeoutMs: 500, token: 'q'.repeat(40) };
  const connection = await connect('catalog'); assert.equal(await replicaReady(connection), true);
  const app = createApp({ config, connection, logger: { info() {} } }); await initialize(app.locals.models); await seed(connection, app.locals.models);
  const base = await listen(app);
  const request = async (route, { method = 'GET', body, who = 'owner', internal = false } = {}) => {
    const r = await fetch(base + route, { method, headers: { ...(internal ? { 'X-Service-Token': config.token } : { Authorization: `Bearer ${tokens[who]}` }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const quote = (pet = {}) => request('/internal/catalog/quotes', { method: 'POST', internal: true, body: { service_id: 'bath', species: 'CAT', weight_kg: 3, coat_type: 'SHORT', ...pet } });
  const update = (body, who = 'pricing') => request('/api/catalog/services/bath/price', { method: 'PATCH', who, body: { price_rule_id: 'cat-0', ...body } });
  await t.test('quote exactly satisfies existing Booking validator; internal credential and input are required', async () => {
    const q = await quote(); assert.equal(q.status, 200);
    const { validQuote } = require('../../booking-service/src/adapters'); assert.equal(validQuote(q.body.data.quote, 'bath').unit_price, 200000);
    assert.equal((await request('/internal/catalog/quotes', { method: 'POST', body: { service_id: 'bath', species: 'CAT', weight_kg: 3 } })).status, 401);
    assert.equal((await request('/internal/catalog/quotes', { method: 'POST', internal: true, body: { service_id: 'bath', species: 'CAT', weight_kg: '3' } })).status, 400);
    assert.equal((await request('/api/catalog/services/boarding')).status, 404);
    const room = (await request('/api/catalog/services/stay-dog-m')).body.data.service;
    assert.equal(room.duration_minutes, null);
    assert.equal(room.unit, 'DAY');
    assert.equal(room.room_tier, 'M');
    const stay = (pet) => quote({ service_id: 'stay-dog-m', coat_type: undefined, ...pet });
    assert.equal(validQuote((await stay({ species: 'DOG', weight_kg: 8 })).body.data.quote, 'stay-dog-m').unit_price, 110000);
    assert.equal((await stay({ species: 'DOG', weight_kg: 15 })).status, 400);
    assert.equal((await stay({ species: 'CAT', weight_kg: 8 })).status, 400);
    assert.equal((await stay({ service_id: 'stay-cat-m', species: 'CAT', weight_kg: 10 })).body.data.quote.unit_price, 120000);
    const service = (await request('/api/catalog/services/bath')).body.data.service;
    assert.equal(service.active, true); assert.equal(service.current_price_version_id, service.price_version_id);
    assert.equal(service.price_rules.length, 10);
    for (const [weight_kg, short, long] of [[4.99, 100000, 150000], [5, 150000, 250000], [10, 250000, 350000], [20, 350000, 500000], [40, 350000, 500000]]) {
      assert.equal((await quote({ species: 'DOG', weight_kg })).body.data.quote.unit_price, short);
      assert.equal((await quote({ species: 'DOG', weight_kg, coat_type: 'LONG' })).body.data.quote.unit_price, long);
    }
    for (const weight_kg of [5, 10]) {
      assert.equal((await quote({ weight_kg, coat_type: 'LONG' })).body.data.quote.unit_price, 300000);
    }
    assert.equal((await quote({ weight_kg: 10.01 })).body.code, 'PET_PRICE_NOT_SUPPORTED');
    assert.equal((await quote({ species: 'DOG', weight_kg: 40.01 })).body.code, 'PET_PRICE_NOT_SUPPORTED');
    assert.equal((await quote({ coat_type: undefined })).body.code, 'PET_COAT_REQUIRED');
    await app.locals.models.Service.updateOne({ _id: 'bath' }, { $set: { active: false } });
    try { assert.equal((await quote()).status, 404); assert.equal((await request('/api/catalog/services/bath')).status, 404); }
    finally { await app.locals.models.Service.updateOne({ _id: 'bath' }, { $set: { active: true } }); }
  });
  await t.test('only current delegated STAFF permission can change price', async () => {
    const body = { unit_price: 170000, expected_price_version: 'bath-groups-v1', reason: 'Price review' };
    assert.equal((await update(body, 'owner')).status, 403); assert.equal((await update(body, 'staff')).status, 403);
    people.pricing.permissions = []; assert.equal((await update(body)).status, 403); people.pricing.permissions = ['UPDATE_SERVICE_PRICE'];
    authStatus = 500; assert.equal((await update(body)).status, 503); authStatus = 200;
    malformedAuth = true; assert.equal((await update(body)).status, 503); malformedAuth = false;
    for (const unit_price of [0, -1, 1.5, '170000', Number.MAX_SAFE_INTEGER + 1]) assert.equal((await update({ ...body, unit_price })).status, 400);
    assert.equal((await update({ ...body, reason: ' ' })).status, 400);
    assert.equal((await update({ ...body, actor_id: people.owner.id })).status, 400);
    assert.equal((await request('/api/catalog/services/bath/price-history')).status, 403);
  });
  await t.test('concurrent CAS produces exactly one immutable audit/version and seed preserves it', async () => {
    const before = await app.locals.models.Price.countDocuments({ service_id: 'bath' });
    const results = await Promise.all([170000, 180000].map(unit_price => update({ unit_price, expected_price_version: 'bath-groups-v1', reason: 'Concurrent price update' })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(results.find(r => r.status === 409).body.code, 'PRICE_VERSION_CONFLICT');
    assert.equal(await app.locals.models.Price.countDocuments({ service_id: 'bath' }), before + 1);
    const changed = results.find(r => r.status === 200).body.data.price;
    assert.equal(changed.old_unit_price, 200000); assert.equal(changed.actor_id, people.pricing.id);
    assert.equal((await quote({ weight_kg: 5 })).body.data.quote.unit_price, 300000);
    const after = (await quote()).body.data.quote; assert.equal(after.price_version_id, changed.price_version_id); assert.equal(after.unit_price, changed.unit_price);
    await seed(connection, app.locals.models); assert.deepEqual((await quote()).body.data.quote, after);
    const history = await request('/api/catalog/services/bath/price-history', { who: 'staff' }); assert.equal(history.body.data.total, 2);
  });
  await t.test('a failed transaction cannot leave a price version without its pointer', async () => {
    const current = (await quote()).body.data.quote, before = await app.locals.models.Price.countDocuments();
    const original = app.locals.models.Service.updateOne;
    app.locals.models.Service.updateOne = () => { throw new Error('Injected failure before pointer commit'); };
    try { assert.equal((await update({ unit_price: 190000, expected_price_version: current.price_version_id, reason: 'Rollback test' })).status, 500); }
    finally { app.locals.models.Service.updateOne = original; }
    assert.equal(await app.locals.models.Price.countDocuments(), before); assert.deepEqual((await quote()).body.data.quote, current);
  });
  await t.test('live Catalog price changes never rewrite an existing Booking snapshot', async () => {
    const bookingConnection = await connect('booking');
    const petId = randomBytes(12).toString('hex');
    const profile = { id: petId, owner_id: people.owner.id, name: 'Mimi', species: 'CAT', weight_kg: 3, coat_type: 'SHORT', version: 1 };
    const pet = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data: { pet: profile } })); });
    await new Promise(r => pet.listen(0, '127.0.0.1', r)); servers.push(pet);
    const bookingConfig = { ...config, catalogMode: 'http', catalogBaseUrl: base, petBaseUrl: `http://127.0.0.1:${pet.address().port}`, tokens: { BOOKING_TO_CATALOG_TOKEN: config.token, BOOKING_TO_PET_TOKEN: 'p'.repeat(40), PAYMENT_TO_BOOKING_TOKEN: 'y'.repeat(40), CARE_TO_BOOKING_TOKEN: 'c'.repeat(40) },
      hours: { open: '08:00', close: '18:00', boardingIn: '14:00', boardingOut: '12:00' }, preparationMinutes: 15, cleaningMinutes: 30, checkInEarlyMinutes: 60, checkInLateMinutes: 120, workerIntervalMs: 5000 };
    const bapp = require('../../booking-service/src/app').createApp({ config: bookingConfig, connection: bookingConnection, clock: () => new Date('2030-01-01T02:00:00Z'), logger: { info() {}, error() {} } });
    await require('../../booking-service/src/models').initialize(bapp.locals.models); await require('../../booking-service/scripts/seed-resources').seed(bapp.locals.models);
    const bookingBase = await listen(bapp), old = (await quote()).body.data.quote;
    const availability = async date => {
      const query = new URLSearchParams({ date, pet_id: petId, service_id: 'bath' });
      const response = await fetch(bookingBase + '/api/bookings/availability?' + query, { headers: { Authorization: `Bearer ${tokens.owner}` } });
      assert.equal(response.status, 200);
      return (await response.json()).data.slots;
    };
    const today = await availability('2030-01-01');
    assert.equal(today.length, 9);
    assert.equal(today[1].status, 'OUTSIDE_BOOKING_WINDOW');
    const day = '2030-01-02', before = await availability(day);
    assert.equal(before[1].status, 'AVAILABLE');
    assert.equal(before[3].end_at, '2030-01-02T05:00:00.000Z');
    assert.equal(before[4].start_at, '2030-01-02T06:00:00.000Z');
    const bays = await bapp.locals.models.Resource.find({ group: 'CARE' }).lean();
    await bapp.locals.models.Allocation.insertMany(bays.map(bay => ({
      resource_id: bay._id, type: 'MAINTENANCE', start_at: before[0].start_at, end_at: before[0].end_at,
    })));
    assert.equal((await availability(day))[0].status, 'FULL');
    const input = { pet_id: petId, service_id: 'bath', start_at: '2030-01-02T09:00:00+07:00', expected_price_version: old.price_version_id, expected_pet_version: 1 };
    const create = body => fetch(bookingBase + '/api/bookings', { method: 'POST', headers: { Authorization: `Bearer ${tokens.owner}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
    Object.assign(profile, { weight_kg: 4, version: 2 });
    const stale = await create(input);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'PRICE_CHANGED');
    const r = await create({ ...input, expected_pet_version: profile.version });
    const b = await r.json(); assert.equal(r.status, 201, JSON.stringify(b));
    const after = await availability(day);
    assert.equal(after[1].status, 'PET_BUSY');
    assert.equal(after[2].available, before[2].available);
    assert.equal(b.data.booking.pet_snapshot.coat_type, 'SHORT');
    assert.equal(b.data.booking.pet_snapshot.weight_kg, 4);
    assert.equal(b.data.booking.service_snapshot.price_rule_id, 'cat-0');
    assert.equal((await update({ unit_price: 210000, expected_price_version: old.price_version_id, reason: 'New catalog price' })).status, 200);
    const detail = await fetch(bookingBase + '/api/bookings/' + b.data.booking.id, { headers: { Authorization: `Bearer ${tokens.owner}` } });
    assert.equal((await detail.json()).data.booking.total_amount, old.unit_price);
    assert.notEqual((await quote()).body.data.quote.unit_price, old.unit_price);
  });
});
