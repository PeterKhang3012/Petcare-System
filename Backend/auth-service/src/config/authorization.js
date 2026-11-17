const ROLES = Object.freeze({ OWNER: 'USER', STAFF: 'STAFF' });
const PERMISSIONS = Object.freeze({ UPDATE_SERVICE_PRICE: 'UPDATE_SERVICE_PRICE' });

function normalizeRole(role) {
 return typeof role === 'string' ? role.toUpperCase() : '';
}
function validatePermissions(role, permissions = []) {
 if (!Array.isArray(permissions) || permissions.some(p => !Object.values(PERMISSIONS).includes(p))) {
  throw new Error('Invalid permissions');
 }
 if (permissions.length && normalizeRole(role) !== ROLES.STAFF) throw new Error('Only STAFF can hold additional permissions');
 return [...new Set(permissions)];
}
module.exports = { ROLES, PERMISSIONS, normalizeRole, validatePermissions };
