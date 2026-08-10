# Proposed PR #91 — Safe Booking Removal and Deletion Queue

## Status

- Parent branch: `development`
- Feature branch: `agent/booking-deletion-lifecycle`
- Intended merge target: `development`
- Current status: initial definition; implementation not started
- Database changes: required
- Primary audience: administrators managing operational booking records

## Objective

Allow an administrator to remove a booking from ordinary visible booking views
without immediately destroying its database record. The booking is instead marked
for deletion, retained in a dedicated recoverable queue and made eligible for a
separate, tightly guarded permanent purge policy.

This feature replaces the current misleading **Delete booking** experience, which
physically deletes a narrow set of records, with an explicit two-stage model:

1. **Mark for deletion** removes the booking from normal operational views while
   retaining its complete record and relationships.
2. **Permanently delete** is a later, independently authorised operation available
   only after retention, dependency and lifecycle safeguards pass.

## Existing behaviour and reason it is difficult to use

The administration Booking Management page already exposes a danger-zone deletion
screen. Its server operation executes `DELETE FROM provisional_bookings` directly.

Normal deletion is permitted only while status is `pending` or `offered`. A second
exception permits records whose Booker name starts with `Production Acceptance
Test` to be deleted from selected later statuses after the full booking reference
is entered. The lifecycle model likewise defines only `pending/delete_request` and
`offered/delete_request` as transitions whose destination is no record.

These safeguards protected genuine bookings from accidental hard deletion, but
they also prevent the UI from being used as the administrator expects:

- confirmed, cancelled, declined, expired and payment-stage records cannot be
  removed from the ordinary list;
- removal from view is treated as synonymous with irreversible data destruction;
- the acceptance-test exception relies on a naming convention rather than a
  general retention policy;
- hard deletion may cascade through conversations, offers, payments, activity,
  planner data and owned availability records;
- an audit entry written after deletion cannot itself make the deleted record
  recoverable;
- there is no deletion queue, restoration action or retention clock.

## Product terminology

Use distinct language throughout the UI and code:

- **Cancel booking** changes the booking lifecycle, releases dates according to
  lifecycle rules and retains the record.
- **Mark for deletion** is an administrative visibility/retention decision. It
  does not itself cancel the booking, change its status or alter its calendar
  effect.
- **Restore to visible bookings** reverses the mark without changing lifecycle
  status.
- **Permanently delete** physically removes an eligible record and its explicitly
  approved dependent data. It is never presented as the immediate default action.

## Mark-for-deletion model

Add deletion metadata to `provisional_bookings`, likely:

- `deletion_requested_at TIMESTAMPTZ`;
- `deletion_requested_by_admin_user_id` with a protected administrator reference;
- `deletion_reason` with a required, length-limited explanation;
- optionally `deletion_eligible_after`, calculated from an agreed retention
  period rather than inferred differently by each caller.

A booking is marked when `deletion_requested_at` is non-null. This is orthogonal
to booking status: status remains the authoritative lifecycle and calendar state.
The original public ID remains stable and no child rows are deleted during this
operation.

Marking must be transactional and must create non-secret audit/activity records.
The administrator ID, timestamp, reason, booking reference and status at the time
of marking are recorded. Contact information, private links and message bodies
must not be copied into general audit JSON.

### Booking-linked holiday plans

Marking a booking for deletion must mark the complete booking plan family in the
same transaction: the original Booker plan, every independent guest-plan copy and
any later plan belonging to that booking.

“Plan family” describes only their shared booking ownership and common retention
operation. Booker and guest plans remain permanently independent representations
of each individual's intentions. They are never merged, synchronised or collapsed
into a common itinerary. When several guests intend to attend the same activity,
that activity appears independently in each participating individual's plan and
may carry different personal timing, notes or surrounding activities.

Each affected `holiday_plans` row receives deletion metadata linked to the parent
booking deletion request. This is distinct from example-plan archival. Booker,
guest, participant, share and AI credentials for all marked plans become unusable
transactionally. Days, scheduled activities, candidate lists, revision histories
and plan relationships remain stored until an approved permanent purge.

Restoring the booking restores visibility of the complete plan family. Private
credentials invalidated for safety must be deliberately replaced rather than
silently revived.

## Guest-created Local Guide candidates

Every custom planning item created by a Booker or guest is retained as a candidate
for possible Local Guide review unless its creator explicitly opts out. This
applies whether it is first created in Candidate activities or directly in a day.
Moving it between candidates and scheduled days must not duplicate the retained
record or lose the creator's decision.

Items selected from the existing Local Guide are references to existing content
and must not be resubmitted as new candidates merely because they enter a plan.

The repository already has `guide_contribution_candidates`, with moderation,
provenance and accepted/rejected states. PR #91 must extend or deliberately
migrate that model rather than create an overlapping `local_guide_candidates`
table without reconciliation. The retained snapshot needs the guest-created
title, description, URL/location and stable source-item identity because the
private plan item may later be edited, moved or removed.

Creation forms should provide a clear unchecked opt-out control, for example:
**Do not save this activity for possible inclusion in the Local Guide**. Absence
of the opt-out records the candidate; selecting it keeps the item only in the
private plan. The server must persist an explicit decision and must not infer it
from a missing or malformed request field.

This reverses the current contribution model, which requires explicit opt-in after
an item is scheduled. Implementation must revise the consent wording, version and
tests, retain evidence of the creator's choice, and keep administrator moderation
mandatory before publication. Candidate retention does not grant attribution
permission or permission to publish personal information.

When a booking and its plan family are marked for deletion, retained Local Guide
candidate snapshots remain private in the moderation queue unless the creator
opted out. Links must not expose the marked plan or booking. Permanent purge must
detach or anonymise retained moderation candidates before deleting plan and
participant rows rather than losing retained content through cascade accidentally.

## Visibility behaviour

Ordinary administration queries exclude marked bookings by default. This includes:

- Booking management list;
- dashboard counts and attention queues;
- default status-filter results;
- other operational selectors where a deletion-marked record would otherwise be
  mistaken for current work.

The administration Bookings page gains a clear **Marked for deletion** filter or
separate queue. That view shows all marked records regardless of lifecycle status,
including:

- Booker/booking identification needed to recognise the record;
- current lifecycle status;
- who marked it and when;
- reason;
- earliest permanent-deletion date, when applicable;
- restore and permanent-delete eligibility.

Marked records must never become undiscoverable to administrators. Direct
administrator URLs may remain readable but should show a prominent deletion-state
banner and restrict ordinary mutations until the record is restored. This avoids
silently operating on a record believed to have been removed.

## Booker and external access

Initial safe policy:

- marking for deletion revokes or suspends Booker and guest-plan access;
- it does not send an automatic message or lifecycle notification;
- it does not cancel an active booking or release dates;
- restoring the record does not silently recreate revoked credentials—credential
  restoration/replacement must be explicit where required;
- public and private routes return a non-disclosing not-found response while the
  deletion mark remains active.

If product review instead requires existing Booker access to remain active during
the retention window, that choice must be explicit before implementation because
it materially changes the meaning of removal and the privacy boundary.

## Lifecycle and calendar safety

Marking for deletion must not be added as a lifecycle transition with a destination
status. It is an administrative retention state alongside the lifecycle.

Therefore:

- active confirmed/payment-stage bookings retain their calendar blocks;
- pending/offered records retain whatever calendar effect their lifecycle already
  owns;
- cancelled/declined/expired records remain released;
- marking and restoration do not create or remove availability overrides;
- an administrator who intends to cancel must complete **Cancel booking** first;
  hiding a record is not a substitute for cancellation.

All statuses may be marked for deletion because this operation is reversible and
does not alter calendar state. For active statuses, the confirmation screen must
warn that the booking will remain active and dates will remain held. The deletion
queue must visibly distinguish active marked records so they cannot be forgotten.

### Administrator cancellation authority

PR #91 review establishes that Booker and administrator cancellation authority is
deliberately asymmetric:

- the Booker may cancel their own booking throughout the active booking lifecycle;
- an administrator may cancel while status is `pending`, `offered`,
  `offer_accepted` or `payment_pending`;
- an administrator may not cancel once status is `payment_reported`, `confirmed`
  or `approved`;
- terminal statuses (`cancelled`, `declined`, `expired`) cannot be cancelled again.

The current lifecycle rules incorrectly generate administrator cancellation rules
for `payment_reported`, `confirmed` and `approved`. Implementation must remove
those administrator transitions while retaining the Booker transitions. The UI,
server decision model, generated lifecycle documentation, notifications and tests
must all derive from the corrected rules rather than duplicating status lists.

This restriction means the administrator cannot use cancellation to make a paid,
reported or confirmed booking eligible for deletion. Such a record becomes
deletion-eligible only if the Booker cancels it, or after the stay has genuinely
gone ahead and the departure/completion condition is satisfied.

### Unverified payment report route

When a booking is `payment_reported` but the administrator cannot identify the
payment in Olrig Bank's account, the administrator does not cancel the booking
directly. They use **Reject payment report** with a required explanation. The
booking returns to `payment_pending` (presented to users as **deposit payment
required**), not to the initial request status `pending`.

This route must:

- retain the accepted offer and payment history;
- record the rejected report and administrator reason;
- send/show a clear message to the Booker explaining that payment has not been
  verified and must be sent or clarified;
- retain the existing calendar effect while awaiting the Booker;
- allow the Booker to report payment again;
- restore administrator cancellation authority because the booking is once again
  `payment_pending`.

If the Booker does not respond by sending or clarifying payment, the administrator
may then cancel from `payment_pending`. Cancellation releases the dates and retains
the booking record; only after cancellation may the record progress through the
mark-for-deletion and eventual purge policy.

Whether this non-response period is an explicit deadline, a manual judgement or
an automated expiry is a separate policy decision. PR #91 must not silently cancel
immediately merely because the payment report was rejected.

## Restoration

An authorised administrator can restore a marked record before permanent purge.
Restoration clears the deletion metadata in one transaction and records who
restored it and why. The booking returns to normal lists according to its unchanged
status.

Restoration must not:

- roll back lifecycle events;
- change status;
- add or remove calendar blocks;
- erase the mark/restore audit history;
- silently reactivate revoked customer or guest credentials.

## Permanent deletion policy

Permanent database deletion is not the same operation as marking. Before enabling
it, implementation must define and test:

- a minimum retention period;
- which lifecycle statuses are purgeable;
- whether financial/payment records have a longer or indefinite retention rule;
- whether messages and personal data must be retained, anonymised or erased;
- dependencies from offers, payments, activity, availability overrides, holiday
  plans, planner shares/invitations and notification records;
- the audit evidence retained after the booking graph is removed;
- backup and legal/accounting expectations.

Product direction established during initial review: a booking cannot become
eligible for permanent deletion until either:

1. it has been cancelled through the booking lifecycle; or
2. the stay has gone ahead and the recorded departure date has passed.

Merely marking a booking for deletion does not satisfy either condition. The
precise definition of “stay has gone ahead” still requires review: departure date
alone may be sufficient, or the system may need a completed/fulfilled lifecycle
state so a past but unresolved booking is not purged accidentally.

Safe first increment: implement marking, queueing and restoration, while displaying
permanent deletion as unavailable pending an explicit retention decision. If purge
is included in this PR after product review, require all of the following:

- record is already marked for deletion;
- retention deadline has passed;
- lifecycle status is terminal under the approved policy;
- no unresolved payment or operational attention remains;
- administrator enters the complete booking reference;
- server rechecks every condition inside the deletion transaction;
- a minimal tombstone/audit event is committed without personal data;
- deletion scope is explicit and covered by integration tests.

The current name-based `Production Acceptance Test%` bypass should be retired once
the general model is proven. Acceptance-test data can use the same mark, retention
and purge semantics, with a shorter retention policy only if explicitly approved.

## Administration interface

Replace the present wording and actions:

- **Delete booking** → **Mark for deletion**;
- explanation states that the booking will leave ordinary views but remain in the
  recoverable deletion queue;
- require a deletion reason and confirmation checkbox;
- active bookings receive an additional explicit warning that lifecycle and held
  dates are unchanged;
- successful marking returns to the Booking list with confirmation;
- a **Marked for deletion** queue provides **Review**, **Restore to visible
  bookings**, and—only when policy permits—**Permanently delete**.

Touch targets, confirmation text and queue layout must remain usable on mobile.
The operation must not be triggered by row double-click, swipe or a single compact
icon without a labelled confirmation screen.

## Repository and query rules

Centralise visibility policy rather than adding ad-hoc filters to pages:

- ordinary list functions default to excluding deletion-marked records;
- callers must opt in explicitly to include or list only marked records;
- direct record lookup used by Admin can opt in and expose deletion metadata;
- Booker, participant, share and AI-capability resolution excludes marked records;
- dashboard counts use the same operational visibility policy;
- background notification/payment jobs must define whether they ignore or flag an
  active marked record rather than silently processing it.

Database indexes should support active-list and deletion-queue queries. A check
constraint should keep requester/timestamp/reason metadata internally consistent.

## Security and audit requirements

- Administrator authentication and same-origin protection remain mandatory.
- Mark, restore and purge actions are POST-only.
- Server decisions never trust button-disabled state or client-supplied status.
- Every action locks/rechecks the booking transactionally.
- Private access credentials are revoked/suspended according to the chosen policy.
- Audit details exclude raw access tokens, password hashes and unnecessary PII.
- A marked booking cannot be accessed by guessing or replaying its private URL.
- Permanent deletion requires a stronger confirmation than reversible marking.

## Migration and compatibility

The migration adds nullable deletion metadata so every existing booking remains
visible and behaviourally unchanged. It must not infer deletion marks from current
status or names.

The rollout should be safe with production's real bespoke booking:

- existing status, conversation, availability and access remain intact;
- the booking is not marked automatically;
- default lists remain unchanged immediately after migration;
- rollback before any marks consists of the normal application/database backup
  procedure; after marks exist, older code would ignore them, so rollback planning
  must account for visibility semantics.

## Testing requirements

Repository/integration tests must cover:

- marking every lifecycle status without changing status or calendar ownership;
- exclusion from ordinary lists and inclusion in the deletion queue;
- Booker, participant, share and AI access denial while marked;
- every original and guest plan in the booking family being marked atomically;
- all plan-family credentials becoming unusable while plan content is retained;
- custom Booker/guest items creating exactly one Local Guide candidate by default
  with no duplicate when moved between candidate and scheduled lists;
- explicit opt-out preventing Local Guide candidate retention;
- existing Local Guide selections never being resubmitted as new candidates;
- restoration with unchanged lifecycle/calendar state;
- repeated mark/restore attempts and concurrent requests;
- required reason and transactional audit attribution;
- active-booking warning/confirmation contract;
- dashboard counts and status filters;
- dependent offers, messages, payments, overrides and holiday plans remaining
  intact while marked;
- permanent-purge guards if purge is implemented;
- migration of existing production-shaped records as unmarked and visible.

Cancellation regression must insert multiple booking-owned calendar availability
overrides plus an unrelated override, cancel the booking, and prove transactionally
that every owned override is removed, the unrelated override remains and the
booking no longer blocks its dates.

Browser regression should exercise both desktop and mobile administration flows.
The existing bespoke booking playback must continue to pass.

## Acceptance criteria

- An administrator can mark any booking for deletion from Booking Management.
- The marked booking immediately leaves ordinary booking lists and dashboard work
  queues without changing lifecycle status or calendar effect.
- The record appears in a dedicated Marked for deletion queue with reason, actor
  and timestamp.
- Every Booker and guest plan belonging to the booking is marked in the same
  transaction and becomes inaccessible through its private credentials.
- Every custom planning item is retained for Local Guide moderation by default
  unless its creator explicitly opts out, without automatic publication.
- Booker and related guest/private access follow the approved suspension policy.
- An administrator can restore the record and recover normal visibility.
- Marking/restoring is fully transactional, authenticated and audited.
- The existing direct hard-delete route cannot bypass the new policy.
- No existing booking is marked or changed by migration.
- Permanent deletion is either explicitly guarded by the approved retention
  policy or deliberately unavailable in this PR.
- Production-shaped bespoke bookings, planner relationships and owned availability
  overrides pass regression tests.

## Decisions required before implementation

1. Confirm whether marking should immediately disable Booker and guest-plan links
   (recommended) or allow them during retention.
2. Choose the minimum retention period before permanent purge; recommendation:
   start with no automatic purge and decide after observing the queue.
3. Decide whether any payment-bearing or confirmed booking may ever be physically
   deleted rather than anonymised and retained.
4. Confirm whether permanent purge belongs in PR #91 or a later PR after the
   reversible workflow has been used safely.
5. Define whether a departed stay needs an explicit completed/fulfilled status
   before it becomes permanently purgeable; actor-specific cancellation statuses
   are now established above.
6. Approve the revised default-retention wording and decide how long rejected or
   unreviewed Local Guide candidates remain after their source booking is purged.

## Proposed implementation sequence

1. Add deletion metadata migration, constraints and query indexes.
2. Implement transactional mark/restore repository operations and audit records.
3. Centralise operational/marked query scopes and private-access denial.
4. Replace the current hard-delete UI with Mark for deletion.
5. Add the deletion queue and restoration workflow.
6. Remove or isolate the acceptance-test hard-delete bypass.
7. Add integration, lifecycle, browser and migration regression coverage.
8. Review real local records before deciding whether to enable permanent purge.
