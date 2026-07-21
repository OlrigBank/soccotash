# Olrig Bank administration foundation

The administration area is part of the existing Astro server application and uses the existing PostgreSQL database.

## Routes

- `/admin/login/` — administrator sign-in
- `/admin/` — dashboard
- `/admin/listings/`
- `/admin/calendars/`
- `/admin/pricing/`
- `/admin/bookings/`
- `/admin/settings/`

All administration pages and `/api/admin/*` routes are protected by server-side middleware. The existing calendar synchronisation endpoint continues to accept its `CALENDAR_SYNC_TOKEN` bearer token.

## Database migration

Migration `site/db/003_admin_foundation.sql` creates:

- `admin_users`
- `admin_sessions`
- `admin_audit_log`

Migrations run automatically when the site container starts.

## Create or reset an administrator

Start the normal Docker services first:

```bash
npm run docker:up
```

Then create the administrator, replacing the sample values:

```bash
docker compose run --rm \
  -e ADMIN_PASSWORD='replace-with-a-long-unique-password' \
  site npm run admin:create -- admin@example.com 'Administrator'
```

The password must contain at least 12 characters. Running the command again for the same email address resets that account's password and re-enables it.

For a directly configured local environment, the equivalent command is:

```bash
cd site
DATABASE_URL='postgresql://...' \
DATABASE_SSL=false \
ADMIN_PASSWORD='replace-with-a-long-unique-password' \
npm run admin:create -- admin@example.com 'Administrator'
```

## Session behaviour

- Sessions are stored in PostgreSQL.
- The browser receives only a random session token.
- The database stores a SHA-256 hash of that token.
- Cookies are HTTP-only and SameSite=Lax.
- Production cookies are Secure.
- Sessions expire after seven days.
- Passwords use Node's scrypt password derivation with a random salt.

## Current scope

The dashboard reports pending provisional bookings, calendar-sync status, and pricing-plan count. The Pricing section now contains the first functional pricing-rule builder and deterministic simulator. Listings, Calendars, Bookings and Settings remain protected placeholders for later implementation phases. See `docs/pricing-foundation.md`.

## Reverse-proxy and local Docker origin handling

The Render web service terminates HTTPS before forwarding requests to the Astro
Node server. Local Docker can also be reached through `localhost`, a LAN address,
or another local reverse proxy. These arrangements can make Astro's internal
request URL differ from the origin visible in the customer's browser.

`site/astro.config.mjs` retains `security.allowedDomains` so Astro can reconstruct
public URLs from Render's trusted `X-Forwarded-Host` header. Astro's built-in
`security.checkOrigin` is disabled because it can reject valid POST requests
before application code runs when the external and internal origins differ.

Every browser-facing route that changes data instead calls the application's
`isSameOrigin()` guard. The guard compares the browser's `Origin` header with:

- the direct request URL and `Host` header used by local Docker;
- the public `X-Forwarded-Host`, protocol and port supplied by a reverse proxy;
- the configured Render and booking public URLs.

Cross-site browser requests are still rejected. The calendar synchronisation
endpoint remains protected separately by its bearer token.

After changing the Render service hostname or adding another custom domain, add
the new hostname to `security.allowedDomains` and redeploy the service so Astro
continues to construct public URLs correctly.
