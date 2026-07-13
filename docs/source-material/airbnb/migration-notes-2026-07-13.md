# Airbnb content migration notes

Migration performed from:

- `archive/main-house-public-2026-07-12.md`
- `archive/cottage-public-2026-07-12.md`

## Migrated

Stable descriptive and factual information was moved into the listing and space collections, including:

- titles and introductory descriptions;
- sleeping arrangements;
- room descriptions and room features;
- bathroom and WC arrangements;
- guest access;
- garden-sharing arrangements;
- parking;
- location summaries;
- access and staircase information;
- selected amenities;
- neighbour-consideration notes.

The Airbnb wording was edited into an independent Olrig Bank website voice rather than copied verbatim into the published pages.

## Deliberately not migrated

The following information remains only in the archive:

- nightly prices and host service-fee figures;
- weekly, monthly, early-booking and last-minute discounts;
- minimum and maximum stay rules;
- advance-notice and restricted check-in/check-out settings;
- Airbnb-generated amenity explanations;
- Airbnb-specific request-to-book wording;
- temporary or platform-controlled availability information.

These values can change frequently and should eventually come from Airbnb, an iCalendar feed or a booking system rather than static Markdown.

## Decisions and inconsistencies

### Main House bathrooms

The Airbnb Main House archive describes two bathrooms: an upstairs bathroom and a ground-floor shower room. The previous soccotash listing said three bathrooms plus additional WCs. The migrated Main House model now records two bathrooms. The whole property records three bathrooms because the Cottage contributes the third.

### Garden privacy

The Cottage archive calls the garden private in some places, while the current Olrig Bank content model and operating plan describe it as potentially shared between Main House and Cottage guests. The migrated records use the more precise rule:

- indoor accommodation is private to each separate booking;
- the garden may be shared when Main House and Cottage are separately occupied;
- the garden is private to the group when the whole property is booked together.

### Main House capacity

The archived bed arrangement provides sleeping places for eight guests: two king beds, one double bed and two single beds. The Main House listing therefore uses a structured maximum of eight. Any alternative arrangement allowing more guests should be verified before increasing this value.

### Airbnb URLs

No public Airbnb URLs were present in the source files, so `airbnbUrl` has been added to the model but left unset in the listing records.

### Guest interaction text

The Airbnb archives name Arienne and Bryan as the owners and describe their interest in answering questions and sharing local knowledge. The public soccotash contact flow currently directs enquiries through Jenna. The contact page was therefore expanded to say that Jenna can help with property questions and local ideas, without publishing conflicting contact arrangements.
