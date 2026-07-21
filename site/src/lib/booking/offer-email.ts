import type {
  BookingOfferLine,
  CustomerBookingOffer,
  ProvisionalBookingRequest,
} from './repository';
import {
  getBookingManagementRecipients,
  sendEmail,
  type EmailSendResult,
} from '../email/sender';

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
  manageUrl: string;
}): Promise<EmailSendResult> {
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
    'View the booking details and accept or decline this offer using the secure link below:',
    input.manageUrl,
    '',
    'This is an offer rather than a confirmed booking. If you accept it, Olrig Bank will record your acceptance and complete the final confirmation separately.',
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
      <p style="margin:26px 0;text-align:center;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">View and respond to your offer</a></p>
      <p>This is an offer rather than a confirmed booking. If you accept it, Olrig Bank will record your acceptance and complete the final confirmation separately.</p>
      <p style="color:#65706b;font-size:13px;">This secure link is unique to your offer. Please do not forward it.</p>
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

export async function sendCustomerOfferResponseEmail(input: {
  offer: CustomerBookingOffer;
  propertyName: string;
  response: 'accepted' | 'declined';
  manageUrl: string;
}): Promise<EmailSendResult> {
  const accepted = input.response === 'accepted';
  const heading = accepted ? 'We have recorded your acceptance' : 'We have recorded that you declined the offer';
  const nextStep = accepted
    ? 'Your acceptance has been recorded. This is not yet the final booking confirmation; Olrig Bank will contact you separately when the booking is fully confirmed.'
    : 'No further action is required. Please contact Olrig Bank if this was not your intention or you would like to discuss another stay.';
  const subject = accepted
    ? `Your ${input.propertyName} booking offer was accepted`
    : `Your ${input.propertyName} booking offer was declined`;
  const text = [
    `Dear ${input.offer.guestName},`,
    '',
    heading + '.',
    '',
    `${input.propertyName}`,
    `${formatDate(input.offer.arrival)} to ${formatDate(input.offer.departure)}`,
    `Offer total: ${formatCurrency(input.offer.totalPence, input.offer.currency)}`,
    '',
    nextStep,
    '',
    'You can review the booking details using the same secure link:',
    input.manageUrl,
    '',
    `Booking request reference: ${input.offer.bookingReference}`,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
    <p style="margin-top:0;">Dear ${escapeHtml(input.offer.guestName)},</p>
    <h1 style="font-size:24px;">${escapeHtml(heading)}</h1>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.offer.arrival))} to ${escapeHtml(formatDate(input.offer.departure))}<br>Offer total: ${escapeHtml(formatCurrency(input.offer.totalPence, input.offer.currency))}</p>
    <p>${escapeHtml(nextStep)}</p>
    <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">Review booking details</a></p>
    <p style="color:#65706b;font-size:13px;">Booking request reference: ${escapeHtml(input.offer.bookingReference)}</p>
    <p style="margin-bottom:0;">Olrig Bank</p>
  </div></div></body></html>`;
  return sendEmail({ to: input.offer.guestEmail, subject, text, html });
}

export async function sendManagementOfferResponseEmail(input: {
  offer: CustomerBookingOffer;
  propertyName: string;
  response: 'accepted' | 'declined';
  adminUrl: string;
}): Promise<EmailSendResult | null> {
  const recipients = getBookingManagementRecipients();
  if (!recipients.length) return null;
  const action = input.response === 'accepted' ? 'accepted' : 'declined';
  const subject = `Booking offer ${action}: ${input.offer.guestName} · ${input.propertyName}`;
  const text = [
    `${input.offer.guestName} has ${action} the booking offer.`,
    '',
    `${input.propertyName}`,
    `${formatDate(input.offer.arrival)} to ${formatDate(input.offer.departure)}`,
    `${input.offer.guests} guest${input.offer.guests === 1 ? '' : 's'}${input.offer.pets ? `, ${input.offer.pets} pet${input.offer.pets === 1 ? '' : 's'}` : ''}`,
    `Offer total: ${formatCurrency(input.offer.totalPence, input.offer.currency)}`,
    `Customer email: ${input.offer.guestEmail}`,
    `Customer telephone: ${input.offer.guestTelephone || 'None supplied'}`,
    `Booking request reference: ${input.offer.bookingReference}`,
    '',
    `Administrator review: ${input.adminUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
    <h1>Booking offer ${escapeHtml(action)}</h1>
    <p><strong>${escapeHtml(input.offer.guestName)}</strong> has ${escapeHtml(action)} the booking offer.</p>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.offer.arrival))} to ${escapeHtml(formatDate(input.offer.departure))}<br>${input.offer.guests} guest${input.offer.guests === 1 ? '' : 's'}${input.offer.pets ? ` · ${input.offer.pets} pet${input.offer.pets === 1 ? '' : 's'}` : ''}<br>Offer total: ${escapeHtml(formatCurrency(input.offer.totalPence, input.offer.currency))}</p>
    <p>Customer email: ${escapeHtml(input.offer.guestEmail)}<br>Customer telephone: ${escapeHtml(input.offer.guestTelephone || 'None supplied')}</p>
    <p>Booking request reference: ${escapeHtml(input.offer.bookingReference)}</p>
  </body></html>`;
  return sendEmail({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject,
    text,
    html,
  });
}
