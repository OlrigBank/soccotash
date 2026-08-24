import type { ProvisionalBookingRequest } from './repository.ts';
import { formatPartyComposition } from './party-composition.ts';
import type { PaymentStage } from './payment-lifecycle.ts';
import {
  BOOKING_TRANSITION_RULES,
  type NotificationTarget,
} from './lifecycle.ts';
import {
  getBookingManagementRecipients,
  sendEmail,
  type EmailSendResult,
  type OutgoingEmail,
} from '../email/sender.ts';

export type BookingLifecycleEmailEvent =
  | 'payment_reported'
  | 'payment_verified_booking_confirmed'
  | 'payment_report_rejected'
  | 'balance_payment_reported'
  | 'balance_payment_verified'
  | 'balance_payment_report_rejected'
  | 'booking_cancelled'
  | 'booking_cancelled_by_booker';

export type BookingLifecycleEmailOutcome =
  | {
      status: 'sent';
      target: NotificationTarget;
      recipient: string;
      bcc: string[];
      provider: EmailSendResult['provider'];
      messageId: string | null;
    }
  | {
      status: 'skipped';
      target: NotificationTarget;
      recipient: null;
      bcc: [];
      reason: string;
    }
  | {
      status: 'failed';
      target: NotificationTarget;
      recipient: string;
      bcc: string[];
      error: string;
    };

export type BookingLifecycleEmailInput = {
  event: BookingLifecycleEmailEvent;
  booking: ProvisionalBookingRequest;
  propertyName: string;
  manageUrl?: string;
  adminUrl?: string;
  reason?: string;
  paymentStage?: PaymentStage;
  paymentAmountPence?: number;
  paymentCurrency?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatCurrency(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
}

function paymentDetails(input: BookingLifecycleEmailInput): {
  label: string;
  labelTitle: string;
  amount: string;
} {
  const booking = input.booking;
  const stage = input.paymentStage
    || (Number(booking.balanceDuePence || 0) === 0 ? 'full_payment' : 'deposit');
  const currency = input.paymentCurrency || booking.latestOfferCurrency || booking.pricingCurrency || 'GBP';
  const amountPence = input.paymentAmountPence
    ?? (stage === 'balance' ? Number(booking.balanceDuePence || 0) : Number(booking.depositPence || 0));
  return {
    label: stage === 'balance' ? 'remaining balance' : stage === 'full_payment' ? 'full payment' : 'deposit',
    labelTitle: stage === 'balance' ? 'Remaining balance' : stage === 'full_payment' ? 'Full payment' : 'Deposit',
    amount: formatCurrency(amountPence, currency),
  };
}

export function getLifecycleEmailTargets(event: BookingLifecycleEmailEvent): NotificationTarget[] {
  if (event === 'booking_cancelled' || event === 'booking_cancelled_by_booker') {
    const actor = event === 'booking_cancelled_by_booker' ? 'booker' : 'administrator';
    return [...new Set(
      BOOKING_TRANSITION_RULES
        .filter((rule) => rule.action === 'cancel_booking' && rule.actor === actor)
        .flatMap((rule) => rule.emailNotificationTargets),
    )];
  }
  return [...new Set(
    BOOKING_TRANSITION_RULES
      .filter((rule) => rule.activityEvent === event)
      .flatMap((rule) => rule.emailNotificationTargets),
  )];
}

function bookingSummary(input: BookingLifecycleEmailInput): string[] {
  return [
    input.propertyName,
    `${formatDate(input.booking.arrival)} to ${formatDate(input.booking.departure)}`,
    `Booking reference: ${input.booking.reference}`,
  ];
}

function bookingSummaryHtml(input: BookingLifecycleEmailInput): string {
  return `<p><strong>${escapeHtml(input.propertyName)}</strong><br>${escapeHtml(formatDate(input.booking.arrival))} to ${escapeHtml(formatDate(input.booking.departure))}<br>Booking reference: ${escapeHtml(input.booking.reference)}</p>`;
}

function bookerEmail(
  input: BookingLifecycleEmailInput,
  heading: string,
  body: string,
  linkLabel: string,
): Pick<OutgoingEmail, 'subject' | 'text' | 'html'> {
  if (!input.manageUrl) throw new Error('BOOKER_MANAGE_URL_REQUIRED');
  const text = [
    `Dear ${input.booking.name},`,
    '',
    heading,
    '',
    body,
    '',
    ...bookingSummary(input),
    '',
    `${linkLabel}:`,
    input.manageUrl,
    '',
    'Olrig Bank',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4ef;color:#17323a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;"><div style="background:#fff;border:1px solid #ddd5c7;border-radius:16px;padding:28px;">
      <p style="margin-top:0;">Dear ${escapeHtml(input.booking.name)},</p>
      <h1 style="font-size:24px;">${escapeHtml(heading)}</h1>
      <p>${escapeHtml(body)}</p>
      ${bookingSummaryHtml(input)}
      <p style="margin:26px 0;"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;background:#9b5b36;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;">${escapeHtml(linkLabel)}</a></p>
      <p style="color:#65706b;font-size:13px;">This secure link is unique to your booking. Please do not forward it.</p>
      <p style="margin-bottom:0;">Olrig Bank</p>
    </div></div>
  </body></html>`;
  return { subject: heading, text, html };
}

function outgoingEmail(input: BookingLifecycleEmailInput): OutgoingEmail {
  const payment = paymentDetails(input);
  switch (input.event) {
    case 'payment_reported': {
      if (!input.adminUrl) throw new Error('ADMIN_BOOKING_URL_REQUIRED');
      const subject = `Payment reported: ${input.booking.name} · ${input.propertyName}`;
      const text = [
        `${input.booking.name} has reported sending the ${payment.label} of ${payment.amount} by manual bank transfer.`,
        '',
        'The booking is not confirmed. Verify the transfer against the Olrig Bank account.',
        '',
        ...bookingSummary(input),
        formatPartyComposition(input.booking),
        `Booker email: ${input.booking.email || 'Not supplied'}`,
        `Booker telephone: ${input.booking.telephone || 'None supplied'}`,
        '',
        `Verify the payment: ${input.adminUrl}`,
      ].join('\n');
      const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
        <h1>Payment reported — verification required</h1>
        <p><strong>${escapeHtml(input.booking.name)}</strong> has reported sending the ${escapeHtml(payment.label)} of <strong>${escapeHtml(payment.amount)}</strong> by manual bank transfer.</p>
        <p>The booking is not confirmed. Verify the transfer against the Olrig Bank account.</p>
        ${bookingSummaryHtml(input)}
        <p>Booker email: ${escapeHtml(input.booking.email || 'Not supplied')}<br>Booker telephone: ${escapeHtml(input.booking.telephone || 'None supplied')}</p>
        <p><a href="${escapeHtml(input.adminUrl)}">Verify the reported payment</a></p>
      </body></html>`;
      return { to: '', subject, text, html };
    }
    case 'payment_verified_booking_confirmed': {
      const heading = `Your ${input.propertyName} booking is confirmed`;
      return {
        to: '',
        ...bookerEmail(
          input,
          heading,
          `Olrig Bank has verified receipt of your ${payment.label} of ${payment.amount}. Your direct booking is now confirmed.`,
          'View confirmed booking',
        ),
      };
    }
    case 'payment_report_rejected': {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new Error('PAYMENT_REJECTION_REASON_REQUIRED');
      const heading = `Payment could not be verified for your ${input.propertyName} booking`;
      return {
        to: '',
        ...bookerEmail(
          input,
          heading,
          `Olrig Bank could not verify the reported bank transfer. Reason: ${reason} Please review the details in the booking conversation before reporting payment again.`,
          'Review payment details',
        ),
      };
    }
    case 'balance_payment_reported': {
      if (!input.adminUrl) throw new Error('ADMIN_BOOKING_URL_REQUIRED');
      const subject = `Balance reported: ${input.booking.name} · ${input.propertyName}`;
      const text = [
        `${input.booking.name} has reported sending the ${payment.label} of ${payment.amount} by manual bank transfer.`,
        '',
        'The booking remains confirmed while the transfer is verified.',
        '',
        ...bookingSummary(input),
        '',
        `Verify the balance payment: ${input.adminUrl}`,
      ].join('\n');
      const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
        <h1>Balance reported — verification required</h1>
        <p><strong>${escapeHtml(input.booking.name)}</strong> has reported sending the remaining balance of <strong>${escapeHtml(payment.amount)}</strong> by manual bank transfer.</p>
        <p>The booking remains confirmed while the transfer is verified.</p>
        ${bookingSummaryHtml(input)}
        <p><a href="${escapeHtml(input.adminUrl)}">Verify the reported balance</a></p>
      </body></html>`;
      return { to: '', subject, text, html };
    }
    case 'balance_payment_verified': {
      const heading = `Your ${input.propertyName} booking is fully paid`;
      return {
        to: '',
        ...bookerEmail(
          input,
          heading,
          `Olrig Bank has verified receipt of your remaining balance of ${payment.amount}. Your booking is confirmed and fully paid.`,
          'View confirmed booking',
        ),
      };
    }
    case 'balance_payment_report_rejected': {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new Error('PAYMENT_REJECTION_REASON_REQUIRED');
      const heading = `Balance payment could not be verified for your ${input.propertyName} booking`;
      return {
        to: '',
        ...bookerEmail(
          input,
          heading,
          `Olrig Bank could not verify the reported remaining-balance transfer. Reason: ${reason} Your booking remains confirmed, and you can report the balance again after reviewing the details.`,
          'Review payment details',
        ),
      };
    }
    case 'booking_cancelled': {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new Error('BOOKING_CANCELLATION_REASON_REQUIRED');
      const heading = `Your ${input.propertyName} booking has been cancelled`;
      return {
        to: '',
        ...bookerEmail(
          input,
          heading,
          `Olrig Bank has cancelled this booking. Reason: ${reason} The booking is no longer active, and the private conversation remains available as the permanent record.`,
          'View booking record',
        ),
      };
    }
    case 'booking_cancelled_by_booker': {
      const reason = String(input.reason || '').trim();
      if (!reason) throw new Error('BOOKING_CANCELLATION_REASON_REQUIRED');
      if (!input.adminUrl) throw new Error('ADMIN_BOOKING_URL_REQUIRED');
      const subject = `Booking cancelled by Booker: ${input.booking.name} · ${input.propertyName}`;
      const text = [
        `${input.booking.name} has cancelled this booking.`,
        '',
        `Reason: ${reason}`,
        '',
        ...bookingSummary(input),
        '',
        `Review the booking record: ${input.adminUrl}`,
      ].join('\n');
      const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#17323a;">
        <h1>Booking cancelled by Booker</h1>
        <p><strong>${escapeHtml(input.booking.name)}</strong> has cancelled this booking.</p>
        <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
        ${bookingSummaryHtml(input)}
        <p><a href="${escapeHtml(input.adminUrl)}">Review the booking record</a></p>
      </body></html>`;
      return { to: '', subject, text, html };
    }
  }
}

export async function deliverBookingLifecycleEmail(
  input: BookingLifecycleEmailInput,
): Promise<BookingLifecycleEmailOutcome> {
  const targets = getLifecycleEmailTargets(input.event);
  if (targets.length !== 1) {
    throw new Error(`LIFECYCLE_EMAIL_TARGET_INVALID:${input.event}:${targets.join(',')}`);
  }
  const target = targets[0];
  const recipients = target === 'administrator'
    ? getBookingManagementRecipients()
    : [input.booking.email.trim()].filter(Boolean);
  if (!recipients.length) {
    return {
      status: 'skipped',
      target,
      recipient: null,
      bcc: [],
      reason: target === 'administrator'
        ? 'No administrator notification recipient is configured.'
        : 'No Booker email address is saved.',
    };
  }

  const recipient = recipients[0];
  const bcc = target === 'administrator' ? recipients.slice(1) : [];
  try {
    const message = outgoingEmail(input);
    const sent = await sendEmail({ ...message, to: recipient, bcc });
    return {
      status: 'sent',
      target,
      recipient,
      bcc,
      provider: sent.provider,
      messageId: sent.messageId,
    };
  } catch (error) {
    return {
      status: 'failed',
      target,
      recipient,
      bcc,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
