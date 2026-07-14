const baseUrl = process.env.BOOKING_SERVICE_URL;
const token = process.env.CALENDAR_SYNC_TOKEN;
if (!baseUrl || !token) throw new Error('BOOKING_SERVICE_URL and CALENDAR_SYNC_TOKEN are required.');

const response = await fetch(new URL('/api/admin/sync-calendars/', baseUrl), {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: '{}',
});
if (!response.ok) throw new Error(`Calendar sync failed: ${response.status} ${await response.text()}`);
const body = await response.json();
console.log(JSON.stringify(body, null, 2));
if (Array.isArray(body.results) && body.results.some((result) => result.ok === false)) {
  process.exitCode = 1;
}
