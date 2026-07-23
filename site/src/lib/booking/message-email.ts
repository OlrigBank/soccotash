import type { ProvisionalBookingRequest } from './repository';
import { getBookingManagementRecipients, sendEmail, type EmailSendResult } from '../email/sender';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export async function sendBookerMessageEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  senderName: string;
  body: string;
  manageUrl: string;
}): Promise<EmailSendResult> {
  const subject = `New message from ${input.senderName} about your ${input.propertyName} booking`;
  const text = [
    `Dear ${input.booking.name},`,
    '',
    `${input.senderName} sent you a message about your Olrig Bank booking:`,
    '',
    input.body,
    '',
    `${input.propertyName}`,
    `${formatDate(input.booking.arrival)} to ${formatDate(input.booking.departure)}`,
    '',
    'Reply in the private booking conversation:',
    input.manageUrl,
    '',
    `Booking reference: ${input.booking.reference}`,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
      <p style="margin-top:0;">Dear ${escapeHtml(input.booking.name)},</p>
      <h1 style="font-size:24px;">New booking message</h1>
      <p><strong>${escapeHtml(input.senderName)}</strong> sent you a message:</p>
      <div style="white-space:pre-wrap;background:#f5f6f1;border-radius:12px;padding:18px;margin:20px 0;">${escapeHtml(input.body)}</div>
      <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}</p>
      <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">Open booking conversation</a></p>
      <p style="color:#65706b;font-size:13px;">This secure link is unique to your booking. Please do not forward it.</p>
      <p style="color:#65706b;font-size:13px;">Booking reference: ${escapeHtml(input.booking.reference)}</p>
      <p style="margin-bottom:0;">Olrig Bank</p>
    </div></div></body></html>`;
  return sendEmail({ to: input.booking.email, subject, text, html });
}

export async function sendAdministratorMessageEmail(input: {
  booking: ProvisionalBookingRequest;
  propertyName: string;
  body: string;
  adminUrl: string;
}): Promise<{ result: EmailSendResult; primaryRecipient: string } | null> {
  const recipients = getBookingManagementRecipients();
  if (!recipients.length) return null;
  const subject = `New Booker message: ${input.booking.name} · ${input.propertyName}`;
  const text = [
    `${input.booking.name} sent a new message in the booking conversation:`,
    '',
    input.body,
    '',
    `${input.propertyName}`,
    `${formatDate(input.booking.arrival)} to ${formatDate(input.booking.departure)}`,
    `${input.booking.guests} guest${input.booking.guests === 1 ? '' : 's'}${input.booking.pets ? `, ${input.booking.pets} pet${input.booking.pets === 1 ? '' : 's'}` : ''}`,
    `Booker email: ${input.booking.email || 'Not supplied'}`,
    `Booker telephone: ${input.booking.telephone || 'None supplied'}`,
    `Booking reference: ${input.booking.reference}`,
    '',
    `Open the conversation: ${input.adminUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
    <h1>New Booker message</h1>
    <p><strong>${escapeHtml(input.booking.name)}</strong> sent a new message:</p>
    <div style="white-space:pre-wrap;background:#f5f6f1;border-radius:12px;padding:18px;margin:20px 0;">${escapeHtml(input.body)}</div>
    <p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}<br>${input.booking.guests} guest${input.booking.guests === 1 ? '' : 's'}${input.booking.pets ? ` · ${input.booking.pets} pet${input.booking.pets === 1 ? '' : 's'}` : ''}</p>
    <p>Booker email: ${escapeHtml(input.booking.email || 'Not supplied')}<br>Booker telephone: ${escapeHtml(input.booking.telephone || 'None supplied')}</p>
    <p><a href="${escapeHtml(input.adminUrl)}">Open the booking conversation</a></p>
    <p>Booking reference: ${escapeHtml(input.booking.reference)}</p>
  </body></html>`;
  const result = await sendEmail({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject,
    text,
    html,
  });
  return { result, primaryRecipient: recipients[0] };
}
