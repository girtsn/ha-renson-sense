# Renson Sense / Waves v0.2.1 — Manual maintenance operations

This release adds explicit maintenance actions to the existing local Home Assistant integration.

## New actions

- **`renson_sense.calibrate`** — request a ventilation duct pressure-loss calibration for the selected Waves device.
- **`renson_sense.restart_device`** — request a restart of the selected device.

Both actions target a specific **Ventilation boost** fan entity and require the confirmation values `CALIBRATE` and `RESTART`, respectively. Neither is invoked by installing, updating, polling, starting Home Assistant or normal fan controls.

The underlying commands use form-encoded `POST /v1/index` requests described by the Home Assistant community. They remain **unverified on the physical devices**. An HTTP acknowledgement only confirms that the request was received, not that a calibration finished successfully. Timeout responses are ambiguous, and the integration deliberately does not retry them.

### Calibrating safely

Calibration adjusts the ventilation airflow compensation according to duct pressure loss; it is **not** VOC sensor calibration. Prepare the front panel, vents, doors and ducting according to the Renson instructions. Remain physically present, operate only one unit at a time and confirm success in the Renson app or via device LED. Do not schedule calibration automatically.

### Calibration pressure (17 Pa / 11 Pa)

The Renson app displays the stored calibration pressure-loss values, but a matching local read-only JSON field **has not yet been identified**. The existing live pressure sensor (near 0–0.2 Pa at low airflow) is a different measurement. These stored values are not exposed as new numeric HA sensors in this release.

Nominal-airflow writes, factory reset and Wi-Fi reconfiguration remain deliberately excluded pending verification.

For full details see the [README](https://github.com/girtsn/ha-renson-sense#readme) and [pull request #2](https://github.com/girtsn/ha-renson-sense/pull/2).
