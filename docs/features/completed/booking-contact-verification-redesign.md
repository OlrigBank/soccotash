# Booking contact verification redesign

Implemented on `fix/booking-contact-verification`, 14 September 2026.

Previously, an already verified contact still showed code-delivery instructions,
channel selection and a disabled Send verification code button. Guests could
mistake a completed check for a blocked action.

The **Verified contact card** is a custom UI pattern. It replaces those controls
with a tick, an Email verified or Mobile number verified heading, the verified
contact, confirmation that no further code is needed, and guidance to complete
the remaining details and continue to review. Its Change contact action focuses
the matching editable field. Editing the contact or expiry restores verification
and prevents continuation until the contact is verified again.

The **Contact code form** uses native select, input and button controls inside a
custom stateful section. It retains email and SMS verification, automatic email
code delivery, invalid-code feedback, retry and expiry handling. The shared
sign-in use keeps its requirement for a fresh code. Completion moves keyboard
focus out of disappearing code controls to Continue to review when available,
or to the status message otherwise. Step 2 is now labelled Your details.

## Verification

- Rebuilt application served at `http://127.0.0.1:4325`; no production deployment
  or Docker service replacement.
- `npm run build`: passed.
- `npm run check`: zero errors, zero warnings, two existing hints in other files.
- `npm run test:booking-lifecycle`: 88 passed.
- Booking-page Playwright suite against the rebuilt server: 72 passed at
  320×800, 390×844, 768×1024 and 1440×900.
- Permanent browser coverage includes saved verified contacts, changing contact,
  delivery failure, invalid codes, new verification, expiry, keyboard focus and
  continuation to review. Existing suite coverage also exercises SMS identity
  reuse, pet details, stay edits, quote changes and request-error recovery.
- Chrome DevTools inspected the rebuilt page at the same four viewport sizes.
  Checked empty and completed states, accessible headings and control names,
  code validation and completion, Change contact keyboard activation, visible
  3px focus outline, review continuation, document and local overflow. No
  overflow was found. Console inspection found no errors or warnings during
  the fixture-backed journey.
- Mobile and desktop Lighthouse snapshot audits: accessibility 97, best
  practices 100, SEO 100, agentic browsing 100. Initial heading-order regression
  in the new card was corrected and the audit repeated. The sole remaining
  failure is existing footer paragraph contrast (2.4:1, #64726b on #2f373a),
  outside the changed verification section.

## Scope and limitations

Browser checks use disposable `example.test` contacts and local API response
fixtures. Chrome DevTools injected a fetch fixture before page scripts; Playwright
intercepted API routes. No email or SMS was sent and no booking was created.
Network inspection confirmed no API calls escaped the Chrome fixture. This
verifies the rendered workflow, not live notification delivery, database
verification or production session behaviour. The earlier Docker verification
503 is not addressed by this presentation change.

## Follow-up: remove WhatsApp opt-in from the request form

Removed the WhatsApp checkbox and all accompanying explanatory copy between
verification and Tell us about each pet. Removed its review-summary row, unused
change handler and the mobile input's reference to the deleted help text. The
request form no longer supplies WhatsApp consent. Existing backend support is
unchanged. This simplifies the existing custom Contact code form flow; no new
UI pattern was introduced.

Rebuilt and inspected with Chrome DevTools at 320×800, 768×1024 and 1440×900.
Pet details follow verification with no intervening visible content, no document
or section overflow and no dangling accessible-description references. No
console errors or warnings. The 12 relevant Playwright checks pass across all
four configured viewports, including review submission without WhatsApp consent,
contact changes, code validation, expiry and keyboard continuation. Repeated
Lighthouse snapshot audit remains 97/100/100/100 with the same existing footer
contrast finding. All verification used local non-notifying response fixtures;
no production changes or messages were sent.
