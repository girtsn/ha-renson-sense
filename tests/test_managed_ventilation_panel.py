"""Regression contract for the integration-managed Renson Ventilation panel."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "renson_sense"


class TestRensonPanel(unittest.TestCase):
    def test_integration_owns_panel_and_static_url(self):
        init = (ROOT / "__init__.py").read_text()
        self.assertIn('PANEL_PATH = "renson-ventilation"', init)
        self.assertIn('webcomponent_name="renson-managed-ventilation-panel"', init)
        self.assertIn('frontend.async_remove_panel', init)
        self.assertIn('await _async_register_ventilation_panel(hass)', init)
        self.assertIn("managed-panel.js?v=", init)
        manifest = (ROOT / "manifest.json").read_text()
        self.assertIn('"frontend"', manifest)
        self.assertIn('"http"', manifest)

    def test_multiple_devices_use_registry_not_hardcoded_ids(self):
        panel = (ROOT / "www" / "renson-ventilation-panel.js").read_text()
        self.assertIn('config/device_registry/list', panel)
        self.assertIn('config/entity_registry/list', panel)
        self.assertIn('entity.platform==="renson_sense"', panel)
        self.assertNotIn("192.168.2.60", panel)
        self.assertNotIn("192.168.2.61", panel)

    def test_both_horizons_and_recorder(self):
        panel = (ROOT / "www" / "renson-ventilation-panel.js").read_text()
        for key in ['"24h"','"7d"','"30d"','"90d"','"1y"','"3y"']:
            self.assertIn(key, panel)
        self.assertIn('recorder/statistics_during_period', panel)
        self.assertIn('period:period.interval', panel)

    def test_maintenance_requires_typed_confirmation(self):
        panel = (ROOT / "www" / "renson-ventilation-panel.js").read_text()
        self.assertIn("window.prompt", panel)
        self.assertIn('"CALIBRATE"', panel)
        self.assertIn('"RESTART"', panel)
        self.assertIn('"renson_sense",{confirmation:word}', panel)
        self.assertIn('"calibrate"', panel)
        self.assertIn('"restart_device"', panel)


if __name__ == "__main__":
    unittest.main()
