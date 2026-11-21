const { fail, object, text, timestamp, id, invalid } = require('./platform');
const { transaction, lock } = require('./transactions');
const { overlap, liveAllocation, DAY, MINUTE } = require('./time');
const { present } = require('./models');
class ResourceOperations {
  constructor(service) { this.service = service; Object.assign(this, { models: service.models, connection: service.connection, clock: service.clock }); }
  async clean(resourceId, actorId, body) {
    object(body, ['reason']); const reason = text(body.reason, 'reason', 500);
    return transaction(this.connection, async session => {
      await lock(this.models, session, null, [resourceId]);
      const resource = await this.models.Resource.findById(resourceId).session(session).lean();
      const now = this.clock();
      const busy = await this.models.Booking.exists({ resource_id: resourceId, status: 'CHECKED_IN' }).session(session);
      const maintenance = await this.models.Maintenance.exists({ resource_id: resourceId, status: 'ACTIVE', start_at: { $lte: now }, end_at: { $gt: now } }).session(session);
      if (busy || resource.occupied_booking_id || maintenance || !['READY', 'CLEANING'].includes(resource.state)) fail(409, 'INVALID_BOOKING_STATE', 'Resource cannot be marked ready');
      if (resource.state === 'CLEANING') {
        await this.models.Resource.updateOne({ _id: resourceId }, { $set: { state: 'READY', updated_at: now } }, { session, timestamps: false });
        await this.service.history({ resource_id: resourceId, action: 'CLEANING_COMPLETED', from: 'CLEANING', to: 'READY', actor_type: 'STAFF', actor_id: actorId, reason }, session);
        resource.state = 'READY'; resource.updated_at = now;
      }
      return present(resource);
    });
  }
  async maintenance(resourceId, actorId, body) {
    object(body, ['start_at', 'end_at', 'reason']);
    const start = timestamp(body.start_at, 'start_at'), end = timestamp(body.end_at, 'end_at'), reason = text(body.reason, 'reason', 500);
    if (+end <= +start || +end - +start > 366 * DAY) invalid('Maintenance must be a positive interval of at most 366 days');
    return transaction(this.connection, async session => {
      await lock(this.models, session, null, [resourceId]); const now = this.clock();
      if (+start < +now - MINUTE || +end <= +now) invalid('Maintenance cannot be backdated');
      const resource = await this.models.Resource.findById(resourceId).session(session).lean();
      const conflicts = await this.models.Allocation.find({ resource_id: resourceId, ...liveAllocation(now), ...overlap(start, end) }).select('booking_id maintenance_id').limit(100).session(session).lean();
      if (conflicts.length || (+start <= +now && resource.occupied_booking_id)) fail(409, 'SLOT_UNAVAILABLE', 'Maintenance conflicts with existing allocations', { conflicts: conflicts.map(c => ({ booking_id: c.booking_id, maintenance_id: c.maintenance_id })) });
      const [maintenance] = await this.models.Maintenance.create([{ resource_id: resourceId, start_at: start, end_at: end, actor_id: actorId, reason }], { session });
      await this.models.Allocation.create([{ resource_id: resourceId, maintenance_id: maintenance._id, type: 'MAINTENANCE', start_at: start, end_at: end, active: true }], { session });
      if (+start <= +now) await this.models.Resource.updateOne({ _id: resourceId }, { $set: { state: 'OUT_OF_SERVICE' } }, { session });
      await this.service.history({ resource_id: resourceId, action: 'MAINTENANCE_CREATED', actor_id: actorId, actor_type: 'STAFF', reason }, session);
      return present(maintenance);
    });
  }
  async cancelMaintenance(resourceId, maintenanceId, actorId, body) {
    object(body, ['reason']); const reason = text(body.reason, 'reason', 500);
    return transaction(this.connection, async session => {
      await lock(this.models, session, null, [resourceId]);
      const maintenance = await this.models.Maintenance.findOne({ _id: maintenanceId, resource_id: resourceId }).session(session).lean();
      if (!maintenance) fail(404, 'NOT_FOUND', 'Maintenance not found');
      if (maintenance.status === 'CANCELLED') return present(maintenance);
      await this.models.Maintenance.updateOne({ _id: maintenanceId }, { $set: { status: 'CANCELLED', cancelled_by: actorId, cancelled_at: this.clock() } }, { session });
      await this.models.Allocation.updateOne({ maintenance_id: maintenanceId }, { $set: { active: false } }, { session });
      await this.service.history({ resource_id: resourceId, action: 'MAINTENANCE_CANCELLED', actor_id: actorId, actor_type: 'STAFF', reason }, session);
      await this.syncInside(resourceId, session);
      return present(await this.models.Maintenance.findById(maintenanceId).session(session).lean());
    });
  }
  async syncInside(resourceId, session) {
    const now = this.clock();
    const resource = await this.models.Resource.findById(resourceId).session(session).lean();
    if (resource.occupied_booking_id || resource.state === 'OCCUPIED') return;
    const active = await this.models.Maintenance.exists({ resource_id: resourceId, status: 'ACTIVE', start_at: { $lte: now }, end_at: { $gt: now } }).session(session);
    const state = active ? 'OUT_OF_SERVICE' : resource.state === 'OUT_OF_SERVICE' ? 'CLEANING' : resource.state;
    if (state !== resource.state) {
      await this.models.Resource.updateOne({ _id: resourceId }, { $set: { state } }, { session });
      await this.service.history({ resource_id: resourceId, action: 'MAINTENANCE_STATE', from: resource.state, to: state, actor_id: 'maintenance-worker', actor_type: 'WORKER', reason: 'Reconciled scheduled maintenance' }, session);
    }
  }
  async reconcile() {
    const rows = await this.models.Resource.find({ state: { $ne: 'OCCUPIED' } }).select('_id').lean();
    for (const resource of rows) await transaction(this.connection, async session => { await lock(this.models, session, null, [resource._id]); await this.syncInside(resource._id, session); });
  }
}
module.exports = { ResourceOperations };
