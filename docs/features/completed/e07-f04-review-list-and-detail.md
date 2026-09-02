# E07-F04 — Review List and Detail

## Status

Complete.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](../epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Let administrators browse imported Airbnb reviews, detailed ratings and private
feedback and move safely between a review and its matched reservation.

## Scope

- Add `/admin/airbnb/reviews/` with bounded server-side pagination.
- Filter by property, stay/published date range, overall rating, link state,
  private-feedback presence and reviewer name.
- Show reviewer, listing, stay, publication date, rating and link state without
  loading review bodies into list results.
- Add `/admin/airbnb/reviews/[id]/` using review `public_id`.
- Display public review text, clearly marked private feedback, six ordered
  category ratings and their ordered feedback tags.
- Display safe source provenance and the confirmed/proposed reservation links.
- Link confirmed matches bidirectionally to the reservation detail screen.

## Tests

- Rating, property, date, link and private-feedback filters.
- Reviews with and without private feedback or feedback tags.
- Stable category and tag ordering.
- Escaped public/private text and Unicode reviewer names.
- Confirmed, proposed and absent reservation links.
- Unknown UUID and anonymous access behavior.

## Acceptance criteria

1. All 52 reviews are discoverable through predictable pagination and filters.
2. Detail views reproduce normalized ratings, tags and text without using raw
   extraction payloads.
3. Private feedback is unmistakably private and admin-only.
4. Confirmed review/reservation navigation uses stable UUIDs in both directions.

## Delivered implementation

- Replaced the review placeholder with a bounded, server-rendered list filtered
  by reviewer, property, publication range, rating, private-feedback presence
  and reservation-link state.
- Added deterministic publication/stay sorting, configurable page size,
  query-preserving pagination, UUID detail links, empty results, desktop tables
  and mobile cards.
- Kept review text and private feedback out of list queries and list markup.
- Added a UUID detail service/page containing public text, a clearly marked
  private-feedback section, ordered category ratings and ordered feedback tags.
- Added safe source provenance and bidirectional UUID navigation for confirmed,
  proposed and rejected reservation candidates.
- Returned a content-free `404` for invalid or unknown review identifiers and
  rendered all captured text through Astro's escaped text expressions.

## Validation

- All 52 reviews are discoverable. Filters identify 23 with private feedback,
  29 without it, 52 with confirmed links and three that also have proposed
  alternatives.
- A representative live detail contains six ordered category ratings, ordered
  tags, one safe provenance record and its reservation link.
- Integration tests cover combined filters, Unicode names, absent feedback,
  stable rating/tag ordering, detail text, UUID links and invalid identifiers.
- Route contract tests and Astro type checking pass.
