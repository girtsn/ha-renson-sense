"""Test configured host metadata without loading Home Assistant."""

import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "renson_sense"

# Test the metadata helper against a small stand-in for HA's DeviceInfo.
ha = types.ModuleType("homeassistant")
ha.__path__ = []
config_entries = types.ModuleType("homeassistant.config_entries")
config_entries.ConfigEntry = type("ConfigEntry", (), {})
helpers = types.ModuleType("homeassistant.helpers")
helpers.__path__ = []
registry = types.ModuleType("homeassistant.helpers.device_registry")
registry.DeviceInfo = dict
component = types.ModuleType("renson_sense")
component.__path__ = [str(ROOT)]
const = types.ModuleType("renson_sense.const")
const.CONF_HOST = "host"
const.DOMAIN = "renson_sense"

modules = {
    "homeassistant": ha,
    "homeassistant.config_entries": config_entries,
    "homeassistant.helpers": helpers,
    "homeassistant.helpers.device_registry": registry,
    "renson_sense": component,
    "renson_sense.const": const,
}

spec = importlib.util.spec_from_file_location("renson_sense.device", ROOT / "device.py")
with patch.dict(sys.modules, modules):
    device = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(device)


class TestDeviceInfo(unittest.TestCase):
    def test_configured_ip_in_device_information(self):
        entry = types.SimpleNamespace(
            entry_id="entry_a",
            title="Bathroom",
            data={"host": "192.168.2.60"},
        )
        info = device.renson_device_info(entry, model="WAVES", sw_version="2.9.3")
        self.assertEqual(info["configuration_url"], "http://192.168.2.60/")
        self.assertEqual(info["identifiers"], {("renson_sense", "entry_a")})
        self.assertEqual(info["model"], "WAVES")
        self.assertEqual(info["sw_version"], "2.9.3")

    def test_independent_host_for_second_entry(self):
        entry = types.SimpleNamespace(
            entry_id="entry_b",
            title="Other bathroom",
            data={"host": "192.168.2.61"},
        )
        info = device.renson_device_info(entry)
        self.assertEqual(info["configuration_url"], "http://192.168.2.61/")


if __name__ == "__main__":
    unittest.main()
