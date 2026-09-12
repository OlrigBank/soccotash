// Standalone so this check also works in the runtime image, which omits src/lib.
export {};
try {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!/^AC[0-9a-f]{32}$/i.test(account || '') || !token || !/^VA[0-9a-f]{32}$/i.test(service || ''))
    throw new Error('Configure the Twilio account SID, auth token and Verify service SID.');
  const response = await fetch(`https://verify.twilio.com/v2/Services/${service}`, {
    headers: { authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Twilio configuration check failed (HTTP ${response.status}).`);
  const configuration = await response.json() as { code_length?: number };
  if (configuration.code_length !== 6) throw new Error('Configure the Verify service for six-digit codes.');
  console.log('Twilio Verify credentials and six-digit service configuration validated. No SMS sent.');
  console.log('Before enabling SMS, confirm default ten-minute validity, UK and Netherlands geographic permissions (all other destinations disabled), fraud protection and trial recipient restrictions in Twilio Console.');
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith('Configure') ? error.message
    : error instanceof Error && error.message.startsWith('Twilio configuration') ? error.message
    : 'Twilio configuration check could not connect. Try again shortly.');
  process.exitCode = 1;
}
