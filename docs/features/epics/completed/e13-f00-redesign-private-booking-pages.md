# E13 — Redesign private booking pages

## Status

Completed and closed with owner approval on 9 September 2026. All three planned
features are accepted and closed; no implementation work remains in this epic.

- [E13-F01](../../completed/e13-f01-private-header-and-navigation.md): private header
  and navigation, implementation commit `1300d76`.
- [E13-F02](../../completed/e13-f02-reservation-entry.md): direct Reservation entry,
  implementation commit `4663e09`.
- [E13-F03](../../completed/e13-f03-pet-details.md): pet-only customer editing,
  implementation commit `f16686f`.

Feature records retain verification evidence and limitations, including the existing
narrow-screen administration drawer overlap. Acceptance closes the epic without
claiming a merge or deployment; neither has been performed as part of this work.

## Summary

Continue [E11-F03](../../completed/e11-f03-verify-bookers-and-private-accounts.md)
by simplifying the private stay area around authenticated account access.
E11 remains closed. Open Reservation immediately, remove the redundant individual
booking overview and link-saving panel, and simplify navigation. Preserve existing
reservation, payment, messaging and holiday-planning workflows.

## Feature sequence

### E13-F01 — Private header and navigation

- Show only the Olrig Bank Kendal logo in the brand link; remove the adjacent
  Private stay area and Your booking labels. Retain an accessible link name.
- Replace Visit the public website with Menu, using the public header's existing
  seven navigation destinations and same-tab links.
- Change the account icon into a disclosure containing Your bookings and Log out.
  Your bookings opens the selector even with one booking. Signed-out visitors see
  Sign in instead. Retain server-side logout and session revocation.
- Keep Reservation, Messages and Holiday Planner visible as private navigation.
- Hide the skip link during ordinary viewing and reveal it on keyboard focus.
- Apply consistently to pages using the private booking layout, retaining
  intentionally hidden headers on print views.
- Patterns: **Public navigation disclosure** and **Booker account disclosure**
  use native details/summary controls with custom styling and dismissal;
  **Focus-visible skip link** uses a native anchor.

### E13-F02 — Reservation as the booking entry page

- Make the existing individual booking root display Reservation by default.
  Retain explicit Reservation, Messages and Holiday Planner routes and deep links.
- Remove the individual booking overview, its return button and the entire
  Your private booking page panel, including copy-link and refresh controls.
- Use Your booking as the page eyebrow and document-title prefix. Preserve clear
  lifecycle status within Reservation, distinguishing pending requests from
  confirmed bookings.
- Keep the accommodation heading and booker/stay summary; use British dates.
- Show compact private navigation with an accessible current destination.
- Preserve query-string notices, form actions and sign-in return destinations.
- Pattern: **Booking section navigation**, a custom arrangement of native links.

### E13-F03 — Simplify reservation party details

- Remove optional occupant-name fields and explanatory copy from Reservation.
- Retain pet editing when applicable, with pet-specific headings, save labels
  and notices. Omit the empty editor when there are no pets.
- Preserve stored occupant names and administration editing. Customer pet saves
  must update pets without deleting or replacing occupant records.
- Retain the planner's separate guest-name capture when duplicating plans.
- Pattern: **Pet details form**, using native form controls.

## Verification and delivery

Deliver features sequentially, recording completion evidence and obtaining owner
acceptance before beginning the next feature.

- Regression coverage: default Reservation entry, deep links, sign-in return,
  single/multiple booking selection, account disclosure and logout.
- Exercise pending, offered, confirmed and cancelled states; preserve offer
  responses, payment notices and messaging/planner navigation.
- Verify pet saves preserve occupant records, including zero pets, validation
  failures and success.
- Inspect the rebuilt app with Chrome DevTools at 320×800, 390×844, 768×1024 and
  1440×900: overflow, keyboard operation, focus, names/structure, console and
  relevant network requests. Run mobile/desktop Lighthouse, investigate applicable
  failures and repeat after corrections.
- Use disposable, non-notifying local fixtures; record tools, states, findings
  and limitations in feature completion records.

## Boundaries

Preserve E11-F03 authentication: valid account sessions or email/SMS verification,
with email preferred. Booking references are identifiers, not credentials.
Preserve private response protections and absence of analytics. No migration or
occupant-data deletion is intended. Broader reservation, messaging, planner,
administration and public-page redesigns are outside this epic. Merging,
deployment and production-data changes require owner approval.
