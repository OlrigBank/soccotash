import type { ProvisionalBookingRequest } from './repository';
import {
  getBookingManagementRecipients,
  sendEmail,
  type EmailSendResult,
  type OutgoingEmail,
} from '../email/sender.ts';

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

function paymentDetails(booking: ProvisionalBookingRequest): {
  amount: string;
  currency: string;
  label: 'deposit' | 'full payment';
} {
  const currency = booking.latestOfferCurrency || booking.pricingCurrency || 'GBP';
  return {
    amount: formatCurrency(booking.depositPence || 0, currency),
    currency,
    label: (booking.balanceDuePence || 0) > 0 ? 'deposit' : 'full payment',
  };
}

function bookingSummary(
  booking: ProvisionalBookingRequest,
  propertyName: string,
): string[] {
  return [
    propertyName,
    `${formatDate(booking.arrival)} to ${formatDate(booking.departure)}`,
    `${booking.guests} guest${booking.guests === 1 ? '' : 's'}${booking.pets ? `, ${booking.pets} pet${booking.pets === 1 ? '' : 's'}` : ''}`,
    `Booking reference: ${booking.reference}`,
  ];
}

export function buildAdministratorPaymentReportedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  adminUrl: string;
}): OutgoingEmail {
  const recipients = getBookingManagementRecipients();
  if (!recipients.length) throw new Error('No booking-management email recipient is configured.');
  const payment = paymentDetails(input.booking);
  const subject = `Payment reported — verification required: ${input.booking.name} · ${input.propertyName}`;
  const text = [
    `${input.booking.name} has reported sending the ${payment.label} of ${payment.amount} by manual bank transfer.`,
    '',
    'This is a Booker declaration, not proof of receipt. Check the Olrig Bank account before confirming the booking.',
    '',
    ...bookingSummary(input.booking, input.propertyName),
    `Booker email: ${input.booking.email || 'Not supplied'}`,
    `Booker telephone: ${input.booking.telephone || 'None supplied'}`,
    '',
    `Verify or reject the payment report: ${input.adminUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
    <h1>Payment reported — verification required</h1>
    <p><strong>${escapeHtml(input.booking.name)}</strong> has reported sending the ${escapeHtml(payment.label)} of <strong>${escapeHtml(payment.amount)}</strong> by manual bank transfer.</p>
    <p>This is a Booker declaration, not proof of receipt. Check the Olrig Bank account before confirming the booking.</p>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}<br>${input.booking.guests} guest${input.booking.guests === 1 ? '' : 's'}${input.booking.pets ? ` · ${input.booking.pets} pet${input.booking.pets === 1 ? '' : 's'}` : ''}</p>
    <p>Booker email: ${escapeHtml(input.booking.email || 'Not supplied')}<br>Booker telephone: ${escapeHtml(input.booking.telephone || 'None supplied')}</p>
    <p><a href="${escapeHtml(input.adminUrl)}">Verify or reject the payment report</a></p>
    <p>Booking reference: ${escapeHtml(input.booking.reference)}</p>
  </body></html>`;
  return {
    to: recipients[0],
    bcc: recipients.slice(1),
    subject,
    text,
    html,
  };
}

export function buildBookerPaymentVerifiedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  manageUrl: string;
}): OutgoingEmail {
  const payment = paymentDetails(input.booking);
  const subject = `Booking confirmed: ${input.propertyName} · ${formatDate(input.booking.arrival)}`;
  const text = [
    `Dear ${input.booking.name},`,
    '',
    `Olrig Bank has verified your ${payment.label} of ${payment.amount}. Your direct booking is now confirmed.`,
    '',
    ...bookingSummary(input.booking, input.propertyName),
    '',
    `Open your secure booking page: ${input.manageUrl}`,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
      <p style="margin-top:0;">Dear ${escapeHtml(input.booking.name)},</p>
      <h1 style="font-size:24px;">Your booking is confirmed</h1>
      <p>Olrig Bank has verified your ${escapeHtml(payment.label)} of <strong>${escapeHtml(payment.amount)}</strong>.</p>
      <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}</p>
      <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">Open your booking</a></p>
      <p style="color:#65706b;font-size:13px;">This secure link is unique to your booking. Please do not forward it.</p>
      <p style="color:#65706b;font-size:13px;">Booking reference: ${escapeHtml(input.booking.reference)}</p>
      <p style="margin-bottom:0;">Olrig Bank</p>
    </div></div>
  </body></html>`;
  return { to: input.booking.email, subject, text, html };
}

export function buildBookerPaymentRejectedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  reason: string;
  manageUrl: string;
}): OutgoingEmail {
  const payment = paymentDetails(input.booking);
  const subject = `Action required: bank transfer could not be verified · ${input.propertyName}`;
  const text = [
    `Dear ${input.booking.name},`,
    '',
    `Olrig Bank could not verify the reported ${payment.label} of ${payment.amount}.`,
    `Reason: ${input.reason}`,
    '',
    'Your booking has returned to payment required. Review the details and contact Olrig Bank in the private conversation before reporting payment again.',
    '',
    ...bookingSummary(input.booking, input.propertyName),
    '',
    `Open your secure booking page: ${input.manageUrl}`,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
      <p style="margin-top:0;">Dear ${escapeHtml(input.booking.name)},</p>
      <h1 style="font-size:24px;">Bank transfer could not be verified</h1>
      <p>Olrig Bank could not verify the reported ${escapeHtml(payment.label)} of <strong>${escapeHtml(payment.amount)}</strong>.</p>
      <div style="white-space:pre-wrap;background:#f5f6f1;border-radius:12px;padding:18px;margin:20px 0;"><strong>Reason:</strong> ${escapeHtml(input.reason)}</div>
      <p>Your booking has returned to payment required. Review the details and contact Olrig Bank in the private conversation before reporting payment again.</p>
      <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}</p>
      <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">Open your booking</a></p>
      <p style="color:#65706b;font-size:13px;">This secure link is unique to your booking. Please do not forward it.</p>
      <p style="color:#65706b;font-size:13px;">Booking reference: ${escapeHtml(input.booking.reference)}</p>
      <p style="margin-bottom:0;">Olrig Bank</p>
    </div></div>
  </body></html>`;
  return { to: input.booking.email, subject, text, html };
}

export async function sendAdministratorPaymentReportedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  adminUrl: string;
}): Promise<EmailSendResult> {
  return sendEmail(buildAdministratorPaymentReportedEmail(input));
}

export async function sendBookerPaymentVerifiedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  manageUrl: string;
}): Promise<EmailSendResult> {
  return sendEmail(buildBookerPaymentVerifiedEmail(input));
}

export async function sendBookerPaymentRejectedEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  reason: string;
  manageUrl: string;
}): Promise<EmailSendResult> {
  return sendEmail(buildBookerPaymentRejectedEmail(input));
}
