const { object, text, id, invalid, dateOnly, timestamp, integer } = require('./platform');
const MINUTE = 60000, DAY = 86400000;
const localDay = date => new Date(+date + 7 * 3600000).toISOString().slice(0, 10);
const localTime = date => new Date(+date + 7 * 3600000).toISOString().slice(11, 16);
function bookingInput(body, creating = false) {
  object(body, ['pet_id', 'service_id', 'start_at', 'check_in_date', 'check_out_date', ...(creating ? ['expected_price_version'] : [])]);
  const result = { pet_id: id(body.pet_id, 'pet_id'), service_id: text(body.service_id, 'service_id') };
  if (!/^[A-Za-z0-9._:-]+$/.test(result.service_id)) invalid('Invalid service_id');
  if (body.start_at !== undefined) {
    if (body.check_in_date !== undefined || body.check_out_date !== undefined) invalid('Choose a care time OR boarding dates');
    result.start_at = timestamp(body.start_at, 'start_at').toISOString();
  } else {
    result.check_in_date = dateOnly(body.check_in_date, 'check_in_date');
    result.check_out_date = dateOnly(body.check_out_date, 'check_out_date');
  }
  if (creating) result.expected_price_version = text(body.expected_price_version, 'expected_price_version');
  return result;
}
function calculate(input, catalog, config, now) {
  let start, end, quantity, nights;
  if (catalog.type === 'CARE') {
    if (!input.start_at) invalid('A care service requires start_at');
    start = new Date(input.start_at); end = new Date(+start + catalog.duration_minutes * MINUTE); quantity = 1;
    const opening = new Date(`${localDay(start)}T${config.hours.open}:00+07:00`), closing = new Date(`${localDay(start)}T${config.hours.close}:00+07:00`);
    if (!Number.isFinite(+end) || localDay(start) !== localDay(end) || +start < +opening || +end > +closing) invalid('Care time must fit facility opening hours');
  } else {
    if (input.start_at) invalid('Boarding requires check_in_date and check_out_date');
    nights = (+new Date(input.check_out_date) - +new Date(input.check_in_date)) / DAY;
    integer(nights, 'nights', 1, 365);
    start = new Date(`${input.check_in_date}T${config.hours.boardingIn}:00+07:00`);
    end = new Date(`${input.check_out_date}T${config.hours.boardingOut}:00+07:00`);
    quantity = nights;
  }
  if (+start <= +now) invalid('The booking must start in the future');
  if (+start > +now + 366 * DAY) invalid('Bookings can be made at most 366 days ahead');
  const total = catalog.unit_price * quantity;
  integer(total, 'total_amount');
  return { start_at: start, end_at: end, allocation_start_at: new Date(+start - config.preparationMinutes * MINUTE),
    allocation_end_at: new Date(+end + config.cleaningMinutes * MINUTE), quantity, ...(nights ? { nights } : {}),
    duration_minutes: (+end - +start) / MINUTE, preparation_minutes: config.preparationMinutes, cleaning_minutes: config.cleaningMinutes,
    unit_price: catalog.unit_price, total_amount: total, currency: 'VND', price_version_id: catalog.price_version_id };
}
const overlap = (start, end) => ({ start_at: { $lt: end }, end_at: { $gt: start } });
const liveAllocation = now => ({ active: true, $or: [{ hold_until: null }, { hold_until: { $gt: now } }] });
module.exports = { MINUTE, DAY, localDay, localTime, bookingInput, calculate, overlap, liveAllocation };
