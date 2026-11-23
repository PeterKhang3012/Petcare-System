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
  const quote = () => request('/internal/catalog/quotes', { method: 'POST', internal: true, body: { service_id: 'bath', species: 'CAT', weight_kg: 3 } });
  const update = (body, who = 'pricing') => request('/api/catalog/services/bath/price', { method: 'PATCH', who, body });
  await t.test('quote exactly satisfies existing Booking validator; internal credential and input are required', async () => {
    const q = await quote(); assert.equal(q.status, 200);
    const { validQuote } = require('../../booking-service/src/adapters'); assert.equal(validQuote(q.body.data.quote, 'bath').unit_price, 150000);
    assert.equal((await request('/internal/catalog/quotes', { method: 'POST', body: { service_id: 'bath', species: 'CAT', weight_kg: 3 } })).status, 401);
    assert.equal((await request('/internal/catalog/quotes', { method: 'POST', internal: true, body: { service_id: 'bath', species: 'CAT', weight_kg: '3' } })).status, 400);
    assert.equal((await request('/api/catalog/services/boarding')).body.data.service.duration_minutes, null);
    const service = (await request('/api/catalog/services/bath')).body.data.service;
    assert.equal(service.active, true); assert.equal(service.current_price_version_id, service.price_version_id);
    await app.locals.models.Service.updateOne({ _id: 'bath' }, { $set: { active: false } });
    try { assert.equal((await quote()).status, 404); assert.equal((await request('/api/catalog/services/bath')).status, 404); }
    finally { await app.locals.models.Service.updateOne({ _id: 'bath' }, { $set: { active: true } }); }
  });
  await t.test('only current delegated STAFF permission can change price', async () => {
    const body = { unit_price: 170000, expected_price_version: 'bath-v1', reason: 'Price review' };
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
    const results = await Promise.all([170000, 180000].map(unit_price => update({ unit_price, expected_price_version: 'bath-v1', reason: 'Concurrent price update' })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(results.find(r => r.status === 409).body.code, 'PRICE_VERSION_CONFLICT');
    assert.equal(await app.locals.models.Price.countDocuments({ service_id: 'bath' }), before + 1);
    const changed = results.find(r => r.status === 200).body.data.price;
    assert.equal(changed.old_unit_price, 150000); assert.equal(changed.actor_id, people.pricing.id);
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
    const pet = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data: { pet: { id: petId, owner_id: people.owner.id, name: 'Mimi', species: 'CAT', weight_kg: 3, version: 1 } } })); });
    await new Promise(r => pet.listen(0, '127.0.0.1', r)); servers.push(pet);
    const bookingConfig = { ...config, catalogMode: 'http', catalogBaseUrl: base, petBaseUrl: `http://127.0.0.1:${pet.address().port}`, tokens: { BOOKING_TO_CATALOG_TOKEN: config.token, BOOKING_TO_PET_TOKEN: 'p'.repeat(40), PAYMENT_TO_BOOKING_TOKEN: 'y'.repeat(40), CARE_TO_BOOKING_TOKEN: 'c'.repeat(40) },
      hours: { open: '08:00', close: '18:00', boardingIn: '14:00', boardingOut: '12:00' }, preparationMinutes: 15, cleaningMinutes: 30, checkInEarlyMinutes: 60, checkInLateMinutes: 120, workerIntervalMs: 5000 };
    const bapp = require('../../booking-service/src/app').createApp({ config: bookingConfig, connection: bookingConnection, clock: () => new Date('2030-01-01T02:00:00Z'), logger: { info() {}, error() {} } });
    await require('../../booking-service/src/models').initialize(bapp.locals.models); await require('../../booking-service/scripts/seed-resources').seed(bapp.locals.models);
    const bookingBase = await listen(bapp), old = (await quote()).body.data.quote;
    const input = { pet_id: petId, service_id: 'bath', start_at: '2030-01-02T09:00:00+07:00', expected_price_version: old.price_version_id };
    const r = await fetch(bookingBase + '/api/bookings', { method: 'POST', headers: { Authorization: `Bearer ${tokens.owner}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(input) });
    const b = await r.json(); assert.equal(r.status, 201, JSON.stringify(b));
    assert.equal((await update({ unit_price: 210000, expected_price_version: old.price_version_id, reason: 'New catalog price' })).status, 200);
    const detail = await fetch(bookingBase + '/api/bookings/' + b.data.booking.id, { headers: { Authorization: `Bearer ${tokens.owner}` } });
    assert.equal((await detail.json()).data.booking.total_amount, old.unit_price);
    assert.notEqual((await quote()).body.data.quote.unit_price, old.unit_price);
  });
});
