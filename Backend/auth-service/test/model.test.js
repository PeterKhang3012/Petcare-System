const { test } = require('node:test');
const assert = require('node:assert/strict');
const Auth = require('../src/models/auth.model');
const { publicUser } = require('../src/services/auth.service');

test('Mongoose preserves staff permissions and rejects unauthorized assignments', async () => {
 const owner = new Auth({ username: 'owner', password: 'hash' });
 await owner.validate();
 assert.equal(owner.role, 'USER');
 assert.deepEqual(owner.toObject().permissions, []);
 const staff = new Auth({ username: 'staff', password: 'hash', role: 'STAFF', permissions: ['UPDATE_SERVICE_PRICE'] });
 await staff.validate();
 assert.deepEqual(staff.toObject().permissions, ['UPDATE_SERVICE_PRICE']);
 assert.deepEqual(publicUser(staff).permissions, ['UPDATE_SERVICE_PRICE']);
 assert.equal('password' in staff.toJSON(), false);
 owner.permissions = ['UPDATE_SERVICE_PRICE'];
 await assert.rejects(owner.validate(), /Only STAFF/);
 staff.permissions = ['ADMIN'];
 await assert.rejects(staff.validate(), /enum/);
 staff.permissions = [];
 staff.role = 'ADMIN';
 await assert.rejects(staff.validate(), /enum/);
 assert.throws(() => publicUser({ _id: '1', username: 'invalid', role: 'ADMIN' }), /Invalid account role/);
 assert.deepEqual(publicUser({ _id: '1', username: 'legacy', role: 'staff' }).permissions, []);
});
