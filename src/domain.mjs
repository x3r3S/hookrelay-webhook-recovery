export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function demoHash(value = "") {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildDemoSignature(payload, secret = "demo_secret", timestamp = 1766217600) {
  const digest = demoHash(`${timestamp}.${stableStringify(payload)}.${secret}`);
  return `t=${timestamp},v1=${digest}`;
}

export function parseSignatureHeader(header = "") {
  return Object.fromEntries(
    String(header)
      .split(",")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

export function inspectDemoSignature({ payload, header, secret = "demo_secret", now = 1766217600, toleranceSeconds = 300 }) {
  const parsed = parseSignatureHeader(header);
  const timestamp = Number(parsed.t);
  const expected = Number.isFinite(timestamp) ? buildDemoSignature(payload, secret, timestamp) : "";
  const expectedDigest = parseSignatureHeader(expected).v1 ?? "";
  const reasons = [];
  if (!Number.isFinite(timestamp)) reasons.push("MISSING_TIMESTAMP");
  if (!parsed.v1) reasons.push("MISSING_DIGEST");
  if (parsed.v1 && expectedDigest && parsed.v1 !== expectedDigest) reasons.push("DIGEST_MISMATCH");
  if (Number.isFinite(timestamp) && Math.abs(now - timestamp) > toleranceSeconds) reasons.push("TIMESTAMP_OUTSIDE_TOLERANCE");
  return {
    valid: reasons.length === 0,
    algorithm: "FNV-1a demo hash",
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    receivedDigest: parsed.v1 ?? "",
    expectedDigest,
    reasons
  };
}

export function validateEventSchema(event = {}) {
  const errors = [];
  if (typeof event.id !== "string" || !/^evt_[a-z0-9_]+$/i.test(event.id)) errors.push("INVALID_EVENT_ID");
  if (typeof event.type !== "string" || !/^[a-z]+\.[a-z_]+$/i.test(event.type)) errors.push("INVALID_EVENT_TYPE");
  if (!Number.isInteger(event.created) || event.created <= 0) errors.push("INVALID_CREATED_AT");
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) errors.push("INVALID_DATA_OBJECT");
  return { valid: errors.length === 0, errors };
}

export function idempotencyKey(event = {}) {
  return `${event.id ?? "missing"}:${demoHash(stableStringify(event.data ?? null))}`;
}

export function createRelayState() {
  return { seen: [], events: [], audit: [] };
}

export function acceptInbound(state, envelope, at = "2026-08-19T08:00:00.000Z") {
  const next = structuredClone(state);
  const schema = validateEventSchema(envelope.event);
  const signature = inspectDemoSignature({
    payload: envelope.event,
    header: envelope.signature,
    secret: envelope.secret ?? "demo_secret",
    now: envelope.now ?? envelope.event?.created
  });
  const eventIdempotencyKey = idempotencyKey(envelope.event);
  let decision = "accepted";
  let reasons = [];

  if (!signature.valid) {
    decision = "rejected";
    reasons = signature.reasons;
  } else if (!schema.valid) {
    decision = "rejected";
    reasons = schema.errors;
  } else if (next.seen.includes(eventIdempotencyKey)) {
    decision = "duplicate";
    reasons = ["IDEMPOTENCY_KEY_SEEN"];
  } else {
    next.seen.push(eventIdempotencyKey);
    next.events.push({ ...envelope.event, status: "queued", attempts: [] });
  }

  next.audit.push({ at, eventId: envelope.event?.id ?? "missing", action: "INGEST", decision, reasons });
  return { state: next, decision, reasons, schema, signature, idempotencyKey: eventIdempotencyKey };
}

export function retryDelaySeconds(attempt, baseSeconds = 30) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError("Attempt must be a positive integer.");
  return attempt === 1 ? 0 : baseSeconds * (2 ** (attempt - 2));
}

export function simulateDelivery(event, outcomes = [], maxAttempts = 4) {
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = outcomes[attempt - 1] ?? "timeout";
    const success = outcome === "200" || outcome === "204";
    attempts.push({ attempt, afterSeconds: retryDelaySeconds(attempt), outcome, success });
    if (success) return { status: "delivered", attempts };
  }
  return { status: "dead_letter", attempts };
}

export function manualReplay(delivery, replayOutcome = "200") {
  if (delivery.status !== "dead_letter") {
    return { ...delivery, replayed: false, replayReason: "NOT_IN_DEAD_LETTER" };
  }
  const success = replayOutcome === "200" || replayOutcome === "204";
  return {
    ...delivery,
    status: success ? "delivered" : "dead_letter",
    replayed: true,
    replay: { outcome: replayOutcome, success }
  };
}

export function buildAuditExport(state, project = "HookRelay") {
  return {
    project,
    provenance: "personal_demo",
    externalActions: false,
    processed: state.audit.length,
    accepted: state.audit.filter(({ decision }) => decision === "accepted").length,
    duplicates: state.audit.filter(({ decision }) => decision === "duplicate").length,
    rejected: state.audit.filter(({ decision }) => decision === "rejected").length,
    audit: state.audit
  };
}
