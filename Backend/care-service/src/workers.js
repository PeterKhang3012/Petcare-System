const { randomUUID } = require('node:crypto');
const { transaction, fail } = require('./platform');
class SyncWorker {
  constructor({ connection, models, client, config, clock = () => new Date(), logger = console }) { Object.assign(this, { connection, models, client, config, clock, logger }); }
  async process(requestId) {
    const now = this.clock(), lease = randomUUID();
    const request = await this.models.Request.findOneAndUpdate({ ...(requestId ? { _id: requestId } : {}), status: 'PENDING', next_attempt_at: { $lte: now }, $or: [{ lease_until: null }, { lease_until: { $lte: now } }] },
      { $set: { lease_token: lease, lease_until: new Date(+now + this.config.leaseMs) }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { next_attempt_at: 1, _id: 1 } }).lean();
    if (!request) return false;
    let result;
    try { result = await this.client.execute(request.payload, request.action); }
    catch {
      await this.models.Request.updateOne({ _id: request._id, status: 'PENDING', lease_token: lease }, { $set: {
        lease_until: null, next_attempt_at: new Date(+this.clock() + Math.min(300000, 1000 * 2 ** Math.min(request.attempts - 1, 9))), last_error: 'BOOKING_UNAVAILABLE'
      } }); return true;
    }
    await transaction(this.connection, async session => {
      const succeeded = result.status === 200, at = this.clock();
      const changed = await this.models.Request.findOneAndUpdate({ _id: request._id, status: 'PENDING', lease_token: lease }, { $set: {
        status: succeeded ? 'SUCCEEDED' : 'REJECTED', result, completed_at: at, lease_until: null, last_error: null
      } }, { session, returnDocument: 'after' }).lean();
      if (!changed) return; // Another lease superseded this worker; its result cannot overwrite it.
      const updates = { pending_request_id: null, sync_state: succeeded ? 'SYNCED' : 'REJECTED' };
      if (succeeded && request.action === 'CHECK_IN') Object.assign(updates, { state: 'IN_CARE', intake: request.draft, intake_actor_id: request.payload.actor_id, checked_in_at: at });
      if (succeeded && request.action === 'CHECK_OUT') Object.assign(updates, { state: 'COMPLETED', handover: request.draft, handover_actor_id: request.payload.actor_id, completed_at: at });
      const visit = await this.models.Visit.updateOne({ _id: request.visit_id, pending_request_id: request._id }, { $set: updates, $inc: { revision: 1 } }, { session });
      if (visit.modifiedCount !== 1) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Visit synchronization needs recovery');
    }); return true;
  }
  async tick() { for (let i = 0; i < 20; i++) if (!await this.process()) break; }
  start() {
    let active, stopping = false;
    const run = () => { if (!active && !stopping) active = this.tick().catch(() => this.logger.error('Care worker failed; persisted requests remain recoverable')).finally(() => { active = null; }); };
    const timer = setInterval(run, this.config.workerIntervalMs); timer.unref(); run();
    return async () => { stopping = true; clearInterval(timer); if (active) await active; };
  }
}
module.exports = { SyncWorker };
