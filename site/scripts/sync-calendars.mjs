const baseUrl = process.env.BOOKING_SERVICE_URL;
const token = process.env.CALENDAR_SYNC_TOKEN;
if (!baseUrl || !token) throw new Error('BOOKING_SERVICE_URL and CALENDAR_SYNC_TOKEN are required.');
const response = await fetch(new URL('/api/admin/sync-calendars', baseUrl), {
  method: 'POST', headers: { authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`Calendar sync failed: ${response.status} ${await response.text()}`);
console.log(await response.text());
