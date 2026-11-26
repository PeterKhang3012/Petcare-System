const { randomUUID } = require('node:crypto');
const { mkdir, readFile, rename, rm, writeFile } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');
const { authenticate, requirePermission } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../config/authorization');

const defaultContact = { hotline: '09000000', address: '' };

function contactPath() {
  return resolve(process.env.FACILITY_CONTACT_FILE || 'data/facility-contact.json');
}

function canEdit(user) {
  return user.role === 'STAFF' && user.permissions.includes(PERMISSIONS.UPDATE_SERVICE_PRICE);
}

function validatedContact(body) {
  if (!body || typeof body.hotline !== 'string' || typeof body.address !== 'string' ||
      Object.keys(body).some(key => !['hotline', 'address'].includes(key))) return null;
  const hotline = body.hotline.trim(), address = body.address.trim();
  return /^\+?[0-9]{7,15}$/.test(hotline) && address.length <= 300 ? { hotline, address } : null;
}

async function readContact() {
  try {
    const contact = validatedContact(JSON.parse(await readFile(contactPath(), 'utf8')));
    if (!contact) throw new Error('Invalid facility contact file');
    return contact;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaultContact;
  }
}

async function writeContact(contact) {
  const file = contactPath(), temporary = file + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(contact, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

const router = require('express').Router();
router.get('/', authenticate, async (req, res) => {
  res.json({ success: true, data: { ...await readContact(), can_edit: canEdit(req.user) } });
});
router.put('/', authenticate, requirePermission(PERMISSIONS.UPDATE_SERVICE_PRICE), async (req, res) => {
  const contact = validatedContact(req.body);
  if (!contact) return res.status(400).json({ success: false, message: 'Invalid hotline or address' });
  await writeContact(contact);
  res.json({ success: true, data: { ...contact, can_edit: true } });
});

module.exports = router;
