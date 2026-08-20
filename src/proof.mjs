import {
  acceptInbound,
  buildAuditExport,
  buildDemoSignature,
  createRelayState,
  simulateDelivery
} from "./domain.mjs";

function signatureFor(scenario, secret) {
  const valid = buildDemoSignature(scenario.event, secret, scenario.event.created);
  if (scenario.signature === "valid") return valid;
  if (scenario.signature === "tampered") return valid.replace(/v1=./, "v1=0");
  throw new TypeError(`Unknown fixture signature mode: ${scenario.signature}`);
}

export function buildProof(input) {
  let state = createRelayState();
  const scenarios = [];

  for (const [index, scenario] of input.scenarios.entries()) {
    const result = acceptInbound(
      state,
      {
        event: scenario.event,
        signature: signatureFor(scenario, input.secret),
        secret: input.secret,
        now: scenario.event.created
      },
      `fixture-step-${String(index + 1).padStart(2, "0")}`
    );
    state = result.state;

    const delivery = result.decision === "accepted"
      ? simulateDelivery(scenario.event, scenario.deliveryOutcomes)
      : null;

    scenarios.push({
      label: scenario.label,
      eventId: scenario.event.id,
      ingressDecision: result.decision,
      reasons: result.reasons,
      delivery
    });
  }

  return {
    fixture: input.name,
    ...buildAuditExport(state),
    scenarios
  };
}
