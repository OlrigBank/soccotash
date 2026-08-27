# Up-front Booking Panels on the Landing and Listing Pages

## Status

Proposed.

## Epic summary

Make checking a stay the main action in the public accommodation journey by
placing a compact, native booking panel directly beneath the homepage hero and
within the opening of every Ways to stay listing page.

The homepage panel replaces the existing **Request a stay** and **View ways to
stay** hero buttons. The public header also loses its separate **Request a
stay** button, leaving the Olrig Bank brand and a compact **☰ Menu** control.
The Ways to stay cards remain links to their detailed listing pages.

The panel must reuse the site's existing authoritative availability, occupancy
and pricing behaviour. It starts a provisional booking request; it does not
introduce instant confirmation, payment or a third-party booking service.

## Background

The first public UI improvement made the homepage more photographic, concise
and useful on a phone. Its hero actions still send visitors elsewhere before
they can answer the practical questions that most strongly influence a stay:

- Is my preferred arrangement available on my dates?
- Can it accommodate my party?
- What is the provisional total?

The existing `/book/` journey already uses authoritative server-side
availability, published pricing and occupancy policies. This epic exposes a
smaller first step earlier in the journey rather than creating another booking
engine.

Listing pages currently offer a **Check availability** link in their opening
and a separate enquiry panel later. Neither gives an answer without navigating
away, and visitors must reconfirm the arrangement they were viewing.

## Desired outcome

A visitor can begin checking a stay from the homepage or relevant listing page
without first navigating to a generic booking form.

For a normally priced arrangement, the visitor can:

1. choose dates and party composition;
2. receive an authoritative availability and provisional-price response;
3. continue to `/book/` with those selections preserved; and
4. complete contact, pet and other request details there.

For Olrig Bank Bespoke, the same area begins an enquiry using preferred dates
and party composition. It explains that Jenna will confirm the accommodation,
availability and price rather than imitating an immediate online quote.

## Experience principles

- The embedded panel is the primary public booking action, not an extra action
  added alongside the existing buttons.
- Keep the homepage hero led by the photograph and concise proposition; do not
  place a large form over the image.
- Ask only for information needed to check or begin a stay. Collect contact and
  detailed pet information in the established `/book/` journey.
- A listing panel already knows which arrangement is being viewed and must not
  ask the visitor to choose it again.
- Do not use **Book now**, **Reserve** or wording that implies a stay is
  confirmed or held.
- Preserve useful selections when the visitor continues to the full form.

## Scope

### 1. Simplify the homepage actions and header

Remove the following actions when the compact panel is introduced:

- **Request a stay** from the public header;
- **Request a stay** from the homepage hero; and
- **View ways to stay** from the homepage hero.

The compact public header should contain the Olrig Bank brand linked to the
homepage and one menu disclosure presented as a menu icon with the visible word
**Menu**. The menu must retain an accessible name, expose its open state, work
with keyboard and touch, and preserve all existing public destinations. An
icon-only control is not the intended default.

The hero retains its photograph, heading and supporting sentence. Its removed
actions must not be replaced by another hero button.

This requirement concerns the header and hero actions. It does not remove links
from Ways to stay cards or ordinary links and controls later on the page.

### 2. Add a compact homepage booking panel

Place a compact **Plan your stay** panel immediately below the homepage hero
and before **Ways to stay**.

For standard arrangements, its first state should contain:

- stay arrangement;
- arrival and departure;
- adults, children and infants; and
- pets.

Offer the arrangements in this order:

1. Olrig Bank;
2. The Cottage at Olrig Bank;
3. Olrig Bank Max; and
4. Olrig Bank Bespoke.

The panel must not reproduce the complete contact form, detailed pet questions,
message field or private booking workflow on the homepage.

Use **Check availability** as the initial standard-arrangement action. An
eligible result should show:

- whether the dates currently appear available;
- number of nights;
- authoritative provisional total in GBP when published pricing exists;
- concise restrictions or occupancy guidance;
- a price-details disclosure when meaningful line items exist; and
- **Continue with request**.

If a price requires host input, explain that Jenna will confirm it rather than
displaying an estimate. An unavailable or failed result must preserve the
inputs and give the visitor a clear way to amend them or continue to the full
request/contact journey.

### 3. Add a panel to every Ways to stay listing

Add the compact panel to the opening of:

- Olrig Bank;
- The Cottage at Olrig Bank;
- Olrig Bank Max; and
- Olrig Bank Bespoke.

On the three standard listings, preselect and lock the listing's arrangement.
Do not show a redundant property selector. Use the same availability response,
provisional quote and continuation behaviour as the homepage panel.

At a representative desktop width, place the panel alongside the opening
description where a balanced split fits. On smaller screens, place it after the
opening description and before the longer gallery, room and prose content.

Replace the opening **Check availability** button with the embedded panel. The
WhatsApp route may remain as a restrained secondary contact link. Review the
later **Ask about a stay** section and remove duplicated booking prompts while
preserving a clear route to Jenna for other questions.

### 4. Give Bespoke an honest enquiry state

Olrig Bank Bespoke is administrator-priced and may use a host-selected
combination of accommodation resources. Its dates and price cannot be shown as
an ordinary instant availability result.

When Bespoke is selected on the homepage, or its listing panel is shown:

- collect preferred arrival, departure and party composition;
- explain that the request does not reserve or block dates;
- state that Jenna will confirm accommodation, availability and price;
- use **Start a Bespoke request** as the principal action; and
- carry the selections into the existing Bespoke request journey.

Do not show a green availability state, zero or estimated price, or **Reserve**
action for Bespoke.

### 5. Continue into the full request without repetition

Pass valid compact-panel state into `/book/`, including the stay arrangement,
arrival, departure, adults, children, infants and pet count.

The full booking page remains responsible for detailed calendar interaction,
pet information, Booker contact details, WhatsApp consent, optional message,
final review and provisional-request creation.

Transferred values must be validated again by the full page and server. Query
parameters or client state are conveniences, not trusted booking data. Changing
the arrangement, dates or party must invalidate the displayed quote and obtain
a fresh authoritative result.

## Authoritative booking behaviour

Compact and full forms must share the existing server-side sources for:

- live and imported availability blocks;
- minimum-stay and date restrictions;
- published pricing and line items;
- arrangement-specific occupancy assessment; and
- provisional-request creation.

Do not duplicate price calculations or occupancy rules in browser code. The
server must recheck quote and availability at submission, retaining existing
conflict protection and changed-quote responses.

An availability check is not a reservation hold. Suitable wording is **These
dates currently appear available**. Submission continues to create a request
for administrator review.

## Responsive presentation

Use a shallow horizontal homepage panel where desktop width permits and a clear
stacked form on phones. Listing pages may use a split opening on desktop and a
single-column sequence on phones.

Review at 320px, 375px, 390px, 430px, approximately 768px and 1280px or wider.
At every size require:

- no horizontal overflow or header overlap;
- persistent labels associated with controls;
- touch targets of at least 44px where practical;
- stable, readable quote and error states; and
- no sticky booking control in this epic.

## Accessibility and resilience

- Associate every input and error with an accessible label or description.
- Announce availability and quote results without unexpectedly moving focus.
- Keep date input keyboard operable; native date fields are acceptable in the
  compact panel even if `/book/` retains its richer calendar.
- Do not communicate unavailable or selected states through colour alone.
- Preserve visible focus against the cream-and-green visual system.
- Keep a retry and continuation route when availability or pricing fails.
- Preserve server-rendered navigation and listing links without JavaScript. A
  live check requires JavaScript, but failure must not strand the visitor.

## Analytics and privacy

Extend public analytics enough to distinguish:

- homepage versus named-listing panel;
- check started and available, unavailable or error outcome;
- standard-price, host-priced and Bespoke outcome; and
- continuation to `/book/`.

Do not include contact data, names, pet descriptions, dates or detailed party
composition in general analytics.

## Content and behaviour to preserve

- The photographic homepage hero and concise Olrig Bank/Kendal proposition.
- The **Ways to stay** heading, stable fragment and four linked cards.
- Existing public destinations through the accessible menu.
- Existing `/book/`, listing, contact and private-booking routes.
- Existing availability, pricing, occupancy and administrator-review behaviour.
- The distinction between standard, Bespoke and host-decision-required requests.
- GBP as the public booking currency.
- Existing canonical, social and structured metadata.

## Out of scope

- Instant confirmation or describing submission as confirmed.
- Payment collection or payment-processor integration.
- A reservation hold created by checking availability.
- The future direct-standard-booking lifecycle.
- Third-party booking engines, iframes or Lodgify.
- Automatically proposed alternative dates or accommodation.
- A sticky mobile booking bar.
- Redesigning cards, galleries, Local Guide, private booking or admin pages.
- New pricing, occupancy or accommodation policy.
- Database changes unless discovery proves a small change essential and it is
  separately agreed.

## Feature delivery sequence

### Feature 1 — Compact booking-panel foundation

Introduce a reusable compact component using the existing availability and
quote endpoints. Implement standard, unavailable, host-priced, error and
Bespoke states without changing `/book/` submission. Add contract tests for
authoritative API use, state wording, quote invalidation and analytics privacy.

### Feature 2 — Homepage panel and simplified actions

Add the panel below the hero and before **Ways to stay**. Remove the header
booking action and both hero buttons. Present the remaining disclosure as
**☰ Menu**, retaining current navigation and accessibility. Verify that the
hero remains photographic and the panel is the obvious next step.

### Feature 3 — Listing-page booking panels

Integrate a preselected panel into each standard listing opening. Add the
desktop split and mobile sequence, replace the opening availability button and
rationalise the later enquiry prompt. Test that each listing is immutably
mapped to the correct booking arrangement.

### Feature 4 — Bespoke listing and homepage state

Complete the Bespoke presentation on both entry points. Verify that it records
preferred dates and party composition, never presents ordinary availability or
a price, and uses honest request language.

### Feature 5 — Preserved continuation into `/book/`

Carry compact selections into the full journey, initialise its form safely and
ensure changes invalidate and refresh quotes. Add end-to-end coverage from the
homepage and every listing to a submittable full request. This completes the
epic without introducing confirmation or payment.

## Acceptance criteria

1. The public header contains the brand and one accessible **☰ Menu** control,
   with no separate **Request a stay** button.
2. The homepage hero has no booking or Ways to stay buttons and retains its
   photograph and concise proposition.
3. A compact panel appears between the homepage hero and **Ways to stay**.
4. The four Ways to stay cards remain usable listing links.
5. The homepage panel offers all four arrangements in the agreed order.
6. Every listing has a compact panel fixed to its own arrangement.
7. Standard panels use authoritative availability, occupancy and pricing and
   show a provisional GBP total when published pricing exists.
8. No public wording implies that checking or submitting reserves or confirms
   a stay.
9. Bespoke never displays normal availability or an immediate price and clearly
   explains Jenna's review.
10. Valid arrangement, date, party and pet-count selections continue to
    `/book/` without re-entry.
11. The full form and server revalidate transferred inputs and refresh a
    changed quote.
12. Contact and detailed pet information remain on `/book/`.
13. Error and unavailable states preserve editable inputs and recovery paths.
14. There is no horizontal overflow from 320px upwards, and the journey remains
    keyboard, touch and screen-reader operable.
15. Existing lifecycle, conflict protection, pricing, occupancy, analytics
    privacy and private booking behaviour do not regress.

## Validation

- Component and booking API contract tests.
- Compact-state transfer and server-side revalidation tests.
- Listing-to-arrangement mapping tests for all four listings.
- Bespoke wording and no-false-availability regression tests.
- Analytics privacy checks.
- Astro checks and production build.
- Browser review of the homepage and every listing at required widths.
- Keyboard-only review of menu, form, results and continuation.
- Failure-path review with availability and pricing unavailable.

## Completion evidence

When all five features are complete, add a completion document recording the
final journey and wording, automated and viewport evidence, listing-to-property
mapping, authoritative-price confirmation, Bespoke safeguards, consciously
deferred work, and the commits or pull requests delivering each feature.
