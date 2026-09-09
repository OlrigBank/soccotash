# Render Soccotash test deployment

## Target and deployment boundary

Use the existing **soccotash** Docker web service at
`https://soccotash.onrender.com`. The repository configuration is
[`render-development.yaml`](../render-development.yaml), with root directory
`site`, port `8080`, health check `/api/health/` and a separate
`soccotash-development-bookings` database. Confirm the service uses the development
database before testing. `render.yaml` targets the production `olrigbankweb`
service and is not the test Blueprint.

The application runs Astro's standalone Node server. Container startup waits for
PostgreSQL, runs unapplied migrations, then starts the server. Automatic deployment
is disabled in both repository Blueprints. Pushing a branch or opening a PR does
not constitute deployment approval; confirm the actual service settings before
an authorised manual deployment.

## E11-F03 contact verification setup

The feature is recorded in
[E11-F03](features/completed/e11-f03-verify-bookers-and-private-accounts.md).
Before the authorised test deployment, configure the existing service's environment:

| Setting | Test requirement |
| --- | --- |
| `BOOKER_VERIFICATION_SECRET` | A separate, stable, randomly generated secret of at least 32 characters. Keep it in Render's environment settings. |
| `EMAIL_PROVIDER` | `resend`, as declared in the test Blueprint. |
| `RESEND_API_KEY` | A working key for the configured sender. |
| `BOOKING_EMAIL_FROM` | A sender permitted by the email provider. |
| `BOOKING_PUBLIC_URL` | `https://soccotash.onrender.com` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Required for SMS tests; email can be tested without these. Configure the Verify service for six-digit codes. |

Existing services need their environment settings checked explicitly; declaring
`sync: false` does not populate missing secrets on a Blueprint update. Keep the
verification secret stable across restarts. Never put secrets, received codes or
session-cookie values in the PR, logs or screenshots.

Review `BOOKING_ADMIN_EMAIL` and `BOOKING_EMAIL_BCC` before submitting test bookings:
ordinary booking notifications may use these recipients. Verification emails
bypass the booking BCC. Keep `WHATSAPP_DELIVERY_ENABLED=false` for this test.
Use owner-controlled test email addresses and mobile numbers, never customer
contacts. Real provider delivery is the remaining acceptance check; the local
suite uses a non-forwarding email sink and a simulated SMS provider.

## Authorised deployment and acceptance

1. Select the approved feature commit, or merge the approved PR into `development`
   and deploy that commit. Record the deployed SHA. Confirm the service and
   development database above; do not deploy the production service.
2. Check startup logs for successful migrations `059_booker_accounts.sql` and
   `060_booker_claim_telephone_fallback.sql`, then check `/api/health/` returns 200.
3. In a fresh browser session, open `/book/`, choose available dates and enter an
   owner-controlled email in the contact step. Leave the contact fields and check
   that a six-digit email code arrives. Review must remain blocked until verified.
4. Enter an incorrect code and check the error; then enter the correct code and
   proceed to review. Submit a clearly labelled test booking and confirm that the
   private page opens. Changing the contact before submission must require a
   matching verification again.
5. Return through the header's **Your bookings** icon without re-entering a code.
   Log out and sign in again with a new code. In a different signed-out browser,
   opening the private URL must not reveal the booking.
6. With SMS configured, repeat using only an owner-controlled mobile number.
   With both contacts entered, confirm email is preferred and SMS can be selected.
   Test resend after 60 seconds; sends are limited to five per destination and
   twenty per IP per hour. Codes expire after ten minutes and allow five attempts.
7. Submit a second test booking for the same verified identity and check the
   booking selector. If testing legacy claims, use an explicitly prepared test
   record: verification should attach matching unclaimed bookings without
   granting access to a different contact's records.
8. Check phone, tablet and desktop layouts, keyboard focus, browser console and
   failed network requests. Inspect cookie attribute names only: session cookies
   must be HttpOnly, Secure and SameSite=Lax on Render. Do not record their values.
9. Record the SHA, channels tested, delivery outcome and any errors in the feature
   record. Cancel test bookings through the authorised admin workflow when done;
   do not delete unrelated data.

Old bearer links no longer grant booking access. Migration does not send messages
or pre-verify existing contacts. Do not roll back to old bearer-link application
code against the migrated database, because it would restore the old access
semantics. Investigate and correct failures on the test service before production
acceptance.

## Local regression checks

```bash
npm --prefix site run check
npm --prefix site run build
npm run test:booker-accounts
```

The account browser suite requires a disposable local PostgreSQL database. Its
server rejects non-local database hosts and redirects email to a loopback sink;
it is not a script for exercising Render or sending live SMS.
