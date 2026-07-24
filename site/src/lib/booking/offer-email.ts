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
    'Return to your private booking page to review and respond to this offer:',
    input.manageUrl,
    '',
    'This is an offer rather than a confirmed booking. If you accept it, the required deposit can be paid or reported on the same private booking page; confirmation follows when the deposit is recorded. Email copies are optional.',
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
      <p style="margin:26px 0;text-align:center;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">Open your booking page</a></p>
      <p>This is an offer rather than a confirmed booking. If you accept it, the required deposit can be paid or reported on the same private booking page; confirmation follows when the deposit is recorded. Email copies are optional.</p>
      <p style="color:#65706b;font-size:13px;">This secure link is the continuing page for your booking. Save it and do not forward it.</p>
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
  const heading = accepted ? 'Your offer is accepted — deposit required' : 'We have recorded that you declined the offer';
  const nextStep = accepted
    ? 'Your offer has been accepted. Return to the secure booking page to choose a deposit payment method. The booking is confirmed after the required deposit is recorded.'
    : 'No further action is required. Please contact Olrig Bank if this was not your intention or you would like to discuss another stay.';
  const subject = accepted
    ? `Deposit required for your ${input.propertyName} booking`
    : `Your ${input.propertyName} booking offer was declined`;
  const totalLabel = accepted ? 'Accepted offer total' : 'Offer total';
  const linkInstruction = accepted
    ? 'Choose a deposit payment method using the secure link below:'
    : 'You can review the booking details using the same secure link:';
  const linkLabel = accepted ? 'Pay booking deposit' : 'Review booking details';
  const text = [
    `Dear ${input.offer.guestName},`,
    '',
    heading + '.',
    '',
    `${input.propertyName}`,
    `${formatDate(input.offer.arrival)} to ${formatDate(input.offer.departure)}`,
    `${totalLabel}: ${formatCurrency(input.offer.totalPence, input.offer.currency)}`,
    '',
    nextStep,
    '',
    linkInstruction,
    input.manageUrl,
    '',
    `Booking reference: ${input.offer.bookingReference}`,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
    <p style="margin-top:0;">Dear ${escapeHtml(input.offer.guestName)},</p>
    <h1 style="font-size:24px;">${escapeHtml(heading)}</h1>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.offer.arrival))} to ${escapeHtml(formatDate(input.offer.departure))}<br>${escapeHtml(totalLabel)}: ${escapeHtml(formatCurrency(input.offer.totalPence, input.offer.currency))}</p>
    <p>${escapeHtml(nextStep)}</p>
    <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">${escapeHtml(linkLabel)}</a></p>
    <p style="color:#65706b;font-size:13px;">This secure link is unique to your booking. Please do not forward it.</p>
    <p style="color:#65706b;font-size:13px;">Booking reference: ${escapeHtml(input.offer.bookingReference)}</p>
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
  const accepted = input.response === 'accepted';
  const subject = accepted
    ? `Offer accepted — payment required: ${input.offer.guestName} · ${input.propertyName}`
    : `Booking offer declined: ${input.offer.guestName} · ${input.propertyName}`;
  const text = [
    accepted
      ? `${input.offer.guestName} has accepted the offer. The booking is awaiting the required deposit.`
      : `${input.offer.guestName} has declined the booking offer.`,
    '',
    `${input.propertyName}`,
    `${formatDate(input.offer.arrival)} to ${formatDate(input.offer.departure)}`,
    `${input.offer.guests} guest${input.offer.guests === 1 ? '' : 's'}${input.offer.pets ? `, ${input.offer.pets} pet${input.offer.pets === 1 ? '' : 's'}` : ''}`,
    `${accepted ? 'Accepted offer total' : 'Offer total'}: ${formatCurrency(input.offer.totalPence, input.offer.currency)}`,
    `Booker email: ${input.offer.guestEmail || 'Not supplied'}`,
    `Booker telephone: ${input.offer.guestTelephone || 'None supplied'}`,
    `Booking request reference: ${input.offer.bookingReference}`,
    '',
    `Administrator review: ${input.adminUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
    <h1>${accepted ? 'Offer accepted — payment required' : 'Booking offer declined'}</h1>
    <p><strong>${escapeHtml(input.offer.guestName)}</strong> ${accepted ? 'has accepted the offer and the booking is awaiting the required deposit.' : 'has declined the booking offer.'}</p>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.offer.arrival))} to ${escapeHtml(formatDate(input.offer.departure))}<br>${input.offer.guests} guest${input.offer.guests === 1 ? '' : 's'}${input.offer.pets ? ` · ${input.offer.pets} pet${input.offer.pets === 1 ? '' : 's'}` : ''}<br>${accepted ? 'Accepted offer total' : 'Offer total'}: ${escapeHtml(formatCurrency(input.offer.totalPence, input.offer.currency))}</p>
    <p>Booker email: ${escapeHtml(input.offer.guestEmail || 'Not supplied')}<br>Booker telephone: ${escapeHtml(input.offer.guestTelephone || 'None supplied')}</p>
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
