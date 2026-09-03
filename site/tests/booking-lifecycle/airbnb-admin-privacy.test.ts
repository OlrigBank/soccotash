import assert from 'node:assert/strict';
import test from 'node:test';
import { AIRBNB_ACCESS_CODE_REDACTION, redactAirbnbAccessCodes } from '../../src/lib/airbnb-admin/privacy.ts';

test('redacts credential-shaped access codes while retaining useful check-in instructions', () => {
  const examples = [
    'Your keys are in box one, and the code is 2468.',
    'The code for that box is A1B2.',
    'Access code: 97531',
    'Door code = 88-42',
    'The keybox code is K9-72.',
    'The lock box code: 4455',
  ];
  for (const input of examples) {
    const output = redactAirbnbAccessCodes(input);
    assert.ok(output.includes(AIRBNB_ACCESS_CODE_REDACTION));
    assert.doesNotMatch(output, /2468|A1B2|97531|88-42|K9-72|4455/u);
  }
});

test('does not redact unrelated operational numbers or ordinary uses of code', () => {
  const message = 'Check-in is 4pm on 27 August. Call 07800111222. The booking code was sent separately.';
  assert.equal(redactAirbnbAccessCodes(message), message);
});
