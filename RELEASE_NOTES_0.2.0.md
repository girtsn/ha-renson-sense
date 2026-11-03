# Renson Sense / Waves 0.2.0

This release upgrades the existing Home Assistant integration to support Renson Waves ventilation telemetry and control while retaining existing sensor entity identities where possible.

## Before updating
- This release changes **raw VOC** from a misleading `ppm` unit to a unitless raw number. Check any automations, charts or statistics that assume ppm.
- The old **absolute humidity** entity is removed because it is derived from temperature and relative humidity.
- **Back up Home Assistant** before updating and restart Home Assistant after installation.
- Boost and silent-mode writes are based on a reverse-engineered local API. They have **not been verified on the user's live Waves devices**; test manually before using in automations.

## New measurements and controls
- **Long-term statistics** support for temperature, humidity, raw and estimated VOC, live pressure, airflow, ventilation percentage, and fan RPM (future readings only; no historical backfill).
- Measured **ventilation airflow (m³/h)** and app-style **ventilation percentage**, using the automatically retrieved nominal airflow from `/v1/decision/room`.
- Optional fan speed, motor, Wi-Fi, memory and uptime diagnostics.
- Boost active, boost remaining, nominal/minimum airflow, humidity and VOC ventilation-control settings, silent mode, breeze mode and status binary sensors.
- A **temporary ventilation boost** fan control. Turning the boost entity off cancels the boost; it does **not** stop continuous extraction.
- A **silent-mode switch** that retains the existing weekly schedule.
- **Estimated Renson VOC** on the unitless app-style scale, based on a provisional 14-point fit. The estimate is **not ppm**, **not a safety sensor**, and **not validated on the other bathroom device**.

For implementation details, see the [README](https://github.com/girtsn/ha-renson-sense#readme) and [PR #1](https://github.com/girtsn/ha-renson-sense/pull/1).
