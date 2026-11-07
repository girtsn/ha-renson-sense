"""Silent-mode control for Renson Waves devices."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import RensonCoordinator
from .const import CONF_NAME, DOMAIN
from .device import renson_device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Create control only if firmware implements silent-mode settings."""
    coordinator: RensonCoordinator = hass.data[DOMAIN][entry.entry_id]
    if "enable" in coordinator.data.get("decision_silent", {}):
        async_add_entities([RensonSilentSwitch(coordinator, entry)])


class RensonSilentSwitch(CoordinatorEntity[RensonCoordinator], SwitchEntity):
    """Enable/disable silent mode while retaining its weekly schedule."""

    def __init__(self, coordinator: RensonCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_silent_mode_switch"
        self._attr_name = f"{entry.data.get(CONF_NAME, entry.title)} Silent mode"
        self._attr_device_info = renson_device_info(entry)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        config = self.coordinator.data.get("decision_silent", {})
        return {key: value for key, value in config.items() if key != "enable"}

    @property
    def is_on(self) -> bool | None:
        enabled = self.coordinator.data.get("decision_silent", {}).get("enable")
        return bool(enabled) if enabled is not None else None

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._set_enabled(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._set_enabled(False)

    async def _set_enabled(self, enabled: bool) -> None:
        await self.coordinator.api.set_silent(
            self.coordinator.data.get("decision_silent", {}), enabled
        )
        await self.coordinator.async_request_refresh()
