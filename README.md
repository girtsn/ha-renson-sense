# Renson Sense / Waves — Home Assistant custom integration

Local API integration for Renson Sense and Waves devices. No Renson cloud account
is needed. Supports multiple device IPs / config entries with distinct names.

## 0.2.2: Configured address in device information

The integration's configured host or IP is now shown as a Home Assistant
device configuration URL (Visit link) and as a new Configured IP / host
diagnostic sensor, so it can be copied easily from the device's entity list.
This is separate from the Wi-Fi IP reported by the hardware.

Existing entity IDs, devices, and long-term statistics are preserved.
Restart Home Assistant after updating via HACS.

## 0.2.1: Manual maintenance operations

Two explicit actions can be invoked on a specific Waves fan entity using
**Developer Tools → Actions**. They are not part of ordinary polling and will
never run automatically after installation.

**Calibrate**: request a new exhaust-system pressure-loss calibration (not
VOC-sensor calibration):

    action: renson_sense.calibrate
    target:
      entity_id: fan.2fl_bathroom_2fl_vent_waves_ventilation_boost
    data:
      confirmation: CALIBRATE

**Restart**: restart one ventilator:

    action: renson_sense.restart_device
    target:
      entity_id: fan.2fl_bathroom_2fl_vent_waves_ventilation_boost
    data:
      confirmation: RESTART

These operations use `POST /v1/index` with form-encoded fields
`calibrate=true` / `restart=true` as described in an independent
Home Assistant community reverse-engineering report. **Not verified yet
on the user's Waves firmware**; test in person, one device at a time.

Before calibration, record existing nominal airflow and app-reported
calibration pressure, prepare the ducts/front panel/room as instructed
by Renson and observe the result using the app/device LED. A successful
HTTP request means *the command was sent*, not that calibration passed.
If the HTTP request times out, **do not retry blindly**: the operation
may already be in progress.

Nominal airflow writes, factory reset and Wi-Fi reconfiguration are
**not exposed** because their parameter semantics and recovery risks
need further verification. A calibration may affect measured extraction
performance and should not be scheduled without supervision.

## What's new in 0.2.0

- **Recorder and long-term statistics:** temperature, relative humidity, raw
  VOC, estimated VOC, live pressure, airflow, ventilation level, fan RPM and
  other numeric readings declare Home Assistant's measurement state class.
  This enables hourly long-term statistics *going forward*, provided Recorder
  includes the entity. Old history is **not retroactively backfilled**.
- **Waves fan telemetry:** measured airflow (m³/h), RPM and diagnostic PWM.
  PWM is **not** electrical power in watts.
- **Ventilation %:** airflow / configured nominal airflow × 100. Both nominal
  and minimum airflow are automatically read from /v1/decision/room.
- **Additional states:** boost active/remaining, static and dynamic humidity
  and VOC controls, stop-when-clean setting, silent/breeze enablement.
- **Controls:** the Ventilation boost fan turns a temporary room boost on/off.
  Turning it off **cancels boost** and returns to automatic ventilation; it
  does **not** stop continuous extraction. A silent-mode switch preserves the
  configured weekly schedule. An advanced entity service
  renson_sense.start_boost accepts a level of 1–200% and duration in seconds.
- **Diagnostics:** heap average, RSSI, uptime, Wi-Fi, motor model, PWM,
  nominal/minimum airflow and configuration values.
- **Raw VOC corrected:** the local API labels avoc.raw values (usually around
  50,000–60,000) ppm, but these are not verified gas concentrations. The
  existing VOC entity keeps its unique ID and numeric readings; the false
  ppm unit is removed.
- **Estimated VOC:** a separate unitless, experimental approximation on the
  Renson app scale, fitted using 14 timestamped points on 3 November 2026.
  It is calibrated on one particular Waves device, so another device may
  require its own baseline. **Not for health or safety decisions.**
- **Absolute humidity:** removed because it can be calculated from temperature
  and relative humidity; the device labels its apparent g/m³ values as g/kg.

### Upgrade notes

Existing unique IDs (entry ID plus keys temperature, humidity, voc, pressure,
heap and rssi) are preserved, so registered entity IDs should remain intact.
The raw VOC display name now says "VOC raw"; its old entity ID normally stays
unchanged. An existing absolute-humidity registry entry is intentionally
removed. Recorder history is not reconstructed automatically.

Some metrics are only available for Waves devices and are omitted if an
endpoint is unsupported by older Sense firmware. Newly available entities
are discovered on setup/reload. The scan interval is 60 seconds.

### Install

In HACS → Custom repositories, add
https://github.com/girtsn/ha-renson-sense as an Integration. Install,
restart HA, then Settings → Devices & services → Add integration →
Renson Sense. Configure each device's local IP and a friendly name.

For this upgrade's test branch, manual installation under
custom_components/renson_sense/ is possible. Do not install another
integration controlling the same device at the same time.

### Ventilation boost examples

Use fan.turn_on or fan.set_percentage on the "Ventilation boost" entity
for an ordinary boost, and fan.turn_off to cancel it. The fan entity's
percentage reflects its *boost target*, not current measured extraction.
For actual extraction, use the "Ventilation level" sensor.

An advanced action in Developer Tools → Actions:

    action: renson_sense.start_boost
    target:
      entity_id: fan.2fl_bathroom_ventilation_boost
    data:
      level: 100
      duration: 900

### Renson API paths used

| Path | Description |
| --- | --- |
| /v1/constellation | Sensor, actuator and identification data |
| /v1/constellation/sensor | Fallback when a full constellation is unavailable |
| /v1/constellation/actuator | Fan telemetry fallback |
| /v1/decision/room | Nominal/minimum airflow, boost and pollutant settings |
| /v1/decision/silent | Silent mode and weekly schedule |
| /v1/decision/breeze | Breeze mode (read only) |
| /v1/global/uptime | Uptime diagnostic |
| /v1/wifi/client/status | Wi-Fi diagnostic |

Controls use PUT /v1/decision/room/{room}/boost (fallback to
/v1/decision/room/boost on HTTP 404) and PUT /v1/decision/silent.
The additional manual calibration action is a one-shot, unverified maintenance command; no automatic calibration or Breeze writes are implemented.
The calibrated installation pressure is not exposed by these known API
responses; the live pressure sensor is a different measurement.

### Limitations

- Reverse-engineered control endpoints should be validated on your Waves
  firmware before enabling unattended ventilation automations.
- The estimated VOC value is **experimental**. It is not ppm, not the
  manufacturer's official processed value, and not validated on both devices.
- Long-term statistics require the Recorder integration to include the
  sensor entity; old 10-day raw history is not magically upgraded.
