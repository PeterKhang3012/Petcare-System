const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { validatePermissions } = require('./authorization');
function key(name) {
 if (!process.env[name]) throw new Error(name + ' is not configured');
 return fs.readFileSync(process.env[name], 'utf8');
}
function issuer() {
 if (!process.env.JWT_ISSUER) throw new Error('JWT_ISSUER is not configured');
 return process.env.JWT_ISSUER;
}
function signToken(user) {
 if (!['USER', 'STAFF'].includes(user.role)) throw new Error('Invalid role');
 return jwt.sign({ username: user.username, role: user.role, permissions: validatePermissions(user.role, user.permissions) }, key('JWT_PRIVATE_KEY_PATH'), { algorithm: 'RS256', subject: user.id, issuer: issuer(), expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
}
function verifyToken(token) {
 const data = jwt.verify(token, key('JWT_PUBLIC_KEY_PATH'), { algorithms: ['RS256'], issuer: issuer() });
 if (typeof data.sub !== 'string' || !data.sub || typeof data.username !== 'string' || !data.username || !['USER', 'STAFF'].includes(data.role) || !Number.isFinite(data.exp) || !Number.isFinite(data.iat)) throw new Error('Invalid token claims');
 data.permissions = validatePermissions(data.role, data.permissions);
 return data;
}
function validateConfig() { verifyToken(signToken({ id: 'config-check', username: 'config-check', role: 'USER' })); }
module.exports = { signToken, verifyToken, validateConfig };
