# Controlled production acceptance checklist

Use this checklist for Priority 1 evidence that cannot be gathered by the
read-only runner. Create a dated copy for each full acceptance cycle. Never
commit private booking links, access tokens, email addresses, telephone
numbers, API keys, database credentials, or unredacted dashboard screenshots.

## Test record

- Date and time:
- Tester:
- Production release or commit:
- Production service:
- Production database:
- Development service:
- Development database:
- Evidence location:
- Related GitHub issues:

## 1. Read-only automated baseline

- [ ] Run `node tests/production-acceptance/run.mjs --json <evidence-file>`.
- [ ] All enabled checks pass.
- [ ] Record failures as GitHub issues before continuing.

Result and notes:

## 2. Production/development isolation

- [ ] Confirm production and development use different Render web services.
- [ ] Confirm each service has its own `DATABASE_URL` binding.
- [ ] Record the database name and user returned from a controlled query in
      each environment.
- [ ] Create a uniquely named marker in development only.
- [ ] Confirm the marker is present in development.
- [ ] Confirm the marker is absent from production.
- [ ] Remove the development marker.

Result and notes:

## 3. Booking-management journey

Use a clearly labelled test Booker and dates that cannot be mistaken for a
real reservation.

- [ ] Preview availability and pricing without submitting.
- [ ] Create one controlled provisional booking.
- [ ] Open the Booker management link.
- [ ] Open the booking in administration.
- [ ] Amend permitted booking details and verify the Booker view.
- [ ] Send a test administrator message and verify the Booker view.
- [ ] Send a test Booker reply and verify the administrator view.
- [ ] Issue an offer and verify the intended email delivery.
- [ ] Accept or decline according to the cycle’s test plan.
- [ ] Verify the resulting booking status and calendar effect.
- [ ] Remove or clearly retain the test record according to the data policy.

Store only redacted identifiers and screenshots.

Result and notes:

## 4. Backup and restore drill

- [ ] Create a fresh production backup using the documented command.
- [ ] Record tool versions, time, encrypted storage location, and checksum.
- [ ] Restore into an isolated, disposable database—not production.
- [ ] Run schema and representative row-count checks.
- [ ] Run the application health/migration check against the restored copy.
- [ ] Destroy the disposable database after evidence is retained.
- [ ] Record recovery time and any manual dependencies.

Result and notes:

## 5. Render protection and outage detection

- [ ] Confirm `/api/health/` is the configured Render health check.
- [ ] Confirm the latest deploy and service restart completed cleanly.
- [ ] Confirm the service recovers from a controlled restart.
- [ ] Confirm outage/failure notifications have a named recipient.
- [ ] Test the notification path without creating a public outage.
- [ ] Review production logs for recurring errors and warnings.
- [ ] Create a GitHub issue for every unresolved recurring error.

Result and notes:

## 6. Recovery dependencies

Confirm the recovery runbook names the owner, access method, second-factor
recovery route, billing dependency, and recovery action for:

- [ ] Hosting.nl (authoritative DNS for `olrig-bank.com`)
- [ ] Render
- [ ] GitHub
- [ ] Umami
- [ ] Resend
- [ ] payment providers
- [ ] Airbnb calendar exports

Do not place passwords, recovery codes, API keys, or full credentials in the
repository.

Result and notes:

## Sign-off

- [ ] Every failure has a GitHub issue.
- [ ] Blocking failures are resolved and retested.
- [ ] Evidence is redacted and stored in the agreed durable location.
- [ ] Priority 1 acceptance status is updated.

Signed:

Date:
