# HookRelay

HookRelay is a browser-based webhook operations lab. It makes the awkward failure paths visible: a request arrives, passes or fails its gates, retries against an isolated route, and either recovers or lands in a dead-letter state.

![HookRelay desktop interface](./screenshots/hookrelay-wide.png)

## The problem

Webhook failures are usually scattered across request logs, queue records and retry dashboards. This project puts the full decision path on one screen so an operator can answer three questions quickly: what arrived, why it was accepted or stopped, and what happened on every delivery attempt.

## Workflow

1. Pick one of four frozen events.
2. Inspect its payload, deterministic fixture digest and schema result.
3. Follow duplicate gating, retries and dead-letter routing on the delivery timeline.
4. Replay the exhausted event locally or export the current audit record as JSON.

Nothing leaves the browser. The interface does not call a webhook endpoint or mutate an external system.

The live demo links directly to the [source repository](https://github.com/x3r3S/hookrelay-webhook-recovery) and its [GitHub Actions history](https://github.com/x3r3S/hookrelay-webhook-recovery/actions) so the implementation and current checks are reachable from the same page.

## Reproducible evidence

- [`examples/input-events.json`](./examples/input-events.json) is the synthetic input batch.
- [`examples/audit-output.json`](./examples/audit-output.json) is the expected output produced by the same domain functions used by the interface.
- [`tests`](./tests/) cover validation, idempotency, retry timing, dead-letter routing, replay and proof regeneration. The browser suite also checks that the repeated event remains separately selectable and that manual replay updates the rendered state.
- [`docs/implementation-notes.md`](./docs/implementation-notes.md) explains the main technical decisions and production limits.
- [Mobile capture](./screenshots/hookrelay-mobile.png) shows the responsive layout.

## Run locally

Node.js 20 or newer runs the static demo without a build step.

```sh
npm start
```

Open the local address printed in the terminal.

## Test and inspect the proof

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npm run proof:print
```

`npm test` runs the Node suite and the Chromium interaction checks. The proof test regenerates the audit in memory and compares it with the checked-in output. `proof:print` writes the regenerated JSON to stdout without modifying repository files.

## GitHub Pages

The repository root is the site root. Enable Pages for the main branch and root folder; `index.html`, relative assets and `.nojekyll` are already in place.

## Project boundary

This is a self-initiated portfolio project, not paid client work. Every event, identifier, address and delivery result is synthetic. The FNV-1a digest exists only to make the exercise deterministic; a production integration would require provider-specific HMAC verification, protected secrets, durable storage, real queues and monitoring.

The code is available for portfolio review under the terms in [`PORTFOLIO-REVIEW-LICENSE.md`](./PORTFOLIO-REVIEW-LICENSE.md). It is not released under an open-source license.
