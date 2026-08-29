import crypto from 'node:crypto';

export function getWhatsAppConfiguration() {
  const provider = String(process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  const deliveryEnabled = String(process.env.WHATSAPP_DELIVERY_ENABLED || '').trim().toLowerCase() === 'true';
  const configured = deliveryEnabled && provider === 'meta' && Boolean(accessToken && phoneNumberId && /^v\d+\.\d+$/.test(graphVersion));
  return { provider: provider === 'meta' ? 'meta' as const : null, accessToken, phoneNumberId, graphVersion, deliveryEnabled, configured };
}

export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  language: string;
  parameters: string[];
}): Promise<{ provider: 'meta'; messageId: string }> {
  const configuration = getWhatsAppConfiguration();
  if (!configuration.configured || !configuration.provider) throw new Error('WHATSAPP_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${configuration.graphVersion}/${configuration.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${configuration.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: [{ type: 'body', parameters: input.parameters.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { code?: number; error_subcode?: number } };
  const messageId = payload.messages?.[0]?.id;
  if (!response.ok || !messageId) {
    const code = payload.error?.error_subcode || payload.error?.code || response.status;
    throw new Error(`WHATSAPP_PROVIDER_REJECTED:${code}`);
  }
  return { provider: 'meta', messageId };
}

export function verifyWhatsAppSignature(rawBody: string | Uint8Array, signature: string | null, appSecret = process.env.WHATSAPP_APP_SECRET || ''): boolean {
  if (!appSecret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const supplied = Buffer.from(signature);
  const actual = Buffer.from(expected);
  return supplied.length === actual.length && crypto.timingSafeEqual(supplied, actual);
}
