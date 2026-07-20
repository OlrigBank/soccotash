import type { BookingOfferLine, ProvisionalBookingRequest } from './repository';
import { sendEmail } from '../email/sender';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

function formatCurrency(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function defaultOfferSubject(booking: ProvisionalBookingRequest, propertyName: string): string {
  return `${propertyName} booking offer – ${formatDate(booking.arrival)} to ${formatDate(booking.departure)}`;
}

export async function sendBookingOfferEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  currency: string;
  lineItems: BookingOfferLine[];
  totalPence: number;
  offerMessage: string;
  terms: string;
  validUntil: string | null;
  subject: string;
}): Promise<{ messageId: string | null; provider: string }> {
  const linesText = input.lineItems
    .map((line) => `${line.label}: ${formatCurrency(line.amountPence, input.currency)}${line.detail ? `\n  ${line.detail}` : ''}`)
    .join('\n');
  const validityText = input.validUntil ? `This offer is valid until ${formatDate(input.validUntil)}.` : '';
  const text = [
    `Dear ${input.booking.name},`,
    '',
    input.offerMessage || `Thank you for your provisional booking request for ${input.propertyName}. We are pleased to make the following offer.`,
    '',
    `${input.propertyName}`,
    `${formatDate(input.booking.arrival)} to ${formatDate(input.booking.departure)}`,
    `${input.booking.guests} guest${input.booking.guests === 1 ? '' : 's'}${input.booking.pets ? `, ${input.booking.pets} pet${input.booking.pets === 1 ? '' : 's'}` : ''}`,
    '',
    linesText,
    `Total offer: ${formatCurrency(input.totalPence, input.currency)}`,
    '',
    validityText,
    input.terms,
    '',
    'This is an offer rather than a confirmed booking. Please reply to this email if you would like to accept it.',
    '',
    `Booking request reference: ${input.booking.reference}`,
    '',
    'Olrig Bank',
  ].filter(Boolean).join('\n');

  const tableRows = input.lineItems.map((line) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e3ded2;">
        <strong>${escapeHtml(line.label)}</strong>${line.detail ? `<br><span style="color:#65706b;font-size:13px;">${escapeHtml(line.detail)}</span>` : ''}
      </td>
      <td style="padding:8px 0 8px 20px;border-bottom:1px solid #e3ded2;text-align:right;white-space:nowrap;">${escapeHtml(formatCurrency(line.amountPence, input.currency))}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
      <p style="margin-top:0;">Dear ${escapeHtml(input.booking.name)},</p>
      <p>${escapeHtml(input.offerMessage || `Thank you for your provisional booking request for ${input.propertyName}. We are pleased to make the following offer.`).replace(/\n/g, '<br>')}</p>
      <div style="background:#f5f6f1;border-radius:12px;padding:18px;margin:22px 0;">
        <h2 style="margin:0 0 8px;font-size:22px;">${escapeHtml(input.propertyName)}</h2>
        <p style="margin:0 0 4px;">${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}</p>
        <p style="margin:0;">${input.booking.guests} guest${input.booking.guests === 1 ? '' : 's'}${input.booking.pets ? ` · ${input.booking.pets} pet${input.booking.pets === 1 ? '' : 's'}` : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">${tableRows}
        <tr><td style="padding-top:14px;font-size:18px;"><strong>Total offer</strong></td><td style="padding:14px 0 0 20px;text-align:right;font-size:20px;white-space:nowrap;"><strong>${escapeHtml(formatCurrency(input.totalPence, input.currency))}</strong></td></tr>
      </table>
      ${validityText ? `<p style="margin-top:24px;"><strong>${escapeHtml(validityText)}</strong></p>` : ''}
      ${input.terms ? `<p>${escapeHtml(input.terms).replace(/\n/g, '<br>')}</p>` : ''}
      <p>This is an offer rather than a confirmed booking. Please reply to this email if you would like to accept it.</p>
      <p style="color:#65706b;font-size:13px;">Booking request reference: ${escapeHtml(input.booking.reference)}</p>
      <p style="margin-bottom:0;">Olrig Bank</p>
    </div>
  </div>
</body></html>`;

  return sendEmail({
    to: input.booking.email,
    subject: input.subject,
    text,
    html,
  });
}
