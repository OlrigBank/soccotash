import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { BookerError } from './accounts.ts';

export function normaliseSmsNumber(value: string): string {
  if (value.length > 80 || !/^[+\d\s().-]+$/.test(value)) throw new BookerError('Enter a valid UK mobile number.');
  const number = parsePhoneNumberFromString(value.trim().replace(/^00/, '+'), 'GB');
  if (!number?.isValid() || number.country !== 'GB' || number.getType() !== 'MOBILE')
    throw new BookerError('SMS verification is available for UK mobile numbers only. Use email instead.');
  return number.number;
}
export function smsAvailable(): boolean {
  return process.env.BOOKER_SMS_ENABLED === 'true'
    && /^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || '')
    && Boolean(process.env.TWILIO_AUTH_TOKEN)
    && /^VA[0-9a-f]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID || '');
}
export function requireSms() {
  if (!smsAvailable()) throw new BookerError('SMS verification is temporarily unavailable. Use email instead.', 503);
}
export class SmsProviderError extends BookerError {
  category: 'expired' | 'limited' | 'configuration' | 'unavailable';
  constructor(category: 'expired' | 'limited' | 'configuration' | 'unavailable') {
    super(category === 'expired' ? 'The code is invalid or has expired. Request another code.'
      : category === 'limited' ? 'Please wait before requesting or checking another SMS code.'
      : 'SMS verification is temporarily unavailable. Try again shortly or use email.',
    category === 'expired' ? 400 : category === 'limited' ? 429 : 503,
    category === 'limited' ? 60 : 0);
    this.category = category;
  }
}
export async function twilioVerify(path: string, values?: Record<string, string>) {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!/^AC[0-9a-f]{32}$/i.test(account || '') || !token || !/^VA[0-9a-f]{32}$/i.test(service || ''))
    throw new SmsProviderError('configuration');
  try {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${service}${path ? '/' + path : ''}`, {
      method: values ? 'POST' : 'GET',
      headers: { authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: values ? new URLSearchParams(values) : undefined, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const category = response.status === 404 && path === 'VerificationCheck' ? 'expired'
        : response.status === 429 ? 'limited' : [401,403,404].includes(response.status) ? 'configuration' : 'unavailable';
      throw new SmsProviderError(category);
    }
    return await response.json() as { sid: string; status: string; date_created: string; code_length?: number; friendly_name?: string };
  } catch (error) {
    const safe = error instanceof SmsProviderError ? error : new SmsProviderError('unavailable');
    console.warn(JSON.stringify({ event: 'booker_sms_provider_failure', category: safe.category }));
    throw safe;
  }
}
export async function sendSms(identifier: string) {
  requireSms();
  const result = await twilioVerify('Verifications', { To: normaliseSmsNumber(identifier), Channel: 'sms' });
  const expiresAt = Date.parse(result.date_created) + 600000;
  if (!/^VE[0-9a-f]{32}$/i.test(result.sid) || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw new SmsProviderError('unavailable');
  return { id: result.sid, expiresAt };
}
export async function checkSms(providerId: string, code: string) {
  requireSms();
  try { return (await twilioVerify('VerificationCheck', { VerificationSid: providerId, Code: code })).status === 'approved'; }
  catch (error) { if (error instanceof SmsProviderError && error.category === 'expired') return false; throw error; }
}
