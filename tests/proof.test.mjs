import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildProof } from "../src/proof.mjs";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("checked-in audit output matches the current relay implementation", async () => {
  const input = await readJson("../examples/input-events.json");
  const expected = await readJson("../examples/audit-output.json");
  assert.deepEqual(buildProof(input), expected);
});

test("proof batch exercises accept, retry recovery, dead letter, duplicate and rejection paths", async () => {
  const input = await readJson("../examples/input-events.json");
  const proof = buildProof(input);

  assert.deepEqual(
    { processed: proof.processed, accepted: proof.accepted, duplicates: proof.duplicates, rejected: proof.rejected },
    { processed: 4, accepted: 2, duplicates: 1, rejected: 1 }
  );
  assert.equal(proof.scenarios[0].delivery.status, "delivered");
  assert.equal(proof.scenarios[0].delivery.attempts.length, 2);
  assert.equal(proof.scenarios[1].delivery.status, "dead_letter");
  assert.deepEqual(proof.scenarios[2].reasons, ["IDEMPOTENCY_KEY_SEEN"]);
  assert.deepEqual(proof.scenarios[3].reasons, ["DIGEST_MISMATCH"]);
});
