const port = process.env.PORT || '8080';
const response = await fetch(`http://127.0.0.1:${port}/api/health/`, {
  signal: AbortSignal.timeout(4000),
});
if (!response.ok) process.exit(1);
const body = await response.json();
if (body.status !== 'ok' || body.database !== 'ok') process.exit(1);
