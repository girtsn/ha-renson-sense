# Renson Sense - Home Assistant custom integration

This is a custom integration for Renson Sense devices using their local
JSON API (`/v1/constellation/sensor`).

Features:

- Local polling, no cloud
- Supports multiple devices (multiple IPs)
- Friendly name per device
- Automatically detects which sensor "types" are available and creates
  entities accordingly (no dependency on index order)
- Supports:
  - Temperature (`temp`)
  - Relative humidity (`rh`)
  - Absolute humidity (`ah`)
  - VOC (`avoc`)
  - Pressure (`press`)
  - Heap info (`heap_info`)
  - Wi-Fi RSSI (`rssi`)
  - Optionally: CO₂ (`co2`), Lux (`lux`), Sound (`sound`) if the device exposes them

## Installation (HACS)

1. In HACS, go to **Integrations → ⋮ → Custom repositories**.
2. Add this repository URL as type **Integration**.
3. In HACS → Integrations → **Explore & add**, search for "Renson Sense".
4. Install the integration and restart Home Assistant.

## Configuration

1. Go to **Settings → Devices & services → Add integration**.
2. Search for **Renson Sense**.
3. Enter:
   - The local IP address of your Renson Sense device
   - A friendly name (e.g. "Living room Sense")

Repeat the process for each additional device.

The integration will discover which sensor types are present on the device
(e.g. `temp`, `rh`, `avoc`, `press`, etc.) and create the corresponding
sensor entities. If a type is not available on a specific device, that
entity will not be created.
