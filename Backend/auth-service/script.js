const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

function generateKeys() {
 const privatePath = process.env.JWT_PRIVATE_KEY_PATH;
 const publicPath = process.env.JWT_PUBLIC_KEY_PATH;
 if (!privatePath || !publicPath) throw new Error('Set JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH in .env first');
 // Relative paths are resolved from auth-service, even when launched elsewhere.
 const privateFile = path.resolve(__dirname, privatePath);
 const publicFile = path.resolve(__dirname, publicPath);
 if (privateFile.toLowerCase() === publicFile.toLowerCase()) throw new Error('Private and public key paths must be different');
 if (fs.existsSync(privateFile) || fs.existsSync(publicFile)) throw new Error('A key file already exists; existing keys were left unchanged');
 const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
 });
 fs.mkdirSync(path.dirname(privateFile), { recursive: true });
 fs.mkdirSync(path.dirname(publicFile), { recursive: true });
 fs.writeFileSync(privateFile, privateKey, { flag: 'wx', mode: 0o600 });
 fs.writeFileSync(publicFile, publicKey, { flag: 'wx', mode: 0o644 });
 console.log('Private key created:', privateFile);
 console.log('Public key created:', publicFile);
}

if (require.main === module) {
 try { generateKeys(); }
 catch (error) {
  console.error('Key generation failed:', error.message);
  process.exitCode = 1;
 }
}
module.exports = { generateKeys };
