# Olrig Bank administration foundation

The administration area is part of the existing Astro server application and uses the existing PostgreSQL database.

## Routes

- `/admin/login/` — administrator sign-in
- `/admin/` — dashboard
- `/admin/content/` — links to the configured sections of hosted Pages CMS
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

## Phase 1 scope

The dashboard is operational and reports pending provisional bookings and calendar-sync status. The Website content page links to the hosted Pages CMS repository and its General pages, Listings, Spaces, Local guide, Site settings, Contact details, Navigation and Images sections. Listings, Calendars, Pricing, Bookings and Settings remain protected operational pages ready for their later implementation phases.

## Reverse-proxy origin handling

The Render web service terminates HTTPS before forwarding requests to the Astro
Node server. `site/astro.config.mjs` therefore lists the public Olrig Bank
hostnames and dynamically adds Render's `RENDER_EXTERNAL_HOSTNAME` to Astro's
`security.allowedDomains` setting.

This allows Astro to trust the matching `X-Forwarded-Host` header and reconstruct
the public request URL correctly while retaining `security.checkOrigin: true`.
Without this setting, login form submissions on Render can be rejected with:

```text
Cross-site POST form submissions are forbidden
```

After changing the service hostname or adding another custom domain, add the new
hostname to `security.allowedDomains` and redeploy the service.
