# Implementation and test notes

## Decisions I wanted to make visible

The relay logic lives in `src/domain.mjs` instead of DOM handlers. That keeps event validation, idempotency, retry timing and audit summaries usable from both the page and Node tests.

The signature inspector uses a small FNV-1a digest. That is useful for a repeatable fixture, but it is not a substitute for HMAC. I named the algorithm in the interface and kept the expected and received values visible so the limitation cannot be mistaken for a production signature check.

Duplicate detection combines the event ID with a stable serialization of `data`. Reordering object keys therefore does not create a new idempotency key, while changing a value does.

The inbox uses a separate `uiKey` for each fixture occurrence. An earlier version spread the domain result over the fixture and replaced that UI key with the idempotency key; the original and its duplicate then pointed at the same card state, and delivery lookup failed for manual replay. Keeping the two identities explicit fixes both paths without weakening duplicate detection.

Retries are deterministic: immediate, 30 seconds, 60 seconds and 120 seconds. The browser does not actually wait or make a request; it displays the decisions produced by the relay functions.

## Checks

`tests/domain.test.mjs` covers the individual decisions. `tests/proof.test.mjs` adds one end-to-end fixture batch and checks the committed audit file against a fresh in-memory run. `tests/e2e/hookrelay.spec.mjs` drives Chromium through duplicate selection and manual replay. If the implementation changes without updating the evidence, those checks fail.

The static page has no bundler or runtime dependency. Playwright is development-only. All browser imports and asset links are relative, which also keeps it suitable for a repository-root GitHub Pages deployment.
