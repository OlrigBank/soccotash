# PR 47 feature summary: Admin calendar availability overrides

This is a living document for the administrator-controlled calendar availability override feature.

## Clarified scope

Availability overrides apply only while checking or displaying availability for a **Bespoke stay** (`bespoke-arrangement`). Main House, Cottage and whole-property booking requests must continue to respect every underlying block on the same night.

## Conversation-first Bespoke requests

The later clarification supersedes availability gating for Bespoke requests: a Booker may enter any valid future arrival and departure dates, together with guests and pets, and submit the request to start a private booking conversation. The application does not load, display or enforce current availability for this request. It also does not treat the pending Bespoke request as an availability hold.

Main House, Cottage and whole-property requests retain their existing public-calendar, quote and transactional conflict checks. The saved availability-override records remain visible in Admin, but Bespoke request creation no longer depends on an override because all valid preferred dates can start a conversation.

## Current behaviour

Availability is enforced in two separate paths:

- Public calendar and quote display use `getBlocks()` in `site/src/lib/booking/repository.ts`, ultimately querying imported blocks and blocking bookings in `site/src/lib/booking/status-calendar.ts`.
- Booking creation performs an independent conflict check through `hasBookingDateConflict()` in `site/src/lib/booking/status-calendar.ts`.

Both paths must understand overrides. Changing only the visible calendar would let someone select 15 August but reject them on submission.

The Admin calendar currently only displays entries in `site/src/pages/admin/calendars/index.astro`; it has no mutation controls.

## Recommended design

Add a new migration, likely `018_calendar_availability_overrides.sql`, with a table containing:

- availability property ID (`main-house` or `cottage`);
- individual night/date;
- administrator who created it;
- optional reason;
- creation timestamp; and
- a unique constraint on property plus date.

An override for 15 August would mean the night `[15 August, 16 August)` is bookable for a Bespoke stay only.

The override should:

- take precedence over Airbnb, manual, provisional, and confirmed booking blocks when evaluating a Bespoke stay;
- have no effect on standard Main House, Cottage or whole-property availability;
- preserve and continue displaying the underlying booking;
- survive Airbnb calendar refreshes;
- be removable so the administrator can restore normal blocking;
- be recorded in `admin_audit_log`; and
- apply to the underlying availability resource, not merely the public arrangement name.

For example, a Main House resource override can satisfy the Main House side of a Bespoke stay availability check. A Cottage block still requires its own override because Bespoke stays consult both resources. The same Main House override does not make an ordinary Main House or whole-property request available.

## Required code changes

1. Add repository operations to create, list, and remove overrides.
2. Update `queryBookingBlocks()` to split or exclude overridden nights before returning blocks to the public calendar and pricing model.
3. Update `hasBookingDateConflict()` so overridden dates do not cause server-side rejection.
4. Extend `queryAdminCalendarEntries()` to return override records alongside underlying events.
5. Add authenticated, same-origin-protected Admin POST actions.
6. Make calendar dates interactive and clearly show:
   - the underlying booking/block;
   - “Available for bespoke stays”;
   - controls to unblock or restore the date; and
   - a strong warning when overriding a direct or provisional booking.
7. Use the existing availability advisory lock during override changes to avoid races with booking creation.

## Important safety consideration

“Unblocked no matter what” permits a second booking over a confirmed direct booking or Airbnb reservation. Preserve that requested power, but require explicit confirmation and show every conflicting entry before applying it. It should never silently cancel, delete, or alter the existing booking.

## Tests needed

The integration suite should demonstrate that:

- an Airbnb-blocked night becomes available for a Bespoke stay;
- the same night remains unavailable for Main House, Cottage and whole-property requests;
- provisional and confirmed booking nights can also be overridden;
- a stay crossing a non-overridden blocked night remains unavailable;
- removing an override restores blocking;
- adjacent arrival/departure boundaries remain correct;
- shared Main House/whole-property behaviour is correct;
- Cottage and combined bespoke availability behave correctly;
- Airbnb resynchronisation does not remove overrides; and
- Admin authentication, same-origin checks, validation, and audit records work.

This design keeps the original booking evidence intact while making the administrator’s exception authoritative everywhere availability is calculated.

## Implementation status

Implemented on `agent/unblocking-dates-in-calendar`:

- migration `018_calendar_availability_overrides.sql` persists one-night overrides by underlying availability property;
- Bespoke quote and booking creation accept valid preferred dates without consulting availability, while standard arrangements continue to enforce it;
- block ranges are split around overridden nights while adjacent blocked nights retain their existing boundaries;
- the Admin calendar continues to show underlying Airbnb, manual and booking entries and adds a highlighted availability-override entry;
- administrators can unblock or restore an affected night directly from the calendar, with an explicit destructive-impact confirmation and an optional reason;
- pending Bespoke requests remain informational and do not add blocks to Main House or Cottage availability;
- override creation and removal use the same per-property advisory lock as booking creation and write administrator audit events; and
- Airbnb synchronisation continues to replace only imported `booking_blocks`, leaving overrides intact.

Validation completed:

- `npm --prefix site run check`;
- `npm --prefix site run build`;
- `npm --prefix site run test:booking-lifecycle` (17 tests); and
- `npm --prefix site run test:booking-integration` against PostgreSQL through Docker Compose (6 tests).
