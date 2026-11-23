# Renson Sense 0.3.8 — Correct calendar-day selection

- All calendar presets and manually selected days now follow **Home Assistant's configured timezone**, not the viewing device's timezone.
- Correct date boundaries during daylight-saving transitions (23- and 25-hour days).
- Select one day with a single date tap, then **Select**. Tap a second date to expand to a date range.
- Preserve first weekday preference, period navigation, existing recorded sensor history and dashboard elements.
- Add automated regression tests for Brussels DST and cross-timezone viewing.
