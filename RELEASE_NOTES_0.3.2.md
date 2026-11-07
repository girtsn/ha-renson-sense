# Renson Sense / Waves v0.3.2 — Reliable device links and cache refresh

**Configured IP fallback:** The Renson Ventilation panel now uses the
configuration URL stored in Home Assistant's device registry when the
Configured IP / host diagnostic entity is not available. The configured IP
appears under each ventilator's name as a clickable address. The separately
reported Wi-Fi IP remains a clickable diagnostic entry.

**Cache refresh:** JavaScript now has a versioned static path, with cache
headers disabled. Once this release's frontend is loaded, an open dashboard
checks a no-cache manifest periodically and requests one full page reload when
it detects a future version. The displayed footer identifies the frontend
version. Persistent browser or Home Assistant service-worker caches can still
require a manual hard refresh.

No Renson device operations, sensor IDs, or existing graphs are changed.

Update through HACS, **restart Home Assistant**, and do one hard refresh if
the old dashboard remains visible. Future version checks will then be active.
