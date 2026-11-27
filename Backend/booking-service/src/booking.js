const { randomUUID } = require('node:crypto');
const { fail, invalid, id, text, object, fingerprint, requestKey } = require('./platform');
const { validQuote } = require('./adapters');
const { transaction, lock } = require('./transactions');
const { calculate, overlap, liveAllocation, careSlots, localDay, MINUTE, DAY } = require('./time');
const { present } = require('./models');
const { demoEnabled, businessTime, requireDemo, clockView } = require('./demo-clock');
const activeBookings = now => ({
  $or: [{ status: { $in: ['CONFIRMED', 'CHECKED_IN'] } }, { status: 'PENDING_PAYMENT', expires_at: { $gt: now } }],
});
class BookingService {
  constructor({ connection, models, config, clients, clock = () => new Date() }) {
    Object.assign(this, { connection, models, config, clients, clock });
  }
  async replay(scope, key, hash, session) {
    const found = await this.models.Processed.findOne({ scope, key }).session(session || null).lean();
    if (found && found.fingerprint !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This request key was used with a different payload');
    return found?.result;
  }
  async remember(scope, key, hash, result, session) {
    await this.models.Processed.create([{ scope, key, fingerprint: hash, result }], { session });
  }
  async history(data, session) {
    await this.models.History.create([{ ...data, at: this.clock() }], { session });
  }
  async move(booking, status, actor, reason, session, businessAt) {
    const before = booking.status, at = this.clock();
    const timeField = { CONFIRMED: 'confirmed_at', CHECKED_IN: 'checked_in_at', COMPLETED: 'completed_at', CANCELLED: 'cancelled_at', EXPIRED: 'expired_at' }[status];
    const changes = { status, [timeField]: businessAt || at, updated_at: at,
      ...(businessAt ? { [status === 'CHECKED_IN' ? 'checked_in_recorded_at' : 'completed_recorded_at']: at } : {}) };
    await this.models.Booking.updateOne({ _id: booking._id, status: before }, { $set: changes }, { session, timestamps: false });
    await this.history({ booking_id: booking._id, resource_id: booking.resource_id, action: status, from: before, to: status, ...actor, reason,
      ...(businessAt ? { business_at: businessAt, demo_clock_version: booking.demo_clock.version } : {}) }, session);
    Object.assign(booking, changes);
  }
  async expireInside(booking, session, now = this.clock()) {
    if (booking.status !== 'PENDING_PAYMENT' || +booking.expires_at > +now) return false;
    await this.move(booking, 'EXPIRED', { actor_type: 'WORKER', actor_id: 'booking-expiry' }, 'Hold expired after 15 minutes', session);
    await this.models.Allocation.updateOne({ booking_id: booking._id }, { $set: { active: false } }, { session });
    return true;
  }
  async withBooking(bookingId, ownerId, operation) {
    const filter = { _id: bookingId, ...(ownerId ? { owner_id: ownerId } : {}) };
    const before = await this.models.Booking.findOne(filter).lean();
    if (!before) fail(404, 'NOT_FOUND', 'Booking not found');
    return transaction(this.connection, async session => {
      await lock(this.models, session, before.pet_id, [before.resource_id]);
      const booking = await this.models.Booking.findOne(filter).session(session).lean();
      if (!booking) fail(404, 'NOT_FOUND', 'Booking not found');
      return operation(booking, session);
    });
  }
  async expire(bookingId) {
    return this.withBooking(bookingId, null, (booking, session) => this.expireInside(booking, session));
  }
  async get(bookingId, ownerId) {
    let booking = await this.models.Booking.findOne({ _id: bookingId, ...(ownerId ? { owner_id: ownerId } : {}) }).lean();
    if (!booking) fail(404, 'NOT_FOUND', 'Booking not found');
    if (booking.status === 'PENDING_PAYMENT' && +booking.expires_at <= +this.clock()) {
      await this.expire(booking._id);
      booking = await this.models.Booking.findById(booking._id).lean();
    }
    return booking;
  }
  staffView(booking) {
    const demoClock = clockView(booking, this.config, this.clock());
    return { booking: present(booking), ...(demoClock ? { demo_clock: demoClock } : {}) };
  }
  async advanceDemo(bookingId, actor, key, body) {
    if (actor?.role !== 'STAFF') fail(403, 'FORBIDDEN', 'STAFF required');
    requireDemo(this.config);
    object(body, ['command']);
    if (!['TO_APPOINTMENT', 'TO_HANDOVER'].includes(body.command)) invalid('Invalid demo clock command');
    const actorId = id(actor.id, 'actor_id'), scope = `DEMO:${actorId}`;
    const hash = fingerprint({ booking_id: bookingId, command: body.command });
    return this.withBooking(bookingId, null, async (booking, session) => {
      // The same pet/resource guards serialize this clock with Care transitions.
      const previous = await this.replay(scope, key, hash, session);
      if (previous) return this.staffView(booking);
      if (body.command === 'TO_APPOINTMENT') {
        if (booking.status !== 'CONFIRMED' || !booking.accepted_payment_id)
          fail(409, 'INVALID_BOOKING_STATE', 'Demo reception requires a confirmed booking with an accepted payment');
      } else if (!booking.demo_clock?.is_demo || booking.status !== 'CHECKED_IN') {
        fail(409, 'INVALID_BOOKING_STATE', 'Demo handover requires a demo booking that is checked in');
      }
      const now = this.clock(), old = booking.demo_clock;
      if (!old || (body.command === 'TO_HANDOVER' && old.stage !== 'TO_HANDOVER')) {
        const target = body.command === 'TO_APPOINTMENT' ? booking.start_at : booking.end_at;
        const demoClock = { is_demo: true, real_anchor_at: now,
          business_anchor_at: new Date(Math.max(+businessTime(booking, now), +target)),
          activated_by: old?.activated_by || actorId, activated_at: old?.activated_at || now,
          version: (old?.version || 0) + 1, stage: body.command, updated_by: actorId, recorded_at: now };
        await this.models.Booking.updateOne({ _id: booking._id }, { $set: { demo_clock: demoClock, updated_at: now } }, { session, timestamps: false });
        booking.demo_clock = demoClock; booking.updated_at = now;
        await this.history({ booking_id: booking._id, resource_id: booking.resource_id, action: body.command,
          actor_type: 'STAFF', actor_id: actorId, reason: 'Advanced booking demo clock',
          business_at: demoClock.business_anchor_at, demo_clock_version: demoClock.version }, session);
      }
      // Repeated commands with another key also keep the existing anchors intact.
      await this.remember(scope, key, hash, { booking_id: String(booking._id), command: body.command }, session);
      return this.staffView(booking);
    });
  }
  async careTime(bookingId) {
    const booking = await this.get(bookingId);
    if (booking.demo_clock?.is_demo) requireDemo(this.config);
    const now = this.clock();
    return { booking_id: String(booking._id), booking_status: booking.status, real_now: now,
      business_now: businessTime(booking, now), ...(booking.demo_clock?.is_demo ? {
        demo_clock: { is_demo: true, version: booking.demo_clock.version }
      } : {}) };
  }
  async bookingContext(input, ownerId, correlationId) {
    const pet = await this.clients.pet(input.pet_id, ownerId, correlationId);
    const catalog = validQuote(await this.clients.catalog(input.service_id, pet, correlationId), input.service_id);
    if (!catalog.allowed_species.includes(pet.species) || pet.weight_kg < catalog.min_weight_kg || pet.weight_kg > catalog.max_weight_kg) invalid('The service does not support this pet');
    const resources = await this.models.Resource.find({ group: catalog.type, species: pet.species, max_weight_kg: { $gte: pet.weight_kg } }).sort({ _id: 1 }).lean();
    return { pet, catalog, resources };
  }
  async prepare(input, ownerId, correlationId) {
    const context = await this.bookingContext(input, ownerId, correlationId);
    return { ...context, quote: calculate(input, context.catalog, this.config, this.clock()) };
  }
  async petBookingStatuses(ownerId, petIds) {
    const rows = await this.models.Booking.find({
      owner_id: ownerId, pet_id: { $in: petIds }, ...activeBookings(this.clock()),
    }).select('pet_id status -_id').lean();
    const priority = { PENDING_PAYMENT: 1, CONFIRMED: 2, CHECKED_IN: 3 };
    const statuses = {};
    for (const { pet_id, status } of rows) {
      if (priority[status] > (priority[statuses[pet_id]] ?? 0)) statuses[pet_id] = status;
    }
    return statuses;
  }
  async dailyAvailability(date, input, ownerId, correlationId) {
    const now = this.clock();
    if (date < localDay(now) || date > localDay(new Date(+now + 366 * DAY))) invalid('Invalid care date');
    const { pet, catalog, resources } = await this.bookingContext(input, ownerId, correlationId);
    if (catalog.type !== 'CARE' || catalog.duration_minutes !== 60) invalid('A 60-minute care service is required');
    const slots = careSlots(date);
    const window = overlap(slots[0].start_at, slots.at(-1).end_at);
    const [blocks, petBookings] = await Promise.all([
      this.models.Allocation.find({ resource_id: { $in: resources.map(row => row._id) }, ...liveAllocation(now), ...window }).select('resource_id start_at end_at').lean(),
      this.models.Booking.find({ pet_id: pet.id, ...activeBookings(now), ...window }).select('start_at end_at').lean(),
    ]);
    return { date, slots: slots.map(slot => {
      const overlaps = row => row.start_at < slot.end_at && row.end_at > slot.start_at;
      const blocked = new Set(blocks.filter(overlaps).map(row => String(row.resource_id)));
      const remaining = resources.length - blocked.size;
      const status = +slot.start_at <= +now || +slot.start_at > +now + 366 * DAY ? 'OUTSIDE_BOOKING_WINDOW' :
        petBookings.some(overlaps) ? 'PET_BUSY' : remaining ? 'AVAILABLE' : 'FULL';
      return { ...slot, status, available: status === 'AVAILABLE' ? remaining : 0 };
    }), holds_resource: false };
  }
  quoteView(prepared) {
    return { service: prepared.catalog, ...prepared.quote, ...(prepared.catalog.price_rule_id ? { pet_version: prepared.pet.version } : {}),
      catalog_mode: this.config.catalogMode, facility_timezone: 'Asia/Ho_Chi_Minh', holds_resource: false };
  }
  async availability(prepared) {
    const now = this.clock(), { quote, resources, pet, catalog } = prepared;
    if (catalog.type === 'CARE' && await this.models.Booking.exists({ pet_id: pet.id, ...overlap(quote.start_at, quote.end_at), ...activeBookings(now) }))
      return { available: [], holds_resource: false };
    const blocked = await this.models.Allocation.find({ resource_id: { $in: resources.map(r => r._id) }, ...liveAllocation(now), ...overlap(quote.allocation_start_at, quote.allocation_end_at) }).select('resource_id').lean();
    const blockedIds = new Set(blocked.map(a => String(a.resource_id)));
    // Only counts and resource codes: no allocations, customer IDs or pet details.
    return { available: resources.filter(r => !blockedIds.has(String(r._id))).map(r => ({ id: String(r._id), code: r.code, group: r.group })), holds_resource: false };
  }
  async create(input, ownerId, key, correlationId) {
    const scope = `CREATE:${ownerId}`, hash = fingerprint(input);
    const replay = await this.replay(scope, key, hash);
    if (replay) return { booking: present(await this.get(replay.booking_id, ownerId)), replayed: true };
    // All HTTP is completed BEFORE the transaction; callback retries reuse this quote.
    const prepared = await this.prepare(input, ownerId, correlationId);
    const { pet, catalog, quote, resources } = prepared;
    if (input.expected_price_version !== catalog.price_version_id || (catalog.price_rule_id && input.expected_pet_version !== pet.version))
      fail(409, 'PRICE_CHANGED', 'The price or pet profile changed; confirm the new quote', { quote: this.quoteView(prepared) });
    if (!resources.length) fail(409, 'SLOT_UNAVAILABLE', 'No compatible resource');
    return transaction(this.connection, async session => {
      await lock(this.models, session, pet.id, resources.map(r => r._id));
      const existing = await this.replay(scope, key, hash, session);
      if (existing) return { booking: present(await this.models.Booking.findById(existing.booking_id).session(session).lean()), replayed: true };
      const now = this.clock();
      if (+quote.start_at <= +now) invalid('The booking must start in the future');
      const petBusy = await this.models.Booking.exists({ pet_id: pet.id, ...overlap(quote.start_at, quote.end_at), ...activeBookings(now) }).session(session);
      if (petBusy) fail(409, 'PET_TIME_CONFLICT', 'This pet already has an overlapping booking');
      let selected;
      for (const resource of resources) {
        if (!await this.models.Allocation.exists({ resource_id: resource._id, ...liveAllocation(now), ...overlap(quote.allocation_start_at, quote.allocation_end_at) }).session(session)) { selected = resource; break; }
      }
      if (!selected) fail(409, 'SLOT_UNAVAILABLE', 'All compatible resources are allocated');
      const expires = new Date(+now + 15 * MINUTE);
      const [booking] = await this.models.Booking.create([{ ...quote, owner_id: ownerId, pet_id: pet.id, pet_version: pet.version,
        pet_snapshot: pet, service_id: catalog.service_id, service_snapshot: catalog,
        resource_id: selected._id, expires_at: expires, status: 'PENDING_PAYMENT', created_at: now, updated_at: now }], { session, timestamps: false });
      await this.models.Allocation.create([{ booking_id: booking._id, pet_id: pet.id, resource_id: selected._id, type: 'BOOKING',
        start_at: quote.allocation_start_at, end_at: quote.allocation_end_at, active: true, hold_until: expires }], { session });
      await this.history({ booking_id: booking._id, resource_id: selected._id, action: 'CREATED', to: 'PENDING_PAYMENT', actor_id: ownerId, actor_type: 'USER', reason: 'Customer created booking' }, session);
      await this.remember(scope, key, hash, { booking_id: String(booking._id) }, session);
      return { booking: present(booking), replayed: false };
    });
  }
  async cancel(bookingId, ownerId, key, body) {
    object(body, ['reason']); const reason = text(body.reason, 'reason', 500);
    const scope = `CANCEL:${ownerId}`, hash = fingerprint({ booking_id: bookingId, reason });
    const previous = await this.replay(scope, key, hash);
    if (previous) return previous;
    return this.withBooking(bookingId, ownerId, async (booking, session) => {
      const old = await this.replay(scope, key, hash, session); if (old) return old;
      const now = this.clock(); await this.expireInside(booking, session, now);
      let result;
      if (booking.status === 'EXPIRED') result = { status: 409, code: 'BOOKING_EXPIRED', message: 'The hold expired; create a new booking' };
      else if (booking.status === 'CANCELLED') result = { status: 200, data: { booking: present(booking) } };
      else if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status) || (booking.status === 'CONFIRMED' && +booking.start_at - +now < DAY)) result = { status: 409, code: 'INVALID_BOOKING_STATE', message: 'Cancellation requires an unpaid hold or a confirmed booking at least 24 hours before start' };
      else {
        const paid = booking.status === 'CONFIRMED';
        await this.move(booking, 'CANCELLED', { actor_id: ownerId, actor_type: 'USER' }, reason, session);
        await this.models.Allocation.updateOne({ booking_id: booking._id }, { $set: { active: false } }, { session });
        if (paid) await this.models.Outbox.create([{ event_id: randomUUID(), type: 'REFUND_REQUESTED',
          payload: { booking_id: String(booking._id), payment_id: booking.accepted_payment_id, amount: booking.total_amount, currency: booking.currency, reason },
          status: 'PENDING', next_attempt_at: now, lease_until: null }], { session });
        result = { status: 200, data: { booking: present(booking), refund_request: paid ? 'PENDING_DELIVERY' : null } };
      }
      await this.remember(scope, key, hash, result, session); return result;
    });
  }
  async paymentContext(bookingId) {
    const booking = await this.get(bookingId);
    if (booking.status === 'EXPIRED') fail(409, 'BOOKING_EXPIRED', 'The hold expired');
    if (booking.status !== 'PENDING_PAYMENT') fail(409, 'INVALID_BOOKING_STATE', 'Only a live unpaid booking can start a payment');
    return { booking_id: String(booking._id), owner_id: booking.owner_id, amount: booking.total_amount, currency: booking.currency,
      price_version_id: booking.price_version_id, expires_at: booking.expires_at, status: booking.status };
  }
  async payment(body) {
    object(body, ['event_id', 'booking_id', 'payment_id', 'amount', 'currency', 'result']);
    const payload = { event_id: requestKey(body.event_id, 'event_id'), booking_id: id(body.booking_id, 'booking_id'),
      payment_id: requestKey(body.payment_id, 'payment_id'), amount: body.amount, currency: text(body.currency, 'currency', 10), result: body.result };
    if (!Number.isSafeInteger(payload.amount) || payload.amount <= 0 || !['SUCCEEDED', 'FAILED', 'PENDING'].includes(payload.result)) invalid('Invalid payment amount or result');
    const hash = fingerprint(payload), scope = 'PAYMENT';
    const old = await this.replay(scope, payload.event_id, hash); if (old) return old;
    const exists = await this.models.Booking.exists({ _id: payload.booking_id });
    if (!exists) {
      return transaction(this.connection, async session => {
        const replay = await this.replay(scope, payload.event_id, hash, session); if (replay) return replay;
        const result = { accepted: false, outcome: 'BOOKING_NOT_FOUND', retryable: false };
        await this.remember(scope, payload.event_id, hash, result, session); return result;
      });
    }
    return this.withBooking(payload.booking_id, null, async (booking, session) => {
      const replay = await this.replay(scope, payload.event_id, hash, session); if (replay) return replay;
      await this.expireInside(booking, session);
      let outcome, accepted = false;
      const claim = await this.models.PaymentClaim.findById(payload.payment_id).session(session).lean();
      if (claim && String(claim.booking_id) !== String(booking._id)) outcome = 'PAYMENT_ALREADY_USED';
      else if (payload.amount !== booking.total_amount || payload.currency !== booking.currency) outcome = 'AMOUNT_OR_CURRENCY_MISMATCH';
      else if (payload.result !== 'SUCCEEDED') outcome = booking.accepted_payment_id ? 'SUCCESS_PRESERVED' : `PAYMENT_${payload.result}`;
      else if (booking.accepted_payment_id) {
        accepted = booking.accepted_payment_id === payload.payment_id;
        outcome = accepted ? 'ALREADY_ACCEPTED' : 'ANOTHER_PAYMENT_ACCEPTED';
      } else if (booking.status !== 'PENDING_PAYMENT') outcome = `BOOKING_${booking.status}`;
      else {
        if (!claim) await this.models.PaymentClaim.create([{ _id: payload.payment_id, booking_id: booking._id }], { session });
        await this.models.Booking.updateOne({ _id: booking._id }, { $set: { accepted_payment_id: payload.payment_id } }, { session });
        booking.accepted_payment_id = payload.payment_id;
        await this.move(booking, 'CONFIRMED', { actor_type: 'PAYMENT', actor_id: 'payment' }, 'Verified full payment accepted within the hold', session);
        await this.models.Allocation.updateOne({ booking_id: booking._id }, { $set: { hold_until: null } }, { session });
        accepted = true; outcome = 'CONFIRMED';
      }
      const result = { accepted, outcome, retryable: false, booking_id: String(booking._id), booking_status: booking.status };
      await this.remember(scope, payload.event_id, hash, result, session); return result;
    });
  }
  async care(operation, body) {
    object(body, ['request_id', 'booking_id', 'actor_id', 'reason']);
    const payload = { operation, request_id: requestKey(body.request_id, 'request_id'), booking_id: id(body.booking_id, 'booking_id'),
      actor_id: id(body.actor_id, 'actor_id'), reason: text(body.reason, 'reason', 500) };
    const hash = fingerprint(payload), scope = 'CARE';
    const old = await this.replay(scope, payload.request_id, hash); if (old) return old;
    if (!await this.models.Booking.exists({ _id: payload.booking_id })) {
      return transaction(this.connection, async session => {
        const replay = await this.replay(scope, payload.request_id, hash, session); if (replay) return replay;
        const result = { status: 404, code: 'NOT_FOUND', message: 'Booking not found' };
        await this.remember(scope, payload.request_id, hash, result, session); return result;
      });
    }
    return this.withBooking(payload.booking_id, null, async (booking, session) => {
      const replay = await this.replay(scope, payload.request_id, hash, session); if (replay) return replay;
      const now = this.clock(); await this.expireInside(booking, session, now);
      const resource = await this.models.Resource.findById(booking.resource_id).session(session).lean();
      const serviceNow = businessTime(booking, now);
      const businessAt = booking.demo_clock?.is_demo ? serviceNow : undefined;
      let result;
      const reject = (code, message) => ({ status: 409, code, message });
      if (booking.demo_clock?.is_demo && !demoEnabled(this.config)) result = reject('DEMO_DISABLED', 'Re-enable demo outside production to continue this demo visit');
      else if (operation === 'check-in') {
        const maintenance = await this.models.Maintenance.exists({ resource_id: resource._id, status: 'ACTIVE', start_at: { $lte: now }, end_at: { $gt: now } }).session(session);
        const petInCare = await this.models.Booking.exists({ pet_id: booking.pet_id, status: 'CHECKED_IN', _id: { $ne: booking._id } }).session(session);
        const actualStart = new Date(Math.min(+serviceNow, +booking.allocation_start_at));
        const earlyConflict = await this.models.Allocation.exists({ resource_id: resource._id, booking_id: { $ne: booking._id }, ...liveAllocation(now), ...overlap(actualStart, booking.allocation_end_at) }).session(session);
        const petEarlyConflict = await this.models.Booking.exists({ pet_id: booking.pet_id, _id: { $ne: booking._id }, ...overlap(new Date(Math.min(+serviceNow, +booking.start_at)), booking.end_at),
          $or: [{ status: { $in: ['CONFIRMED', 'CHECKED_IN'] } }, { status: 'PENDING_PAYMENT', expires_at: { $gt: now } }] }).session(session);
        if (booking.status !== 'CONFIRMED') result = reject('INVALID_BOOKING_STATE', 'Check-in requires CONFIRMED');
        else if (+serviceNow < +booking.start_at - this.config.checkInEarlyMinutes * MINUTE || +serviceNow > +booking.start_at + this.config.checkInLateMinutes * MINUTE || +serviceNow >= +booking.end_at) result = reject('INVALID_BOOKING_STATE', 'Outside the configured check-in window');
        else if (resource.state !== 'READY' || resource.occupied_booking_id || maintenance || petInCare || earlyConflict || petEarlyConflict) result = reject('SLOT_UNAVAILABLE', 'The resource or pet is not ready for check-in (including preparation/cleaning allocations)');
        else {
          await this.models.Allocation.updateOne({ booking_id: booking._id }, { $set: { start_at: actualStart } }, { session });
          await this.move(booking, 'CHECKED_IN', { actor_type: 'CARE', actor_id: payload.actor_id }, payload.reason, session, businessAt);
          await this.models.Resource.updateOne({ _id: resource._id }, { $set: { state: 'OCCUPIED', occupied_booking_id: booking._id, updated_at: now } }, { session, timestamps: false });
          resource.state = 'OCCUPIED'; resource.occupied_booking_id = booking._id; resource.updated_at = now;
          result = { status: 200, data: { booking: present(booking), resource: present(resource) } };
        }
      } else {
        if (booking.status !== 'CHECKED_IN' || String(resource.occupied_booking_id) !== String(booking._id) || resource.state !== 'OCCUPIED') result = reject('INVALID_BOOKING_STATE', 'Check-out requires this booking to occupy the resource');
        else {
          const bufferEnd = new Date(Math.max(+booking.end_at, +serviceNow) + booking.cleaning_minutes * MINUTE);
          const conflict = await this.models.Allocation.exists({ resource_id: resource._id, booking_id: { $ne: booking._id }, ...liveAllocation(now), ...overlap(booking.allocation_start_at, bufferEnd) }).session(session);
          if (conflict) result = reject('SLOT_UNAVAILABLE', 'Actual service/cleaning would overlap a future allocation; resolve the conflict before retrying with a new request_id');
          else {
            await this.move(booking, 'COMPLETED', { actor_type: 'CARE', actor_id: payload.actor_id }, payload.reason, session, businessAt);
            await this.models.Allocation.updateOne({ booking_id: booking._id }, { $set: { end_at: bufferEnd, hold_until: null } }, { session });
            await this.models.Resource.updateOne({ _id: resource._id }, { $set: { state: 'CLEANING', occupied_booking_id: null, updated_at: now } }, { session, timestamps: false });
            resource.state = 'CLEANING'; resource.occupied_booking_id = null; resource.updated_at = now;
            result = { status: 200, data: { booking: present(booking), resource: present(resource) } };
          }
        }
      }
      await this.remember(scope, payload.request_id, hash, result, session); return result;
    });
  }
}
module.exports = { BookingService };
