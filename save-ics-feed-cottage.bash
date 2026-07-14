#!/usr/bin/env bash
docker compose exec -T site node --input-type=module -e '
const url = (process.env.AIRBNB_COTTAGE_ICAL_URLS ?? "")
  .split(/[,\n]+/)[0]
  .trim();

if (!url) throw new Error("AIRBNB_COTTAGE_ICAL_URLS is not configured.");

const response = await fetch(url);
if (!response.ok) throw new Error(`Airbnb returned HTTP ${response.status}.`);

process.stdout.write(await response.text());
' > airbnb-cottage.ics