"""Small, read-mostly API client for Renson Sense and Waves devices."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)
_TIMEOUT = aiohttp.ClientTimeout(total=10)


class RensonAPI:
    """Reuse HA's session and serialize requests to small embedded devices."""

    def __init__(self, session: aiohttp.ClientSession, host: str) -> None:
        self._session = session
        self._host = host
        self._lock = asyncio.Lock()

    async def get(self, path: str, *, required: bool = False) -> dict[str, Any]:
        """GET a JSON object; optional unsupported endpoints return {}."""
        url = f"http://{self._host}{path}"
        try:
            async with self._lock:
                async with self._session.get(url, timeout=_TIMEOUT) as response:
                    if response.status != 200:
                        if required:
                            raise HomeAssistantError(f"{path}: HTTP {response.status}")
                        _LOGGER.debug("Optional Renson endpoint %s: HTTP %s", path, response.status)
                        return {}
                    payload = await response.json(content_type=None)
            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object")
            return payload
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            if required:
                raise HomeAssistantError(f"Error retrieving {path}: {err}") from err
            _LOGGER.debug("Optional Renson endpoint %s unavailable: %s", path, err)
            return {}

    async def put(self, path: str, payload: dict[str, Any]) -> None:
        """Make a control request, reporting failures rather than hiding them."""
        url = f"http://{self._host}{path}"
        try:
            async with self._lock:
                async with self._session.put(url, json=payload, timeout=_TIMEOUT) as response:
                    if response.status not in (200, 204):
                        raise HomeAssistantError(f"{path}: HTTP {response.status}")
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise HomeAssistantError(f"Error updating {path}: {err}") from err

    async def boost(
        self, room: int, *, enable: bool, level: float, timeout: int
    ) -> None:
        """Set or cancel a room boost, falling back to the default room endpoint.

        The on/off operation changes *boost*, not the continuous base ventilation.
        """
        payload = {
            "enable": enable,
            "level": float(level),
            "timeout": int(timeout),
            "remaining": 0,
        }
        try:
            await self.put(f"/v1/decision/room/{room}/boost", payload)
        except HomeAssistantError as err:
            # Older WAVES firmware uses the unqualified /room/boost endpoint.
            if "HTTP 404" not in str(err):
                raise
            await self.put("/v1/decision/room/boost", payload)

    async def set_silent(self, settings: dict[str, Any], enabled: bool) -> None:
        """Preserve the full weekly schedule while changing silent enablement."""
        if not settings or "enable" not in settings:
            raise HomeAssistantError("Silent-mode configuration is unavailable")
        payload = {**settings, "enable": enabled}
        await self.put("/v1/decision/silent", payload)
