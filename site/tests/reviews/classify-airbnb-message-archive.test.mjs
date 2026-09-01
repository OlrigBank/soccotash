import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyArchiveEntry,
  reconcileArchiveEntries,
} from "../../scripts/classify-airbnb-message-archive.mjs";

test("classifies support, booking, cancelled booking and unconfirmed request labels", () => {
  const cases = [
    ["Read. Closed. Airbnb Support. Last message sent Jun 9", "support", false],
    ["Read. Aug 20 - 22, 2025. Olrig Bank. Guest.", "booking-candidate", true],
    ["Read. Canceled. Jul 11 - 13, 2025. Olrig Bank. Guest.", "cancelled-booking-candidate", true],
    ["Read. Jul 4 - 6, 2025. Olrig Bank. Reservation request canceled.", "unconfirmed-request", false],
    ["Read. Nov 23 - 24, 2024. Room. Airbnb update: Reservation canceled.", "unconfirmed-request", false],
  ];

  for (const [label, classification, captureEligible] of cases) {
    const result = classifyArchiveEntry({ label });
    assert.equal(result.classification, classification);
    assert.equal(result.captureEligible, captureEligible);
  }
});

test("reconciles a contiguous unique inventory into a capture queue", () => {
  const result = reconcileArchiveEntries([
    { index: 1, conversationId: "102", label: "Read. Closed. Airbnb Support." },
    { index: 0, conversationId: "101", label: "Read. Aug 20 - 22, 2025. Olrig Bank. Guest." },
  ]);

  assert.deepEqual(result.items.map((entry) => entry.index), [0, 1]);
  assert.deepEqual(result.captureQueue.map((entry) => entry.conversationId), ["101"]);
  assert.deepEqual(result.counts, { "booking-candidate": 1, support: 1 });
});

test("rejects duplicate IDs and incomplete index ranges", () => {
  assert.throws(
    () => reconcileArchiveEntries([
      { index: 0, conversationId: "101", label: "Read. Jan 1 - 2, 2025." },
      { index: 1, conversationId: "101", label: "Read. Jan 3 - 4, 2025." },
    ]),
    /Duplicate conversation ID/,
  );

  assert.throws(
    () => reconcileArchiveEntries([
      { index: 1, conversationId: "101", label: "Read. Jan 1 - 2, 2025." },
    ]),
    /missing index 0/,
  );
});
