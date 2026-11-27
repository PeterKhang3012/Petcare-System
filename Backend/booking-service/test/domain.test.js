const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookingInput, calculate, careSlots, localTime } = require('../src/time');
const { validQuote, adapters } = require('../src/adapters');
const { timestamp, internalAuth } = require('../src/platform');
const { supportsTransactions } = require('../src/transactions');
const { BookingService } = require('../src/booking');
const { businessTime, clockView } = require('../src/demo-clock');
const fixture = require('../fixtures/catalog.json');
const config = { hours: { open: '08:00', close: '18:00', boardingIn: '14:00', boardingOut: '12:00' }, preparationMinutes: 15, cleaningMinutes: 30 };
const now = new Date('2030-01-01T02:00:00Z');
test('pet booking badges scope the query to the owner and prefer an ongoing visit', async () => {
  const models = { Booking: { find(filter) {
    assert.equal(filter.owner_id, 'owner');
    assert.deepEqual(filter.pet_id, { $in: ['a', 'b', 'c', 'd'] });
    assert.deepEqual(filter.$or[1], { status: 'PENDING_PAYMENT', expires_at: { $gt: now } });
    return { select: () => ({ lean: async () => [
      { pet_id: 'a', status: 'CONFIRMED' },
      { pet_id: 'a', status: 'CHECKED_IN' },
      { pet_id: 'a', status: 'PENDING_PAYMENT' },
      { pet_id: 'b', status: 'CONFIRMED' },
      { pet_id: 'c', status: 'PENDING_PAYMENT' },
    ] }) };
  } } };
  const service = new BookingService({ models, clock: () => now });
  assert.deepEqual(await service.petBookingStatuses('owner', ['a', 'b', 'c', 'd']),
    { a: 'CHECKED_IN', b: 'CONFIRMED', c: 'PENDING_PAYMENT' });
});
test('care uses the fixed local schedule and includes preparation and cleaning in one hour', () => {
  assert.deepEqual(careSlots('2030-01-02').map(slot => localTime(slot.start_at)), ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  const input = bookingInput({ pet_id: 'a'.repeat(24), service_id: 'bath', start_at: '2030-01-02T17:00:00+07:00' });
  const quote = calculate(input, fixture[0], config, now);
  assert.equal(quote.end_at.toISOString(), '2030-01-02T11:00:00.000Z');
  assert.equal(quote.allocation_start_at.toISOString(), '2030-01-02T10:00:00.000Z');
  assert.equal(quote.allocation_end_at.toISOString(), '2030-01-02T11:00:00.000Z');
  for (const time of ['08:15', '12:00', '18:00']) {
    assert.throws(() => calculate({ ...input, start_at: `2030-01-02T${time}:00+07:00` }, fixture[0], config, now));
  }
  assert.throws(() => calculate({ ...input, start_at: '2030-01-02T17:00:00.001+07:00' }, fixture[0], config, now));
  assert.throws(() => calculate({ ...input, start_at: '2030-01-02T07:59:59+07:00' }, fixture[0], config, now));
  assert.throws(() => calculate({ ...input, start_at: now.toISOString() }, fixture[0], config, now));
  for (const extra of [{ total_amount: 1 }, { end_at: now.toISOString() }, { status: 'CONFIRMED' }, { owner_id: 'a' }]) assert.throws(() => bookingInput({ ...input, ...extra }));
  assert.throws(() => timestamp('2030-01-01T24:00:00Z', 'time'));
});
test('boarding uses facility calendar nights and protects safe integer arithmetic', () => {
  const input = { check_in_date: '2030-01-02', check_out_date: '2030-01-04' };
  const quote = calculate(input, fixture[1], config, now);
  assert.equal(quote.nights, 2); assert.equal(quote.total_amount, 400000);
  assert.equal(quote.start_at.toISOString(), '2030-01-02T07:00:00.000Z');
  assert.equal(+quote.start_at - +quote.allocation_start_at, 15 * 60000);
  assert.equal(+quote.allocation_end_at - +quote.end_at, 30 * 60000);
  assert.equal(quote.end_at.toISOString(), '2030-01-04T05:00:00.000Z');
  assert.throws(() => calculate({ ...input, check_out_date: input.check_in_date }, fixture[1], config, now));
  assert.throws(() => calculate(input, { ...fixture[1], unit_price: Number.MAX_SAFE_INTEGER }, config, now));
  assert.throws(() => validQuote({ ...fixture[0], unit_price: 1.2 }, 'bath'), { status: 503 });
  assert.throws(() => validQuote({ ...fixture[0], currency: 'USD' }, 'bath'), { status: 503 });
});
test('internal callers come from credentials and cannot borrow another caller capability', () => {
  const authorize = internalAuth({ payment: 'p'.repeat(40), care: 'c'.repeat(40) }, ['payment']);
  let error;
  authorize({ headers: { 'x-service-token': 'c'.repeat(40), 'x-caller': 'payment' } }, {}, value => { error = value; });
  assert.equal(error.status, 403);
  const req = { headers: { 'x-service-token': 'p'.repeat(40) } };
  authorize(req, {}, value => { error = value; }); assert.equal(error, undefined); assert.equal(req.caller, 'payment');
});
test('standalone cannot report transaction readiness and HTTP Catalog never silently uses fixture', async () => {
  assert.equal(await supportsTransactions({ db: { command: async () => ({ isWritablePrimary: true }) } }), false);
  const client = adapters({ catalogMode: 'http' });
  await assert.rejects(client.catalog('bath', {}), { code: 'DEPENDENCY_UNAVAILABLE' });
});

test('demo time belongs to one booking and is derived from persisted anchors after restart', () => {
  const booking = { demo_clock: { is_demo: true, real_anchor_at: now,
    business_anchor_at: new Date('2030-02-01T02:00:00Z'), version: 1, stage: 'TO_APPOINTMENT' } };
  const later = new Date(+now + 5000);
  assert.equal(businessTime({}, later), later);
  assert.equal(businessTime(booking, later).toISOString(), '2030-02-01T02:00:05.000Z');
  const persisted = JSON.parse(JSON.stringify(booking));
  assert.equal(+businessTime(persisted, later), +businessTime(booking, later));
  assert.equal(clockView({}, { demoEnabled: false }, now), undefined);
  const disabled = clockView(persisted, { demoEnabled: false }, later);
  assert.equal(disabled.enabled, false);
  assert.equal(+disabled.business_now, +businessTime(booking, later));
  assert.equal(clockView({}, { demoEnabled: true, nodeEnv: 'production' }, now), undefined);
});

test('demo control checks STAFF and configuration before accessing booking storage', async () => {
  const service = new BookingService({ config: { demoEnabled: false } });
  const actor = { id: 'a'.repeat(24), role: 'STAFF' };
  await assert.rejects(service.advanceDemo('b'.repeat(24), { ...actor, role: 'USER' }, 'k', { command: 'TO_APPOINTMENT' }), { status: 403 });
  await assert.rejects(service.advanceDemo('b'.repeat(24), actor, 'k', { command: 'TO_APPOINTMENT' }), { code: 'DEMO_DISABLED' });
  service.config = { demoEnabled: true, nodeEnv: 'production' };
  await assert.rejects(service.advanceDemo('b'.repeat(24), actor, 'k', { command: 'TO_APPOINTMENT' }), { code: 'DEMO_DISABLED' });
  service.config = { demoEnabled: true };
  for (const body of [{ command: 'SET_TIME' }, { command: 'TO_APPOINTMENT', timestamp: now.toISOString() }])
    await assert.rejects(service.advanceDemo('b'.repeat(24), actor, 'k', body), { code: 'VALIDATION_ERROR' });
});
