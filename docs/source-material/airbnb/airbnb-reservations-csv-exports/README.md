# Airbnb reservation-page exports

Place the CSV files downloaded from Airbnb's reservations page in this directory,
then run `npm run airbnb:analyse` from the repository root. Select the detailed
reservation-evidence ZIP to compare against. The Python-only alternative is
`python3 scripts/run_reservation_analysis.py`.

Every `.csv` file directly in this directory is included. Move older exports out
before adding a replacement set: overlapping rows are retained and duplicate
confirmation codes are flagged rather than silently removed. Other files and
subdirectories are not read. With no CSV files, the analysis retains its original
13 tabs. With CSV files, it appends Review, Comparisons, CSV reservations and
Extract reservations.

Use the original UTF-8 Airbnb exports, with these columns:

```text
Confirmation code, Status, Guest name, Contact, # of adults, # of children,
# of infants, Start date, End date, # of nights, Booked, Listing, Earnings
```

Keep private CSV exports and evidence ZIPs out of commits. Only this README is
tracked here; all other files and subdirectories are ignored. Supply your own
local exports when running the process. No generated workbook, temporary builder,
Codex installation or private reference file is needed by the generator.

See [Standalone reservation analysis](../../../features/standalone-reservation-analysis.md)
for installation, direct commands, matching rules and verification.
