"""Device info shared by all Renson entity platforms."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceInfo

from .const import CONF_HOST, DOMAIN


def renson_device_info(
    entry: ConfigEntry,
    *,
    model: str | None = None,
    sw_version: str | None = None,
) -> DeviceInfo:
    """Expose the configured host through Home Assistant's device Visit link."""
    info = DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=entry.title,
        manufacturer="Renson",
        configuration_url=f"http://{entry.data[CONF_HOST].strip()}/",
    )
    if model:
        info["model"] = model
    if sw_version:
        info["sw_version"] = sw_version
    return info
