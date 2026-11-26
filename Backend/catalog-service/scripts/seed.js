require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { databaseConfig, connect, initialize, replicaReady, transaction } = require('../src/platform');
const { models } = require('../src/catalog');
// Catalog owns this seed. Runtime never imports Booking's fixture or database.
const initial = [
  { service_id: 'bath', name: 'Bath', type: 'CARE', unit: 'SERVICE', duration_minutes: 60, unit_price: 150000 },
  { service_id: 'boarding', name: 'Overnight boarding', type: 'BOARDING', unit: 'NIGHT', duration_minutes: null, unit_price: 200000 }
];
const bathRules = [
  ...[
    [0, 5, 100000, 150000],
    [5, 10, 150000, 250000],
    [10, 20, 250000, 350000],
    [20, 40, 350000, 500000],
  ].flatMap(([min, max, short, long]) => [
    { price_rule_id: `dog-${min}-short`, species: 'DOG', coat_type: 'SHORT', min_weight_kg: min, max_weight_kg: max, max_inclusive: max === 40, unit_price: short },
    { price_rule_id: `dog-${min}-long`, species: 'DOG', coat_type: 'LONG', min_weight_kg: min, max_weight_kg: max, max_inclusive: max === 40, unit_price: long },
  ]),
  { price_rule_id: 'cat-0', species: 'CAT', min_weight_kg: 0, max_weight_kg: 5, unit_price: 200000 },
  { price_rule_id: 'cat-5', species: 'CAT', min_weight_kg: 5, max_weight_kg: 10, max_inclusive: true, unit_price: 300000 },
];
async function seed(connection, data = models(connection)) {
  for (const item of initial) await transaction(connection, async session => {
    const { service_id, unit_price, ...details } = item;
    const grouped = service_id === 'bath';
    const existing = await data.Service.findById(service_id).session(session).lean();
    if (existing && !grouped) return;
    const current = existing && await data.Price.findById(existing.current_price_version_id).session(session).lean();
    if (current?.price_rules?.length) return;
    const priceId = grouped ? 'bath-groups-v1' : `${service_id}-v1`;
    await data.Price.create([{ _id: priceId, service_id, unit_price: grouped ? bathRules[0].unit_price : unit_price,
      price_rules: grouped ? bathRules : undefined, previous_price_version_id: current?._id, currency: 'VND',
      actor_id: 'catalog-seed', reason: grouped ? 'Initial bath price groups' : 'Initial catalog price', created_at: new Date() }], { session });
    if (existing) {
      await data.Service.updateOne({ _id: service_id }, { $set: { current_price_version_id: priceId } }, { session });
    } else {
      await data.Service.create([{ _id: service_id, ...details, allowed_species: ['DOG', 'CAT'], min_weight_kg: 0, max_weight_kg: 40, active: true, current_price_version_id: priceId }], { session });
    }
  });
}
async function main() {
  const connection = await connect(databaseConfig('catalog'));
  try { if (!await replicaReady(connection)) throw new Error('Replica set required'); const data = models(connection); await initialize(data); await seed(connection, data); console.log('Catalog seeded; existing prices and history preserved.'); }
  finally { await connection.close(); }
}
if (require.main === module) main().catch(() => { console.error('Catalog seed failed; check database configuration.'); process.exitCode = 1; });
module.exports = { seed };
