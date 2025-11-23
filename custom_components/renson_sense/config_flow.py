from __future__ import annotations

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_HOST, CONF_NAME


async def _test_connection(hass: HomeAssistant, host: str) -> bool:
    """Try a simple GET to verify the device."""
    session = async_get_clientsession(hass)
    url = f"http://{host}/v1/constellation/sensor"
    try:
        async with session.get(url, timeout=10) as resp:
            return resp.status == 200
    except aiohttp.ClientError:
        return False


class RensonSenseConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Renson Sense."""

    VERSION = 1
    DOMAIN = DOMAIN

    async def async_step_user(self, user_input=None) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].strip()
            name = user_input[CONF_NAME].strip()

            if not await _test_connection(self.hass, host):
                errors["base"] = "cannot_connect"
            else:
                # Allow multiple devices; we don't set a unique_id to permit duplicates
                return self.async_create_entry(
                    title=name,
                    data={
                        CONF_HOST: host,
                        CONF_NAME: name,
                    },
                )

        data_schema = vol.Schema(
            {
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_NAME, default="Renson Sense"): str,
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors,
        )