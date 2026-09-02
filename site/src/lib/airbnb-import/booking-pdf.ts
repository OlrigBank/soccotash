const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_PATTERN = MONTHS.join('|');

export interface ParsedConversationEntry {
  position: number;
  entryType: 'message' | 'service_event';
  senderType: 'guest' | 'host' | 'airbnb' | 'unknown';
  senderDisplayName: string;
  body: string;
  displayedDate: string;
  displayedTime: string;
  sentAt: string | null;
  timestampPrecision: 'exact' | 'date_inferred' | 'year_unknown' | 'unresolved';
  reactions: string[];
}

export interface ParsedFinancialLineItem {
  position: number;
  parentPosition: number | null;
  itemType: 'accommodation' | 'nightly_charge' | 'adjustment' | 'host_service_fee' | 'guest_service_fee' | 'tax' | 'total' | 'other';
  description: string;
  serviceDate: string | null;
  quantity: number | null;
  unitAmountMinor: number | null;
  amountMinor: number;
  rawDisplayText: string;
}

export interface ParsedFinancialSummary {
  perspective: 'host_earnings' | 'guest_paid';
  currency: 'GBP';
  totalMinor: number;
  arithmeticStatus: 'verified' | 'not_determinable' | 'discrepancy';
  arithmeticDifferenceMinor: number | null;
  rawDisplayText: string;
  lineItems: ParsedFinancialLineItem[];
}

export interface ParsedAirbnbBooking {
  source: { conversationId: string; capturedAt: string };
  heading: string;
  reservation: {
    sourceListingName: string;
    propertyId: string;
    confirmationCode: string | null;
    bookerDisplayName: string;
    partyDisplayName: string | null;
    arrival: string;
    departure: string;
    nights: number;
    checkInTime: string | null;
    checkOutTime: string | null;
    partySize: number | null;
    adults: number | null;
    children: number | null;
    infants: number | null;
    pets: number | null;
    bookingDate: string | null;
    sourceStatusText: string | null;
    cancellationPolicy: string;
    currency: string;
    headlineHostTotalMinor: number | null;
    hostNotes: string | null;
    guestProfileText: string | null;
    accessCode: string | null;
  };
  conversationEntries: ParsedConversationEntry[];
  financialRaw: string;
  financialSummaries: ParsedFinancialSummary[];
}

function nonEmptyLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    throw new Error(`Invalid displayed date ${year}-${month + 1}-${day}`);
  }
  return date.toISOString().slice(0, 10);
}

function datePart(value: string, fallbackMonth?: number): { month: number; day: number; year: number | null } {
  const match = value.trim().match(new RegExp(`^(?:(${MONTH_PATTERN})\\s+)?(\\d{1,2})(?:,\\s*(\\d{4}))?$`, 'u'));
  if (!match) throw new Error(`Cannot parse displayed date: ${value}`);
  const month = match[1] ? MONTHS.indexOf(match[1]) : fallbackMonth;
  if (month === undefined) throw new Error(`Displayed date has no month: ${value}`);
  return { month, day: Number(match[2]), year: match[3] ? Number(match[3]) : null };
}

function parseStayRange(value: string, capturedAt: string): { arrival: string; departure: string; nights: number } {
  const match = value.match(/^(.+?)\s+[–-]\s+(.+?)\s+·\s+(\d+) nights$/u);
  if (!match) throw new Error(`Cannot parse stay range: ${value}`);
  const start = datePart(match[1]);
  const end = datePart(match[2], start.month);
  const capturedYear = Number(capturedAt.slice(0, 4));
  if (start.year === null && end.year === null) {
    start.year = capturedYear;
    end.year = capturedYear + (end.month < start.month ? 1 : 0);
  } else if (start.year === null) {
    start.year = end.year! - (start.month > end.month ? 1 : 0);
  } else if (end.year === null) {
    end.year = start.year + (end.month < start.month ? 1 : 0);
  }
  const arrival = isoDate(start.year!, start.month, start.day);
  const departure = isoDate(end.year!, end.month, end.day);
  const nights = Number(match[3]);
  const calculated = (Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86_400_000;
  if (calculated !== nights) throw new Error(`Stay range spans ${calculated} nights, not ${nights}`);
  return { arrival, departure, nights };
}

function normaliseHeading(value: string): string {
  const lines = nonEmptyLines(value);
  return lines.filter((line, index) => index === 0 || line !== lines[index - 1]).join(' ');
}

function propertyIdForListing(value: string): string {
  if (/cottage/iu.test(value)) return 'cottage';
  if (/(olrig bank|bedroom in victorian house)/iu.test(value)) return 'main-house';
  throw new Error(`Unsupported Airbnb listing: ${value}`);
}

function time24(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})\s+([AP]M)$/u);
  if (!match) throw new Error(`Cannot parse displayed time: ${value}`);
  let hour = Number(match[1]);
  if (hour === 12) hour = 0;
  if (match[3] === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}:00`;
}

function textBetweenLabels(lines: string[], startLabel: string, endLabels: string[]): string | null {
  const start = lines.indexOf(startLabel);
  if (start < 0) return null;
  let end = lines.length;
  for (const label of endLabels) {
    const candidate = lines.indexOf(label, start + 1);
    if (candidate >= 0 && candidate < end) end = candidate;
  }
  const text = lines.slice(start + 1, end).join('\n').trim();
  return text || null;
}

function parseEnglishDate(value: string): string {
  const date = new Date(`${value} 00:00:00 UTC`);
  if (Number.isNaN(date.valueOf())) throw new Error(`Cannot parse booking date: ${value}`);
  return date.toISOString().slice(0, 10);
}

function parseReservation(value: string, capturedAt: string, heading: string): ParsedAirbnbBooking['reservation'] {
  const lines = nonEmptyLines(value);
  const stayIndex = lines.findIndex((line) => /\s+[–-]\s+.+\s+·\s+\d+ nights$/u.test(line));
  if (stayIndex < 1 || !lines[stayIndex + 1]) throw new Error('Reservation has no stay range or listing');
  const stay = parseStayRange(lines[stayIndex], capturedAt);
  const cancellationIndex = lines.indexOf('Cancellation policy');
  const totalIndex = lines.findIndex((line) => /^Total for \d+ nights$/u.test(line));
  if (cancellationIndex < 0) throw new Error('Reservation has no cancellation policy');
  const amountMatch = totalIndex > 0 ? lines[totalIndex - 1].match(/^£([\d,]+\.\d{2})$/u) : null;
  if (totalIndex > 0 && !amountMatch) throw new Error('Reservation has a malformed GBP headline total');
  const partyMatch = lines.slice(0, cancellationIndex).join(' ').match(/(\d+) adults?(?:,\s*(\d+) children?)?(?:,\s*(\d+) infants?)?(?:,\s*(\d+) pets?)?/iu);
  const groupMatch = lines.slice(0, stayIndex).join(' ').match(/group of (\d+)/iu);
  const codeIndex = lines.indexOf('Suggested door code');
  const bookingDateIndex = lines.indexOf('Booking date');
  const confirmationIndex = lines.indexOf('Confirmation code');
  const guestLabel = lines.includes('Who’s coming') ? 'Who’s coming' : 'Guests';
  const checkInIndex = lines.indexOf('Check-in');
  const checkOutIndex = lines.indexOf('Checkout');
  const displayedAdults = partyMatch ? Number(partyMatch[1]) : null;
  const partySize = groupMatch ? Number(groupMatch[1]) : displayedAdults;

  return {
    sourceListingName: lines[stayIndex + 1],
    propertyId: propertyIdForListing(lines[stayIndex + 1]),
    confirmationCode: confirmationIndex >= 0 ? lines[confirmationIndex + 1] ?? null : null,
    bookerDisplayName: heading,
    partyDisplayName: lines[stayIndex - 1] === heading ? null : lines[stayIndex - 1],
    ...stay,
    checkInTime: checkInIndex >= 0 && lines[checkInIndex + 2] ? time24(lines[checkInIndex + 2]) : null,
    checkOutTime: checkOutIndex >= 0 && lines[checkOutIndex + 2] ? time24(lines[checkOutIndex + 2]) : null,
    partySize,
    adults: displayedAdults !== null && partySize !== null && displayedAdults + 1 === partySize
      ? partySize
      : displayedAdults,
    children: partyMatch?.[2] ? Number(partyMatch[2]) : null,
    infants: partyMatch?.[3] ? Number(partyMatch[3]) : null,
    pets: partyMatch?.[4] ? Number(partyMatch[4]) : null,
    bookingDate: bookingDateIndex >= 0 && lines[bookingDateIndex + 1] ? parseEnglishDate(lines[bookingDateIndex + 1]) : null,
    sourceStatusText: null,
    cancellationPolicy: lines[cancellationIndex + 1],
    currency: 'GBP',
    headlineHostTotalMinor: amountMatch ? Math.round(Number(amountMatch[1].replaceAll(',', '')) * 100) : null,
    hostNotes: textBetweenLabels(lines, 'Your notes', [guestLabel, 'Cancellation policy']),
    guestProfileText: textBetweenLabels(lines, guestLabel, ['Cancellation policy']),
    accessCode: codeIndex >= 0 ? lines[codeIndex + 1] ?? null : null,
  };
}

function resolveMessageTimestamp(displayedDate: string, displayedTime: string): Pick<ParsedConversationEntry, 'sentAt' | 'timestampPrecision'> {
  const part = (() => { try { return datePart(displayedDate); } catch { return null; } })();
  if (!part) return { sentAt: null, timestampPrecision: 'unresolved' };
  if (!part.year) return { sentAt: null, timestampPrecision: 'year_unknown' };
  const date = isoDate(part.year, part.month, part.day);
  return { sentAt: `${date} ${time24(displayedTime)} Europe/London`, timestampPrecision: 'exact' };
}

function parseConversation(value: string, heading: string): ParsedConversationEntry[] {
  const lines = value.replaceAll('\f', '\n').replaceAll('\r', '').split('\n');
  const displayedDatePattern = `(?:(${MONTH_PATTERN})\\s+\\d{1,2}(?:,\\s*\\d{4})?|Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)`;
  const headerPattern = new RegExp(`^\\s*(\\S.*?)\\s{2,}(${displayedDatePattern}) at (\\d{1,2}:\\d{2} [AP]M)\\s*$`, 'u');
  const dateOnlyPattern = new RegExp(`^\\s*(${displayedDatePattern}) at (\\d{1,2}:\\d{2} [AP]M)\\s*$`, 'u');
  const headers = lines.flatMap((line, index) => {
    const match = line.match(headerPattern);
    if (match) return [{ index, sender: match[1], displayedDate: match[2], displayedTime: match[4] }];
    const dateOnly = line.match(dateOnlyPattern);
    if (!dateOnly) return [];
    let start = index - 1;
    while (start >= 0 && lines[start].trim()) start -= 1;
    const sender = lines.slice(start + 1, index).map((item) => item.trim()).find(Boolean);
    return sender ? [{ index, sender, displayedDate: dateOnly[1], displayedTime: dateOnly[3] }] : [];
  });
  if (!headers.length) throw new Error('Conversation has no parseable entries');
  return headers.map((header, position) => {
    const nextIndex = headers[position + 1]?.index ?? lines.length;
    const bodyLines = lines.slice(header.index + 1, nextIndex).map((line) => line.trim());
    while (!bodyLines[0]) bodyLines.shift();
    while (!bodyLines.at(-1)) bodyLines.pop();
    const body = bodyLines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
    if (!body) throw new Error(`Conversation entry ${position} has no body`);
    const sender = normaliseHeading(header.sender);
    if (!sender) throw new Error(`Conversation entry ${position} has no sender`);
    const senderType = sender === 'Airbnb service' ? 'airbnb' : sender === heading ? 'guest' : /jenna/iu.test(sender) ? 'host' : 'unknown';
    return {
      position,
      entryType: senderType === 'airbnb' ? 'service_event' : 'message',
      senderType,
      senderDisplayName: sender,
      body,
      displayedDate: header.displayedDate,
      displayedTime: header.displayedTime,
      ...resolveMessageTimestamp(header.displayedDate, header.displayedTime),
      reactions: [],
    };
  });
}

function moneyMinor(value: string): number | null {
  const match = value.trim().match(/^(-?)£([\d,]+\.\d{2})$/u);
  return match ? (match[1] ? -1 : 1) * Math.round(Number(match[2].replaceAll(',', '')) * 100) : null;
}

function financialItemType(description: string): ParsedFinancialLineItem['itemType'] {
  if (/^total\s*\(/iu.test(description)) return 'total';
  if (/host service fee/iu.test(description)) return 'host_service_fee';
  if (/guest service fee/iu.test(description)) return 'guest_service_fee';
  if (/tax|vat(?!\))/iu.test(description)) return 'tax';
  if (/adjustment|discount|non-refundable/iu.test(description)) return 'adjustment';
  if (/^[A-Z][a-z]{2},\s+\d{2}\/\d{2}/u.test(description)) return 'nightly_charge';
  if (/nights? room fee|£[\d,.]+\s+x\s+\d+ nights?/iu.test(description)) return 'accommodation';
  return 'other';
}

function serviceDate(description: string, arrival: string): string | null {
  const match = description.match(/^[A-Z][a-z]{2},\s+(\d{2})\/(\d{2})/u);
  if (!match) return null;
  const arrivalYear = Number(arrival.slice(0, 4));
  const arrivalMonth = Number(arrival.slice(5, 7));
  const month = Number(match[1]);
  const year = arrivalYear + (month < arrivalMonth ? 1 : 0);
  return isoDate(year, month - 1, Number(match[2]));
}

function parseFinancialPanel(
  perspective: ParsedFinancialSummary['perspective'],
  rows: string[],
  arrival: string,
  headlineHostTotalMinor: number | null,
): ParsedFinancialSummary {
  const values = rows.map((row) => row.trim()).filter(Boolean);
  const totalMinor = values.length ? moneyMinor(values[0]) : null;
  if (totalMinor === null) throw new Error(`${perspective} panel has no displayed total`);
  const lineItems: ParsedFinancialLineItem[] = [];
  let parentPosition: number | null = null;
  for (let index = 1; index < values.length; index += 1) {
    const description = values[index];
    const amount = values[index + 1] ? moneyMinor(values[index + 1]) : null;
    if (amount === null) throw new Error(`${perspective} financial row has no amount: ${description}`);
    index += 1;
    const type = financialItemType(description);
    const quantityMatch = description.match(/^£([\d,]+\.\d{2})\s+x\s+(\d+) nights?$/iu);
    const currentPosition = lineItems.length;
    const parsedServiceDate = serviceDate(description, arrival);
    const isChild = parsedServiceDate !== null && parentPosition !== null;
    lineItems.push({
      position: currentPosition,
      parentPosition: isChild ? parentPosition : null,
      itemType: type,
      description,
      serviceDate: parsedServiceDate,
      quantity: quantityMatch ? Number(quantityMatch[2]) : null,
      unitAmountMinor: quantityMatch ? Math.round(Number(quantityMatch[1].replaceAll(',', '')) * 100) : null,
      amountMinor: amount,
      rawDisplayText: `${description}\n${values[index]}`,
    });
    if (type === 'accommodation' || (type === 'adjustment' && !isChild)) parentPosition = currentPosition;
    if (type === 'host_service_fee' || type === 'guest_service_fee' || type === 'total') parentPosition = null;
  }
  const topLevelComponents = lineItems.filter((item) => item.parentPosition === null && item.itemType !== 'total');
  const nonTotalSum = topLevelComponents
    .reduce((sum, item) => sum + item.amountMinor, 0);
  const difference = totalMinor - nonTotalSum;
  const headlineDifference = perspective === 'host_earnings' && headlineHostTotalMinor !== null
    ? totalMinor - headlineHostTotalMinor : 0;
  const isDeterminable = topLevelComponents.length > 0;
  return {
    perspective,
    currency: 'GBP',
    totalMinor,
    arithmeticStatus: headlineDifference !== 0 || (isDeterminable && difference !== 0)
      ? 'discrepancy' : isDeterminable ? 'verified' : 'not_determinable',
    arithmeticDifferenceMinor: headlineDifference !== 0 ? headlineDifference
      : isDeterminable && difference !== 0 ? difference : null,
    rawDisplayText: values.join('\n'),
    lineItems,
  };
}

function parseFinancials(raw: string, reservation: ParsedAirbnbBooking['reservation']): ParsedFinancialSummary[] {
  const lines = raw.replaceAll('\r', '').split('\n');
  const headerIndex = lines.findIndex((line) => line.includes('You earn') && line.includes('Guest paid'));
  if (headerIndex < 0) {
    const compact = lines.map((line) => line.trim()).filter(Boolean);
    const hostIndex = compact.indexOf('You earn');
    const guestIndex = compact.indexOf('Guest paid');
    if (hostIndex < 0 || guestIndex <= hostIndex) throw new Error('Financial section has no perspective headings');
    return [
      parseFinancialPanel('host_earnings', compact.slice(hostIndex + 1, guestIndex), reservation.arrival, reservation.headlineHostTotalMinor),
      parseFinancialPanel('guest_paid', compact.slice(guestIndex + 1), reservation.arrival, null),
    ];
  }
  const guestColumn = lines[headerIndex].indexOf('Guest paid');
  const hostRows: string[] = [];
  const guestRows: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    hostRows.push(line.slice(0, guestColumn));
    guestRows.push(line.slice(guestColumn));
  }
  return [
    parseFinancialPanel('host_earnings', hostRows, reservation.arrival, reservation.headlineHostTotalMinor),
    parseFinancialPanel('guest_paid', guestRows, reservation.arrival, null),
  ];
}

export function parseAirbnbBookingPdfText(layoutText: string): ParsedAirbnbBooking {
  const identity = layoutText.match(/PRIVATE AIRBNB BOOKING RECORD\s+([\s\S]*?)\s+Conversation ID (\d+) · Captured ([^\s]+)/u);
  if (!identity) throw new Error('PDF has no Airbnb booking identity');
  const heading = normaliseHeading(identity[1])
    || normaliseHeading(layoutText.slice(0, layoutText.indexOf('PRIVATE AIRBNB BOOKING RECORD')));
  if (!heading) throw new Error('PDF has no booking heading');
  const reservation = layoutText.match(/Reservation details\s+([\s\S]*?)\s+Private record\./u);
  const finance = layoutText.match(/Price totals and breakdowns\s+([\s\S]*?)\s+Complete conversation/u);
  const conversation = layoutText.match(/Complete conversation\s+([\s\S]*)$/u);
  if (!reservation || !finance || !conversation) throw new Error('PDF is missing a required booking section');
  const parsedReservation = parseReservation(reservation[1], identity[3], heading);
  const conversationEntries = parseConversation(conversation[1], heading);
  const conversationText = conversationEntries.map((entry) => entry.body).join('\n');
  parsedReservation.sourceStatusText = /(?:reservation[^\n.]*canc(?:eled|elled)|canc(?:eled|elled)[^\n.]*reservation)/iu.test(conversationText)
    ? 'Cancelled'
    : /(reservation|booking) confirmed/iu.test(conversationText) ? 'Confirmed' : null;
  return {
    source: { conversationId: identity[2], capturedAt: identity[3] },
    heading,
    reservation: parsedReservation,
    conversationEntries,
    financialRaw: finance[1].trim(),
    financialSummaries: parseFinancials(finance[1], parsedReservation),
  };
}
