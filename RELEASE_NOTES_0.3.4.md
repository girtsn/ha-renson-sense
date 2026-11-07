# Renson Sense / Waves v0.3.4 — Unified history and self-updating frontend

- Replace the two independent period/metric graphs with **one shared tado X /
  Sauna-style date-range picker** driving **eight separate graphs**, one per
  measured statistic, for both bathroom ventilators.
- All charts display the selected period (short-term to 3 years), with
  adaptive Recorder aggregation and a single batched statistics request.
- Retain all controls, confirmation prompts, diagnostics, links and entities.
- Add a stable loader that imports versioned dashboard + date-picker modules
  and updates an open panel **without refreshing the HA page** after
  subsequent HACS releases. A failed version import is retried using a fresh
  module URL; temporary HA restart errors do not replace the old panel.
- No historical data are backfilled, modified or deleted.

**One-time upgrade:** 0.3.3 browser tabs run the old panel registration.
Install in HACS, restart Home Assistant, then close and reopen the browser tab.
One final hard refresh may be needed to activate the stable loader in an
already-cached Home Assistant shell. Future updates should load automatically
when the manifest and versioned assets can be reached.
