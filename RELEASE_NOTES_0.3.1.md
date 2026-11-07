# Renson Sense / Waves v0.3.1 — Clickable IP addresses

- The configured IP address or hostname in each Renson Ventilation dashboard
  card now opens the device's local HTTP URL in a **new browser tab**.
- The device-reported Wi-Fi IP in the **Diagnostics and maintenance** section
  is now clickable as well.
- Links are restricted to local-style hostname/IP syntax and are opened with
  \`noopener noreferrer\`.
- This update changes no ventilation settings, sensors, or automations.
- Some firmware may not provide a browser interface at the root address; in
  that case the browser may show an error even though the address is correct.

Update in HACS, restart Home Assistant, then open **Renson Ventilation**.
