on my olrig-bank website visitors can submit booking requests. They have to provide a email address and or telephone number. Both can become the basis of a login account that can be used to later access and modify their booking. Give feedback on this approach

Updated memory
Here's a rundown of the strengths and risks in this approach:

What works

Low-friction: no upfront password creation, which reduces booking abandonment.
Flexibility (email or phone) accommodates people who don't check email often, or don't want to give a phone number.
Key risks to think through

Identity verification is the crux. If an account is created just because someone typed an email/phone into a form, you haven't proven they own it. Anyone who knows (or guesses) the address/number tied to a booking could potentially access and modify someone else's reservation. You need some verification step — a confirmation link/OTP sent at booking time, or an OTP required at login time — not just "type the same string back in."
What's the actual login mechanism? "Email/phone as basis for a login account" is ambiguous — is there a password, or is it OTP/magic-link only (passwordless)?
If passwordless (recommended): login = "enter email or phone → we send a one-time code/link." Simple, no password to leak, and doubles as verification.
If there's a password: you still need to verify the email/phone before trusting it, and now you also have password-reset flows to build, and credential storage/hashing to get right.
Uniqueness and collisions. What happens when two different bookings use the same email (e.g. a partner books on someone's behalf, or a shared family email)? Do they merge into one account with multiple bookings, or conflict? Decide this explicitly rather than letting it emerge by accident.
Partial-identifier problem. If someone books with only a phone number, then later tries to log in with email, that won't work — worth deciding whether login must match whichever identifier(s) were provided, and communicating that clearly.
Normalization. Emails should be lowercased/trimmed; phone numbers need consistent E.164-style normalization (country code, spaces, dashes) or "the same" number entered two different ways will look like two different accounts.
No password recovery flow needed if passwordless — this is actually a point in favor of going fully OTP-based, since it eliminates an entire class of account-recovery UX problems.
Rate limiting / abuse. An OTP-to-phone or OTP-to-email flow needs rate limiting so it can't be used to spam a number/inbox or brute-force codes.
Data protection. Since email/phone doubles as a credential, treat it with the same care as a password store — don't log it in plaintext anywhere unnecessary, and be mindful of GDPR (or local equivalent) obligations since you're storing contact details tied to identity-verification purposes, not just contact purposes.
Suggested concrete flow

At booking time: collect email and/or phone, immediately send a verification code/link to whichever was given, and don't finalize the booking as "claimed" until verified.
At login/return-visit time: same mechanism — enter email or phone, receive a one-time code, redirect straight to their booking. No password at all.
This keeps things simple and removes most of the security risk of guessable static identifiers.
Would it help if I sketched out the login/OTP flow in more detail, or looked at the data model for how bookings and accounts should relate?

Can we put a session cookie for the booker's link, so that if they use the same browser later they get straight back in?

Thought for 4s
Yes — that's a good idea, and it's basically the standard pattern for exactly this kind of low-friction login. A few things worth getting right:

What the cookie should represent

Don't derive the cookie from the email/phone itself (e.g. a hash of it) — that's still guessable/replayable. Instead, once someone verifies via OTP, issue a random, opaque session token (128+ bits of entropy) tied server-side to that booking/account. The cookie just carries the token; it has no meaning on its own.
Cookie attributes

HttpOnly — prevents JS access, mitigates XSS token theft.
Secure — HTTPS only.
SameSite=Lax (or Strict) — mitigates CSRF.
Reasonable expiry — for a booking system, something like 30–90 days is common, or tie it to the booking's relevant window (e.g. keep them logged in until a few days after the booking date, then let it lapse).
Server-side session store

Keep a sessions table (token → account/booking ID, created_at, expires_at, maybe device/user-agent info) so you can invalidate individual sessions without touching others.
Let users "log out" or "forgot this device," which just deletes that row.
Fallback still needed

The cookie only helps returning on the same browser/device. Keep the OTP-via-email/phone flow as the actual login method for new devices, cleared cookies, etc. The cookie is a convenience layer on top of that, not a replacement.
Renewal behavior

Consider sliding expiration (each visit extends the session) vs. fixed expiration (must re-verify after N days regardless). Sliding is more convenient; fixed is slightly safer and simpler to reason about.
One edge case to decide

If a booking gets modified or cancelled, does the session stay valid? Generally yes — the session authenticates the person, not a specific booking state, so it should persist across changes to their own booking.
This pattern (verify once via OTP → issue opaque session cookie → silent return access) gives you the low-friction experience you want without weakening the verification step you already have in place.

sketched out the login/OTP flow in more detail, and the data model for how bookings and accounts should relate?

Updated memory
Here's a concrete sketch of both.

OTP Login Flow
1. Request step

User enters email or phone on a "Manage my booking" page.
Server looks up whether that identifier matches a verified booking/account.
Important: respond the same way whether or not it matches ("If that address/number is on file, we've sent a code") — don't leak which emails/phones are registered.
Generate a short numeric code (6 digits is standard) or a single-use link with a random token. Store: code_hash, identifier, purpose (login vs. booking-verification), expires_at (5–10 min), attempts (0), consumed_at (null).
Send via email or SMS depending on which identifier they used.
2. Verify step

User submits the code (or clicks the link).
Server checks: not expired, not already consumed, attempts < limit (e.g. 5), and the hash matches.
On success: mark consumed_at, create a session (see below), redirect to their booking(s).
On failure: increment attempts; lock out after limit with a cooldown.
3. Session issuance

Generate a random opaque session token, store server-side (see sessions table below), set it as an HttpOnly, Secure, SameSite=Lax cookie.
4. Booking-time verification (same mechanism, different purpose)

When a booking is first submitted, immediately kick off the same OTP flow to confirm ownership before the booking is considered "claimed." Until verified, the booking exists but isn't yet linked to a usable account.
Rate limiting to add

Per-identifier: max N OTP requests per hour.
Per-IP: max N requests per hour (prevents someone spamming random emails/phones).
Per-code: max attempts before invalidation.
Data Model
accounts
- id (PK)
- email (nullable, unique when present, normalized lowercase)
- phone (nullable, unique when present, normalized E.164)
- email_verified_at (nullable)
- phone_verified_at (nullable)
- created_at

bookings
- id (PK)
- account_id (FK -> accounts.id, nullable until claimed/verified)
- status (pending_verification, confirmed, cancelled, etc.)
- booking_details... (dates, resource, party size, notes)
- created_at
- updated_at

otp_codes
- id (PK)
- account_id (FK, nullable — may not exist yet at booking time)
- identifier (email or phone string, in case account doesn't exist yet)
- purpose (login | claim_booking)
- code_hash
- expires_at
- attempts
- consumed_at (nullable)
- created_at

sessions
- id (PK) / token (random, stored hashed)
- account_id (FK -> accounts.id)
- created_at
- expires_at
- last_seen_at
- user_agent / device_label (optional, for "log out this device" UX)
  Key relationships & decisions this encodes

accounts is the identity; bookings belong to an account once claimed. A booking can exist briefly without an account_id (right after submission, before OTP verification completes) — that's your pending_verification state.
One account can have many bookings (repeat visitors), so it's a proper one-to-many, not a 1:1 booking↔login pairing.
Both email and phone live on the account, not per-booking — so if the same person books again with the same email, it attaches to the same account rather than creating a duplicate.
otp_codes.account_id is nullable because the very first OTP (at initial booking) fires before an account necessarily exists yet — you resolve/create the account only on successful verification.
One decision you'll want to make explicitly: what happens if someone books once with only an email, then later books again giving only a phone number — do you treat that as the same account (requiring them to prove both) or a separate account? Simplest approach: keep them separate unless the person actively links the phone to their existing email-based account while logged in.
