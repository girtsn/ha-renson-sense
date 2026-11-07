"""Regression contract for the integration-managed Renson Ventilation panel."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "renson_sense"


class TestRensonPanel(unittest.TestCase):
    def test_integration_owns_panel_and_static_url(self):
        init = (ROOT / "__init__.py").read_text()
        self.assertIn('PANEL_PATH = "renson-ventilation"', init)
        self.assertIn('webcomponent_name="renson-ventilation-loader-panel"', init)
        self.assertIn('frontend.async_remove_panel', init)
        self.assertIn('await _async_register_ventilation_panel(hass)', init)
        self.assertIn('module_url="/renson_sense/panel-loader.js"', init)
        self.assertIn('f"/renson_sense/assets/{PANEL_VERSION}/managed-panel.js"', init)
        self.assertIn('"/renson_sense/manifest.json"', init)
        self.assertIn('f"/renson_sense/assets/{PANEL_VERSION}/renson-ventilation-date-range-picker.js"', init)
        panel = (ROOT / "www" / "renson-ventilation-panel.js").read_text()
        manifest = __import__("json").loads((ROOT / "manifest.json").read_text())
        self.assertIn(f'RV_PANEL_VERSION="{manifest["version"]}"', panel)
        self.assertIn('RV_ELEMENT_NAME="renson-managed-ventilation-v"', panel)
        loader = (ROOT / "www" / "renson-ventilation-loader.js").read_text()
        self.assertIn('customElements.define("renson-ventilation-loader-panel"', loader)
        self.assertIn('cache:"no-store"', loader)
        self.assertIn('await import(url)', loader)
        self.assertIn('Path(__file__).parent / "manifest.json"', init)
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

    def test_one_date_selector_and_eight_statistic_charts(self):
        panel = (ROOT / "www" / "renson-ventilation-panel.js").read_text()
        picker = (ROOT / "www" / "renson-ventilation-date-range-picker.js").read_text()
        for key in ['"last7"', '"last30"', '"last365"', '"last3years"']:
            self.assertIn(key, picker)
        self.assertIn('date-range-changed', panel)
        self.assertIn('rvPresetRange("last7")', panel)
        self.assertIn('for(const metric of RV_METRICS)charts.append(this._chartSection(metric))', panel)
        self.assertIn('recorder/statistics_during_period', panel)
        self.assertIn('period,types:["mean","min","max"]', panel)
        self.assertIn('rvRecorderPeriod(', panel)
        self.assertNotIn('_charts={', panel)

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
