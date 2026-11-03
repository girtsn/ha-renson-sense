"""Environmental, ventilation and diagnostic sensors for Renson devices."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import RensonCoordinator
from .const import CONF_NAME, DOMAIN
from .helpers import estimated_voc, nested_value, numeric, typed_node, ventilation_percentage


@dataclass(kw_only=True)
class RensonSensorDescription(SensorEntityDescription):
    """Description of a dynamic sensor or a single endpoint field."""

    source: str = "sensor"
    node_type: str | None = None
    path: tuple[str, ...] = ()
    conversion: str | None = None
    numeric_value: bool = True


SENSORS: list[RensonSensorDescription] = [
    # Keep existing unique IDs (entry ID + original key) for existing entities.
    RensonSensorDescription(
        key="temperature", name="Temperature", node_type="temp",
        path=("parameter", "temperature", "value"),
        native_unit_of_measurement="°C", device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="humidity", name="Humidity", node_type="rh",
        path=("parameter", "humidity", "value"),
        native_unit_of_measurement="%", device_class=SensorDeviceClass.HUMIDITY,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="voc", name="VOC raw", node_type="avoc",
        path=("parameter", "raw", "value"),
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="voc_estimated", name="VOC estimated (Renson app scale)",
        node_type="avoc", path=("parameter", "raw", "value"),
        conversion="estimated_voc", state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="pressure", name="Ventilation pressure", node_type="press",
        path=("parameter", "pressure", "value"),
        native_unit_of_measurement="Pa", device_class=SensorDeviceClass.PRESSURE,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="heap", name="Heap average", node_type="heap_info",
        path=("parameter", "average_current_heap", "value"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="rssi", name="Wi-Fi RSSI", node_type="rssi",
        path=("parameter", "rssi", "value"), native_unit_of_measurement="dBm",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="co2", name="CO2 concentration", node_type="co2",
        path=("parameter", "concentration", "value"),
        native_unit_of_measurement="ppm", device_class=SensorDeviceClass.CO2,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="lux", name="Light level", node_type="lux",
        path=("parameter", "lux", "value"), native_unit_of_measurement="lx",
        device_class=SensorDeviceClass.ILLUMINANCE,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="sound", name="Sound level", node_type="sound",
        path=("parameter", "average_level", "value"),
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="decision_trigger", name="Ventilation trigger", node_type="decision",
        path=("parameter", "trigger", "value"), numeric_value=False,
    ),
    RensonSensorDescription(
        key="airflow", name="Ventilation airflow", source="actuator",
        node_type="ventilation fan", path=("parameter", "flow_rate", "value"),
        native_unit_of_measurement="m³/h",
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="ventilation_level", name="Ventilation level", source="actuator",
        node_type="ventilation fan", path=("parameter", "flow_rate", "value"),
        conversion="ventilation_level", native_unit_of_measurement="%",
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="fan_rpm", name="Fan speed", source="actuator",
        node_type="ventilation fan", path=("parameter", "rpm", "value"),
        native_unit_of_measurement="rpm", state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="fan_pwm", name="Motor PWM", source="actuator",
        node_type="ventilation fan", path=("parameter", "pwm", "value"),
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="motor_type", name="Motor model", source="actuator",
        node_type="ventilation fan", path=("parameter", "motor_type", "value"),
        numeric_value=False, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="nominal_airflow", name="Nominal airflow", source="decision_room",
        path=("nominal",), native_unit_of_measurement="m³/h",
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="minimum_airflow", name="Minimum airflow", source="decision_room",
        path=("minimum",), native_unit_of_measurement="m³/h",
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="boost_level", name="Boost target", source="decision_room",
        path=("boost", "level"), native_unit_of_measurement="%",
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="boost_remaining", name="Boost remaining", source="decision_room",
        path=("boost", "remaining"), native_unit_of_measurement="s",
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RensonSensorDescription(
        key="boost_timeout", name="Boost timeout", source="decision_room",
        path=("boost", "timeout"), native_unit_of_measurement="s",
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="silent_reduction", name="Silent mode reduction", source="decision_silent",
        path=("reduction",), native_unit_of_measurement="%",
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="breeze_temperature", name="Breeze temperature threshold", source="decision_breeze",
        path=("temp_threshold",), native_unit_of_measurement="°C",
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    # Device's active humidity/VOC decision thresholds and timings. These are
    # configuration readings, grouped under Diagnostics rather than main graphs.
    RensonSensorDescription(
        key="humidity_static_min", name="Humidity static minimum",
        source="decision_room", path=("demand", "relative_humidity", "static", "minimum"),
        native_unit_of_measurement="%", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="humidity_static_max", name="Humidity static maximum",
        source="decision_room", path=("demand", "relative_humidity", "static", "maximum"),
        native_unit_of_measurement="%", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="humidity_dynamic_min", name="Humidity dynamic minimum",
        source="decision_room", path=("demand", "relative_humidity", "dynamic", "minimum"),
        native_unit_of_measurement="%", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="humidity_average", name="Humidity dynamic average period",
        source="decision_room", path=("demand", "relative_humidity", "dynamic", "average"),
        native_unit_of_measurement="s", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="humidity_decay", name="Humidity dynamic decay period",
        source="decision_room", path=("demand", "relative_humidity", "dynamic", "decay"),
        native_unit_of_measurement="s", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="voc_average", name="VOC dynamic average period",
        source="decision_room", path=("demand", "VOC", "dynamic", "average"),
        native_unit_of_measurement="s", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="voc_decay", name="VOC dynamic decay period",
        source="decision_room", path=("demand", "VOC", "dynamic", "decay"),
        native_unit_of_measurement="s", entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="uptime", name="Uptime", source="uptime", path=("uptime",),
        native_unit_of_measurement="s",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="wifi_ssid", name="Wi-Fi SSID", source="wifi", path=("ssid",),
        numeric_value=False, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="wifi_ip", name="Wi-Fi IP", source="wifi", path=("IP",),
        numeric_value=False, entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RensonSensorDescription(
        key="wifi_mac", name="Wi-Fi MAC", source="wifi", path=("MAC",),
        numeric_value=False, entity_category=EntityCategory.DIAGNOSTIC,
    ),
]


def _has_value(data: dict[str, Any], desc: RensonSensorDescription) -> bool:
    """Discover only metrics actually returned by this device."""
    if desc.source in ("sensor", "actuator"):
        node = typed_node(data.get(desc.source), desc.node_type or "")
    else:
        node = data.get(desc.source, {})
    return nested_value(node, *desc.path) is not None


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Expose only sensors available on this particular device."""
    coordinator: RensonCoordinator = hass.data[DOMAIN][entry.entry_id]
    data = coordinator.data or {}
    async_add_entities([
        RensonSensor(coordinator, entry, description)
        for description in SENSORS if _has_value(data, description)
    ])


class RensonSensor(CoordinatorEntity[RensonCoordinator], SensorEntity):
    """One local Renson measurement or derived quantity."""

    entity_description: RensonSensorDescription

    def __init__(
        self, coordinator: RensonCoordinator, entry: ConfigEntry,
        description: RensonSensorDescription
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_name = f"{entry.data.get(CONF_NAME, entry.title)} {description.name}"
        global_info = coordinator.data.get("global", {})
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "Renson",
            "model": nested_value(global_info, "product_name", "value") or "Sense / Waves",
            "sw_version": nested_value(global_info, "firmware_version", "value"),
        }

    @property
    def native_value(self) -> Any:
        data = self.coordinator.data or {}
        desc = self.entity_description
        if desc.source in ("sensor", "actuator"):
            node = typed_node(data.get(desc.source), desc.node_type or "")
        else:
            node = data.get(desc.source, {})
        value = nested_value(node, *desc.path)
        if desc.conversion == "estimated_voc":
            return estimated_voc(value)
        if desc.conversion == "ventilation_level":
            return ventilation_percentage(value, nested_value(data, "decision_room", "nominal"))
        return numeric(value) if desc.numeric_value else value
