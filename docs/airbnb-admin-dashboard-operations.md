# Airbnb Administration Dashboard — Operating Notes

## Purpose and access

The Airbnb administration area provides a private, read-focused view of the
historical Airbnb exports imported by E06. It is available to authenticated
administrators at `/admin/airbnb/`; it is not part of the public website.

Admin pages and APIs require the existing database-backed administrator
session. Responses are marked `private, no-store` and excluded from indexing by
both HTML metadata and HTTP headers. Do not copy guest messages, private
feedback, host notes, financial details or source paths into public content.

## Using the dashboard

- **Reservations** filters by guest/listing text, property, source status,
  arrival date and review-link status. Lists deliberately omit conversations,
  notes and financial detail; open a reservation to see those sections.
- **Reviews** filters by reviewer/listing text, property, rating, publication
  date and reservation-link status. Lists deliberately omit review and private
  feedback text; open a review to see it.
- **Reconciliation** shows ambiguous proposed links. Compare the review and
  reservation evidence, open both complete records when needed, and then
  confirm or reject. A decision is audited and cannot be replayed.
- Browser Back, the provided return link, and pagination preserve validated
  list filters. Unknown or malformed filter values safely fall back to defaults.

## Sensitive-data boundary

The dashboard never decrypts or displays imported access-code material. This
is intentional: E07 only exposes whether an encrypted code was captured. Raw
PDF extraction payloads and encryption keys are also excluded from dashboard
service result types and rendered output.

If an operational need for access-code reveal arises, treat it as a separate
security feature requiring explicit authorization, audited access, time-limited
display and its own threat review. Do not add it to a list or detail query as an
incidental field.

## Reconciliation safety

Confirm only when the property and stay dates agree and the displayed identity
evidence supports the match. Reject when the candidate is known to be wrong.
If another administrator has already decided a candidate, the page reports a
conflict; reload instead of repeating the request. Neither action alters the
source review or reservation.

## Release verification

Before merging the feature branch, run the E06 import verifier against the
intended database, the PostgreSQL integration suite, review tests, booking
lifecycle tests, Astro checks and a production build. Verify the rendered admin
screens at phone, tablet and desktop widths while signed in, and verify an
anonymous request is redirected (or receives `401` for an admin API).

The feature branch must remain separate from `development` until the merge is
explicitly authorized.
