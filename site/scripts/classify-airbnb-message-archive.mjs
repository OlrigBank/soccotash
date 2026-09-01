const MONTH_PATTERN = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

export function classifyArchiveEntry(entry) {
  const label = String(entry.label || "");

  if (label.includes("Airbnb Support")) {
    return {
      ...entry,
      classification: "support",
      captureEligible: false,
      classificationReason: "Airbnb Support thread",
    };
  }

  if (label.includes("Canceled.") && MONTH_PATTERN.test(label)) {
    return {
      ...entry,
      classification: "cancelled-booking-candidate",
      captureEligible: true,
      classificationReason: "Archive label displays canceled status, stay dates and listing",
    };
  }

  if (label.includes("Reservation request canceled") || label.includes("Airbnb update: Reservation canceled")) {
    return {
      ...entry,
      classification: "unconfirmed-request",
      captureEligible: false,
      classificationReason: "Reservation request was canceled before confirmation",
    };
  }

  if (MONTH_PATTERN.test(label)) {
    return {
      ...entry,
      classification: "booking-candidate",
      captureEligible: true,
      classificationReason: "Archive label displays stay dates and listing",
    };
  }

  return {
    ...entry,
    classification: "other",
    captureEligible: false,
    classificationReason: "No booking evidence in archive label",
  };
}

export function reconcileArchiveEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("Archive entries must be an array");

  const seenIds = new Set();
  const seenIndexes = new Set();
  const classified = entries.map((entry) => {
    if (!Number.isInteger(entry.index) || entry.index < 0) {
      throw new Error("Every archive entry requires a non-negative integer index");
    }
    if (!/^\d+$/.test(String(entry.conversationId || ""))) {
      throw new Error(`Archive entry ${entry.index} has no valid conversation ID`);
    }
    if (seenIndexes.has(entry.index)) {
      throw new Error(`Duplicate archive index ${entry.index}`);
    }
    if (seenIds.has(entry.conversationId)) {
      throw new Error(`Duplicate conversation ID ${entry.conversationId}`);
    }
    seenIndexes.add(entry.index);
    seenIds.add(entry.conversationId);
    return classifyArchiveEntry(entry);
  });

  const sorted = [...classified].sort((a, b) => a.index - b.index);
  sorted.forEach((entry, expectedIndex) => {
    if (entry.index !== expectedIndex) {
      throw new Error(`Archive inventory is missing index ${expectedIndex}`);
    }
  });

  const counts = sorted.reduce((result, entry) => {
    result[entry.classification] = (result[entry.classification] || 0) + 1;
    return result;
  }, {});

  return {
    items: sorted,
    captureQueue: sorted.filter((entry) => entry.captureEligible),
    counts,
  };
}
