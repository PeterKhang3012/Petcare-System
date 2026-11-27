const { object, text, id, invalid, dateOnly, timestamp, integer } = require('./platform');
const MINUTE = 60000, DAY = 86400000;
const CARE_HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17];
const localDay = date => new Date(+date + 7 * 3600000).toISOString().slice(0, 10);
const localTime = date => new Date(+date + 7 * 3600000).toISOString().slice(11, 16);
const careSlots = day => CARE_HOURS.map(hour => {
  const start_at = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`);
  return { start_at, end_at: new Date(+start_at + 60 * MINUTE) };
});
function bookingInput(body, creating = false) {
  object(body, ['pet_id', 'service_id', 'start_at', 'check_in_date', 'check_out_date', 'check_in_time', 'check_out_time', ...(creating ? ['expected_price_version', 'expected_pet_version'] : [])]);
  const result = { pet_id: id(body.pet_id, 'pet_id'), service_id: text(body.service_id, 'service_id') };
  if (!/^[A-Za-z0-9._:-]+$/.test(result.service_id)) invalid('Invalid service_id');
  if (body.start_at !== undefined) {
    if (body.check_in_date !== undefined || body.check_out_date !== undefined || body.check_in_time !== undefined || body.check_out_time !== undefined) invalid('Choose a care time OR boarding dates');
    result.start_at = timestamp(body.start_at, 'start_at').toISOString();
  } else {
    result.check_in_date = dateOnly(body.check_in_date, 'check_in_date');
    result.check_out_date = dateOnly(body.check_out_date, 'check_out_date');
    if (body.check_in_time !== undefined || body.check_out_time !== undefined) {
      const time = /^(?:(?:0[89]|1[0-7]):[0-5][0-9]|18:00)$/;
      if (typeof body.check_in_time !== 'string' || typeof body.check_out_time !== 'string'
        || !time.test(body.check_in_time) || !time.test(body.check_out_time)) invalid('Choose check-in and check-out times between 08:00 and 18:00');
      result.check_in_time = body.check_in_time;
      result.check_out_time = body.check_out_time;
    }
  }
  if (creating) result.expected_price_version = text(body.expected_price_version, 'expected_price_version');
  if (creating && body.expected_pet_version !== undefined)
    result.expected_pet_version = integer(body.expected_pet_version, 'expected_pet_version');
  return result;
}
function calculate(input, catalog, config, now) {
  let start, end, quantity, nights;
  const care = catalog.type === 'CARE';
  if (care) {
    if (!input.start_at) invalid('A care service requires start_at');
    start = new Date(input.start_at);
    const slot = Number.isFinite(+start) && careSlots(localDay(start)).find(item => +item.start_at === +start);
    if (!slot || catalog.duration_minutes !== 60) invalid('Choose a scheduled 60-minute care slot');
    end = slot.end_at; quantity = 1;
  } else {
    if (input.start_at) invalid('Boarding requires check_in_date and check_out_date');
    nights = (+new Date(input.check_out_date) - +new Date(input.check_in_date)) / DAY;
    const daily = catalog.unit === 'DAY';
    integer(nights, 'nights', 1, daily ? 14 : 365);
    if (daily && (!input.check_in_time || !input.check_out_time)) invalid('Choose check-in and check-out times');
    if (!daily && (input.check_in_time || input.check_out_time)) invalid('This Stay service uses fixed check-in and check-out times');
    start = new Date(`${input.check_in_date}T${input.check_in_time ?? config.hours.boardingIn}:00+07:00`);
    end = new Date(`${input.check_out_date}T${input.check_out_time ?? config.hours.boardingOut}:00+07:00`);
    quantity = daily
      ? nights - 1 + (input.check_in_time < '14:00' ? 1 : 0.5) + (input.check_out_time < '14:00' ? 0.5 : 1)
      : nights;
  }
  if (+start <= +now) invalid('The booking must start in the future');
  if (+start > +now + 366 * DAY) invalid('Bookings can be made at most 366 days ahead');
  const total = catalog.unit_price * quantity;
  integer(total, 'total_amount');
  const preparation = care ? 0 : config.preparationMinutes, cleaning = care ? 0 : catalog.unit === 'DAY' ? 60 : config.cleaningMinutes;
  return { start_at: start, end_at: end, allocation_start_at: new Date(+start - preparation * MINUTE),
    allocation_end_at: new Date(+end + cleaning * MINUTE), quantity, ...(nights ? { nights } : {}),
    duration_minutes: (+end - +start) / MINUTE, preparation_minutes: preparation, cleaning_minutes: cleaning,
    unit_price: catalog.unit_price, total_amount: total, currency: 'VND', price_version_id: catalog.price_version_id };
}
const overlap = (start, end) => ({ start_at: { $lt: end }, end_at: { $gt: start } });
const liveAllocation = now => ({ active: true, $or: [{ hold_until: null }, { hold_until: { $gt: now } }] });
module.exports = { MINUTE, DAY, localDay, localTime, careSlots, bookingInput, calculate, overlap, liveAllocation };
