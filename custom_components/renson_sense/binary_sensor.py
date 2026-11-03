"""Read-only operational states and ventilation-control configuration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import RensonCoordinator
from .const import CONF_NAME, DOMAIN
from .helpers import nested_value


@dataclass(kw_only=True)
class RensonBinaryDescription(BinarySensorEntityDescription):
    """Binary state retrieved from an optional Renson endpoint."""

    source: str
    path: tuple[str, ...]
    true_value: Any = True


BINARY_SENSORS = [
    RensonBinaryDescription(
        key="boost_active", name="Boost active", source="decision_room",
        path=("boost", "enable"),
    ),
    RensonBinaryDescription(
        key="silent_enabled", name="Silent mode enabled", source="decision_silent",
        path=("enable",), entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="breeze_enabled", name="Breeze enabled", source="decision_breeze",
        path=("enable",), entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="stop_when_clean", name="Stop when air is clean", source="decision_room",
        path=("stop_flow_decision_control", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="humidity_dynamic", name="Humidity dynamic control", source="decision_room",
        path=("demand", "relative_humidity", "dynamic", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="humidity_static", name="Humidity static control", source="decision_room",
        path=("demand", "relative_humidity", "static", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="voc_dynamic", name="VOC dynamic control", source="decision_room",
        path=("demand", "VOC", "dynamic", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="voc_static", name="VOC static control", source="decision_room",
        path=("demand", "VOC", "static", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="absolute_humidity_control", name="Absolute humidity control", source="decision_room",
        path=("demand", "absolute_humidity", "dynamic", "enable"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonBinaryDescription(
        key="wifi_connected", name="Wi-Fi connected", source="wifi",
        path=("status",), true_value="connected",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: RensonCoordinator = hass.data[DOMAIN][entry.entry_id]
    data = coordinator.data or {}
    async_add_entities([
        RensonBinary(coordinator, entry, desc)
        for desc in BINARY_SENSORS
        if nested_value(data.get(desc.source), *desc.path) is not None
    ])


class RensonBinary(CoordinatorEntity[RensonCoordinator], BinarySensorEntity):
    """Boolean device status."""

    entity_description: RensonBinaryDescription

    def __init__(
        self, coordinator: RensonCoordinator, entry: ConfigEntry,
        description: RensonBinaryDescription
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_name = f"{entry.data.get(CONF_NAME, entry.title)} {description.name}"
        self._attr_device_info = {"identifiers": {(DOMAIN, entry.entry_id)}}

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Expose complete control settings for inspection, not alert thresholds."""
        desc = self.entity_description
        data = self.coordinator.data or {}
        if desc.key in (
            "humidity_dynamic", "humidity_static", "voc_dynamic", "voc_static",
            "absolute_humidity_control",
        ):
            component = {
                "humidity_dynamic": "relative_humidity",
                "humidity_static": "relative_humidity",
                "voc_dynamic": "VOC",
                "voc_static": "VOC",
                "absolute_humidity_control": "absolute_humidity",
            }[desc.key]
            mode = "static" if desc.key.endswith("static") else "dynamic"
            settings = nested_value(data, "decision_room", "demand", component, mode)
            return {k: v for k, v in settings.items() if k != "enable"} if isinstance(settings, dict) else None
        if desc.key == "boost_active":
            boost = nested_value(data, "decision_room", "boost")
            return dict(boost) if isinstance(boost, dict) else None
        if desc.key == "breeze_enabled":
            return {"temperature_threshold": nested_value(data, "decision_breeze", "temp_threshold")}
        return None

    @property
    def is_on(self) -> bool | None:
        desc = self.entity_description
        value = nested_value(self.coordinator.data.get(desc.source), *desc.path)
        if value is None:
            return None
        if isinstance(desc.true_value, str):
            return str(value).lower() == desc.true_value
        return value is desc.true_value
