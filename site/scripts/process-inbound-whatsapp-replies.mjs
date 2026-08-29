const baseUrl = process.env.BOOKING_SERVICE_URL;
const token = process.env.CALENDAR_SYNC_TOKEN;
if (!baseUrl || !token) throw new Error('BOOKING_SERVICE_URL and CALENDAR_SYNC_TOKEN are required.');

const response = await fetch(new URL('/api/admin/process-inbound-whatsapp-replies/', baseUrl), {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: '{}',
});
if (!response.ok) throw new Error(`Inbound WhatsApp reply processing failed: ${response.status} ${await response.text()}`);
console.log(JSON.stringify(await response.json(), null, 2));
