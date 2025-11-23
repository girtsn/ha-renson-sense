from __future__ import annotations

import asyncio
from datetime import timedelta
import logging

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, CONF_HOST, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)

# ✔ Required for HA tooling & VS Code, even if we don’t use forward_entry_setups
PLATFORMS: list[str] = ["sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Renson Sense from a config entry."""

    host = entry.data[CONF_HOST]
    session = async_get_clientsession(hass)

  async def async_update_data():
    """Fetch data from the Renson Sense."""
    url = f"http://{host}/v1/constellation/sensor"
    try:
        async with session.get(url, timeout=10) as resp:
            if resp.status != 200:
                raise UpdateFailed(f"HTTP {resp.status}")
            return await resp.json()
    except Exception as err:
        raise UpdateFailed(f"Error fetching {url}: {err}")

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name=f"Renson Sense {host}",
        update_method=async_update_data,
        update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
    )

    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    # Safe static import
    from . import sensor

    # Start platform setup asynchronously without blocking the event loop
    hass.async_create_task(
        sensor.async_setup_entry(
            hass,
            entry,
            hass.helpers.entity_platform.async_add_entities,
        )
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Renson Sense config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True
