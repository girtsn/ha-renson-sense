# Renson Sense / Waves v0.3.0 — Managed Ventilation panel

This release adds a **Renson Ventilation** sidebar panel, installed and updated
automatically as part of the integration (similar to the tado X Heating panel).

- Shows both/all configured Renson Waves devices without relying on particular
  entity IDs or room names, including renamed entities.
- Live airflow, relative ventilation %, RPM, temperature, humidity, estimated
  VOC and device boost/silent states.
- Top controls for per-device boost (level and duration), stop boost and
  silent-mode toggle; each action requires explicit user confirmation.
- Two independent historical plots: short-term 24h/7d/30d, long-term
  90d/1yr/3yr. Filter by device and metric.
- Historical data comes exclusively from Home Assistant Recorder's aggregated
  statistics. No separate database, additional network polling, custom
  Lovelace resource registration, YAML dashboard or manual helper installation.
- The panel is bundled in the integration and cache-busted by manifest version;
  existing manually created dashboards are untouched.
- Calibration/restart stay available only through explicitly confirmed
  developer actions, not the dashboard.
- As long-term statistics accumulate, 3-year plots develop naturally.
  Missing historical statistics are **not** backfilled.
- Estimated VOC remains a unitless experimental model, not a safety sensor.

Install through HACS, restart Home Assistant, then open
**Renson Ventilation** from the sidebar.
