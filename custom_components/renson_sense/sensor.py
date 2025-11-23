from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List

from homeassistant.components.sensor import (
    SensorEntity,
    SensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
    DataUpdateCoordinator,
)

from .const import DOMAIN, CONF_NAME


@dataclass(kw_only=True)
class RensonSensorDescription(SensorEntityDescription):
    """Description of a Renson Sense sensor."""
    sensor_type: str
    param_path: List[str]


# Core + optional sensor definitions
SENSORS: list[RensonSensorDescription] = [
     # Core types (your device)
    RensonSensorDescription(
        key="temperature",
        name="Temperature",
        native_unit_of_measurement="°C",
        sensor_type="temp",
        param_path=["parameter", "temperature", "value"],
    ),
    RensonSensorDescription(
        key="humidity",
        name="Humidity",
        native_unit_of_measurement="%",
        sensor_type="rh",
        param_path=["parameter", "humidity", "value"],
    ),
    RensonSensorDescription(
        key="absolute_humidity",
        name="Absolute humidity",
        native_unit_of_measurement="g/kg",
        sensor_type="ah",
        param_path=["parameter", "humidity", "value"],
    ),
    RensonSensorDescription(
        key="voc",
        name="VOC",
        native_unit_of_measurement="ppm",
        sensor_type="avoc",
        param_path=["parameter", "raw", "value"],
    ),
    RensonSensorDescription(
        key="pressure",
        name="Pressure",
        native_unit_of_measurement="Pa",
        sensor_type="press",
        param_path=["parameter", "pressure", "value"],
    ),
    RensonSensorDescription(
        key="heap",
        name="Heap average",
        sensor_type="heap_info",
        param_path=["parameter", "average_current_heap", "value"],
    ),
    RensonSensorDescription(
        key="rssi",
        name="Wi-Fi RSSI",
        native_unit_of_measurement="dBm",
        sensor_type="rssi",
        param_path=["parameter", "rssi", "value"],
    ),

    # Optional sensors — created only if returned by device
    RensonSensorDescription(
        key="co2",
        name="CO2 concentration",
        native_unit_of_measurement="ppm",
        sensor_type="co2",
        param_path=["parameter", "concentration", "value"],
    ),
    RensonSensorDescription(
        key="lux",
        name="Light level",
        native_unit_of_measurement="lx",
        sensor_type="lux",
        param_path=["parameter", "lux", "value"],
    ),
    RensonSensorDescription(
        key="sound",
        name="Sound level",
        sensor_type="sound",
        param_path=["parameter", "average_level", "value"],
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Renson Sense sensor entities from a config entry."""

    coordinator: DataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    device_name: str = entry.data.get(CONF_NAME, "Renson Sense")

    data = coordinator.data or {}
    available_types = {node.get("type") for node in data.values()}

    entities: list[RensonSenseEntity] = [
        RensonSenseEntity(
            coordinator=coordinator,
            description=desc,
            device_name=device_name,
            entry_id=entry.entry_id,
        )
        for desc in SENSORS
        if desc.sensor_type in available_types
    ]

    async_add_entities(entities)


class RensonSenseEntity(CoordinatorEntity, SensorEntity):
    """Representation of a single Renson Sense metric."""

    entity_description: RensonSensorDescription

    def __init__(
        self,
        coordinator: DataUpdateCoordinator,
        description: RensonSensorDescription,
        device_name: str,
        entry_id: str,
    ) -> None:
        super().__init__(coordinator)

        self.entity_description = description
        self._attr_unique_id = f"{entry_id}_{description.key}"
        self._attr_name = f"{device_name} {description.name}"

        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry_id)},
            "name": device_name,
            "manufacturer": "Renson",
            "model": "Sense",
        }

    @property
    def native_value(self) -> Any:
        """Extract the sensor value from coordinator data."""
        data = self.coordinator.data or {}
        sensor_type = self.entity_description.sensor_type

        # Find the matching JSON node by type
        node = None
        for item in data.values():
            if item.get("type") == sensor_type:
                node = item
                break

        if not node:
            return None

        try:
            # Follow the param path to extract the value
            for step in self.entity_description.param_path:
                node = node[step]
            return node
        except Exception:
            return None
