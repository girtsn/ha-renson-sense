"""Pure helpers for extracting and estimating Renson measurements.

The estimated VOC relationship is an empirical *app index approximation* based on
14 paired Waves readings (3 November 2026), not a ppm concentration or a
manufacturer-published conversion. Do not use it for health/safety decisions.
"""

from __future__ import annotations

from typing import Any


def nested_value(data: Any, *keys: str) -> Any:
    """Return a nested value or None if the data shape is different."""
    for key in keys:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def typed_node(nodes: Any, node_type: str) -> dict[str, Any] | None:
    """Find a sensor/actuator by its declared type, never by numeric index."""
    if not isinstance(nodes, dict):
        return None
    for node in nodes.values():
        if isinstance(node, dict) and node.get("type") == node_type:
            return node
    return None


def numeric(value: Any) -> float | None:
    """Safely turn a sensor value into a number, excluding booleans."""
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    if result != result or result in (float("inf"), float("-inf")):
        return None
    return result


def estimated_voc(raw: Any) -> int | None:
    """Return the provisional Renson app-scale VOC index (no unit).

    Three-segment empirical fit for *one* Waves bathroom; validation on other
    devices is outstanding. The first two branches join near 55,000 and
    58,000; there is deliberately no arbitrary upper cap.
    """
    r = numeric(raw)
    if r is None:
        return None
    if r <= 55_000:
        value = 118 + 0.0453 * (r - 55_000)
    elif r <= 58_000:
        value = 118 + 0.6424 * (r - 55_000)
    else:
        value = 2045.2 + 0.1792 * (r - 58_000)
    return round(max(0, value))


def ventilation_percentage(flow: Any, nominal: Any) -> float | None:
    """Calculate app ventilation % using measured flow and nominal flow."""
    actual, target = numeric(flow), numeric(nominal)
    if actual is None or target is None or target <= 0:
        return None
    return round(max(0, actual / target * 100), 1)
