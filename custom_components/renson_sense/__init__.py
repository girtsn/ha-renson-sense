"""Renson Sense / Waves local Home Assistant integration."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import RensonAPI
from .const import DOMAIN, CONF_HOST, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "binary_sensor", "fan", "switch"]


class RensonCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Poll a single device; Waves adds endpoints that original Sense lacks."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"Renson {entry.title}",
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
        self.api = RensonAPI(async_get_clientsession(hass), entry.data[CONF_HOST])

    async def _async_update_data(self) -> dict[str, Any]:
        # Waves returns all environmental readings and actuator data together.
        # Preserve compatibility with older Sense firmware that only implements
        # /v1/constellation/sensor.
        constellation = await self.api.get("/v1/constellation")
        if isinstance(constellation.get("sensor"), dict):
            sensors = constellation["sensor"]
        else:
            try:
                sensors = await self.api.get("/v1/constellation/sensor", required=True)
            except HomeAssistantError as err:
                raise UpdateFailed(str(err)) from err

        if not isinstance(sensors, dict):
            raise UpdateFailed("Unexpected sensor payload")

        result: dict[str, Any] = {
            "sensor": sensors,
            "actuator": constellation.get("actuator", {}),
            "global": constellation.get("global", {}),
        }
        if not result["actuator"]:
            result["actuator"] = await self.api.get("/v1/constellation/actuator")
        if not result["global"]:
            result["global"] = await self.api.get("/v1/constellation/global")

        # Unsupported optional paths are normal on Sense (rather than Waves).
        for key, path in (
            ("decision_room", "/v1/decision/room"),
            ("decision_silent", "/v1/decision/silent"),
            ("decision_breeze", "/v1/decision/breeze"),
            ("uptime", "/v1/global/uptime"),
            ("wifi", "/v1/wifi/client/status"),
        ):
            result[key] = await self.api.get(path)
        return result


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a device and its platforms."""
    coordinator = RensonCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    # Absolute humidity is derived from temperature/RH and was deliberately
    # retired. Remove its old entity registry entry to avoid an orphaned sensor.
    registry = er.async_get(hass)
    obsolete = registry.async_get_entity_id(
        "sensor", DOMAIN, f"{entry.entry_id}_absolute_humidity"
    )
    if obsolete:
        registry.async_remove(obsolete)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return ok
