const fs = require('node:fs');
const { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } = require('node:crypto');

const privatePath = '/keys/private.pem';
const publicPath = '/keys/public.pem';
const sharedPath = '/public-keys/auth-public.pem';

function publicPem(key) {
  const publicKey = createPublicKey(key);
  if (publicKey.asymmetricKeyType !== 'rsa') throw new Error('JWT keys must use RSA');
  return publicKey.export({ type: 'spki', format: 'pem' });
}

function initialize() {
  const hasPrivate = fs.existsSync(privatePath);
  const hasPublic = fs.existsSync(publicPath);
  if (!hasPrivate && hasPublic) {
    throw new Error('public.pem exists without private.pem. Restore the matching private key.');
  }
  if (!hasPrivate) {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(privatePath, privateKey, { flag: 'wx', mode: 0o600 });
    fs.chownSync(privatePath, 1000, 1000);
  }
  const expected = publicPem(createPrivateKey(fs.readFileSync(privatePath)));
  if (hasPublic) {
    if (publicPem(fs.readFileSync(publicPath)) !== expected) {
      throw new Error('Existing JWT keys do not match. Restore the matching pair.');
    }
  } else {
    fs.writeFileSync(publicPath, expected, { flag: 'wx', mode: 0o644 });
  }

  const publicFile = fs.readFileSync(publicPath);
  if (!fs.existsSync(sharedPath) || !publicFile.equals(fs.readFileSync(sharedPath))) {
    const temporary = sharedPath + '.' + randomUUID();
    try {
      fs.writeFileSync(temporary, publicFile, { flag: 'wx', mode: 0o644 });
      fs.renameSync(temporary, sharedPath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  console.log(hasPrivate && hasPublic ? 'Existing JWT key pair preserved.' : 'JWT keys initialized.');
}

try {
  initialize();
} catch (error) {
  console.error('JWT initialization failed:', error.message);
  process.exitCode = 1;
}
