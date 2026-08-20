import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptInbound,
  buildAuditExport,
  buildDemoSignature,
  createRelayState,
  demoHash,
  idempotencyKey,
  inspectDemoSignature,
  manualReplay,
  parseSignatureHeader,
  retryDelaySeconds,
  simulateDelivery,
  stableStringify,
  validateEventSchema
} from "../src/domain.mjs";

const event = { id: "evt_order_1048", type: "order.created", created: 1766217600, data: { total: 12900, currency: "EUR" } };

test("stable serialization ignores object insertion order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(stableStringify([2, { z: true, a: false }]), '[2,{"a":false,"z":true}]');
});

test("demo hash and signature are deterministic", () => {
  assert.equal(demoHash("relay"), demoHash("relay"));
  assert.match(buildDemoSignature(event), /^t=1766217600,v1=[a-f0-9]{8}$/);
});

test("parses a two-part signature header", () => {
  assert.deepEqual(parseSignatureHeader("t=123, v1=abc"), { t: "123", v1: "abc" });
});

test("accepts a matching fresh demo signature", () => {
  const result = inspectDemoSignature({ payload: event, header: buildDemoSignature(event), now: event.created });
  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.receivedDigest, result.expectedDigest);
});

test("rejects tampering and stale timestamps with explicit reasons", () => {
  const tampered = inspectDemoSignature({ payload: { ...event, type: "order.refunded" }, header: buildDemoSignature(event), now: event.created + 1000 });
  assert.equal(tampered.valid, false);
  assert.deepEqual(tampered.reasons, ["DIGEST_MISMATCH", "TIMESTAMP_OUTSIDE_TOLERANCE"]);
});

test("validates event schema without assuming a provider", () => {
  assert.equal(validateEventSchema(event).valid, true);
  assert.deepEqual(validateEventSchema({ id: "1048", type: "created", created: 0, data: [] }).errors, [
    "INVALID_EVENT_ID",
    "INVALID_EVENT_TYPE",
    "INVALID_CREATED_AT",
    "INVALID_DATA_OBJECT"
  ]);
});

test("creates a stable idempotency key from id and data", () => {
  assert.equal(idempotencyKey(event), idempotencyKey({ ...event, data: { currency: "EUR", total: 12900 } }));
  assert.notEqual(idempotencyKey(event), idempotencyKey({ ...event, data: { total: 13000, currency: "EUR" } }));
});

test("accepts once and gates an identical duplicate", () => {
  const envelope = { event, signature: buildDemoSignature(event), now: event.created };
  const first = acceptInbound(createRelayState(), envelope);
  const second = acceptInbound(first.state, envelope);
  assert.equal(first.decision, "accepted");
  assert.equal(first.state.events.length, 1);
  assert.equal(second.decision, "duplicate");
  assert.deepEqual(second.reasons, ["IDEMPOTENCY_KEY_SEEN"]);
  assert.equal(second.state.events.length, 1);
});

test("rejects a bad signature before queueing", () => {
  const result = acceptInbound(createRelayState(), { event, signature: "t=1766217600,v1=bad", now: event.created });
  assert.equal(result.decision, "rejected");
  assert.equal(result.state.events.length, 0);
  assert.deepEqual(result.reasons, ["DIGEST_MISMATCH"]);
});

test("uses a deterministic exponential retry schedule", () => {
  assert.deepEqual([1, 2, 3, 4].map((attempt) => retryDelaySeconds(attempt)), [0, 30, 60, 120]);
  assert.throws(() => retryDelaySeconds(0), /positive integer/i);
});

test("stops on delivery success or routes exhausted attempts to DLQ", () => {
  const recovered = simulateDelivery(event, ["timeout", "500", "204"]);
  const exhausted = simulateDelivery(event, ["500", "500", "timeout", "500"]);
  assert.equal(recovered.status, "delivered");
  assert.equal(recovered.attempts.length, 3);
  assert.equal(exhausted.status, "dead_letter");
  assert.equal(exhausted.attempts.length, 4);
});

test("manual replay is gated to dead-letter deliveries", () => {
  assert.equal(manualReplay({ status: "delivered", attempts: [] }).replayed, false);
  const replayed = manualReplay({ status: "dead_letter", attempts: [] }, "200");
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.status, "delivered");
});

test("builds a transparent audit export with no external-action claim", () => {
  const envelope = { event, signature: buildDemoSignature(event), now: event.created };
  const first = acceptInbound(createRelayState(), envelope);
  const second = acceptInbound(first.state, envelope);
  const report = buildAuditExport(second.state);
  assert.deepEqual({ processed: report.processed, accepted: report.accepted, duplicates: report.duplicates, rejected: report.rejected }, { processed: 2, accepted: 1, duplicates: 1, rejected: 0 });
  assert.equal(report.externalActions, false);
  assert.equal(report.provenance, "personal_demo");
});
