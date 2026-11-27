const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

const tasks = {
  auth: { start: 'server.js', seed: 'scripts/seed-staff.js', keys: 'script.js' },
  pet: { start: 'server.js' },
  booking: { start: 'server.js', seed: 'scripts/seed-resources.js', worker: 'worker.js' },
  catalog: { start: 'server.js', seed: 'scripts/seed.js' },
  care: { start: 'server.js' },
  payment: { start: 'spring-boot:run', verify: 'verify' },
};
const serviceKeys = {
  auth: ['JWT_EXPIRES_IN'],
  pet: ['BOOKING_TO_PET_TOKEN'],
  booking: ['BOOKING_TO_PET_TOKEN', 'BOOKING_TO_CATALOG_TOKEN', 'BOOKING_TO_PAYMENT_TOKEN',
    'PAYMENT_TO_BOOKING_TOKEN', 'CARE_TO_BOOKING_TOKEN', 'PAWSTAY_DEMO_ENABLED'],
  catalog: ['BOOKING_TO_CATALOG_TOKEN'],
  care: ['CARE_TO_BOOKING_TOKEN', 'PAWSTAY_DEMO_ENABLED'],
  payment: ['PAYMENT_TO_BOOKING_TOKEN', 'BOOKING_TO_PAYMENT_TOKEN', 'VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET',
    'VNPAY_PAYMENT_URL', 'VNPAY_RETURN_URL', 'VNPAY_IPN_URL', 'VNPAY_REFUND_SERVER_IP',
    'PAYMENT_FRONTEND_RETURN_URL', 'OUTBOX_ENABLED', 'OUTBOX_BATCH_SIZE', 'OUTBOX_RETRY_DELAY',
    'OUTBOX_MAX_ATTEMPTS', 'OUTBOX_POLL_DELAY'],
};

const [service, task = 'start', ...extra] = process.argv.slice(2);
const command = Object.hasOwn(tasks, service) && Object.hasOwn(tasks[service], task) && tasks[service][task];
if (!command || extra.length) {
  console.error('Usage: node scripts/run-local.cjs <auth|pet|booking|catalog|care|payment> [start|seed|keys|worker|verify]');
  process.exit(1);
}

const root = resolve(__dirname, '..');
let rootSettings;
try {
  rootSettings = { ...parseEnv(readFileSync(resolve(root, '.env'), 'utf8')), ...process.env };
} catch {
  console.error('Could not read the root .env. Copy .env.example to .env and fill in the service settings.');
  process.exit(1);
}

const env = { ...process.env };
for (const key of ['JWT_ISSUER', 'NODE_ENV', ...serviceKeys[service]]) {
  if (rootSettings[key] !== undefined) env[key] = rootSettings[key];
}
const prefix = `LOCAL_${service.toUpperCase()}_`;
for (const [key, value] of Object.entries(rootSettings)) {
  if (key.startsWith(prefix)) env[key.slice(prefix.length)] = value;
}
const cwd = resolve(root, 'Backend', service + '-service');
const payment = service === 'payment';
const options = { cwd, env, stdio: 'inherit' };
const result = payment && process.platform === 'win32'
  ? spawnSync(`mvn ${command}`, { ...options, shell: true })
  : spawnSync(payment ? 'mvn' : process.execPath, [command], options);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
