import {
  acceptInbound,
  buildAuditExport,
  buildDemoSignature,
  createRelayState,
  inspectDemoSignature,
  manualReplay,
  recordOperatorReplay,
  simulateDelivery,
  validateEventSchema
} from "./domain.mjs";

const events = [
  {
    uiKey: "order-1048",
    event: { id: "evt_order_1048", type: "order.created", created: 1766217600, data: { order_id: "ord_1048", amount: 12900, currency: "EUR", email: "maya@example.test" } },
    outcomes: ["500", "200"],
    endpoint: "/hooks/orders"
  },
  {
    uiKey: "invoice-772",
    event: { id: "evt_invoice_772", type: "invoice.finalized", created: 1766217660, data: { invoice_id: "inv_772", total: 48000, currency: "EUR", account: "acct_demo_18" } },
    outcomes: ["500", "timeout", "503", "500"],
    endpoint: "/hooks/invoices"
  },
  {
    uiKey: "order-1048-copy",
    event: { id: "evt_order_1048", type: "order.created", created: 1766217600, data: { order_id: "ord_1048", amount: 12900, currency: "EUR", email: "maya@example.test" } },
    outcomes: [],
    endpoint: "/hooks/orders",
    duplicate: true
  },
  {
    uiKey: "profile-91",
    event: { id: "evt_profile_91", type: "profile.updated", created: 1766217720, data: { profile_id: "pro_91", locale: "de-DE", plan: "team" } },
    outcomes: [],
    endpoint: "/hooks/profiles",
    tampered: true
  }
];

const ui = {
  relay: createRelayState(),
  processed: [],
  deliveries: new Map(),
  selected: events[0].uiKey
};

const elements = {
  eventList: document.querySelector("#event-list"),
  payload: document.querySelector("#payload-json"),
  requestSize: document.querySelector("#request-size"),
  signatureResult: document.querySelector("#signature-result"),
  signatureTime: document.querySelector("#signature-time"),
  signatureReceived: document.querySelector("#signature-received"),
  signatureExpected: document.querySelector("#signature-expected"),
  schemaResult: document.querySelector("#schema-result"),
  schemaList: document.querySelector("#schema-list"),
  deliveryStatus: document.querySelector("#delivery-status"),
  timeline: document.querySelector("#delivery-timeline"),
  dlqCard: document.querySelector("#dlq-card"),
  replay: document.querySelector("#manual-replay"),
  decision: document.querySelector("#decision-card"),
  auditEntries: document.querySelector("#audit-entries"),
  toast: document.querySelector("#toast")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signatureFor(item) {
  const valid = buildDemoSignature(item.event);
  return item.tampered ? valid.replace(/v1=./, "v1=0") : valid;
}

function resetState() {
  ui.relay = createRelayState();
  ui.processed = [];
  ui.deliveries = new Map();

  for (const [index, item] of events.entries()) {
    const envelope = { event: item.event, signature: signatureFor(item), now: item.event.created };
    const result = acceptInbound(ui.relay, envelope, `2026-08-19T08:0${index}:00.000Z`);
    ui.relay = result.state;
    const delivery = result.decision === "accepted" ? simulateDelivery(item.event, item.outcomes) : null;
    if (delivery) ui.deliveries.set(item.uiKey, delivery);
    ui.processed.push({ ...item, ...result, delivery });
  }
}

function selectedItem() {
  return ui.processed.find(({ uiKey }) => uiKey === ui.selected) ?? ui.processed[0];
}

function itemState(item) {
  if (item.decision !== "accepted") return item.decision;
  return ui.deliveries.get(item.uiKey)?.status ?? item.delivery?.status ?? "queued";
}

function visibleState(status) {
  return ({ delivered: "dry-run 200", dead_letter: "dry-run DLQ", duplicate: "duplicate gated", rejected: "rejected" })[status] ?? prettyStatus(status);
}

function prettyStatus(status) {
  return status.replaceAll("_", " ");
}

function syntaxJson(value) {
  const safe = escapeHtml(JSON.stringify(value, null, 2));
  return safe.replace(/(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\&])*&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, (match, string, colon) => {
    if (string) return `<span class="${colon ? "code-key" : "code-string"}">${string}</span>${colon ?? ""}`;
    return `<span class="code-number">${match}</span>`;
  });
}

function restoreEventFocus(uiKey) {
  const selectedButton = [...elements.eventList.querySelectorAll("[data-event-key]")]
    .find((button) => button.dataset.eventKey === uiKey);
  selectedButton?.focus({ preventScroll: true });
}

function renderEventList() {
  elements.eventList.innerHTML = ui.processed.map((item) => {
    const status = itemState(item);
    const selected = item.uiKey === ui.selected;
    const occurrence = item.decision === "duplicate" ? "duplicate copy" : "fixture";
    return `
      <button class="event-item ${selected ? "is-selected" : ""}" type="button" data-event-key="${escapeHtml(item.uiKey)}" data-state="${status}" aria-label="Inspect ${escapeHtml(item.event.id)}, ${occurrence}" aria-pressed="${selected}">
        <span class="event-type-icon" aria-hidden="true">{ }</span>
        <span class="event-copy">
          <span class="event-row"><strong>${escapeHtml(item.event.type)}</strong><span class="event-state ${status}">${escapeHtml(visibleState(status))}</span></span>
          <small>${escapeHtml(item.event.id)} · ${item.event.created}</small>
        </span>
      </button>`;
  }).join("");
  elements.eventList.querySelectorAll("[data-event-key]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const selectedKey = button.dataset.eventKey;
      const restoreKeyboardFocus = event.detail === 0 && document.activeElement === button;
      ui.selected = selectedKey;
      render();
      if (restoreKeyboardFocus) restoreEventFocus(selectedKey);
    });
  });
}

function renderInspector(item) {
  const raw = JSON.stringify(item.event);
  const visibleEvent = item.event?.data?.email
    ? { ...item.event, data: { ...item.event.data, email: "[contact redacted]" } }
    : item.event;
  elements.payload.innerHTML = syntaxJson(visibleEvent);
  elements.requestSize.textContent = `${new TextEncoder().encode(raw).length} bytes`;
  document.querySelector(".request-line code").textContent = item.endpoint;

  const inspection = inspectDemoSignature({ payload: item.event, header: signatureFor(item), now: item.event.created });
  elements.signatureResult.textContent = inspection.valid ? "Verified" : "Failed";
  elements.signatureResult.className = `result-chip ${inspection.valid ? "is-pass" : "is-fail"}`;
  elements.signatureTime.textContent = inspection.timestamp ? `${inspection.timestamp} · within 300s` : "Missing";
  elements.signatureReceived.textContent = inspection.receivedDigest || "Missing";
  elements.signatureExpected.textContent = inspection.expectedDigest || "Unavailable";

  const schema = validateEventSchema(item.event);
  const duplicate = item.decision === "duplicate";
  elements.schemaResult.textContent = duplicate ? "Duplicate" : schema.valid ? "Passed" : "Failed";
  elements.schemaResult.className = `result-chip ${duplicate ? "is-duplicate" : schema.valid ? "is-pass" : "is-fail"}`;
  const checks = [
    { label: "Event ID follows the fixture schema", pass: !schema.errors.includes("INVALID_EVENT_ID") },
    { label: "Type uses resource.action", pass: !schema.errors.includes("INVALID_EVENT_TYPE") },
    { label: "Data is a structured object", pass: !schema.errors.includes("INVALID_DATA_OBJECT") },
    { label: duplicate ? "Idempotency key already seen" : "Idempotency key is new", pass: !duplicate }
  ];
  elements.schemaList.innerHTML = checks.map(({ label, pass }) => `<li class="${pass ? "" : "is-fail"}">${escapeHtml(label)}</li>`).join("");
}

function baseTimeline(item) {
  const steps = [
    { label: "Event received", detail: `${item.event.id} · intake`, tone: "pass" },
    { label: item.signature.valid ? "Fixture digest verified" : "Digest rejected", detail: item.signature.valid ? "digest + timestamp passed" : item.signature.reasons.join(" · "), tone: item.signature.valid ? "pass" : "fail" }
  ];
  if (item.decision === "duplicate") steps.push({ label: "Duplicate gated", detail: "idempotency key already seen", tone: "warn" });
  else if (item.decision === "rejected") steps.push({ label: "Stopped before delivery", detail: item.reasons.join(" · "), tone: "fail" });
  else steps.push({ label: "Schema accepted", detail: "event queued for isolated delivery", tone: "pass" });
  return steps;
}

function renderDelivery(item) {
  const status = itemState(item);
  const delivery = ui.deliveries.get(item.uiKey) ?? item.delivery;
  elements.deliveryStatus.textContent = status === "delivered"
    ? delivery?.replayed ? `dry run · replayed ${delivery.replay.outcome}` : "dry run · delivered"
    : visibleState(status);
  elements.deliveryStatus.className = `status-chip status-${status}`;
  const steps = baseTimeline(item);

  if (delivery) {
    delivery.attempts.forEach(({ attempt, afterSeconds, outcome, success }) => {
      steps.push({ label: `Attempt ${attempt} · ${outcome}`, detail: attempt === 1 ? "immediate" : `retry after ${afterSeconds}s`, tone: success ? "pass" : "fail" });
    });
    if (delivery.replayed) steps.push({ label: `Manual replay · ${delivery.replay.outcome}`, detail: "operator-triggered local action", tone: delivery.replay.success ? "pass" : "fail" });
  }

  elements.timeline.innerHTML = steps.map(({ label, detail, tone }) => `
    <li class="${tone === "fail" ? "is-fail" : tone === "warn" ? "is-warn" : ""}">
      <span class="timeline-marker" aria-hidden="true">${tone === "pass" ? "✓" : tone === "warn" ? "≋" : "×"}</span>
      <strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small>
    </li>
  `).join("");

  elements.dlqCard.hidden = status !== "dead_letter";
  const decisionCopy = {
    delivered: delivery?.replayed
      ? ["Replay complete", `The isolated route returned ${delivery.replay.outcome}; the local delivery is now marked delivered.`]
      : ["Delivery complete", "The isolated route returned a successful response during the deterministic retry sequence."],
    dead_letter: ["Manual decision required", "Four attempts were exhausted. The event stays visible until an operator replays it."],
    duplicate: ["Delivery intentionally skipped", "The same event ID and payload fingerprint already passed the gate."],
    rejected: ["Rejected before queue", "Fixture digest validation failed, so this event never entered the delivery path."],
    queued: ["Queued", "The event is ready for isolated delivery replay."]
  }[status];
  elements.decision.innerHTML = `<strong>${decisionCopy[0]}</strong>${decisionCopy[1]}`;
}

function renderAudit() {
  const report = buildAuditExport(ui.relay);
  document.querySelector("#metric-total").textContent = report.processed;
  document.querySelector("#metric-accepted").textContent = report.accepted;
  document.querySelector("#metric-duplicates").textContent = report.duplicates;
  document.querySelector("#metric-rejected").textContent = report.rejected;
  const entries = [...report.audit, ...(report.operatorAudit ?? [])]
    .sort((left, right) => String(left.at).localeCompare(String(right.at)));
  elements.auditEntries.innerHTML = entries.slice(-3).reverse().map((entry) => `
    <li><strong>${escapeHtml(entry.eventId)}</strong><small>${entry.action === "OPERATOR_REPLAY"
      ? `${escapeHtml("operator replay")} · ${escapeHtml(entry.outcome)} · ${escapeHtml("local simulation")} · ${escapeHtml(entry.at.slice(11,16))} UTC`
      : `${escapeHtml(entry.decision)} · ${escapeHtml(entry.at.slice(11,16))} UTC`}</small></li>
  `).join("");
}

function render() {
  const item = selectedItem();
  renderEventList();
  renderInspector(item);
  renderDelivery(item);
  renderAudit();
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
}

function downloadAudit() {
  const exportPayload = {
    ...buildAuditExport(ui.relay),
    deliveries: Object.fromEntries([...ui.deliveries].map(([key, value]) => [key, value]))
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "hookrelay-audit.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Audit JSON downloaded locally.");
}

document.querySelector("#export-audit").addEventListener("click", downloadAudit);
document.querySelector("#run-inspection").addEventListener("click", () => {
  const item = selectedItem();
  showToast(item.signature.valid ? "Inspection complete: digest and schema decisions reproduced." : `Inspection stopped: ${item.reasons.join(" · ")}.`);
});
document.querySelector("#copy-payload").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedItem().event, null, 2));
    showToast("Payload copied.");
  } catch {
    showToast("Clipboard access is unavailable in this browser.");
  }
});
elements.replay.addEventListener("click", () => {
  const item = selectedItem();
  const delivery = ui.deliveries.get(item.uiKey);
  if (!delivery || delivery.status !== "dead_letter") return;
  const replayed = manualReplay(delivery, "200");
  ui.deliveries.set(item.uiKey, replayed);
  ui.relay = recordOperatorReplay(ui.relay, item.event.id, replayed.replay.outcome);
  render();
  elements.decision.focus({ preventScroll: true });
  showToast("Manual replay returned 200 in the isolated route.");
});
document.querySelector("#reset-demo").addEventListener("click", () => {
  resetState();
  ui.selected = events[0].uiKey;
  render();
  showToast("Event session reset.");
});

resetState();
render();
