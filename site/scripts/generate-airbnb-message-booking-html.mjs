#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nonEmptyLines(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normaliseHeading(value) {
  const lines = nonEmptyLines(value);
  return lines.filter((line, index) => index === 0 || line !== lines[index - 1]).join(" ");
}

export function parseMessageGroup(group) {
  const label = String(group.accessibleLabel || "").trim();
  const match = label.match(
    /^(?:(?:[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Yesterday)\. )?(?:Most Recent Message\. )?(Airbnb service says|.+? sent) ([\s\S]*)\. Sent ((?:[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Yesterday)), (\d{1,2}:\d{2} [AP]M)(?:\..*)?$/,
  );

  if (!match) {
    throw new Error(`Cannot parse message group ${group.index}: ${label}`);
  }

  const sender = match[1] === "Airbnb service says"
    ? "Airbnb service"
    : match[1].replace(/ sent$/, "");

  const sentDate = match[3];
  const sentTime = match[4];
  const visibleLines = nonEmptyLines(group.visibleText);
  if (visibleLines[0] === sentDate) visibleLines.shift();
  if (visibleLines[0]?.includes("· Booker")) visibleLines.shift();
  if (visibleLines[0] === sentTime) visibleLines.shift();

  return {
    index: group.index,
    sender,
    body: visibleLines.join("\n") || match[2].trim(),
    sentDate,
    sentTime,
  };
}

function renderDisplayLines(value) {
  return nonEmptyLines(value)
    .map((line) => `<div class="display-line">${escapeHtml(line)}</div>`)
    .join("\n");
}

function renderMessages(groups) {
  return groups.map(parseMessageGroup).map((message) => `
    <article class="message ${message.sender === "Airbnb service" ? "message--service" : ""}">
      <div class="message__meta">
        <strong>${escapeHtml(message.sender)}</strong>
        <span>${escapeHtml(message.sentDate)} at ${escapeHtml(message.sentTime)}</span>
      </div>
      <div class="message__body">${escapeHtml(message.body)}</div>
    </article>`).join("\n");
}

export function renderBookingHtml(capture) {
  if (capture?.schemaVersion !== 1) {
    throw new Error("Expected Airbnb message capture schemaVersion 1");
  }
  if (!capture.source?.conversationId) {
    throw new Error("Capture has no conversation ID");
  }
  if (!Array.isArray(capture.conversation?.groups) || capture.conversation.groups.length === 0) {
    throw new Error("Capture has no conversation messages");
  }
  if (!capture.reservation?.visibleText) {
    throw new Error("Capture has no reservation details");
  }

  const tabs = new Map((capture.earnings?.tabs || []).map((tab) => [tab.name, tab.text]));
  for (const requiredTab of ["You earn", "Guest paid"]) {
    if (!tabs.get(requiredTab)) {
      throw new Error(`Capture has no ${requiredTab} earnings tab`);
    }
  }

  const heading = normaliseHeading(capture.conversation.heading) || "Airbnb booking";
  const conversationId = capture.source.conversationId;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(heading)} - Airbnb booking ${escapeHtml(conversationId)}</title>
  <style>
    @page { size: A4; margin: 16mm 15mm 17mm; }
    * { box-sizing: border-box; }
    html { color: #202124; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.42; }
    body { margin: 0; }
    h1, h2 { color: #172b3a; margin: 0; }
    h1 { font-size: 22pt; line-height: 1.12; }
    h2 { border-bottom: 1px solid #b7c5cf; font-size: 14pt; margin-bottom: 8px; padding-bottom: 4px; }
    .document-header { border-bottom: 3px solid #cc3852; margin-bottom: 16px; padding-bottom: 10px; }
    .eyebrow { color: #cc3852; font-size: 8pt; font-weight: 700; letter-spacing: .08em; margin-bottom: 4px; text-transform: uppercase; }
    .identity { color: #52616b; margin-top: 6px; }
    .section { break-before: page; }
    .section--first { break-before: auto; }
    .summary-card, .finance-card { border: 1px solid #cfd8de; border-radius: 8px; padding: 10px 12px; }
    .display-line + .display-line { margin-top: 3px; }
    .finance-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    .finance-card { break-inside: avoid; }
    .finance-card h3 { color: #172b3a; font-size: 12pt; margin: 0 0 7px; }
    .message { border-left: 3px solid #59778a; break-inside: avoid; margin: 0 0 9px; padding: 7px 10px; }
    .message--service { background: #f3f6f7; border-left-color: #9aa8b1; }
    .message__meta { align-items: baseline; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 3px; }
    .message__meta span { color: #61717b; font-size: 8.5pt; white-space: nowrap; }
    .message__body { overflow-wrap: anywhere; white-space: pre-wrap; }
    .privacy { background: #fff4f1; border-left: 4px solid #cc3852; margin-top: 14px; padding: 8px 10px; }
    .footer-note { color: #687780; font-size: 8pt; margin-top: 14px; }
    @media print {
      .finance-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <header class="document-header">
    <div class="eyebrow">Private Airbnb booking record</div>
    <h1>${escapeHtml(heading)}</h1>
    <div class="identity">Conversation ID ${escapeHtml(conversationId)} · Captured ${escapeHtml(capture.capturedAt)}</div>
  </header>

  <section class="section section--first">
    <h2>Reservation details</h2>
    <div class="summary-card">${renderDisplayLines(capture.reservation.visibleText)}</div>
    <aside class="privacy"><strong>Private record.</strong> This document may contain personal, access and financial information. Do not publish or share it.</aside>
    <div class="footer-note">Source: signed-in Airbnb host message archive. Generated locally from the displayed interface.</div>
  </section>

  <section class="section">
    <h2>Price totals and breakdowns</h2>
    <div class="finance-grid">
      <div class="finance-card">
        <h3>You earn</h3>
        ${renderDisplayLines(tabs.get("You earn"))}
      </div>
      <div class="finance-card">
        <h3>Guest paid</h3>
        ${renderDisplayLines(tabs.get("Guest paid"))}
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Complete conversation</h2>
    ${renderMessages(capture.conversation.groups)}
  </section>

</body>
</html>`;
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("Usage: generate-airbnb-message-booking-html.mjs INPUT.json OUTPUT.html");
  }

  const capture = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const html = renderBookingHtml(capture);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, { mode: 0o600 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
