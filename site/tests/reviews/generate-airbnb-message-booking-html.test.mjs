import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMessageGroup,
  renderBookingHtml,
} from "../../scripts/generate-airbnb-message-booking-html.mjs";

const capture = {
  schemaVersion: 1,
  capturedAt: "2026-09-01T08:00:00.000Z",
  source: { conversationId: "123" },
  conversation: {
    heading: "Example guest",
    groups: [
      {
        index: 0,
        accessibleLabel: "Jan 2, 2026. Guest sent Hello. Sent Jan 2, 2026, 3:04 PM",
        visibleText: "Jan 2, 2026\nGuest · Booker\n3:04 PM\nHello",
      },
      {
        index: 1,
        accessibleLabel: "Airbnb service says Request accepted. Sent Jan 2, 2026, 3:05 PM",
        visibleText: "Request accepted",
      },
    ],
  },
  reservation: { visibleText: "Reservation\nJan 10 - 12, 2026\n£100.00\nTotal for 2 nights" },
  earnings: {
    tabs: [
      { name: "You earn", text: "£100.00\nTotal (GBP)\n£100.00" },
      { name: "Guest paid", text: "£120.00\nTotal (GBP)\n£120.00" },
    ],
  },
};

test("parses guest and Airbnb service message labels", () => {
  assert.deepEqual(parseMessageGroup(capture.conversation.groups[0]), {
    index: 0,
    sender: "Guest",
    body: "Hello",
    sentDate: "Jan 2, 2026",
    sentTime: "3:04 PM",
  });
  assert.equal(parseMessageGroup(capture.conversation.groups[1]).sender, "Airbnb service");
  assert.deepEqual(parseMessageGroup({
    index: 2,
    accessibleLabel: "Most Recent Message. Host sent Thanks. Sent Aug 10, 9:19 PM. Read by guest",
    visibleText: "9:19 PM\nThanks\nRead by guest",
  }), {
    index: 2,
    sender: "Host",
    body: "Thanks\nRead by guest",
    sentDate: "Aug 10",
    sentTime: "9:19 PM",
  });
});

test("renders the complete private booking sections", () => {
  const html = renderBookingHtml(capture);
  assert.match(html, /Reservation details/);
  assert.match(html, /You earn/);
  assert.match(html, /Guest paid/);
  assert.match(html, /Complete conversation/);
  assert.match(html, /Conversation ID 123/);
  assert.match(html, /Request accepted/);
});

test("normalises Airbnb's duplicated conversation heading", () => {
  const duplicated = structuredClone(capture);
  duplicated.conversation.heading = "Example guest\nExample guest";
  const html = renderBookingHtml(duplicated);
  assert.match(html, /<h1>Example guest<\/h1>/);
  assert.doesNotMatch(html, /Example guest Example guest/);
});

test("rejects a capture missing a required financial tab", () => {
  const incomplete = structuredClone(capture);
  incomplete.earnings.tabs = incomplete.earnings.tabs.slice(0, 1);
  assert.throws(() => renderBookingHtml(incomplete), /Guest paid/);
});
