# Content model

## Local guide

Path: `site/src/content/local-guide/*.md`

Each entry has YAML frontmatter with:

- `title`
- `slug`
- `legacyId`
- `category`
- `categoryLabel`
- `image`
- `externalLink`
- `recommended`
- `summary`
- `legacyText`

The body is rendered as the main page content.

## Pages

Path: `site/src/content/pages/*.md`

Used for top-level pages such as `/contact/` and `/guest-information/`. The file `home.md` is used for `/`.

## Listings

Path: `site/src/content/listings/*.md`

Listings describe each bookable accommodation option. The model contains:

### Identity and presentation

- `title`
- `slug`
- `tagline`
- `summary`
- `image`
- `gallery`
- `featured`
- `sortOrder`

### Display facts and structured capacity

- `sleeps`
- `bedrooms`
- `bathrooms`
- `standardGuests`
- `maximumGuests`
- `bedroomCount`
- `bedCount`
- `bathroomCount`
- `wcCount`

The text fields are used for visitor-facing wording. The numeric fields are available for future search, comparison, structured metadata and booking integration.

### Description and practical information

- `highlights`
- `guestAccess`
- `sharedSpaces`
- `locationSummary`
- `parking`
- `accessInformation`
- `importantNotes`
- `amenities`
- `houseRules`
- `airbnbUrl`

### Relationships

- `spaces` contains references to the rooms and spaces included in the listing.

The Markdown body is used for the main editorial introduction rather than repeating all structured facts.

## Spaces

Path: `site/src/content/spaces/**/**/*.md`

Spaces describe individual rooms and shared outdoor areas. The model contains:

- `title`
- `slug`
- `spaceGroup`
- `spaceType`
- `summary`
- `image`
- `gallery`
- `floor`
- `sleeps`
- `beds`
- `bedTypes`
- `bathrooms`
- `toilets`
- `ensuite`
- `shared`
- `views`
- `features`
- `accessInformation`
- `sortOrder`
- `featured`

The Markdown body contains the fuller room description. Numeric room facts are stored as numbers so they can be reused programmatically.

## Airbnb source material

Path: `docs/source-material/airbnb/archive/*.md`

These files preserve raw Airbnb listing information. They are source records, not published content. Stable property facts may be migrated into listing and space records. Prices, discounts, availability rules and platform-generated descriptions remain in the archive unless a future booking integration requires a separate data model.

## Navigation

Path: `site/src/data/navigation/main.yml`

This file contains the migrated menu tree and local guide categories. Astro reads this at build time.
