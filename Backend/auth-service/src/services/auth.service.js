const Auth = require('../models/auth.model');
const bcrypt = require('bcryptjs');
const { signToken } = require('../config/jwt');
const { validateCredentials, httpError } = require('../utils/validation');
const { normalizeRole, validatePermissions, ROLES } = require('../config/authorization');

function publicUser(user) {
 const role = normalizeRole(user.role);
 if (!Object.values(ROLES).includes(role)) throw new Error('Invalid account role');
 return { id: String(user._id), username: user.username, role,
  permissions: validatePermissions(role, user.permissions) };
}

async function register(username, password) {
 username = validateCredentials(username, password);
 if (await Auth.exists({ username })) throw httpError(409, 'Username already exists');
 try {
  const user = await Auth.create({ username, password: await bcrypt.hash(password, 12), role: ROLES.OWNER, permissions: [] });
  return { user: publicUser(user) };
 } catch (error) {
  if (error.code === 11000) throw httpError(409, 'Username already exists');
  throw error;
 }
}

async function login(username, password) {
 username = validateCredentials(username, password, false);
 const user = await Auth.findOne({ username }).select('+password');
 if (!user || !(await bcrypt.compare(password, user.password))) throw httpError(401, 'Invalid username or password');
 const safe = publicUser(user);
 return { accessToken: signToken(safe), user: safe };
}
module.exports = { register, login, publicUser };
