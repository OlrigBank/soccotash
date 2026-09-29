const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthPattern = months.join('|');
const dayFirst = new RegExp(`^(\\d{1,2})(?:\\s+(${monthPattern}))?(?:,?\\s+(\\d{4}))?$`, 'iu');
const monthFirst = new RegExp(`^(${monthPattern})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$`, 'iu');

function dateParts(value) {
  let match = value.trim().match(monthFirst);
  if (match) return { month: months.findIndex((month) => month.toLowerCase() === match[1].toLowerCase()) + 1, day: Number(match[2]), year: match[3] ? Number(match[3]) : null };
  match = value.trim().match(dayFirst);
  if (!match) throw new Error('Unsupported review date format.');
  return { day: Number(match[1]), month: match[2] ? months.findIndex((month) => month.toLowerCase() === match[2].toLowerCase()) + 1 : null, year: match[3] ? Number(match[3]) : null };
}

function iso({ year, month, day }) {
  if (!year || !month) throw new Error('Review stay year is not displayed; supply verified review metadata with complete stay dates.');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Review contains an invalid calendar date.');
  return date.toISOString().slice(0, 10);
}

function metadataDate(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) throw new Error('Verified review metadata requires ISO calendar dates.');
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  iso(parts);
  return parts;
}

export function isStayLine(line) {
  return /^.+?\s*[–-]\s*.+?\s*[·-]\s*\d+\s+nights?(?:\s*·\s*Published\b.*)?$/iu.test(line);
}

/** Capture dates independently of the optional Published label; never use capture time as a stay year. */
export function parseReviewDates(stayLine, metadataLines, knownReview, { capturedAt, reviewerName, propertyId, reservations = [] } = {}) {
  const match = stayLine.match(/^(.+?)\s*[–-]\s*(.+?)\s*[·-]\s*(\d+)\s+nights?(?:\s*·\s*Published\b.*)?$/iu);
  if (!match) throw new Error('Review stay line must contain a date range and number of nights.');
  const start = dateParts(match[1]);
  const end = dateParts(match[2]);
  start.month ??= end.month;
  end.month ??= start.month;
  const publishedValues = metadataLines.flatMap((line, index) => {
    const published = line.match(/(?:^|·)\s*Published(?:\s+on)?\s*(.*)$/iu);
    return published ? [published[1].trim() || metadataLines[index + 1] || ''] : [];
  });
  if (publishedValues.length > 1) throw new Error('Review has multiple publication dates.');
  const published = publishedValues.length ? iso(dateParts(publishedValues[0]))
    : knownReview?.publishedAt ? iso(metadataDate(knownReview.publishedAt)) : null;
  const knownStart = knownReview?.stay?.checkIn ? metadataDate(knownReview.stay.checkIn) : null;
  const knownEnd = knownReview?.stay?.checkOut ? metadataDate(knownReview.stay.checkOut) : null;
  const crossesYear = start.month > end.month;
  let yearSource = 'displayed';
  if (!start.year && !end.year) {
    if (knownStart || knownEnd) {
      start.year = knownStart?.year ?? knownEnd.year - Number(crossesYear);
      yearSource = knownReview.stay.yearSource === 'current-year-assumption' ? 'current-year-assumption' : 'verified-review';
    } else {
      const normalise = (name) => String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, ' ').trim();
      const identity = normalise(reviewerName);
      const candidates = reservations.filter((reservation) => {
        if (!propertyId || reservation.propertyId !== propertyId || !identity) return false;
        const names = [reservation.bookerDisplayName, reservation.partyDisplayName].map(normalise);
        if (!names.some((name) => name === identity || (identity.length >= 3 && !identity.includes(' ') && name.split(' ')[0] === identity))) return false;
        const arrival = metadataDate(reservation.arrival);
        const departure = metadataDate(reservation.departure);
        return arrival.month === start.month && arrival.day === start.day && departure.month === end.month && departure.day === end.day
          && reservation.nights === Number(match[3]) && (Date.parse(reservation.departure) - Date.parse(reservation.arrival)) / 86_400_000 === reservation.nights;
      });
      const dates = [...new Set(candidates.map((reservation) => `${reservation.arrival}/${reservation.departure}`))];
      if (dates.length > 1) throw new Error('Multiple reservation years match this review; resolve the conflicting evidence before capture.');
      if (dates.length === 1) {
        start.year = metadataDate(candidates[0].arrival).year;
        yearSource = 'reservation';
      } else {
        const captureDate = new Date(capturedAt);
        if (Number.isNaN(captureDate.valueOf())) throw new Error('A valid capture date is required for the current-year assumption.');
        start.year = Number(new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'Europe/London' }).format(captureDate));
        yearSource = 'current-year-assumption';
      }
    }
  }
  end.year ??= start.year + Number(crossesYear);
  start.year ??= end.year - Number(crossesYear);
  const checkIn = iso(start);
  const checkOut = iso(end);
  const nights = Number(match[3]);
  if (nights < 1 || (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000 !== nights) throw new Error('Review stay dates do not match the displayed number of nights.');
  if ((knownStart && checkIn !== knownReview.stay.checkIn) || (knownEnd && checkOut !== knownReview.stay.checkOut)
    || (knownReview?.publishedAt && published !== knownReview.publishedAt)) throw new Error('Displayed review dates conflict with previously captured metadata.');
  return { checkIn, checkOut, nights, publishedAt: published, yearSource };
}
