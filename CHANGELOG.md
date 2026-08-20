# Changelog

## 2026-08-20

- Separated fixture UI identity from the domain idempotency key so the original and duplicate event can be selected independently.
- Restored manual dead-letter replay and made its `200` result visible in the status, timeline and keyboard focus flow.
- Added Chromium regression coverage for both interactions and wired it into CI.
- Added compact Source and CI links to the demo so public implementation evidence is one click away.
