import { parseReviewPdfText } from '../generate-airbnb-review-datasets.mjs';
import { isStayLine, parseReviewDates } from './review-dates.mjs';
import { renderBookingHtml, parseMessageGroup } from '../generate-airbnb-message-booking-html.mjs';
import { parseAirbnbBookingPdfText } from '../../src/lib/airbnb-import/booking-pdf.ts';

export const categories = ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value'];
const clean = (value) => String(value).replace(/\s+/gu, ' ').trim();
const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const longDate = (value) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

export function sourceIdentity(kind, value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.airbnb.com', 'www.airbnb.co.uk', 'airbnb.com', 'airbnb.co.uk'].includes(url.hostname)
      || url.username || url.password || url.port) throw new Error('Use an HTTPS Airbnb URL on airbnb.com or airbnb.co.uk.');
  const id = kind === 'reviews' && url.pathname === '/progress/reviews'
    ? url.searchParams.get('reviewId')
    : kind === 'bookings' ? url.pathname.match(/^\/(?:hosting\/)?(?:inbox|messages)\/(\d+)\/?$/u)?.[1] : null;
  if (!id || !/^\d+$/u.test(id)) throw new Error('URL has no supported review or conversation identity.');
  // Retain only the navigation identity, never incidental tracking/authentication parameters.
  url.search = kind === 'reviews' ? `?reviewId=${id}` : url.searchParams.has('archived') ? '?archived=' : '';
  url.hash = '';
  return { id, url: url.href };
}

function rating(value) {
  const text = clean(value);
  const match = text.match(/^(?:Rating[,:]?\s*)?([1-5])(?:\.0)?(?:\s*(?:out of 5|of 5))?\s*stars?[.,]?$/iu)
    ?? text.match(/^★+\s*([1-5])$/u) ?? text.match(/^([1-5])$/u);
  if (!match) throw new Error('Unrecognised displayed rating.');
  return Number(match[1]);
}

/** Read text from the displayed dialog; fail closed if Airbnb changes section boundaries. */
export function parseReviewDialog({ text, reviewId, capturedAt, knownReview, reservations }) {
  if (knownReview && knownReview.source?.reviewId !== reviewId) throw new Error('Verified metadata belongs to a different review.');
  const lines = text.split(/\r?\n/u).map(clean).filter((line) => line && line !== '·');
  const heading = lines.findIndex((line) => /['’]s review$/iu.test(line));
  const publicIndex = lines.findIndex((line) => /^Public review\b/u.test(line));
  const stayIndex = lines.findIndex((line, index) => (publicIndex < 0 || index < publicIndex) && isStayLine(line));
  const detailedIndex = lines.indexOf('Detailed ratings');
  const failures = [];
  if (heading < 0) failures.push('Review heading: expected a line ending in “\'s review” or “’s review”.');
  if (stayIndex < 0) failures.push('Stay line: expected a date range and number of nights, for example “27–30 August·3 nights”.');
  if (publicIndex < 0) failures.push('Public review heading: expected a line beginning with “Public review”.');
  if (detailedIndex < 0) failures.push('Detailed ratings heading: expected a line containing exactly “Detailed ratings”.');
  else if (publicIndex >= 0 && detailedIndex <= publicIndex) failures.push('Section order: “Detailed ratings” must appear after “Public review”.');
  if (failures.length) {
    throw new Error(`Review section checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  const reviewer = lines[heading].replace(/['’]s review$/iu, '');
  const listing = lines.slice(heading + 1, publicIndex)
    .filter((line) => /Olrig Bank|Cosy Cottage|bedroom in Victorian house/iu.test(line));
  if (listing.length !== 1) throw new Error('Cannot identify one supported listing.');
  const stay = parseReviewDates(lines[stayIndex], lines.slice(heading + 1, publicIndex), knownReview, {
    capturedAt, reviewerName: reviewer, propertyId: /cottage/iu.test(listing[0]) ? 'cottage' : 'main-house', reservations,
  });
  const publicLabelRating = lines[publicIndex].replace(/^Public review\s*[·:]?\s*/u, '');
  const overall = rating(publicLabelRating || lines[publicIndex + 1]);
  const publicStart = publicIndex + (publicLabelRating ? 1 : 2);
  const noteIndex = lines.findIndex((line, index) => index >= publicStart && index < detailedIndex && /^Note from\b/u.test(line));
  const replyIndex = lines.findIndex((line, index) => index >= publicStart && index < detailedIndex && /^Write a public reply$/u.test(line));
  const publicEnd = Math.min(...[noteIndex, replyIndex, detailedIndex].filter((index) => index >= 0));
  const quote = lines.slice(publicStart, publicEnd).join('\n');
  if (!quote || /Only visible to you and Airbnb/u.test(quote)) throw new Error('Public review boundary is invalid.');
  let privateText = null;
  if (noteIndex >= 0) {
    if (lines[noteIndex + 1] !== 'Only visible to you and Airbnb') throw new Error('Private note has no visibility boundary.');
    privateText = lines.slice(noteIndex + 2, replyIndex > noteIndex ? replyIndex : detailedIndex).join('\n');
    if (!privateText) throw new Error('Private note is empty.');
  }
  const detailedRatings = [];
  let cursor = detailedIndex + 1;
  for (const category of categories) {
    const label = lines[cursor++];
    if (!label?.startsWith(category)) throw new Error('Missing or reordered detailed-rating category.');
    const inlineRating = label.slice(category.length).trim();
    const score = rating(inlineRating || lines[cursor++]);
    const feedback = [];
    while (cursor < lines.length && !categories.some((name) => lines[cursor] === name || lines[cursor].startsWith(`${name} `))) {
      const line = lines[cursor++];
      if (['Positive feedback', 'Negative feedback', 'Close', 'Write a public reply'].includes(line)) continue;
      feedback.push(line);
    }
    detailedRatings.push({ category, rating: score, feedback: [...new Set(feedback)] });
  }
  const record = {
    source: { reviewId, capturedAt: capturedAt.slice(0, 10) },
    reviewer: { displayName: reviewer },
    listing: { sourceDisplayName: listing[0] },
    stay: { checkIn: stay.checkIn, checkOut: stay.checkOut, nights: stay.nights, yearSource: stay.yearSource },
    publishedAt: stay.publishedAt,
    publicReview: { rating: overall, text: quote },
    privateFeedback: privateText ? { text: privateText } : null,
    detailedRatings,
  };
  // The same parser used by PostgreSQL ingestion checks dates, property and section structure.
  return parseReviewPdfText(reviewText(record), `${reviewId}.pdf`);
}

export function reviewText(review) {
  return [
    'AIRBNB GUEST REVIEW', `${review.reviewer.displayName}'s review`, review.listing.sourceDisplayName,
    `${longDate(review.stay.checkIn)} – ${longDate(review.stay.checkOut)} - ${review.stay.nights} nights · Published ${review.publishedAt ? longDate(review.publishedAt) : 'unknown'}`,
    ...(review.stay.yearSource ? [`Stay year source: ${review.stay.yearSource}`] : []),
    `Public review · ${'★'.repeat(review.publicReview.rating)} ${review.publicReview.rating}`, review.publicReview.text,
    ...(review.privateFeedback ? [`Note from ${review.reviewer.displayName}`, 'Only visible to you and Airbnb', review.privateFeedback.text] : []),
    'Detailed ratings',
    ...review.detailedRatings.map((item) => `${item.category} ${'★'.repeat(item.rating)} ${item.rating} ${item.feedback.join('; ')}`),
    `Airbnb review ID ${review.source.reviewId} · Captured ${longDate(review.source.capturedAt)}`,
  ].join('\n');
}

export function renderReviewHtml(review) {
  parseReviewPdfText(reviewText(review), `${review.source.reviewId}.pdf`);
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Airbnb review ${e(review.source.reviewId)}</title>
<style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:11pt/1.5 Arial,sans-serif;color:#202124;margin:0}h1{font-size:23pt;margin:8px 0}h2{font-size:14pt;margin:20px 0 8px}p{white-space:pre-wrap;overflow-wrap:anywhere}.eyebrow,footer{color:#52616b;font-size:9pt}.private{border-left:3px solid #cc3852;padding-left:12px}.category{break-inside:avoid;margin:10px 0}footer{margin-top:24px}h1,h2{break-after:avoid}</style>
<div class="eyebrow">AIRBNB GUEST REVIEW</div><h1>${e(review.reviewer.displayName)}'s review</h1>
<div>${e(review.listing.sourceDisplayName)}</div>
<p>${longDate(review.stay.checkIn)} – ${longDate(review.stay.checkOut)} - ${review.stay.nights} nights · Published ${review.publishedAt ? longDate(review.publishedAt) : 'unknown'}</p>
${review.stay.yearSource ? `<div class="eyebrow">Stay year source: ${e(review.stay.yearSource)}</div>` : ''}
<h2>Public review · ${'★'.repeat(review.publicReview.rating)} ${review.publicReview.rating}</h2><p>${e(review.publicReview.text)}</p>
${review.privateFeedback ? `<section class="private"><h2>Note from ${e(review.reviewer.displayName)}</h2><div>Only visible to you and Airbnb</div><p>${e(review.privateFeedback.text)}</p></section>` : ''}
<h2>Detailed ratings</h2>${review.detailedRatings.map((item) => `<div class="category"><strong>${e(item.category)} ${'★'.repeat(item.rating)} ${item.rating}</strong><div>${e(item.feedback.join('; '))}</div></div>`).join('')}
<footer>Airbnb review ID ${e(review.source.reviewId)} · Captured ${longDate(review.source.capturedAt)}</footer></html>`;
}

export function renderCapture(kind, capture) {
  return kind === 'reviews' ? renderReviewHtml(capture.review) : renderBookingHtml(capture);
}

export function verifyPdfText(kind, capture, text) {
  const normalise = (value) => clean(value).normalize('NFKC');
  const contains = (value) => {
    if (!normalise(text).includes(normalise(value))) throw new Error('PDF text is incomplete.');
  };
  if (kind === 'reviews') {
    const actual = parseReviewPdfText(text, `${capture.review.source.reviewId}.pdf`);
    const expected = parseReviewPdfText(reviewText(capture.review), `${capture.review.source.reviewId}.pdf`);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Review PDF differs from the captured record.');
    return { pagesVerified: true, reviewId: actual.source.reviewId };
  }
  const parsed = parseAirbnbBookingPdfText(text);
  if (parsed.source.conversationId !== capture.source.conversationId
    || parsed.conversationEntries.length !== capture.conversation.groups.length) throw new Error('Booking PDF identity or message count differs.');
  for (const [index, group] of capture.conversation.groups.entries()) {
    const message = parseMessageGroup(group);
    contains(message.body);
    contains(message.sender);
    const actual = parsed.conversationEntries[index];
    if (normalise(actual.body) !== normalise(message.body)
      || normalise(actual.senderDisplayName) !== normalise(message.sender)
      || actual.displayedDate !== message.sentDate || actual.displayedTime !== message.sentTime) {
      throw new Error('PDF conversation order or message metadata differs.');
    }
  }
  for (const line of capture.reservation.visibleText.split(/\r?\n/u).filter((value) => value.trim())) contains(line);
  for (const [index, tab] of capture.earnings.tabs.entries()) {
    // Compare within each parsed financial column, not the interleaved PDF text.
    if (normalise(parsed.financialSummaries[index]?.rawDisplayText) !== normalise(tab.text)) {
      throw new Error('PDF financial rows differ from the captured tab.');
    }
  }
  if (parsed.financialSummaries.some((summary) => summary.arithmeticStatus !== 'verified')) {
    throw new Error('Booking financial totals could not be verified.');
  }
  return { pagesVerified: true, conversationId: parsed.source.conversationId, messages: parsed.conversationEntries.length };
}

/** Merge overlapping windows without collapsing two genuinely identical consecutive messages. */
export function appendMessageWindow(previous, next) {
  if (!previous.length) return next;
  const key = (group) => JSON.stringify([group.accessibleLabel, group.visibleText]);
  for (let overlap = Math.min(previous.length, next.length); overlap > 0; overlap -= 1) {
    if (previous.slice(-overlap).every((group, index) => key(group) === key(next[index]))) return [...previous, ...next.slice(overlap)];
  }
  throw new Error('Message windows do not overlap; completeness cannot be established.');
}
