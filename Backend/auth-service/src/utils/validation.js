const httpError = (status, message) => Object.assign(new Error(message), { status });
function validateCredentials(username, password, registering = true) {
 if (typeof username !== 'string' || !username.trim() || username.trim().length > 100) throw httpError(400, 'Username must contain 1 to 100 characters');
 if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72 || (registering && password.length < 8)) throw httpError(400, 'Password must contain at least 8 characters for registration and at most 72 UTF-8 bytes');
 return username.trim();
}
module.exports = { httpError, validateCredentials };
