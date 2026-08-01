export const WHATSAPP_TEMPLATE_VERSION = 'v1';

export const whatsappEventSummaries = {
  booking_request_received: 'Your booking request has been received.',
  booking_offer_available: 'Your booking offer is ready to review.',
  payment_required: 'Payment details are ready on your private booking page.',
  offer_declined: 'Your booking offer has been declined. Your private booking page remains the record.',
  payment_verified_booking_confirmed: 'Your payment was verified and your booking is confirmed.',
  payment_report_rejected: 'Your reported payment could not be verified. Please review the details.',
  balance_payment_verified: 'Your remaining balance was verified.',
  balance_payment_report_rejected: 'Your reported remaining-balance payment could not be verified.',
  booking_cancelled: 'Your booking has been cancelled. View your private booking record for details.',
  booking_message_available: 'There is a new message on your private booking page.',
  booking_changed: 'There is an update to your booking.',
  secure_link_changed: 'The secure link for your booking has changed.',
} as const;

export type WhatsAppNotificationEvent = keyof typeof whatsappEventSummaries;

export function isWhatsAppNotificationEvent(value: string): value is WhatsAppNotificationEvent {
  return value in whatsappEventSummaries;
}

export function getWhatsAppTemplate(event: WhatsAppNotificationEvent) {
  const environmentKey = `WHATSAPP_TEMPLATE_${event.toUpperCase()}`;
  return {
    name: process.env[environmentKey] || process.env.WHATSAPP_TEMPLATE_BOOKING_UPDATE || 'olrig_booking_update_v1',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_GB',
    version: WHATSAPP_TEMPLATE_VERSION,
  };
}

export function whatsappTemplateParameters(input: {
  event: WhatsAppNotificationEvent;
  guestName: string;
  propertyName: string;
  manageUrl: string;
}) {
  return [input.guestName, whatsappEventSummaries[input.event], input.propertyName, input.manageUrl];
}
