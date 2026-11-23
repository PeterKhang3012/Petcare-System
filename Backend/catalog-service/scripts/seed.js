require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { databaseConfig, connect, initialize, replicaReady, transaction } = require('../src/platform');
const { models } = require('../src/catalog');
// Catalog owns this seed. Runtime never imports Booking's fixture or database.
const initial = [
  { service_id: 'bath', name: 'Bath', type: 'CARE', unit: 'SERVICE', duration_minutes: 60, unit_price: 150000 },
  { service_id: 'boarding', name: 'Overnight boarding', type: 'BOARDING', unit: 'NIGHT', duration_minutes: null, unit_price: 200000 }
];
async function seed(connection, data = models(connection)) {
  for (const item of initial) await transaction(connection, async session => {
    if (await data.Service.exists({ _id: item.service_id }).session(session)) return;
    const { service_id, unit_price, ...details } = item, priceId = `${service_id}-v1`;
    await data.Price.create([{ _id: priceId, service_id, unit_price, currency: 'VND', actor_id: 'catalog-seed', reason: 'Initial catalog price', created_at: new Date() }], { session });
    await data.Service.create([{ _id: service_id, ...details, allowed_species: ['DOG', 'CAT'], min_weight_kg: 0, max_weight_kg: 40, active: true, current_price_version_id: priceId }], { session });
  });
}
async function main() {
  const connection = await connect(databaseConfig('catalog'));
  try { if (!await replicaReady(connection)) throw new Error('Replica set required'); const data = models(connection); await initialize(data); await seed(connection, data); console.log('Catalog seeded; existing prices and history preserved.'); }
  finally { await connection.close(); }
}
if (require.main === module) main().catch(() => { console.error('Catalog seed failed; check database configuration.'); process.exitCode = 1; });
module.exports = { seed };
