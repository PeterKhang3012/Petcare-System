const { observability } = require('./observability');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash, createPublicKey, timingSafeEqual } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message); Object.assign(this, { status, code, details });
  }
}
const fail = (status, code, message, details) => { throw new HttpError(status, code, message, details); };
const invalid = message => fail(400, 'VALIDATION_ERROR', message);
function text(value, name, max = 100, optional = false) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${name} must contain 1 to ${max} characters`);
  return value.trim();
}
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('A JSON object is required');
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid('Unknown or protected fields');
  return value;
}
function id(value, name = 'id') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) invalid(`${name} must be a MongoDB ObjectId`);
  return value.toLowerCase();
}
function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
function pagination(query) {
  const number = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) invalid('Invalid pagination');
    return integer(Number(value), 'pagination', 1, max);
  };
  const page = number(query.page, 1, 10000), limit = number(query.limit, 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}
function dateOnly(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${name} must be YYYY-MM-DD`);
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900) invalid(`Invalid ${name}`);
  return value;
}
function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$/.test(value)) invalid(`${name} must be an ISO timestamp with offset`);
  dateOnly(value.slice(0, 10), name);
  const date = new Date(value);
  if (!Number.isFinite(+date)) invalid(`Invalid ${name}`);
  return date;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function requestKey(value, name = 'Idempotency-Key') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) invalid(`${name} must contain 1 to 128 letters, digits, . _ : or -`);
  return value;
}
function url(value, name, optional = false) {
  if (!value && optional) return undefined;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an HTTP(S) URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`Invalid ${name}`);
  return parsed.href.replace(/\/$/, '');
}
function secret(value, name) {
  if (typeof value !== 'string' || value.length < 32 || /\s/.test(value) || /REPLACE|example|changeme/i.test(value)) throw new Error(`${name} must be a unique random credential (32+ characters)`);
  return value;
}
function loadConfig(service, root, env = process.env) {
  const dbName = `${service}_db`;
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGODB_URI is required');
  let database;
  try { database = decodeURIComponent(new URL(mongoUri).pathname.slice(1)); } catch { throw new Error('Invalid MONGODB_URI'); }
  if (database !== dbName) throw new Error(`MONGODB_URI must select only ${dbName}`);
  const publicKey = fs.readFileSync(path.resolve(root, env.JWT_PUBLIC_KEY_PATH || ''), 'utf8');
  if (publicKey.includes('PRIVATE KEY')) throw new Error('Only an Auth PUBLIC key is allowed');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('An RSA public key of 2048+ bits is required');
  const requiredTokens = service === 'pet' ? ['BOOKING_TO_PET_TOKEN'] : ['BOOKING_TO_PET_TOKEN', 'PAYMENT_TO_BOOKING_TOKEN', 'CARE_TO_BOOKING_TOKEN'];
  const tokens = Object.fromEntries(requiredTokens.map(name => [name, secret(env[name], name)]));
  if (new Set(Object.values(tokens)).size !== Object.keys(tokens).length) throw new Error('Directional credentials must differ');
  const numeric = (name, fallback, min, max) => integer(Number(env[name] || fallback), name, min, max);
  if (!env.JWT_ISSUER) throw new Error('JWT_ISSUER is required');
  return { service, dbName, mongoUri, publicKey, issuer: env.JWT_ISSUER, tokens,
    authBaseUrl: url(env.AUTH_BASE_URL, 'AUTH_BASE_URL'),
    timeoutMs: numeric('HTTP_TIMEOUT_MS', 3000, 100, 30000),
    port: numeric('PORT', service === 'pet' ? 3002 : 3003, 1, 65535) };
}
async function requestJson(target, { method = 'GET', body, headers = {}, timeoutMs = 3000 } = {}) {
  const response = await fetch(target, { method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 65536) throw new Error('Dependency response too large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}
function authenticate(config) {
  return async (req, _res, next) => {
    try {
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
      if (!bearer) fail(401, 'UNAUTHORIZED', 'A valid Bearer token is required');
      let claims;
      try {
        claims = jwt.verify(bearer[1], config.publicKey, { algorithms: ['RS256'], issuer: config.issuer });
        if (typeof claims.sub !== 'string' || !/^[a-f\d]{24}$/i.test(claims.sub) || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) throw new Error('claims');
      } catch { fail(401, 'UNAUTHORIZED', 'Invalid or expired token'); }
      let result;
      try { result = await requestJson(config.authBaseUrl + '/api/auth/me', { headers: { Authorization: `Bearer ${bearer[1]}`, 'X-Correlation-ID': req.correlationId }, timeoutMs: config.timeoutMs }); }
      catch { fail(503, 'DEPENDENCY_UNAVAILABLE', 'Auth is unavailable'); }
      if ([401, 403].includes(result.status)) fail(401, 'UNAUTHORIZED', 'Auth rejected the token');
      const user = result.body?.data?.user;
      if (result.status !== 200 || result.body.success !== true || !user || !['USER', 'STAFF'].includes(user.role) || !Array.isArray(user.permissions) || user.permissions.some(p => typeof p !== 'string')) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Auth response');
      if (user.id !== claims.sub) fail(401, 'UNAUTHORIZED', 'Identity mismatch');
      req.user = { id: user.id, role: user.role, permissions: [...user.permissions] };
      next();
    } catch (error) { next(error); }
  };
}
const requireRole = role => (req, _res, next) => req.user?.role === role ? next() : next(new HttpError(403, 'FORBIDDEN', 'This role cannot perform this operation'));
function internalAuth(credentials, allowed) {
  const digests = Object.entries(credentials).map(([caller, token]) => [caller, createHash('sha256').update(token).digest()]);
  return (req, _res, next) => {
    const supplied = req.headers['x-service-token'];
    if (typeof supplied !== 'string') return next(new HttpError(401, 'UNAUTHORIZED', 'Service credential required'));
    const hash = createHash('sha256').update(supplied).digest();
    const match = digests.find(([, expected]) => timingSafeEqual(hash, expected));
    if (!match) return next(new HttpError(401, 'UNAUTHORIZED', 'Invalid service credential'));
    if (!allowed.includes(match[0])) return next(new HttpError(403, 'FORBIDDEN', 'Caller cannot perform this operation'));
    req.caller = match[0]; next();
  };
}
function baseApp({ service, connection, ready = async () => true, logger = console }) {
  const app = express(); app.disable('x-powered-by'); app.set('query parser', 'simple');
  app.use((req, res, next) => {
    const supplied = req.headers['x-correlation-id'];
    req.correlationId = typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
    res.setHeader('X-Correlation-ID', req.correlationId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => logger.info(JSON.stringify({ service, request_id: req.correlationId, method: req.method, status: res.statusCode })));
    next();
  });
  observability(app, 'booking-service');
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/health', (_req, res) => res.json({ success: true, data: { service, live: true } }));
  app.get('/ready', async (_req, res) => {
    try {
      if (connection.readyState !== 1 || !await ready()) throw new Error('not ready');
      await connection.db.command({ ping: 1 });
      res.json({ success: true, data: { ready: true } });
    } catch { res.status(503).json({ success: false, code: 'DEPENDENCY_UNAVAILABLE', message: 'Database/configuration is not ready' }); }
  });
  return app;
}
function finishApp(app) {
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  app.use((error, _req, res, _next) => {
    let status = error instanceof HttpError ? error.status : 500;
    let code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
    let message = error instanceof HttpError ? error.message : 'Internal server error';
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large' || error.name === 'ValidationError' || error.name === 'CastError') { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request data'; }
    if (/^Mongo(Network|ServerSelection)|^MongooseServerSelection/.test(error.name || '')) { status = 503; code = 'DEPENDENCY_UNAVAILABLE'; message = 'Database is unavailable'; }
    res.status(status).json({ success: false, code, message, ...(error instanceof HttpError && error.details !== undefined ? { details: error.details } : {}) });
  });
  return app;
}
async function connect(config) {
  const connection = await mongoose.createConnection(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 5000, maxPoolSize: 20, autoIndex: false }).asPromise();
  return connection;
}
function shutdown(server, connection, stop = async () => {}) {
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    const timer = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 10000); timer.unref();
    await new Promise(resolve => server.close(resolve));
    await stop(); await connection.close(); clearTimeout(timer);
  };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  return close;
}
module.exports = { HttpError, fail, invalid, text, object, id, integer, pagination, dateOnly, timestamp, fingerprint, requestKey, url, secret,
  loadConfig, requestJson, authenticate, requireRole, internalAuth, baseApp, finishApp, connect, shutdown };
