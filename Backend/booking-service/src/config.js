const { loadConfig, url, secret, integer } = require('./platform');
function configFor(root, env = process.env) {
  const config = loadConfig('booking', root, env);
  const number = (name, fallback, min, max) => integer(Number(env[name] === undefined || env[name] === '' ? fallback : env[name]), name, min, max);
  const time = (name, fallback) => {
    const value = env[name] || fallback;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`Invalid ${name}`);
    return value;
  };
  const boolean = (name, fallback) => {
    if (env[name] === undefined || env[name] === '') return fallback;
    if (!['true', 'false'].includes(env[name])) throw new Error(`Invalid ${name}`);
    return env[name] === 'true';
  };
  config.petBaseUrl = url(env.PET_BASE_URL, 'PET_BASE_URL');
  config.catalogMode = env.CATALOG_MODE || 'http';
  if (!['http', 'fixture'].includes(config.catalogMode)) throw new Error('Invalid CATALOG_MODE');
  if (config.catalogMode === 'fixture' && env.NODE_ENV === 'production') throw new Error('Catalog fixture is forbidden in production');
  config.catalogBaseUrl = url(env.CATALOG_BASE_URL, 'CATALOG_BASE_URL', true);
  config.paymentBaseUrl = url(env.PAYMENT_BASE_URL, 'PAYMENT_BASE_URL', true);
  if (config.catalogBaseUrl) config.tokens.BOOKING_TO_CATALOG_TOKEN = secret(env.BOOKING_TO_CATALOG_TOKEN, 'BOOKING_TO_CATALOG_TOKEN');
  if (config.paymentBaseUrl) config.tokens.BOOKING_TO_PAYMENT_TOKEN = secret(env.BOOKING_TO_PAYMENT_TOKEN, 'BOOKING_TO_PAYMENT_TOKEN');
  if (new Set(Object.values(config.tokens)).size !== Object.keys(config.tokens).length) throw new Error('Directional credentials must differ');
  config.hours = { open: time('OPEN_TIME', '08:00'), close: time('CLOSE_TIME', '18:00'),
    boardingIn: time('BOARDING_CHECK_IN_TIME', '14:00'), boardingOut: time('BOARDING_CHECK_OUT_TIME', '12:00') };
  if (config.hours.open >= config.hours.close || [config.hours.boardingIn, config.hours.boardingOut].some(t => t < config.hours.open || t >= config.hours.close)) throw new Error('Opening/boarding times must fit the facility day');
  config.preparationMinutes = number('PREPARATION_MINUTES', 15, 0, 240);
  config.cleaningMinutes = number('CLEANING_MINUTES', 30, 1, 240);
  config.checkInEarlyMinutes = number('CHECK_IN_EARLY_MINUTES', 60, 0, 1440);
  config.checkInLateMinutes = number('CHECK_IN_LATE_MINUTES', 120, 0, 1440);
  config.workerEnabled = boolean('WORKER_ENABLED', true);
  config.workerIntervalMs = number('WORKER_INTERVAL_MS', 5000, 100, 60000);
  return config;
}
module.exports = { configFor };
