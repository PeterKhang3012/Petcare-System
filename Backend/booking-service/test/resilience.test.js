const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { configFor } = require('../src/config');
const { adapters } = require('../src/adapters');
const { transaction } = require('../src/transactions');
test('configuration rejects fixture in production, duplicate credentials, wrong database and private keys', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawstay-public-config-'));
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPath = path.join(directory, 'public.pem'), privatePath = path.join(directory, 'private.pem');
  fs.writeFileSync(publicPath, pair.publicKey.export({ type: 'spki', format: 'pem' }));
  fs.writeFileSync(privatePath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const env = { MONGODB_URI: 'mongodb://127.0.0.1:27017/booking_db', JWT_PUBLIC_KEY_PATH: publicPath, JWT_ISSUER: 'test', AUTH_BASE_URL: 'http://127.0.0.1:3001', PET_BASE_URL: 'http://127.0.0.1:3002',
    BOOKING_TO_PET_TOKEN: 'b'.repeat(40), PAYMENT_TO_BOOKING_TOKEN: 'p'.repeat(40), CARE_TO_BOOKING_TOKEN: 'c'.repeat(40) };
  assert.equal(configFor(directory, env).catalogMode, 'http');
  assert.equal(configFor(directory, env).demoEnabled, false);
  assert.equal(configFor(directory, { ...env, PAWSTAY_DEMO_ENABLED: 'true' }).demoEnabled, true);
  assert.throws(() => configFor(directory, { ...env, PAWSTAY_DEMO_ENABLED: 'yes' }), /PAWSTAY_DEMO_ENABLED/);
  assert.throws(() => configFor(directory, { ...env, PAWSTAY_DEMO_ENABLED: 'true', NODE_ENV: 'production' }), /forbidden/);
  assert.throws(() => configFor(directory, { ...env, CATALOG_MODE: 'fixture', NODE_ENV: 'production' }), /forbidden/);
  assert.throws(() => configFor(directory, { ...env, CARE_TO_BOOKING_TOKEN: env.PAYMENT_TO_BOOKING_TOKEN }), /differ/);
  assert.throws(() => configFor(directory, { ...env, MONGODB_URI: 'mongodb://127.0.0.1:27017/auth_db' }), /booking_db/);
  assert.throws(() => configFor(directory, { ...env, JWT_PUBLIC_KEY_PATH: privatePath }), /PUBLIC/);
  assert.throws(() => configFor(directory, { ...env, OPEN_TIME: '19:00', CLOSE_TIME: '08:00' }));
  assert.throws(() => configFor(directory, { ...env, CLEANING_MINUTES: '0' }));
});
test('HTTP adapters enforce timeouts, invalid dependency identity and no fixture fallback', async t => {
  let mode = 'timeout';
  const server = http.createServer((req, res) => {
    if (mode === 'timeout') return;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: { pet: { id: 'a'.repeat(24), owner_id: 'b'.repeat(24), name: 'Mimi', species: 'CAT', weight_kg: 3, version: 1 } } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const config = { petBaseUrl: `http://127.0.0.1:${server.address().port}`, catalogMode: 'http', timeoutMs: 100, tokens: { BOOKING_TO_PET_TOKEN: 'b'.repeat(40) } };
  await assert.rejects(adapters(config).pet('a'.repeat(24), 'b'.repeat(24), 'timeout-test'), { code: 'DEPENDENCY_UNAVAILABLE' });
  mode = 'identity';
  await assert.rejects(adapters(config).pet('a'.repeat(24), 'c'.repeat(24), 'identity-test'), { code: 'DEPENDENCY_UNAVAILABLE' });
  await assert.rejects(adapters(config).catalog('bath', {}), { code: 'DEPENDENCY_UNAVAILABLE' });
});
test('ambiguous commit retries commit only; transient transactions rerun reads in a new transaction', async () => {
  let callbacks = 0, commits = 0, begins = 0, active = false;
  const session = { startTransaction() { begins++; active = true; }, inTransaction() { return active; }, async abortTransaction() { active = false; }, async endSession() {},
    async commitTransaction() { commits++; if (commits === 1) throw { hasErrorLabel: label => label === 'UnknownTransactionCommitResult' }; active = false; } };
  const connection = { startSession: async () => session };
  assert.equal(await transaction(connection, async () => { callbacks++; return 'durable result'; }), 'durable result');
  assert.equal(callbacks, 1); assert.equal(commits, 2); assert.equal(begins, 1);
  callbacks = 0; commits = 1; begins = 0;
  await transaction(connection, async () => { if (++callbacks === 1) throw { code: 112 }; return true; });
  assert.equal(callbacks, 2); assert.equal(begins, 2);
});
