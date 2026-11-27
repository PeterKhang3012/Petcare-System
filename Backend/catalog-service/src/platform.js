const { observability } = require('./observability');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, createPublicKey, randomUUID, timingSafeEqual } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = message => fail(400, 'VALIDATION_ERROR', message);
function object(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) invalid('Invalid object or unknown/protected fields');
}
function text(value, name, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${name} must contain 1 to ${max} characters`);
  return value.trim();
}
function key(value, name = 'id', max = 128) {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9._:-]+$/.test(value)) invalid(`Invalid ${name}`);
  return value;
}
function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`Invalid ${name}`);
  return value;
}
function pagination(query) {
  const parse = (value, fallback, max) => value === undefined ? fallback : typeof value === 'string' && /^[1-9]\d*$/.test(value) ? integer(Number(value), 'pagination', 1, max) : invalid('Invalid pagination');
  const page = parse(query.page, 1, 10000), limit = parse(query.limit, 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}
function httpUrl(value, name) {
  let url; try { url = new URL(value); } catch { throw new Error(`Invalid ${name}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${name}`);
  return url.href.replace(/\/$/, '');
}
function databaseConfig(service, env = process.env) {
  const dbName = `${service}_db`; let parsed;
  try { parsed = new URL(env.MONGODB_URI); } catch { throw new Error('MONGODB_URI is required'); }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || decodeURIComponent(parsed.pathname.slice(1)) !== dbName) throw new Error(`Only ${dbName} is allowed`);
  return { mongoUri: env.MONGODB_URI, dbName };
}
function loadConfig(service, root, env = process.env) {
  if (service !== 'catalog') throw new Error('Catalog configuration required');
  const config = databaseConfig(service, env);
  const publicKey = fs.readFileSync(path.resolve(root, env.JWT_PUBLIC_KEY_PATH || ''), 'utf8');
  if (publicKey.includes('PRIVATE KEY')) throw new Error('An Auth PUBLIC key is required');
  const parsed = createPublicKey(publicKey);
  if (parsed.asymmetricKeyType !== 'rsa' || parsed.asymmetricKeyDetails.modulusLength < 2048 || !env.JWT_ISSUER) throw new Error('Invalid JWT public key/issuer');
  const tokenName = 'BOOKING_TO_CATALOG_TOKEN';
  const token = env[tokenName];
  if (typeof token !== 'string' || token.length < 32 || /\s|REPLACE|changeme|example/i.test(token)) throw new Error(`Configure ${tokenName} with a random 32+ character credential`);
  Object.assign(config, { service, publicKey, issuer: env.JWT_ISSUER, authBaseUrl: httpUrl(env.AUTH_BASE_URL, 'AUTH_BASE_URL'), token,
    timeoutMs: integer(Number(env.HTTP_TIMEOUT_MS || 3000), 'HTTP_TIMEOUT_MS', 100, 10000),
    port: integer(Number(env.PORT || 3004), 'PORT', 1, 65535) });
  return config;
}
async function requestJson(url, { method = 'GET', body, headers = {}, timeoutMs = 3000 } = {}) {
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 65536) throw new Error('Dependency response too large'); chunks.push(Buffer.from(value)); }
  } finally { await reader.cancel().catch(() => {}); }
  return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}
function authenticate(config) {
  return async (req, _res, next) => {
    try {
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || ''); let claims;
      if (!bearer) fail(401, 'UNAUTHORIZED', 'Bearer token required');
      try { claims = jwt.verify(bearer[1], config.publicKey, { algorithms: ['RS256'], issuer: config.issuer });
        if (typeof claims.sub !== 'string' || !/^[a-f\d]{24}$/i.test(claims.sub) || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) throw new Error('Invalid claims');
      } catch { fail(401, 'UNAUTHORIZED', 'Invalid or expired token'); }
      let result;
      try { result = await requestJson(config.authBaseUrl + '/api/auth/me', { headers: { Authorization: `Bearer ${bearer[1]}`, 'X-Correlation-ID': req.correlationId }, timeoutMs: config.timeoutMs }); }
      catch { fail(503, 'DEPENDENCY_UNAVAILABLE', 'Auth is unavailable'); }
      if ([401, 403].includes(result.status)) fail(401, 'UNAUTHORIZED', 'Auth rejected the token');
      const user = result.body?.data?.user;
      if (result.status !== 200 || result.body?.success !== true || !user || !['USER', 'STAFF'].includes(user.role) || !Array.isArray(user.permissions) || user.permissions.some(p => typeof p !== 'string')) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Auth response');
      if (user.id !== claims.sub) fail(401, 'UNAUTHORIZED', 'Identity mismatch');
      req.user = { id: user.id, role: user.role, permissions: [...user.permissions] };
      next();
    } catch (error) { next(error); }
  };
}
const staffOnly = (req, _res, next) => req.user?.role === 'STAFF' ? next() : next(new HttpError(403, 'FORBIDDEN', 'STAFF required'));
function internalAuth(token) {
  const expected = createHash('sha256').update(token).digest();
  return (req, _res, next) => {
    const supplied = req.headers['x-service-token'];
    if (typeof supplied !== 'string' || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) return next(new HttpError(401, 'UNAUTHORIZED', 'Invalid service credential'));
    next();
  };
}
async function replicaReady(connection) { const h = await connection.db.command({ hello: 1 }); return Boolean(h.setName && h.isWritablePrimary && h.logicalSessionTimeoutMinutes); }
async function connect(config) { return mongoose.createConnection(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 5000, autoIndex: false, maxPoolSize: 15 }).asPromise(); }
async function initialize(models) { for (const model of Object.values(models)) { await model.init(); await model.createIndexes(); } }
async function transaction(connection, callback) {
  const session = await connection.startSession();
  try {
    for (let attempt = 0; attempt < 7; attempt++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000 });
      try {
        const result = await callback(session);
        for (let commit = 0; ; commit++) {
          try { await session.commitTransaction(); return result; }
          catch (error) { if (!error.hasErrorLabel?.('UnknownTransactionCommitResult')) throw error; if (commit === 4) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Unknown commit outcome; retry the same request'); }
        }
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction().catch(() => {});
        if (error instanceof HttpError || !(error.hasErrorLabel?.('TransientTransactionError') || [11000, 112, 244, 251].includes(error.code))) throw error;
        if (attempt === 6) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Database contention; retry the same request');
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1) + Math.random() * 20));
      }
    }
  } finally { await session.endSession(); }
}
function baseApp(service, connection, logger = console) {
  const app = express(); app.disable('x-powered-by'); app.set('query parser', 'simple');
  app.use((req, res, next) => {
    const given = req.headers['x-correlation-id']; req.correlationId = typeof given === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(given) ? given : randomUUID();
    res.setHeader('X-Correlation-ID', req.correlationId); res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => logger.info(JSON.stringify({ service, request_id: req.correlationId, method: req.method, status: res.statusCode }))); next();
  });
  observability(app, 'catalog-service');
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => res.json({ success: true, data: { live: true, service } }));
  app.get('/ready', async (_req, res) => {
    try { if (connection.readyState !== 1 || !await replicaReady(connection)) throw new Error('not ready'); res.json({ success: true, data: { ready: true } }); }
    catch { res.status(503).json({ success: false, code: 'DEPENDENCY_UNAVAILABLE', message: 'A writable replica set is required' }); }
  });
  return app;
}
function finishApp(app) {
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  app.use((error, _req, res, _next) => {
    let status = error instanceof HttpError ? error.status : 500, code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR', message = error instanceof HttpError ? error.message : 'Internal server error';
    if (['entity.parse.failed', 'entity.too.large'].includes(error.type) || ['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request data'; }
    if (/^Mongo(Network|ServerSelection)|^MongooseServerSelection/.test(error.name || '')) { status = 503; code = 'DEPENDENCY_UNAVAILABLE'; message = 'Database is unavailable'; }
    res.status(status).json({ success: false, code, message });
  }); return app;
}
function shutdown(server, connection, stop = async () => {}) {
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    const force = setTimeout(() => { server.closeAllConnections(); connection.destroy(true).catch(() => {}); process.exitCode = 1; }, 10000); force.unref();
    await new Promise(resolve => server.close(resolve)); await stop(); await connection.close(); clearTimeout(force);
  };
  process.once('SIGINT', close); process.once('SIGTERM', close); return close;
}
module.exports = { HttpError, fail, invalid, object, text, key, integer, pagination, databaseConfig, loadConfig, requestJson, authenticate, staffOnly, internalAuth, replicaReady, connect, initialize, transaction, baseApp, finishApp, shutdown };
