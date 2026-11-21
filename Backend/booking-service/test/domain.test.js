const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookingInput, calculate } = require('../src/time');
const { validQuote, adapters } = require('../src/adapters');
const { timestamp, internalAuth } = require('../src/platform');
const { supportsTransactions } = require('../src/transactions');
const fixture = require('../fixtures/catalog.json');
const config = { hours: { open: '08:00', close: '18:00', boardingIn: '14:00', boardingOut: '12:00' }, preparationMinutes: 15, cleaningMinutes: 30 };
const now = new Date('2030-01-01T02:00:00Z');
test('care duration, opening boundaries, UTC, preparation and cleaning', () => {
  const input = bookingInput({ pet_id: 'a'.repeat(24), service_id: 'bath', start_at: '2030-01-02T17:00:00+07:00' });
  const quote = calculate(input, fixture[0], config, now);
  assert.equal(quote.end_at.toISOString(), '2030-01-02T11:00:00.000Z');
  assert.equal(quote.allocation_start_at.toISOString(), '2030-01-02T09:45:00.000Z');
  assert.equal(quote.allocation_end_at.toISOString(), '2030-01-02T11:30:00.000Z');
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
