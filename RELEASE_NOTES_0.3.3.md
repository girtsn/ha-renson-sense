# Renson Sense / Waves v0.3.3 — Correct live and historical temperature

**Important display fix:** The Renson Ventilation dashboard mistakenly matched
the Breeze-mode temperature threshold (typically 30°C) as if it were the live
bathroom temperature (for example 25.3°C in the device app and API).

The dashboard now matches each sensor by its **exact unique ID**, including
the Home Assistant configuration-entry identifier. This prevents look-alike
configuration sensors from replacing real measurements and prevents entities
from different ventilators from being mixed up.

Both **live temperature tiles** and **short/long-term temperature graphs**
now use the actual temperature sensor. Regression tests cover both device
ordering permutations, the 30°C threshold collision, and Recorder statistic
selection.

This update does **not** modify the sensor readings, recorded historical
statistics, device settings or controls.

Update through HACS and restart Home Assistant. An open v0.3.2 dashboard
should detect the new release automatically; if not, reopen the panel or do
one hard browser refresh.
