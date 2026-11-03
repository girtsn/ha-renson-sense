"""Tests for pure helpers without importing Home Assistant."""

import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "renson_helpers", ROOT / "custom_components" / "renson_sense" / "helpers.py"
)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


class TestHelpers(unittest.TestCase):
    def test_nested_node_lookup(self):
        data = {"0": {"type": "temp", "parameter": {"value": 21}},
                "7": {"type": "avoc", "parameter": {"raw": {"value": 54399}}}}
        self.assertEqual(helper.nested_value(helper.typed_node(data, "avoc"),
                                             "parameter", "raw", "value"), 54399)
        self.assertIsNone(helper.typed_node(data, "missing"))
        self.assertIsNone(helper.nested_value(data, "not_there"))

    def test_ventilation_percentage(self):
        self.assertEqual(helper.ventilation_percentage(4, 38), 10.5)
        self.assertEqual(helper.ventilation_percentage(5, 50), 10.0)
        self.assertIsNone(helper.ventilation_percentage(4, 0))

    def test_estimated_voc(self):
        self.assertEqual(helper.estimated_voc(55000), 118)
        self.assertEqual(helper.estimated_voc(54399), 91)
        self.assertEqual(helper.estimated_voc(57727), 1870)
        self.assertEqual(helper.estimated_voc(60000), 2404)
        self.assertEqual(helper.estimated_voc(None), None)
        self.assertEqual(helper.estimated_voc(-1), 0)

    def test_invalid_numeric_values(self):
        self.assertIsNone(helper.numeric("unknown"))
        self.assertIsNone(helper.numeric(True))
        self.assertEqual(helper.numeric("25.5"), 25.5)


if __name__ == "__main__":
    unittest.main()
