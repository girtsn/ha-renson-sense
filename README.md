# Renson Sense / Waves — Home Assistant custom integration

Local API integration for Renson Sense and Waves devices. No Renson cloud account
is needed. Supports multiple device IPs / config entries with distinct names.

## 0.3.3: Fix actual temperature vs Breeze setpoint mix-up

The dashboard previously matched entity IDs by their suffix. Both the real
temperature sensor (unique ID `<entry>_temperature`) and the Breeze
temperature threshold (unique ID `<entry>_breeze_temperature`) matched the
same `temperature` display slot. Depending on registry order, the dashboard
displayed the Breeze threshold (often exactly **30°C**) instead of actual
bathroom temperature (for example, **25.3°C**). Temperature graphs could also
use the wrong statistic.

Entity discovery now requires an **exact unique ID** derived from the specific
device's Home Assistant configuration entry ID and the expected key. It also
rejects configuration and unrelated sensors with similar suffixes. Regression
tests cover both ordering permutations and verify live display bindings and
the temperature-statistics query for two separate devices.

The Renson temperature sensor entity itself and its existing Recorder history
are unchanged. Already-collected real temperature statistics are preserved,
and the dashboard now queries the correct statistics ID.

## 0.3.2: Reliable configured address and frontend cache refresh

The dashboard now uses the **configured host diagnostic sensor** when present,
but falls back to the Home Assistant **device registry configuration URL** when
that sensor is missing, disabled or unavailable. The configured address is shown
and clickable at the top of each device card; the **reported Wi-Fi IP** remains
separate in Diagnostics. The fallback does not substitute the reported address
for the configured one, even when the addresses happen to be the same.

Dashboard JavaScript now uses an integration-versioned asset path (not only a
query parameter), and the panel checks a no-cache copy of the installed
manifest every two minutes. If a newer version is detected in an already-open
tab, it attempts one reload while no control action is in progress. A reload
loop is prevented, and the page displays a hard-refresh hint if the old
JavaScript persists. The footer shows the active frontend version.

Because the previous (0.3.1) JavaScript did not have the version monitor, one
final hard refresh may be needed on initial update to 0.3.2. Subsequent
updates should be recognized automatically when Home Assistant is running,
although external browser/service-worker/reverse-proxy caching cannot be
eliminated completely.

## 0.3.1: Clickable device addresses

The configured IP / hostname at the top of each device card is a clickable
link that opens the local device URL in a new tab. The device-reported Wi-Fi
IP in Diagnostics is clickable as well. An accessible browser interface is
not guaranteed; these links only open the device's HTTP address.

Device names, existing entity IDs, and dashboard configuration stay intact.
After updating via HACS, restart Home Assistant and reload the dashboard.

## 0.3.0: Integration-managed Renson Ventilation dashboard

A new **Renson Ventilation** sidebar panel is installed automatically when
at least one Renson Sense/Waves integration entry is present. It is inspired
by the integration-managed tado X Heating sidebar panel and is bundled in
this HACS integration, including its JavaScript and graph controls.

- Shows **all configured Renson devices**, identified via Home Assistant's
  device/entity registries rather than hard-coded names or entity IDs.
- Controls at the top: per-device **boost level and duration**, Start/Stop
  boost, and the **silent mode** switch. Device actions require a click and
  explicit confirmation; calibration and restart are not dashboard buttons.
- Live airflow (m³/h), ventilation %, fan RPM, temperature, relative humidity,
  experimental estimated VOC, and boost status.
- **Two independent time horizons** (short and long): 24h / 7d / 30d and
  90d / 1 year / 3 years. Select metric and one/all devices.
- Uses local Home Assistant Recorder statistics via WebSocket; no new polling,
  database, YAML dashboard, or custom card resource setup. Lines compare the
  *same metric* across devices; no misleading combined y-axis.
- User-created dashboards and automations remain unchanged.
- The JavaScript module uses the manifest-versioned URL to refresh when a new
  HACS release is installed, then Home Assistant is restarted.

Older historical statistics are not backfilled: three-year views initially
show only the measurements available since long-term recording started. If
Recorder excludes the Renson sensors, the graphs will be empty. The estimated
VOC is an approximate unitless index, **not a health/safety measurement**.

After updating through HACS and restarting Home Assistant, choose
**Renson Ventilation** in the sidebar. You can keep your existing custom
ventilation dashboards independently.

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
