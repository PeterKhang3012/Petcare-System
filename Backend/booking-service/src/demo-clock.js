const { fail } = require('./platform');

const demoEnabled = config => config.demoEnabled === true && config.nodeEnv !== 'production' && process.env.NODE_ENV !== 'production';

function businessTime(booking, realNow) {
  const clock = booking.demo_clock;
  if (!clock?.is_demo) return realNow;
  return new Date(+new Date(clock.business_anchor_at) + Math.max(0, +realNow - +new Date(clock.real_anchor_at)));
}

function requireDemo(config) {
  if (!demoEnabled(config)) fail(409, 'DEMO_DISABLED', 'Demo operations require PAWSTAY_DEMO_ENABLED=true outside production');
}

function clockView(booking, config, realNow) {
  if (!demoEnabled(config) && !booking.demo_clock?.is_demo) return undefined;
  return {
    enabled: demoEnabled(config), is_demo: booking.demo_clock?.is_demo === true,
    real_now: realNow, business_now: businessTime(booking, realNow),
    version: booking.demo_clock?.version || 0, stage: booking.demo_clock?.stage,
  };
}

module.exports = { demoEnabled, businessTime, requireDemo, clockView };
