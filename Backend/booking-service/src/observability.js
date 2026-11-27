const { Registry, Histogram, Gauge, collectDefaultMetrics } = require('prom-client');
const specification = require('../openapi.json');

function observability(app, service) {
  const register = new Registry();
  register.setDefaultLabels({ service });
  collectDefaultMetrics({ register });
  const duration = new Histogram({
    name: 'pawstay_http_request_duration_seconds',
    help: 'Duration of completed HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });
  const active = new Gauge({ name: 'pawstay_http_active_requests', help: 'Active HTTP requests',
    registers: [register] });
  const routes = Object.entries(specification.paths).map(([path, operations]) => ({
    path, operations, pattern: new RegExp('^' + path.split('/').map(segment =>
      segment.startsWith('{') ? '[^/]+' : segment).join('/') + '/?$'),
  })).sort((a, b) => Number(a.path.includes('{')) - Number(b.path.includes('{')));
  app.get('/metrics', async (_req, res) => res.type(register.contentType).send(await register.metrics()));
  app.get('/api-docs.json', (_req, res) => res.json(specification));
  app.use((req, res, next) => {
    const method = req.method.toLowerCase();
    const route = routes.find(entry => (entry.operations[method] ||
      (method === 'head' && entry.operations.get)) && entry.pattern.test(req.path))?.path ?? 'UNMATCHED';
    const start = process.hrtime.bigint();
    active.inc();
    res.once('close', () => active.dec());
    res.once('finish', () => duration.observe({
      method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER',
      route, status: String(res.statusCode),
    }, Number(process.hrtime.bigint() - start) / 1e9));
    next();
  });
}

module.exports = { observability };
