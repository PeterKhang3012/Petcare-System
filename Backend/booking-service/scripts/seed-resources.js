require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { configFor } = require('../src/config');
const { connect } = require('../src/platform');
const { createModels, initialize } = require('../src/models');
const { supportsTransactions, transaction, lock } = require('../src/transactions');
const { stayResources } = require('./stay-resources');
const resources = Object.freeze([
  { code: 'CARE-01', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-02', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-03', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-04', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-05', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-06', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-07', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  { code: 'CARE-08', group: 'CARE', species: ['DOG', 'CAT'], max_weight_kg: 40 },
  ...stayResources,
]);
async function seed(models) {
  const positions = resources.filter(resource => resource.group === 'CARE');
  for (const resource of positions) {
    await models.Resource.updateOne({ code: resource.code }, { $setOnInsert: { ...resource, state: 'READY', schedule_version: 0 } }, { upsert: true, timestamps: false });
  }

  await transaction(models.Resource.db, async session => {
    const legacy = await models.Resource.find({ code: /^STAY-(DOG|CAT)-0[1-4]$/ }).session(session).lean();
    await lock(models, session, null, legacy.map(room => room._id));
    // Keep identifiers, booking links, occupancy and maintenance when renaming rooms.
    for (const species of ['DOG', 'CAT']) {
      const newRooms = stayResources.filter(room => room.species[0] === species);
      for (const [index, room] of newRooms.entries()) {
        const legacyRoom = legacy.find(item => item.code === `STAY-${species}-0${index + 1}`);
        if (legacyRoom) {
          await models.Resource.updateOne({ _id: legacyRoom._id }, { $set: room }, { session });
        } else {
          await models.Resource.updateOne({ code: room.code }, { $setOnInsert: { ...room, state: 'READY', schedule_version: 0 } },
            { upsert: true, timestamps: false, session });
        }
      }
    }
  });
}
async function main() {
  const connection = await connect(configFor(require('node:path').join(__dirname, '..')));
  try {
    if (!await supportsTransactions(connection)) throw new Error('Replica set required');
    const models = createModels(connection); await initialize(models); await seed(models);
    console.log('Resource seed complete; existing resources and operational data preserved.');
  } finally { await connection.close(); }
}
if (require.main === module) main().catch(() => { console.error('Resource seed failed; check configuration or room-code conflicts.'); process.exitCode = 1; });
module.exports = { seed, resources };
