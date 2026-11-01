'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSeCheckin, validateRegistration, normaliseName } = require('../shared/test-drive');

const ID = '8c8b6714-f300-413f-bf75-e1156662acfb';
const MODEL = '11111111-2222-4333-8444-555555555555';

test('SE check-in requires a location, name and dealership', () => {
  assert.equal(validateSeCheckin({ instanceId: ID, name: 'Ana Cruz', dealership: 'Toyota Manila' }).ok, true);
  assert.equal(validateSeCheckin({ instanceId: ID, name: '123', dealership: '' }).ok, false);
});

test('registration requires all client fields, consent, code and a model', () => {
  const valid = {
    instanceId: ID, fullName: 'Ana Cruz', email: 'ana@example.com', cityAddress: 'Quezon City',
    contactNumber: '+63 917 123 4567', seCode: '0123', modelIds: [MODEL],
    waiverAccepted: true, termsAccepted: true
  };
  assert.equal(validateRegistration(valid).ok, true);
  assert.equal(validateRegistration({ ...valid, modelIds: [], waiverAccepted: false }).ok, false);
});

test('registration normalises name and deduplicates selected model ids', () => {
  const r = validateRegistration({
    instanceId: ID, fullName: '  Ana   Cruz ', email: 'ANA@EXAMPLE.COM', cityAddress: 'Quezon City',
    contactNumber: '9171234567', seCode: '0123', modelIds: [MODEL, MODEL], waiverAccepted: true, termsAccepted: true
  });
  assert.equal(r.value.nameSearch, 'ana cruz');
  assert.equal(r.value.email, 'ana@example.com');
  assert.deepEqual(r.value.modelIds, [MODEL]);
  assert.equal(normaliseName('  Ana   Cruz '), 'ana cruz');
});
