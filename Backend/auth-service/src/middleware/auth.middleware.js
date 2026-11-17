const { verifyToken } = require('../config/jwt');
async function authenticate(req, res, next) {
 const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
 if (!match) return res.status(401).json({ success: false, message: 'Unauthorized' });
 let claims;
 try { claims = verifyToken(match[1]); }
 catch { return res.status(401).json({ success: false, message: 'Unauthorized' }); }
 try {
  const account = await require('../models/auth.model').findById(claims.sub);
  if (!account) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const current = require('../services/auth.service').publicUser(account);
  req.user = { ...claims, ...current, sub: current.id };
 } catch (error) {
  if (error.name === 'CastError' && error.path === '_id') return res.status(401).json({ success: false, message: 'Unauthorized' });
  return next(error);
 }
  next();
}
const requireRole = (...roles) => (req, res, next) => {
 if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
 if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    next();
  };
const requirePermission = (...permissions) => (req, res, next) => {
 if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
 const known = Object.values(require('../config/authorization').PERMISSIONS);
 if (req.user.role !== 'STAFF' || !permissions.length || permissions.some(p => !known.includes(p) || !req.user.permissions?.includes(p))) {
  return res.status(403).json({ success: false, message: 'Forbidden' });
 }
 next();
};
module.exports = { authenticate, requireRole, requirePermission };
