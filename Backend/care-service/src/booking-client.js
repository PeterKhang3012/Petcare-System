const { requestJson, fail } = require('./platform');
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const demoMarker = clock => {
  if (!clock) return undefined;
  if (clock.is_demo !== true || !Number.isSafeInteger(clock.version) || clock.version < 1) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking demo context');
  return { is_demo: true, version: clock.version };
};
function bookingClient(config) {
  const call = async (path, options = {}) => {
    try { return await requestJson(config.bookingBaseUrl + path, { ...options, timeoutMs: config.timeoutMs }); }
    catch { fail(503, 'DEPENDENCY_UNAVAILABLE', 'Booking is unavailable'); }
  };
  return {
    async context(bookingId, bearer, correlationId) {
      const response = await call('/api/staff/bookings/' + bookingId, { headers: { Authorization: `Bearer ${bearer}`, 'X-Correlation-ID': correlationId } });
      if ([401, 403, 404].includes(response.status)) fail(response.status, response.status === 404 ? 'NOT_FOUND' : response.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', 'Booking rejected the context request');
      const b = response.body?.data?.booking;
      if (response.status !== 200 || response.body?.success !== true || !b || b.id !== bookingId || !/^[a-f\d]{24}$/.test(b.owner_id || '') || !/^[a-f\d]{24}$/.test(b.pet_id || '') ||
        !b.pet_snapshot || typeof b.pet_snapshot.name !== 'string' || !['DOG', 'CAT'].includes(b.pet_snapshot.species) ||
        !b.service_snapshot || !['CARE', 'BOARDING'].includes(b.service_snapshot.type) || !['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(b.status)) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking context');
      demoMarker(b.demo_clock);
      return b;
    },
    async time(bookingId) {
      const response = await call('/internal/bookings/' + bookingId + '/care-time', { headers: { 'X-Service-Token': config.token } });
      if (response.status === 409 && response.body?.code === 'DEMO_DISABLED') fail(409, 'DEMO_DISABLED', 'Re-enable demo outside production to continue this demo visit');
      const data = response.body?.data;
      if (response.status !== 200 || response.body?.success !== true || data?.booking_id !== bookingId ||
        !['CHECKED_IN', 'COMPLETED'].includes(data.booking_status) || !validTime(data.real_now) || !validTime(data.business_now))
        fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking service time');
      return { ...data, demo_clock: demoMarker(data.demo_clock) };
    },
    async execute(payload, action) {
      const headers = { 'X-Service-Token': config.token, 'X-Correlation-ID': payload.request_id };
      const lookup = await call('/internal/care/requests/' + encodeURIComponent(payload.request_id), { headers });
      if (lookup.status >= 500 || (lookup.status === 200 && (lookup.body?.success !== true || lookup.body.data?.request_id !== payload.request_id || !Number.isInteger(lookup.body.data?.result?.status)))) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking receipt');
      if (![200, 404].includes(lookup.status)) return rejection(lookup);
      // Lookup does not expose its fingerprint. Replay the original payload even if a receipt
      // exists, so Booking also verifies that this request_id belongs to the same operation.
      const response = await call('/internal/bookings/' + (action === 'CHECK_IN' ? 'check-in' : 'check-out'), { method: 'POST', body: payload, headers });
      if (response.status >= 500) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Booking is unavailable');
      if (response.status !== 200) return rejection(response);
      const b = response.body?.data?.booking, resource = response.body?.data?.resource;
      const expected = action === 'CHECK_IN' ? 'CHECKED_IN' : 'COMPLETED';
      if (response.body?.success !== true || b?.id !== payload.booking_id || b.status !== expected || resource?.state !== (action === 'CHECK_IN' ? 'OCCUPIED' : 'CLEANING')) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking transition result');
      const demo = demoMarker(b.demo_clock);
      if (demo && (!validTime(b[action === 'CHECK_IN' ? 'checked_in_at' : 'completed_at']) ||
        !validTime(b[action === 'CHECK_IN' ? 'checked_in_recorded_at' : 'completed_recorded_at'])))
        fail(503, 'DEPENDENCY_UNAVAILABLE', 'Invalid Booking service timestamps');
      return { status: 200, booking_id: b.id, booking_status: b.status, resource_state: resource.state,
        ...(demo ? { demo_clock: demo, checked_in_at: b.checked_in_at, completed_at: b.completed_at,
          checked_in_recorded_at: b.checked_in_recorded_at, completed_recorded_at: b.completed_recorded_at } : {}) };
    }
  };
}
const safeRejections = new Set([
  'Outside the configured check-in window',
  'Check-in requires CONFIRMED',
  'Check-in requires CONFIRMED with an accepted payment',
  'Check-out requires this booking to occupy the resource',
  'The resource or pet is not ready for check-in (including preparation/cleaning allocations)',
  'Actual service/cleaning would overlap a future allocation; resolve the conflict before retrying with a new request_id',
  'Re-enable demo outside production to continue this demo visit',
]);
function rejection(response) {
  if (![400, 401, 403, 404, 409, 422].includes(response.status) || response.body?.success !== false) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Unexpected Booking response');
  const code = typeof response.body.code === 'string' && /^[A-Z_]{1,80}$/.test(response.body.code) ? response.body.code : 'BOOKING_REJECTED';
  const message = safeRejections.has(response.body.message) ? response.body.message :
    'Booking rejected this operation; inspect its status and retry with a new request_id after resolving the cause';
  return { status: response.status, code, message };
}
module.exports = { bookingClient };
