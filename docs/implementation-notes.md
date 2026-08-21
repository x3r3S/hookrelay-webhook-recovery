# Implementation and test notes

## Decisions I wanted to make visible

The relay logic lives in `src/domain.mjs` instead of DOM handlers. That keeps event validation, idempotency, retry timing and audit summaries usable from both the page and Node tests.

The signature inspector uses a small FNV-1a digest. That is useful for a repeatable fixture, but it is not a substitute for HMAC. I named the algorithm in the interface and kept the expected and received values visible so the limitation cannot be mistaken for a production signature check.

Duplicate detection combines the event ID with a stable serialization of `data`. Reordering object keys therefore does not create a new idempotency key, while changing a value does.

The inbox uses a separate `uiKey` for each fixture occurrence. An earlier version spread the domain result over the fixture and replaced that UI key with the idempotency key; the original and its duplicate then pointed at the same card state, and delivery lookup failed for manual replay. Keeping the two identities explicit fixes both paths without weakening duplicate detection.

Ingress decisions stay in `state.audit`; operator-triggered replays are appended to `state.operatorAudit`. The replay record names the local operator, `browser_local_simulation` boundary, simulated outcome and `externalAction: false`. `buildAuditExport` keeps processed/accepted/duplicate/rejected metrics derived only from ingress, while the interface merges both streams for the latest visible entries.

Retries are deterministic: immediate, 30 seconds, 60 seconds and 120 seconds. The browser does not actually wait or make a request; it displays the decisions produced by the relay functions.

## Readability and contrast

The compact console keeps three functional text levels instead of shrinking operational evidence to fit: 10 px for uppercase micro-labels and terse state chips, 11 px for metadata and inspection values, and 12–14 px for event names and explanatory copy. The hero and panel titles remain larger, so the denser typography does not flatten the product hierarchy.

Quiet metadata uses `#7f9196`. Across the opaque dark work surfaces used by the page, that token is at least 5.36:1; browser tests also calculate the effective inherited background of representative rendered elements and require at least 4.5:1. The original `#607075` token measured only 3.41–3.83:1 on those surfaces.

Keyboard focus uses a two-pixel acid outline. Panel buttons move that outline inside their clipped containers so the focus indicator remains visible rather than being cut off at panel edges.

## Checks

`tests/domain.test.mjs` covers the individual decisions and proves a replay record does not mutate ingress evidence or metrics. `tests/proof.test.mjs` adds one end-to-end fixture batch and checks the committed audit file against a fresh in-memory run. `tests/e2e/hookrelay.spec.mjs` drives Chromium through duplicate selection and manual replay in dedicated 1440×900 and 390×844 projects, then checks the visible entry and downloaded operator audit. It also reads computed font sizes, composites inherited backgrounds for contrast checks, reaches event controls by Tab, activates one with Enter and rejects page-level horizontal overflow. If the implementation changes without updating the evidence, those checks fail.

The static page has no bundler or runtime dependency. Playwright is development-only. All browser imports and asset links are relative, which also keeps it suitable for a repository-root GitHub Pages deployment.
