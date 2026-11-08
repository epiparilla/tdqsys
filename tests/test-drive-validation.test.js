'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSeCheckin, validateRegistration, normaliseName, validContactNumber } = require('../shared/test-drive');

const ID = '8c8b6714-f300-413f-bf75-e1156662acfb';
const MODEL = '11111111-2222-4333-8444-555555555555';

test('SE check-in requires a location, name, dealership and contact number', () => {
  assert.equal(validateSeCheckin({ instanceId: ID, name: 'Ana Cruz', dealership: 'Toyota Manila', contactNumber:'09171234567' }).ok, true);
  assert.equal(validateSeCheckin({ instanceId: ID, name: '123', dealership: '' }).ok, false);
});

test('registration requires all client fields, consent, code and a model', () => {
  const valid = {
    instanceId: ID, fullName: 'Ana Cruz', email: 'ana@example.com', cityAddress: 'Quezon City',
    contactNumber: '09171234567', seCode: '0123', modelIds: [MODEL],
    privacyAccepted: true, waiverAccepted: true, printedWaiverAccepted: true, termsAccepted: true
  };
  assert.equal(validateRegistration(valid).ok, true);
  assert.equal(validateRegistration({ ...valid, modelIds: [], waiverAccepted: false }).ok, false);
});

test('registration normalises name and deduplicates selected model ids', () => {
  const r = validateRegistration({
    instanceId: ID, fullName: '  Ana   Cruz ', email: 'ANA@EXAMPLE.COM', cityAddress: 'Quezon City',
    contactNumber: '09171234567', seCode: '0123', modelIds: [MODEL, MODEL], privacyAccepted: true, waiverAccepted: true, printedWaiverAccepted: true, termsAccepted: true
  });
  assert.equal(r.value.nameSearch, 'ana cruz');
  assert.equal(r.value.email, 'ana@example.com');
  assert.deepEqual(r.value.modelIds, [MODEL]);
  assert.equal(normaliseName('  Ana   Cruz '), 'ana cruz');
});

test('both contact validators accept only exactly 11 ASCII digits and preserve zeroes',()=>{
  for(const contactNumber of ['',undefined,null,91712345678,'0917123456','091712345678','0917 1234567','0917-1234567','+639171234567','0917123456a','０９１７１２３４５６７',' 09171234567','09171234567\n']) {
    assert.equal(validContactNumber(contactNumber),false,JSON.stringify(contactNumber));
    assert.match(validateSeCheckin({contactNumber}).errors.contactNumber,/11 digits/);
    assert.match(validateRegistration({contactNumber}).errors.contactNumber,/11 digits/);
  }
  assert.equal(validateSeCheckin({contactNumber:'00171234567'}).value.contactNumber,'00171234567');
});
