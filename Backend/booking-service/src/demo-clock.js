const { fail } = require('./platform');
const { MINUTE } = require('./time');

const demoEnabled = config => config.demoEnabled === true && config.nodeEnv !== 'production' && process.env.NODE_ENV !== 'production';

function businessTime(booking, realNow) {
  const clock = booking.demo_clock;
  if (!clock?.is_demo) return realNow;
  return new Date(+new Date(clock.business_anchor_at) + Math.max(0, +realNow - +new Date(clock.real_anchor_at)));
}

function requireDemo(config) {
  if (!demoEnabled(config)) fail(409, 'DEMO_DISABLED', 'Demo operations require PAWSTAY_DEMO_ENABLED=true outside production');
}

function receptionWindow(booking, config) {
  return {
    min_time: new Date(+new Date(booking.start_at) - config.checkInEarlyMinutes * MINUTE),
    max_time: new Date(Math.min(+new Date(booking.start_at) + config.checkInLateMinutes * MINUTE, +new Date(booking.end_at) - 1)),
  };
}

function clockView(booking, config, realNow) {
  const range = booking.status === 'CONFIRMED' ? receptionWindow(booking, config) :
    booking.status === 'CHECKED_IN' ? { min_time: booking.checked_in_at, max_time: booking.end_at } : {};
  return {
    enabled: demoEnabled(config), is_demo: booking.demo_clock?.is_demo === true,
    real_now: realNow, business_now: businessTime(booking, realNow),
    version: booking.demo_clock?.version || 0, stage: booking.demo_clock?.stage,
    ...range,
  };
}

module.exports = { demoEnabled, businessTime, requireDemo, clockView, receptionWindow };
