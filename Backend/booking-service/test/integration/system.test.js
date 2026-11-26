const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const { mongo, doubles, childService, request, environment, deps } = require('../../../../scripts/test-support');
const { MongoClient } = deps('mongoose').mongo;
const jwt = deps('jsonwebtoken');

test('Pet and Booking on authenticated real MongoDB replica set with two Booking processes', async t => {
  const database = await mongo(); t.after(() => database.close());
  const fakes = await doubles(database.directory); t.after(() => fakes.close());
  const env = environment(database, fakes), users = fakes.tokens;
  const pet = await childService('pet', { ...env, MONGODB_URI: database.uris.pet_db }); t.after(() => pet.close());
  const bookingEnv = { ...env, PET_BASE_URL: pet.base, MONGODB_URI: database.uris.booking_db };
  const first = await childService('booking', bookingEnv); t.after(() => first.close());
  const second = await childService('booking', bookingEnv); t.after(() => second.close());
  assert.notEqual(first.pid, second.pid);
  const db = database.admin.db('booking_db');
  const api = (route, options = {}, host = first) => request(host.base, route, { token: users.alice, ...options });
  const pets = (route = '', options = {}) => request(pet.base, '/api/pets' + route, { token: users.alice, ...options });
  const newPet = async (species = 'CAT', token = users.alice) => {
    const result = await pets('', { method: 'POST', token, body: { name: 'Mimi-' + randomUUID().slice(0, 8), species, weight_kg: 3, care_notes: 'original note' } });
    assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.data.pet;
  };
  const careInput = (petId, day, time = '09:00') => ({ pet_id: petId, service_id: 'bath', start_at: `2030-01-${String(day).padStart(2, '0')}T${time}:00+07:00` });
  const create = (input, key = randomUUID(), host = first) => api('/api/bookings', { method: 'POST', key, body: { ...input, expected_price_version: input.service_id === 'bath' ? fakes.state.priceVersion : 'boarding-v1' } }, host);
  const newBooking = async (day, time = '09:00') => {
    const p = await newPet(); const result = await create(careInput(p.id, day, time)); assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.data.booking;
  };
  const payment = (b, change = {}, host = first, credential = env.PAYMENT_TO_BOOKING_TOKEN) => api('/internal/bookings/payment-events', { method: 'POST', token: undefined, credential,
    body: { event_id: randomUUID(), booking_id: b.id, payment_id: randomUUID(), amount: b.total_amount, currency: 'VND', result: 'SUCCEEDED', ...change } }, host);
  const care = (operation, b, change = {}, host = first, credential = env.CARE_TO_BOOKING_TOKEN) => api('/internal/bookings/' + operation, { method: 'POST', token: undefined, credential,
    body: { request_id: randomUUID(), booking_id: b.id, actor_id: users.staffId, reason: 'Staff confirmed handover', ...change } }, host);
  const time = async now => { await first.call('time', { now }); await second.call('time', { now }); };
  const staff = (route, options = {}, host = first) => api('/api/staff' + route, { token: users.staff, ...options }, host);
  const resources = (await staff('/resources')).body.data.resources;

  await t.test('health/readiness, correlation IDs, public-key JWT and database roles', async () => {
    assert.equal((await api('/health', { token: undefined })).status, 200);
    assert.equal((await api('/ready', { token: undefined })).status, 200);
    assert.equal((await api('/api/bookings', { token: undefined })).status, 401);
    const claims = { username: 'alice', role: 'USER', permissions: [] };
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    for (const token of [jwt.sign(claims, other.privateKey, { algorithm: 'RS256', issuer: 'pawstay-test-auth', subject: users.aliceId, expiresIn: '1h' }),
      jwt.sign(claims, fakes.privateKey, { algorithm: 'RS256', issuer: 'wrong', subject: users.aliceId, expiresIn: '1h' }),
      jwt.sign(claims, fakes.privateKey, { algorithm: 'RS256', issuer: 'pawstay-test-auth', subject: users.aliceId, expiresIn: -1 }),
      jwt.sign(claims, fakes.privateKey, { algorithm: 'RS256', issuer: 'pawstay-test-auth', subject: users.aliceId })]) assert.equal((await api('/api/bookings', { token })).status, 401);
    assert.ok((await api('/health')).correlation);
    for (const name of ['pet_db', 'booking_db']) {
      const client = await new MongoClient(database.uris[name]).connect();
      try { await assert.rejects(client.db(name === 'pet_db' ? 'booking_db' : 'pet_db').collection('pets').findOne({}), { code: 13 }); }
      finally { await client.close(); }
    }
  });
  await t.test('Pet owner CRUD, strict fields, bounded lists, archive and internal context', async () => {
    const p = await newPet();
    assert.equal((await pets('/' + p.id)).body.data.pet.owner_id, users.aliceId);
    for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { name: 'stolen' }], ['POST', '/archive', {}]]) assert.equal((await pets('/' + p.id + suffix, { method, body, token: users.bob })).status, 404);
    assert.equal((await pets('/' + p.id, { method: 'PATCH', token: users.staff, body: { name: 'staff edit' } })).status, 403);
    for (const body of [{ owner_id: users.bobId }, { status: 'ARCHIVED' }, { version: 100 }, { created_at: '2030-01-01' }]) assert.equal((await pets('/' + p.id, { method: 'PATCH', body })).status, 400);
    assert.equal((await pets('/bad-id')).status, 400);
    assert.equal((await pets('?limit=101')).status, 400);
    const edited = await pets('/' + p.id, { method: 'PATCH', body: { name: '  Renamed  ' } }); assert.equal(edited.body.data.pet.name, 'Renamed');
    const contextUrl = `/internal/pets/${p.id}/booking-context?owner_id=${users.aliceId}`;
    assert.equal((await request(pet.base, contextUrl)).status, 401);
    assert.equal((await request(pet.base, contextUrl, { credential: env.CARE_TO_BOOKING_TOKEN })).status, 401);
    assert.equal((await request(pet.base, contextUrl, { credential: env.BOOKING_TO_PET_TOKEN })).status, 200);
    const archived = await pets('/' + p.id + '/archive', { method: 'POST', body: {} });
    const replay = await pets('/' + p.id + '/archive', { method: 'POST', body: {} }); assert.deepEqual(replay.body, archived.body);
    assert.equal((await pets('/' + p.id)).status, 200);
    assert.equal((await pets('/' + p.id, { method: 'PATCH', body: { name: 'again' } })).status, 409);
    assert.equal((await request(pet.base, contextUrl, { credential: env.BOOKING_TO_PET_TOKEN })).status, 404);
    assert.equal((await pets()).body.data.pets.some(x => x.id === p.id), false);
    assert.equal((await pets('?status=ARCHIVED')).body.data.pets.some(x => x.id === p.id), true);
    assert.equal((await create(careInput(p.id, 2))).status, 404);
  });
  await t.test('current Auth role, revocation, identity mismatch and dependency errors fail closed', async () => {
    fakes.state.authStatus = 500; assert.equal((await pets()).status, 503); assert.equal((await api('/api/bookings')).status, 503);
    fakes.state.authStatus = 401; assert.equal((await pets()).status, 401);
    fakes.state.authStatus = 200; fakes.state.mismatch = true; assert.equal((await api('/api/bookings')).status, 401); fakes.state.mismatch = false;
    fakes.accounts.get(users.aliceId).role = 'STAFF'; assert.equal((await pets('', { method: 'POST', body: { name: 'blocked', species: 'CAT', weight_kg: 3 } })).status, 403);
    fakes.accounts.get(users.aliceId).role = 'USER';
  });
  await t.test('quotes/availability hold nothing, reject injection, wrong owner and stale price', async () => {
    const p = await newPet(), input = careInput(p.id, 2, '11:00'), before = await db.collection('bookings').countDocuments();
    const quoted = await api('/api/bookings/quotes', { method: 'POST', body: input }); assert.equal(quoted.status, 200); assert.equal(quoted.body.data.quote.duration_minutes, 60);
    const available = await api('/api/bookings/availability?' + new URLSearchParams(input)); assert.equal(available.status, 200); assert.equal(available.body.data.holds_resource, false);
    assert.equal(JSON.stringify(available.body).includes('owner_id'), false);
    assert.equal(await db.collection('bookings').countDocuments(), before);
    assert.equal((await create({ ...input, total_amount: 1 })).status, 400);
    assert.equal((await create({ ...input, end_at: '2030-01-02T20:00:00Z' })).status, 400);
    assert.equal((await create({ ...input, status: 'CONFIRMED' })).status, 400);
    assert.equal((await api('/api/bookings', { method: 'POST', key: randomUUID(), token: users.staff, body: { ...input, expected_price_version: 'bath-v1' } })).status, 403);
    assert.equal((await api('/api/bookings/quotes', { method: 'POST', token: users.bob, body: input })).status, 404);
    const changed = await api('/api/bookings', { method: 'POST', key: randomUUID(), body: { ...input, expected_price_version: 'old' } });
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'PRICE_CHANGED'); assert.ok(changed.body.details.quote);
    assert.equal(await db.collection('bookings').countDocuments(), before);
    fakes.state.catalogStatus = 503; assert.equal((await create(input)).status, 503); fakes.state.catalogStatus = 200;
  });
  await t.test('boarding counts local nights and stores fixed price and pet snapshots', async () => {
    const p = await newPet('DOG'), input = { pet_id: p.id, service_id: 'boarding', check_in_date: '2030-01-03', check_out_date: '2030-01-05' };
    const result = await create(input); assert.equal(result.status, 201); const b = result.body.data.booking;
    assert.equal(b.nights, 2); assert.equal(b.total_amount, 400000); assert.equal(b.start_at, '2030-01-03T07:00:00.000Z');
    assert.equal(+new Date(b.expires_at) - +new Date(b.created_at), 900000);
    assert.equal((await create({ ...input, check_out_date: input.check_in_date })).status, 400);
    assert.equal((await api('/api/bookings/' + b.id, { token: users.bob })).status, 404);
  });
  await t.test('create idempotency survives changed dependencies, preserves hold and snapshots', async () => {
    const p = await newPet(), input = careInput(p.id, 4), key = randomUUID();
    const made = await create(input, key); assert.equal(made.status, 201); const b = made.body.data.booking;
    await pets('/' + p.id, { method: 'PATCH', body: { name: 'changed', care_notes: 'new note' } });
    await pets('/' + p.id + '/archive', { method: 'POST', body: {} });
    fakes.state.unitPrice = 170000; fakes.state.priceVersion = 'bath-v2';
    const view = await api('/api/bookings/' + b.id); assert.equal(view.body.data.booking.total_amount, 150000); assert.equal(view.body.data.booking.pet_snapshot.name, p.name);
    fakes.state.catalogStatus = 503;
    const replay = await api('/api/bookings', { method: 'POST', key, body: { ...input, expected_price_version: 'bath-v1' } }, second);
    assert.equal(replay.status, 200); assert.equal(replay.body.data.booking.id, b.id); assert.equal(replay.body.data.booking.expires_at, b.expires_at);
    const conflict = await api('/api/bookings', { method: 'POST', key, body: { ...input, expected_price_version: 'bath-v2' } }); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(await db.collection('allocations').countDocuments({ booking_id: new (deps('mongoose').Types.ObjectId)(b.id) }), 1);
    fakes.state.catalogStatus = 200; fakes.state.unitPrice = 150000; fakes.state.priceVersion = 'bath-v1';
  });
  await t.test('two processes cannot exceed resource capacity', async () => {
    const group = await Promise.all(Array.from({ length: 8 }, () => newPet()));
    const results = await Promise.all(group.map((p, i) => create(careInput(p.id, 5), randomUUID(), i % 2 ? first : second)));
    assert.equal(results.filter(r => r.status === 201).length, 2, JSON.stringify(results.map(r => r.body)));
    assert.ok(results.every(r => [201, 409].includes(r.status)));
    const allocations = await db.collection('allocations').find({ type: 'BOOKING', start_at: new Date('2030-01-05T02:00:00Z') }).toArray();
    assert.equal(allocations.length, 2); assert.equal(new Set(allocations.map(a => String(a.resource_id))).size, 2);
  });
  await t.test('two processes cannot overlap one pet across different resources', async () => {
    const p = await newPet();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => create(careInput(p.id, 6), randomUUID(), i % 2 ? first : second)));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.ok(results.filter(r => r.status !== 201).every(r => r.body.code === 'PET_TIME_CONFLICT'));
  });
  await t.test('consecutive care slots share a resource without overlap', async () => {
    const careResources = resources.filter(r => r.group === 'CARE');
    assert.equal((await staff(`/resources/${careResources[1].id}/maintenance`, { method: 'POST', body: { start_at: '2030-01-07T08:00:00+07:00', end_at: '2030-01-07T18:00:00+07:00', reason: 'Only one operational bay for boundary test' } })).status, 201);
    const one = await newBooking(7, '10:00'), two = await newBooking(7, '11:00'); assert.equal(one.resource_id, two.resource_id);
    const conflict = await create(careInput((await newPet()).id, 7, '11:00')); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'SLOT_UNAVAILABLE');
  });
  await t.test('maintenance and creation race use the same resource write guard', async () => {
    const p = await newPet('DOG'), r = resources.find(r => r.code === 'STAY-DOG-01');
    const results = await Promise.all([create({ pet_id: p.id, service_id: 'boarding', check_in_date: '2030-01-08', check_out_date: '2030-01-10' }, randomUUID(), first),
      staff(`/resources/${r.id}/maintenance`, { method: 'POST', body: { start_at: '2030-01-08T14:00:00+07:00', end_at: '2030-01-10T12:00:00+07:00', reason: 'Maintenance race' } }, second)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  });
  await t.test('Payment capability, amount/currency, receipts and payment ID binding', async () => {
    const b = await newBooking(11), another = await newBooking(12);
    assert.equal((await payment(b, {}, first, env.CARE_TO_BOOKING_TOKEN)).status, 403);
    assert.equal((await api(`/internal/bookings/${b.id}/payment-context`, { token: undefined, credential: env.CARE_TO_BOOKING_TOKEN })).status, 403);
    assert.equal((await payment(b, { amount: 1 })).body.data.outcome, 'AMOUNT_OR_CURRENCY_MISMATCH');
    assert.equal((await payment(b, { currency: 'USD' })).body.data.accepted, false);
    assert.equal((await api('/api/bookings/' + b.id)).body.data.booking.status, 'PENDING_PAYMENT');
    const event_id = randomUUID(), payment_id = randomUUID();
    const good = await payment(b, { event_id, payment_id }); assert.equal(good.body.data.outcome, 'CONFIRMED');
    assert.deepEqual((await payment(b, { event_id, payment_id }, second)).body, good.body);
    assert.equal((await payment(b, { event_id, payment_id, amount: 1 })).status, 409);
    assert.equal((await payment(another, { payment_id })).body.data.outcome, 'PAYMENT_ALREADY_USED');
    assert.equal((await payment(b, { result: 'FAILED' })).body.data.outcome, 'SUCCESS_PRESERVED');
    assert.equal((await payment(b)).body.data.outcome, 'ANOTHER_PAYMENT_ACCEPTED');
    const view = (await api('/api/bookings/' + b.id)).body.data.booking; assert.equal(view.accepted_payment_id, payment_id); assert.equal(view.status, 'CONFIRMED');
  });
  await t.test('unpaid cancellation is idempotent and late payment never resurrects it', async () => {
    const b = await newBooking(13), key = randomUUID(), body = { reason: 'Customer changed plans' };
    const cancelled = await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key, body }); assert.equal(cancelled.status, 200);
    assert.deepEqual((await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key, body }, second)).body, cancelled.body);
    assert.equal((await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key, body: { reason: 'changed payload' } })).status, 409);
    assert.equal((await payment(b)).body.data.outcome, 'BOOKING_CANCELLED');
    assert.equal((await api('/api/bookings/' + b.id)).body.data.booking.status, 'CANCELLED');
  });
  await t.test('overdue holds release capacity even before worker; expiry races Payment safely', async () => {
    const b = await newBooking(14), ObjectId = deps('mongoose').Types.ObjectId;
    await db.collection('bookings').updateOne({ _id: new ObjectId(b.id) }, { $set: { expires_at: new Date('2030-01-01T01:59:59Z') } });
    await db.collection('allocations').updateOne({ booking_id: new ObjectId(b.id) }, { $set: { hold_until: new Date('2030-01-01T01:59:59Z') } });
    const replacement = await create(careInput(b.pet_id, 14)); assert.equal(replacement.status, 201);
    const results = await Promise.all([first.call('expiry'), payment(b, {}, second)]);
    assert.equal(results[1].body.data.accepted, false); assert.equal((await api('/api/bookings/' + b.id)).body.data.booking.status, 'EXPIRED');
    assert.equal((await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: 'too late' } })).body.code, 'BOOKING_EXPIRED');
    const allocation = await db.collection('allocations').findOne({ booking_id: new ObjectId(b.id) }); assert.equal(allocation.active, false);
  });
  await t.test('same payment ID racing two bookings is consumed at most once', async () => {
    const a = await newBooking(15), b = await newBooking(16), payment_id = randomUUID();
    const results = await Promise.all([payment(a, { payment_id }, first), payment(b, { payment_id }, second)]);
    assert.equal(results.filter(r => r.body.data.accepted).length, 1);
    assert.ok(results.some(r => r.body.data.outcome === 'PAYMENT_ALREADY_USED'));
  });
  await t.test('exact 24-hour cancellation boundary and durable refund Outbox retries', async () => {
    const b = await newBooking(20), late = await newBooking(20, '11:00'); await payment(b); await payment(late);
    await time('2030-01-19T02:00:00.000Z');
    const cancel = await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: '24 hours exactly' } }); assert.equal(cancel.status, 200);
    const ObjectId = deps('mongoose').Types.ObjectId;
    const event = await db.collection('outboxes').findOne({ 'payload.booking_id': b.id }); assert.equal(event.status, 'PENDING');
    assert.equal((await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: 'repeat cancellation' } })).status, 200);
    assert.equal(await db.collection('outboxes').countDocuments({ 'payload.booking_id': b.id }), 1);
    fakes.state.refundStatus = 503; await first.call('outbox'); assert.equal((await db.collection('outboxes').findOne({ _id: event._id })).status, 'PENDING');
    await db.collection('outboxes').updateOne({ _id: event._id }, { $set: { next_attempt_at: new Date(0) } });
    fakes.state.refundStatus = 200; await Promise.all([first.call('outbox'), second.call('outbox')]);
    assert.equal((await db.collection('outboxes').findOne({ _id: event._id })).status, 'DELIVERED');
    await time('2030-01-19T04:00:00.001Z');
    assert.equal((await api(`/api/bookings/${late.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: 'less than 24 hours' } })).status, 409);
    await time('2030-01-01T02:00:00.000Z');
  });
  await t.test('cancellation and Care check-in cannot both transition the same booking', async () => {
    const b = await newBooking(22); await payment(b); await time('2030-01-21T02:00:00Z');
    const result = await Promise.all([api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: 'racing check-in' } }, first), care('check-in', b, {}, second)]);
    assert.equal(result.filter(r => r.status === 200).length, 1); assert.ok(result.some(r => r.status === 409));
    const view = (await api('/api/bookings/' + b.id)).body.data.booking;
    assert.ok(['CANCELLED', 'CHECKED_IN'].includes(view.status));
    if (view.status === 'CHECKED_IN') { assert.equal((await care('check-out', b)).status, 200); await staff(`/resources/${view.resource_id}/cleaning-complete`, { method: 'POST', body: { reason: 'cleaned after race' } }); }
    await time('2030-01-01T02:00:00Z');
  });
  await t.test('Care persistent requests, actual state, seed preservation and cleaning buffer', async () => {
    const b = await newBooking(24), next = await newBooking(24, '10:00'); await payment(b); await payment(next);
    assert.equal(b.resource_id, next.resource_id);
    assert.equal((await care('check-in', b)).status, 409); // beyond even the test early window
    await time('2030-01-24T02:00:00Z');
    assert.equal((await care('check-in', b, {}, first, env.PAYMENT_TO_BOOKING_TOKEN)).status, 403);
    const request_id = randomUUID(), arrived = await care('check-in', b, { request_id }); assert.equal(arrived.status, 200); assert.equal(arrived.body.data.resource.state, 'OCCUPIED');
    assert.deepEqual((await care('check-in', b, { request_id }, second)).body, arrived.body);
    assert.equal((await care('check-in', b, { request_id, reason: 'different' })).status, 409);
    const lookup = await api('/internal/care/requests/' + request_id, { token: undefined, credential: env.CARE_TO_BOOKING_TOKEN }); assert.equal(lookup.body.data.result.data.booking.status, 'CHECKED_IN');
    assert.equal((await staff(`/resources/${b.resource_id}/cleaning-complete`, { method: 'POST', body: { reason: 'cannot force READY' } })).status, 409);
    await first.call('seed'); assert.equal((await staff('/resources')).body.data.resources.find(r => r.id === b.resource_id).state, 'OCCUPIED');
    const checkoutId = randomUUID(), done = await care('check-out', b, { request_id: checkoutId }); assert.equal(done.status, 200); assert.equal(done.body.data.resource.state, 'CLEANING');
    assert.deepEqual((await care('check-out', b, { request_id: checkoutId })).body, done.body);
    await first.call('seed'); assert.equal((await staff('/resources')).body.data.resources.find(r => r.id === b.resource_id).state, 'CLEANING');
    assert.equal((await care('check-in', next)).status, 409);
    assert.equal((await staff(`/resources/${b.resource_id}/cleaning-complete`, { method: 'POST', body: { reason: 'physical cleaning complete' } })).status, 200);
    assert.equal((await care('check-in', next)).status, 409); // READY still cannot erase reserved buffer
    await time('2030-01-24T03:30:00Z'); assert.equal((await care('check-in', next)).status, 200);
    assert.equal((await care('check-out', next)).status, 200);
    assert.equal((await api(`/api/bookings/${b.id}/cancel`, { method: 'POST', key: randomUUID(), body: { reason: 'completed' } })).status, 409);
    const ObjectId = deps('mongoose').Types.ObjectId;
    const allocation = await db.collection('allocations').findOne({ booking_id: new ObjectId(b.id) }); assert.equal(allocation.end_at.toISOString(), '2030-01-24T03:30:00.000Z'); assert.equal(allocation.active, true);
    await staff(`/resources/${b.resource_id}/cleaning-complete`, { method: 'POST', body: { reason: 'done' } }); await time('2030-01-01T02:00:00Z');
  });
  await t.test('scheduled maintenance reconciles to OUT_OF_SERVICE then CLEANING, never arbitrary READY', async () => {
    const resource = resources.find(r => r.code === 'STAY-CAT-01');
    const result = await staff(`/resources/${resource.id}/maintenance`, { method: 'POST', body: { start_at: '2030-01-26T09:00:00+07:00', end_at: '2030-01-26T10:00:00+07:00', reason: 'Disinfection' } }); assert.equal(result.status, 201);
    await time('2030-01-26T02:00:00Z'); await first.call('tick');
    assert.equal((await staff('/resources')).body.data.resources.find(r => r.id === resource.id).state, 'OUT_OF_SERVICE');
    assert.equal((await staff(`/resources/${resource.id}/cleaning-complete`, { method: 'POST', body: { reason: 'not finished' } })).status, 409);
    await time('2030-01-26T03:00:00Z'); await second.call('tick');
    assert.equal((await staff('/resources')).body.data.resources.find(r => r.id === resource.id).state, 'CLEANING');
    assert.equal((await staff(`/resources/${resource.id}/cleaning-complete`, { method: 'POST', body: { reason: 'ready after maintenance' } })).status, 200);
    assert.equal((await api('/api/staff/resources')).status, 403);
    assert.equal((await staff('/bookings?limit=101')).status, 400);
  });
  await t.test('receipts and expiry survive process restart and missing Care bookings are recorded', async () => {
    await time('2030-01-01T02:00:00Z');
    const b = await newBooking(28), event_id = randomUUID(), payment_id = randomUUID();
    const original = await payment(b, { event_id, payment_id }); assert.equal(original.body.data.accepted, true);
    const missing = { id: 'f'.repeat(24) }, request_id = randomUUID();
    assert.equal((await care('check-in', missing, { request_id })).status, 404);
    await second.close();
    const recovered = await childService('booking', bookingEnv); t.after(() => recovered.close()); assert.notEqual(recovered.pid, second.pid);
    assert.deepEqual((await payment(b, { event_id, payment_id }, recovered)).body, original.body);
    const receipt = await api('/internal/care/requests/' + request_id, { token: undefined, credential: env.CARE_TO_BOOKING_TOKEN }, recovered);
    assert.equal(receipt.body.data.result.status, 404);
    const pending = await newBooking(29);
    await recovered.call('time', { now: '2030-01-01T02:15:00Z' });
    await recovered.call('expiry');
    assert.equal((await api('/api/bookings/' + pending.id, {}, recovered)).body.data.booking.status, 'EXPIRED');
  });
});
