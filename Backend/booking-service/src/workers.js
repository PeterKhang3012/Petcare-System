const { randomUUID } = require('node:crypto');
function createWorkers(service, operations, logger = console) {
  const workerId = randomUUID(); let running, stopped = false;
  async function expiry() {
    const rows = await service.models.Booking.find({ status: 'PENDING_PAYMENT', expires_at: { $lte: service.clock() } }).sort({ expires_at: 1, _id: 1 }).limit(100).select('_id').lean();
    for (const row of rows) await service.expire(row._id);
    return rows.length;
  }
  async function outbox() {
    if (!service.config.paymentBaseUrl) return 0;
    let sent = 0;
    for (let index = 0; index < 20; index++) {
      const now = service.clock();
      const event = await service.models.Outbox.findOneAndUpdate({ status: 'PENDING', next_attempt_at: { $lte: now }, $or: [{ lease_until: null }, { lease_until: { $lte: now } }] },
        { $set: { lease_until: new Date(+now + 60000), lease_owner: workerId }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { next_attempt_at: 1, _id: 1 } }).lean();
      if (!event) break;
      const delivered = await service.clients.refund(event);
      await service.models.Outbox.updateOne({ _id: event._id, lease_owner: workerId }, { $set: delivered ?
        { status: 'DELIVERED', delivered_at: service.clock(), lease_until: null } :
        { next_attempt_at: new Date(+service.clock() + Math.min(3600000, 1000 * 2 ** Math.min(event.attempts, 12))), lease_until: null } });
      if (delivered) sent++;
    }
    return sent;
  }
  async function tick() { await expiry(); await operations.reconcile(); await outbox(); }
  function start() {
    const run = () => {
      if (running || stopped) return;
      running = tick().catch(() => logger.error(JSON.stringify({ service: 'booking', worker_id: workerId, message: 'Worker failed; persisted work will be retried' }))).finally(() => { running = null; });
    };
    const timer = setInterval(run, service.config.workerIntervalMs); timer.unref(); run();
    return async () => { stopped = true; clearInterval(timer); if (running) await running; };
  }
  return { expiry, outbox, tick, start };
}
module.exports = { createWorkers };
