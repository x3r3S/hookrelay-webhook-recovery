# Five-minute walkthrough

This is the route I use when checking the demo after a change.

1. Start the local server and open HookRelay.
2. Select `order.created`. Its first simulated delivery returns `500`; the second returns `200`. The event ends in `delivered`.
3. Select `invoice.finalized`. Four failed attempts place it in the dead-letter view. Use **Replay event** once and confirm that the local state changes to `delivered`.
4. Select the second `evt_order_1048`. It should stop at the idempotency gate and should not have a delivery timeline.
5. Select `profile.updated`. Its fixture digest differs from the expected digest, so it should be rejected before queueing.
6. Download the audit JSON. It should report four ingress decisions: two accepted, one duplicate and one rejected.

At both 1440×900 and 390×844, confirm that state chips, event metadata, digest/schema values, timeline notes and audit entries remain readable without page-level horizontal scrolling. Use Tab to reveal the skip link, continue into the event stream, and activate an event with Enter; the focused event should keep a visible inset outline.

For a non-visual check, run `npm run proof:print`. The output comes from the same functions that drive these decisions in the browser.
