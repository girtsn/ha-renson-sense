"""Unit tests for the form-encoded Waves maintenance commands.

Only HTTP request construction and failure reporting are tested here. No
physical calibration is performed or simulated as successfully completed.
"""

import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class FakeClientError(Exception):
    pass


fake_aiohttp = types.ModuleType("aiohttp")
fake_aiohttp.ClientError = FakeClientError
fake_aiohttp.ClientTimeout = lambda **kw: kw
ha_module = types.ModuleType("homeassistant")
ha_exceptions = types.ModuleType("homeassistant.exceptions")


class HomeAssistantError(Exception):
    pass


ha_exceptions.HomeAssistantError = HomeAssistantError
spec = importlib.util.spec_from_file_location(
    "renson_maintenance_api",
    Path(__file__).resolve().parents[1]
    / "custom_components" / "renson_sense" / "api.py",
)
with patch.dict(sys.modules, {
    "aiohttp": fake_aiohttp,
    "homeassistant": ha_module,
    "homeassistant.exceptions": ha_exceptions,
}):
    api_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api_module)


class FakeResponse:
    def __init__(self, status):
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None


class FakeSession:
    def __init__(self, status=200):
        self.status = status
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.status)


class TestMaintenance(unittest.IsolatedAsyncioTestCase):
    async def test_calibration_form(self):
        session = FakeSession()
        await api_module.RensonAPI(session, "waves.local").post_maintenance_command("calibrate")
        self.assertEqual(session.calls[0][0], "http://waves.local/v1/index")
        self.assertEqual(session.calls[0][1]["data"], {"calibrate": "true"})
        self.assertEqual(session.calls[0][1]["headers"]["Accept"], "text/html")

    async def test_restart_form(self):
        session = FakeSession()
        await api_module.RensonAPI(session, "waves.local").post_maintenance_command("restart")
        self.assertEqual(session.calls[0][1]["data"], {"restart": "true"})

    async def test_unsupported_command_does_not_send(self):
        session = FakeSession()
        with self.assertRaises(ValueError):
            await api_module.RensonAPI(session, "waves.local").post_maintenance_command("nominal")
        self.assertEqual(session.calls, [])

    async def test_http_failure_is_reported(self):
        session = FakeSession(status=404)
        with self.assertRaises(HomeAssistantError):
            await api_module.RensonAPI(session, "waves.local").post_maintenance_command("calibrate")
        self.assertEqual(len(session.calls), 1)


if __name__ == "__main__":
    unittest.main()
