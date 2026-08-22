# Getting Olrig Bank to Go Viral Epic

## Epic summary

Improve the public Olrig Bank website so that people and search engines can
understand, discover and confidently choose the Main House when searching for
large group and family accommodation in Kendal.

The initial discovery target is the existing canonical Main House page:

```text
https://olrigbank.co.uk/listings/main-house/
```

The work must present useful, accurate guest information in crawlable HTML. It
must not use hidden keyword lists, repetitive doorway pages or claims that are
not supported by the property and its guest evidence.

"Go viral" is the outcome ambition, not a ranking guarantee. The controllable
product outcome is a technically discoverable, clearly positioned and
measurable public accommodation website. Search performance will then be
improved from observed query and conversion evidence.

## Product proposition

The first 47 Main House reviews support the following proposition:

> A spacious but homely period house where families and groups can stay
> together, walk into Kendal, enjoy the garden and use the property as a base
> for the wider Lake District, supported by responsive personal hosting.

The website should express this proposition using the language prospective
guests naturally use when searching:

- large holiday house in Kendal;
- group accommodation in Kendal;
- family holiday accommodation;
- self-catering accommodation for 8–10 guests;
- Kendal accommodation with a large garden and off-road parking;
- accommodation within walking distance of Kendal town centre; and
- group accommodation near Windermere and the Lake District.

These phrases are writing inputs, not a block to be copied repeatedly.

## Current state

The Main House page is already server-rendered by Astro and can be crawled. It
currently provides:

- the stable URL `/listings/main-house/`;
- a browser title of `Main House | Olrig Bank`;
- an `h1` of `Main House`;
- a short summary;
- two short paragraphs of visible listing copy;
- occupancy, bedroom and bathroom facts;
- linked room and space content; and
- availability and contact calls to action.

The content is accurate but too brief and generically titled to explain the
complete guest proposition to search engines or prospective guests.

The site configuration declares `https://olrigbank.co.uk` as its production
site. The current public shell has description metadata but does not yet expose
an explicit canonical link or complete social-sharing metadata. No generated
XML sitemap or public `robots.txt` crawler discovery file has been identified.

## Target search presentation

The property name remains **Main House** in navigation, cards and operational
interfaces. Search metadata and the listing presentation describe what it is.

### Proposed document title

```text
Large Group & Family Holiday House in Kendal | Olrig Bank
```

### Proposed meta description

```text
Spacious self-catering holiday accommodation for 8–10 guests in Kendal, with four bedrooms, a large garden and off-road parking near the Lake District.
```

### Proposed page presentation

```text
Main House at Olrig Bank
Large group and family holiday house in Kendal
```

The accommodation name and search-oriented heading must remain understandable
to a person without becoming an unnatural repetition of keywords.

## Proposed visible Main House copy

The following is the initial editorial source. It should be checked against the
current property facts before publication and rendered as immediately visible
page content.

### Spacious group accommodation in Kendal

The Main House at Olrig Bank is a spacious Victorian holiday house for families
and groups staying in Kendal. Sleeping 8–10 guests across four bedrooms, it
provides generous communal rooms where everyone can eat, relax and spend time
together.

The house is well suited to extended-family holidays, groups of friends,
wedding guests, reunions and visitors attending events in Kendal. Its lounge,
dining room and well-equipped kitchen make it practical for a shared
self-catering stay without everyone feeling crowded.

### Walk into Kendal and explore the Lake District

Olrig Bank is within walking distance of Kendal town centre, including its
shops, cafés, restaurants and pubs. Guests can leave their cars at the property
and explore Kendal, the River Kent and Kendal Castle on foot.

Windermere and the wider Lake District are within easy reach, making the Main
House a convenient base for days in the Lakes while retaining the facilities
and transport connections of Kendal.

### Large garden and off-road parking

Guests have access to Olrig Bank's large garden, providing outdoor space for
relaxing and for children to play. Off-road parking is available at the
property, which is particularly useful for families and groups arriving in more
than one vehicle.

The driveway requires some care with larger vehicles. Olrig Bank provides
arrival and parking guidance before each stay.

### Designed for families and groups

The Main House includes four bedrooms, three bathrooms plus additional WCs, a
lounge, dining room and self-catering kitchen. Books, games and children's toys
help families settle in, while the generous communal rooms give larger groups
space to spend time together.

Bedroom arrangements can vary, so guests should tell Jenna about their group
when requesting a stay. Olrig Bank can confirm the most suitable arrangement
before booking.

## Proposed visible questions and answers

### How many guests can stay at the Main House?

The Main House normally accommodates groups of 8–10 guests across four
bedrooms. Guests should ask Olrig Bank to confirm the arrangement for their
group.

### Can guests walk into Kendal town centre?

Yes. Kendal's shops, cafés, restaurants and pubs are within walking distance of
Olrig Bank.

### Is parking available?

Yes. The Main House has off-road parking. Olrig Bank provides guidance for
arranging several vehicles because the driveway can be tight for larger cars.

### Is the house suitable for families?

Yes. The generous communal rooms, large garden, books, games and toys make it
particularly suitable for family and multi-generational stays.

### Is Olrig Bank a good base for the Lake District?

Yes. Kendal provides convenient access to Windermere and the South Lakes while
giving guests shops, restaurants and transport connections close to the house.

## Internal discovery

Important pages must link to the Main House through ordinary `<a href>` links
with concise, descriptive text. Proposed home-page wording is:

```markdown
Explore our [large group and family holiday house in Kendal](/listings/main-house/)
or our [spacious Kendal holiday cottage with a garden and parking](/listings/cottage/).
```

The listings index, relevant Local Guide pages and appropriate booking entry
points should provide contextual links without repeating an exact phrase in
every location. Operational and private booking pages are not SEO landing pages.

## Technical discovery requirements

Public pages require:

- a unique, descriptive document title and meta description;
- one production canonical URL;
- Open Graph title, description, URL and image metadata;
- suitable social-card metadata for platforms that recognise it;
- descriptive image alternative text based on what the image shows;
- an XML sitemap of canonical public URLs;
- a public `robots.txt` referencing the sitemap;
- crawlable internal links to every important public page; and
- appropriate vacation-rental or lodging structured data derived from verified
  listing facts.

Structured data must match visible content. Ratings, reviews, amenities,
location facts and occupancy must not be invented or exposed from private data.
Google's richer vacation-rental presentation has separate eligibility and
Hotel Center requirements, so valid markup does not guarantee a rich result.

## Search submission and measurement

After the changes are deployed:

1. verify the production canonical and rendered HTML;
2. validate the XML sitemap and `robots.txt`;
3. validate structured data with the relevant public testing tools;
4. submit the sitemap in Google Search Console;
5. inspect the Main House URL and request indexing;
6. record the release date as an analytics/Search Console annotation in the
   project record;
7. monitor impressions, queries, positions, clicks and click-through rate;
8. distinguish listing discovery from availability requests and completed
   booking conversations; and
9. refine copy from genuine query evidence rather than assumptions.

Search engines may take days or longer to recrawl a page. A sitemap helps
discovery but neither guarantees indexing nor increases ranking by itself.

## Explicit exclusions

This epic will not:

- add hidden keywords or visually concealed search text;
- repeat phrases until copy becomes unnatural;
- create one near-duplicate landing page per search phrase;
- claim `luxury`, `mansion`, `secluded`, `accessible`, `secure garden` or
  `enclosed garden` without verified support;
- present Kendal as though the property were physically inside the Lake
  District National Park;
- publish private review feedback;
- copy third-party accommodation descriptions;
- promise a search ranking, traffic volume or booking level;
- introduce paid advertising or third-party directory distribution unless
  approved as a later feature; or
- change private booking, administration or planner indexing rules.

## Branch and delivery route

The proposed integration structure is:

```text
development
└── agent/getting-olrig-bank-to-go-viral-epic
    ├── agent/pr-96-listing-seo-metadata
    ├── agent/pr-97-main-house-search-content
    ├── agent/pr-98-public-internal-discovery
    ├── agent/pr-99-canonical-social-metadata
    ├── agent/pr-100-sitemap-robots
    ├── agent/pr-101-vacation-rental-structured-data
    └── agent/pr-102-search-console-measurement
```

Each feature branch should be derived from the current epic branch, tested,
merged locally into the epic branch in order and then deleted. The epic branch
should reach `development` only after the complete crawlability, content,
structured-data and regression checks pass.

## Ordered feature route

1. **PR 96 — Listing SEO metadata foundation**
2. **PR 97 — Main House search-intent content and FAQ**
3. **PR 98 — Public internal discovery links**
4. **PR 99 — Canonical and social-sharing metadata**
5. **PR 100 — XML sitemap and robots discovery**
6. **PR 101 — Verified vacation-rental structured data**
7. **PR 102 — Search Console release and measurement**

Later features must be justified by observed query, visitor or booking evidence.

## Epic acceptance criteria

1. The stable Main House URL presents a descriptive title, description, heading
   and useful visible content.
2. Property facts in metadata, copy and structured data agree with the
   authoritative listing configuration.
3. Important public pages link to the Main House with descriptive, natural
   anchor text.
4. Every indexable public page emits one correct HTTPS canonical URL.
5. Main House social previews contain correct Olrig Bank content and imagery.
6. Search crawlers can discover canonical public pages through valid internal
   links, an XML sitemap and `robots.txt`.
7. Structured data validates and does not expose private or invented facts.
8. Private booking, planner and administration pages remain excluded from
   indexing as required.
9. Mobile and desktop page layouts remain accessible and usable.
10. Search Console submission and a repeatable measurement record are complete.
11. Automated tests cover metadata composition, canonical URL generation,
    sitemap inclusion, robots policy and structured-data serialization.
12. Existing booking, content, Local Guide and planner regression suites pass.
