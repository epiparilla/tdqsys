'use strict';

// Shared validation for the public test-drive forms. Server endpoints still
// validate against the database; these helpers keep browser and server rules
// consistent without treating client validation as a security boundary.

const INSTANCE_RE = /^[0-9a-f-]{1,64}$/i;
const CODE_RE = /^\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L} .,'-]+$/u;
const ADDRESS_RE = /^[\p{L}\p{N} .,'#/-]+$/u;
const PHONE_RE = /^[0-9]{11}$/;
const CONTACT_ERROR = 'Enter exactly 11 digits for the contact number (numbers only).';

function validContactNumber(value) { return typeof value === 'string' && value.length === 11 && PHONE_RE.test(value); }

function text(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normaliseName(value) {
  return text(value, 160).replace(/\s+/g, ' ').toLocaleLowerCase();
}

function validInstanceId(value) { return typeof value === 'string' && INSTANCE_RE.test(value.trim()); }
function validSeCode(value) { return typeof value === 'string' && CODE_RE.test(value.trim()); }

function validateSeCheckin(body = {}) {
  if (!body || typeof body !== 'object') body = {};
  const name = text(body.name, 120);
  const dealership = text(body.dealership, 160);
  const contactNumber = typeof body.contactNumber === 'string' ? body.contactNumber : '';
  const errors = {};
  if (!validInstanceId(body.instanceId)) errors.instanceId = 'Invalid registration location.';
  if (!name || !NAME_RE.test(name)) errors.name = 'Enter the Agent name using letters.';
  if (!dealership) errors.dealership = 'Enter the dealership.';
  if (!validContactNumber(contactNumber)) errors.contactNumber = CONTACT_ERROR;
  return { ok: Object.keys(errors).length === 0, errors, value: { name, dealership, contactNumber } };
}

function validateRegistration(body = {}) {
  if (!body || typeof body !== 'object') body = {};
  const fullName = text(body.fullName, 160);
  const email = text(body.email, 320).toLowerCase();
  const cityAddress = text(body.cityAddress, 240);
  const contactNumber = typeof body.contactNumber === 'string' ? body.contactNumber : '';
  const seCode = text(body.seCode, 4);
  const modelIds = Array.isArray(body.modelIds)
    ? [...new Set(body.modelIds.filter((v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)))]
    : [];
  const errors = {};
  if (!validInstanceId(body.instanceId)) errors.instanceId = 'Invalid registration location.';
  if (!fullName || !NAME_RE.test(fullName)) errors.fullName = 'Enter your full name using letters.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!cityAddress || !ADDRESS_RE.test(cityAddress)) errors.cityAddress = 'Enter a valid city address.';
  if (!validContactNumber(contactNumber)) errors.contactNumber = CONTACT_ERROR;
  if (!modelIds.length) errors.modelIds = 'Select at least one vehicle model.';
  if (!validSeCode(body.seCode)) errors.seCode = 'Enter the four-digit Agent code.';
  if (body.waiverAccepted !== true) errors.waiverAccepted = 'You must accept the waiver.';
  if (body.termsAccepted !== true) errors.termsAccepted = 'You must accept the Terms and Conditions.';
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { fullName, nameSearch: normaliseName(fullName), email, cityAddress, contactNumber, seCode, modelIds }
  };
}

module.exports = { normaliseName, validInstanceId, validSeCode, validContactNumber, validateSeCheckin, validateRegistration };
