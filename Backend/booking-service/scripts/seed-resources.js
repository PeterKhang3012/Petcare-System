require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { configFor } = require('../src/config');
const { connect } = require('../src/platform');
const { createModels, initialize } = require('../src/models');
const { supportsTransactions } = require('../src/transactions');
const resources = Object.freeze([
  { code: 'CARE-01', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-02', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-03', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-04', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-05', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-06', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-07', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-08', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'STAY-DOG-01', group: 'BOARDING', species: ['DOG'], max_weight_kg: 40 },
  { code: 'STAY-DOG-02', group: 'BOARDING', species: ['DOG'], max_weight_kg: 40 },
  { code: 'STAY-DOG-03', group: 'BOARDING', species: ['DOG'], max_weight_kg: 40 },
  { code: 'STAY-DOG-04', group: 'BOARDING', species: ['DOG'], max_weight_kg: 40 },
  { code: 'STAY-CAT-02', group: 'BOARDING', species: ['CAT'], max_weight_kg: 20 },
  { code: 'STAY-CAT-03', group: 'BOARDING', species: ['CAT'], max_weight_kg: 20 },
  { code: 'STAY-CAT-04', group: 'BOARDING', species: ['CAT'], max_weight_kg: 20 },
  { code: 'STAY-CAT-01', group: 'BOARDING', species: ['CAT'], max_weight_kg: 20 }
]);
async function seed(models) {
  for (const resource of resources) {
    try { await models.Resource.updateOne({ code: resource.code }, { $setOnInsert: { ...resource, state: 'READY', schedule_version: 0 } }, { upsert: true, timestamps: false }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
}
async function main() {
  const connection = await connect(configFor(require('node:path').join(__dirname, '..')));
  try {
    if (!await supportsTransactions(connection)) throw new Error('Replica set required');
    const models = createModels(connection); await initialize(models); await seed(models);
    console.log('Resource seed complete; existing resources and operational data preserved.');
  } finally { await connection.close(); }
}
if (require.main === module) main().catch(() => { console.error('Resource seed failed; check configuration.'); process.exitCode = 1; });
module.exports = { seed, resources };
