const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePet, petModel } = require('../src/pet');
const { id, pagination, dateOnly } = require('../src/platform');
const mongoose = require('mongoose');
const good = { name: '  Mimi  ', species: 'CAT', weight_kg: 3.5, date_of_birth: '2020-02-29', care_notes: '  Quiet  ' };
test('pet input whitelists fields, trims and validates real calendar dates', () => {
  assert.equal(validatePet(good).name, 'Mimi');
  assert.equal(validatePet(good).care_notes, 'Quiet');
  for (const change of [{ name: ' ' }, { species: 'RABBIT' }, { weight_kg: 0 }, { weight_kg: Infinity }, { weight_kg: '3' },
    { date_of_birth: '2023-02-29' }, { date_of_birth: '2999-01-01' }, { care_notes: 'x'.repeat(2001) }, { owner_id: 'injected' },
    { version: 5 }, { status: 'ARCHIVED' }, { updated_at: '2020-01-01' }, { role: 'STAFF' }]) assert.throws(() => validatePet({ ...good, ...change }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => validatePet({}, true));
  assert.throws(() => id('not-an-id'), { status: 400 });
  assert.throws(() => pagination({ limit: '101' }));
  assert.throws(() => dateOnly('2026-02-30', 'date'));
});
test('pet schema has ownership index and archive/version fields', async () => {
  const connection = mongoose.createConnection(); const Pet = petModel(connection);
  const row = new Pet({ ...validatePet(good), owner_id: 'a'.repeat(24) }); await row.validate();
  assert.equal(row.status, 'ACTIVE'); assert.equal(row.version, 1); assert.equal(row.archived_at, null);
  assert.ok(Pet.schema.indexes().some(([keys]) => keys.owner_id && keys.status));
  row.species = 'BIRD'; await assert.rejects(row.validate()); await connection.close();
});
