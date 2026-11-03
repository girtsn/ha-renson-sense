"""Control temporary Waves ventilation boosts via a Home Assistant fan entity."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.fan import FanEntity, FanEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback, async_get_current_platform
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import RensonCoordinator
from .const import CONF_NAME, DOMAIN
from .helpers import nested_value, numeric, typed_node


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Expose boost control only when a fan actuator and room settings exist."""
    coordinator: RensonCoordinator = hass.data[DOMAIN][entry.entry_id]
    fan_node = typed_node(coordinator.data.get("actuator"), "ventilation fan")
    room_data = coordinator.data.get("decision_room", {})
    if fan_node is None or not isinstance(room_data.get("boost"), dict):
        return
    raw_room = fan_node.get("room", [0])
    room = raw_room[0] if isinstance(raw_room, list) and raw_room else 0
    async_add_entities([RensonBoost(coordinator, entry, int(room))])
    # An entity service targets a particular fan, avoiding cross-device control.
    platform = async_get_current_platform()
    platform.async_register_entity_service(
        "start_boost",
        {
            vol.Optional("level"): vol.All(vol.Coerce(float), vol.Range(min=1, max=200)),
            vol.Optional("duration"): vol.All(vol.Coerce(int), vol.Range(min=1, max=86400)),
        },
        "async_start_boost",
    )
    # The confirmation string is deliberately required on every invocation,
    # including automations. Neither command runs during setup, polling or
    # an ordinary fan turn-on.
    platform.async_register_entity_service(
        "calibrate",
        {vol.Required("confirmation"): vol.In(["CALIBRATE"])},
        "async_calibrate",
    )
    platform.async_register_entity_service(
        "restart_device",
        {vol.Required("confirmation"): vol.In(["RESTART"])},
        "async_restart_device",
    )


class RensonBoost(CoordinatorEntity[RensonCoordinator], FanEntity):
    """Boost control; 'off' means automatic ventilation, not stopped airflow."""

    _attr_supported_features = FanEntityFeature.SET_SPEED

    def __init__(
        self, coordinator: RensonCoordinator, entry: ConfigEntry, room: int
    ) -> None:
        super().__init__(coordinator)
        self._room = room
        self._attr_unique_id = f"{entry.entry_id}_ventilation_boost"
        self._attr_name = f"{entry.data.get(CONF_NAME, entry.title)} Ventilation boost"
        self._attr_device_info = {"identifiers": {(DOMAIN, entry.entry_id)}}

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        boost = nested_value(self.coordinator.data, "decision_room", "boost") or {}
        return {
            "room": self._room,
            "remaining_seconds": boost.get("remaining"),
            "default_level": boost.get("default_level"),
            "default_timeout_seconds": boost.get("default_timeout"),
        }

    @property
    def is_on(self) -> bool | None:
        enabled = nested_value(self.coordinator.data, "decision_room", "boost", "enable")
        return bool(enabled) if enabled is not None else None

    @property
    def percentage(self) -> int | None:
        if not self.is_on:
            return 0 if self.is_on is False else None
        level = numeric(nested_value(self.coordinator.data, "decision_room", "boost", "level"))
        return min(100, max(0, round(level))) if level is not None else None

    async def async_start_boost(
        self, level: float | None = None, duration: int | None = None
    ) -> None:
        """Start a boost without changing the minimum ventilation settings."""
        cfg = self.coordinator.data.get("decision_room", {}).get("boost", {})
        target = float(level if level is not None else cfg.get("default_level", 100))
        seconds = int(duration if duration is not None else cfg.get("default_timeout", 1800))
        await self.coordinator.api.boost(
            self._room, enable=True, level=target, timeout=seconds
        )
        await self.coordinator.async_request_refresh()

    async def async_turn_on(
        self, percentage: int | None = None,
        preset_mode: str | None = None, **kwargs: Any
    ) -> None:
        if percentage == 0:
            await self.async_turn_off()
        else:
            await self.async_start_boost(level=percentage)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Cancel boost; the fan returns to its automatic base ventilation."""
        await self.coordinator.api.boost(
            self._room, enable=False, level=0, timeout=0
        )
        await self.coordinator.async_request_refresh()

    async def async_calibrate(self, confirmation: str) -> None:
        """Request calibration of this device's exhaust pressure curve.

        The returned HTTP response is not a verified calibration outcome.
        Renson's app or the device LED should be used to confirm completion.
        """
        if confirmation != "CALIBRATE":
            raise ValueError("Explicit CALIBRATE confirmation is required")
        await self.coordinator.api.post_maintenance_command("calibrate")

    async def async_restart_device(self, confirmation: str) -> None:
        """Restart this specific Waves device (briefly interrupts telemetry)."""
        if confirmation != "RESTART":
            raise ValueError("Explicit RESTART confirmation is required")
        await self.coordinator.api.post_maintenance_command("restart")

    async def async_set_percentage(self, percentage: int) -> None:
        if percentage <= 0:
            await self.async_turn_off()
        else:
            await self.async_start_boost(level=max(1, min(100, percentage)))
