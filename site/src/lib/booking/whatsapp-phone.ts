import crypto from 'node:crypto';

export const WHATSAPP_CONSENT_VERSION = '2026-07-31-v1';
export const WHATSAPP_CONSENT_TEXT = 'Yes, Olrig Bank may send transactional WhatsApp messages about this booking and its payments. I can withdraw consent at any time. Email or my private booking page will remain available.';

export function normaliseWhatsAppTelephone(value: string): string | null {
  let number = String(value || '').trim().replace(/[\s().-]/g, '');
  if (!number) return null;
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  if (number.startsWith('0')) number = `+44${number.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

export function validateWhatsAppConsent(input: { telephone: string; requested: boolean }): {
  telephoneE164: string | null;
  status: 'not_requested' | 'active';
} {
  const telephoneE164 = normaliseWhatsAppTelephone(input.telephone);
  if (input.requested && !telephoneE164) throw new Error('WHATSAPP_TELEPHONE_INVALID');
  return { telephoneE164, status: input.requested ? 'active' : 'not_requested' };
}

export function maskTelephone(value: string): string {
  return value.length <= 6 ? '***' : `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function hashRecipient(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
