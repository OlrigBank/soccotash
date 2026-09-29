export const reviewText = `Example Guest's review
Olrig Bank: Spacious, but cosy, with large garden
August 27 – 30 - 3 nights · Published August 30, 2026
Public review
Rating, 4 stars
A comfortable stay. The garden was lovely.
Note from Example Guest
Only visible to you and Airbnb
Private fixture feedback.
Detailed ratings
Check-in
Rating, 5 stars
Positive feedback
Clear instructions
Cleanliness
Rating, 4 stars
Accuracy
Rating, 5 stars
Communication
Rating, 5 stars
Location
Rating, 5 stars
Value
Rating, 4 stars`;

export const booking = {
  schemaVersion: 1,
  capturedAt: '2026-09-01T08:00:00.000Z',
  source: { conversationId: '8000000001', url: 'https://www.airbnb.com/hosting/messages/8000000001' },
  conversation: {
    heading: 'Example Guest',
    groups: [
      { index: 0, accessibleLabel: 'Aug 1, 2026. Example Guest sent A synthetic booking message. Sent Aug 1, 2026, 1:15 PM', visibleText: 'A synthetic booking message.' },
      { index: 1, accessibleLabel: 'Airbnb service says Booking confirmed. Sent Aug 1, 2026, 2:30 PM', visibleText: 'Booking confirmed.' },
    ],
  },
  reservation: { visibleText: `Reservation
Example Guest’s group of 2
Oct 24 – 26 · 2 nights
Olrig Bank: Spacious, but cosy, with large garden
Check-in
Sat, Oct 24
4:00 PM
Checkout
Mon, Oct 26
10:00 AM
Your notes
Disposable fixture only
Guests
Example Guest
2 adults
Cancellation policy
Moderate
£100.00
Total for 2 nights` },
  earnings: { tabs: [
    { name: 'You earn', text: '£100.00\n2 nights room fee\n£100.00\nTotal (GBP)\n£100.00' },
    { name: 'Guest paid', text: '£120.00\n2 nights room fee\n£100.00\nGuest service fee\n£20.00\nTotal (GBP)\n£120.00' },
  ] },
};

const escape = (text) => text.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function reviewPage() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Disposable Airbnb review fixture</title><div role="dialog" aria-label="Single review page">${reviewText.split('\n').map((line) => line.startsWith('Rating,') ? `<div role="img" aria-label="${line}"></div>` : `<div>${escape(line)}</div>`).join('')}<button aria-label="Close">Close</button></div></html>`;
}

export function bookingPage() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Disposable Airbnb booking fixture</title>
<h1>Example Guest</h1><aside style="white-space:pre-line">${escape(booking.reservation.visibleText)}</aside>
<section id="messages" style="height:150px;overflow:auto">${booking.conversation.groups.map((group) => `<div style="min-height:120px" role="group" aria-label="${escape(group.accessibleLabel)}">${escape(group.visibleText)}</div>`).join('')}</section>
<button aria-label="Earnings" onclick="document.querySelector('[role=dialog]').hidden=false">Earnings</button>
<div role="dialog" hidden><div role="tablist"><button role="tab" aria-selected="true" onclick="selectTab(0)">You earn</button><button role="tab" aria-selected="false" onclick="selectTab(1)">Guest paid</button></div>
${booking.earnings.tabs.map((tab, index) => `<div role="tabpanel" ${index ? 'hidden' : ''} style="white-space:pre-line">${escape(tab.text)}</div>`).join('')}</div>
<script>function selectTab(index){document.querySelectorAll('[role=tab]').forEach((tab,i)=>tab.setAttribute('aria-selected',String(i===index)));document.querySelectorAll('[role=tabpanel]').forEach((panel,i)=>panel.hidden=i!==index)}</script></html>`;
}
