const baseUrl = process.env.BOOKING_SERVICE_URL;
const token = process.env.CALENDAR_SYNC_TOKEN;
if (!baseUrl || !token) throw new Error('BOOKING_SERVICE_URL and CALENDAR_SYNC_TOKEN are required.');

const response = await fetch(new URL('/api/admin/booking-report/', baseUrl), {
  headers: { authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`Booking report failed: ${response.status} ${await response.text()}`);
console.log(JSON.stringify(await response.json(), null, 2));
