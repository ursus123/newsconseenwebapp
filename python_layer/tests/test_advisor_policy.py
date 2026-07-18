"""Contract tests for tenant-controlled Idjwi advisor routing."""

import unittest
from unittest.mock import patch

from copilot.advisor_policy import select_advisor


class TestAdvisorPolicy(unittest.TestCase):
    def test_core_mode_never_selects_provider(self):
        with patch("copilot.advisor_policy.get_policy", return_value={
            "default_mode": "automatic", "default_profile": "balanced", "allow_external": True,
        }):
            selected = select_advisor("tenant-1", mode="core")
        self.assertEqual(selected.mode, "core")
        self.assertIsNone(selected.model_id)
        self.assertIsNone(selected.provider)

    def test_requested_advisor_must_be_permitted(self):
        connections = [{
            "model_id": "gpt-4.1", "provider": "openai", "enabled": True,
            "objectives": ["coding"], "data_classes": ["internal"], "priority": 1,
        }]
        with patch("copilot.advisor_policy.get_policy", return_value={
            "default_mode": "automatic", "default_profile": "coding", "allow_external": True,
        }), patch("copilot.advisor_policy.list_connections", return_value=connections):
            selected = select_advisor(
                "tenant-1", objective="coding", profile="coding",
                requested_model="gpt-4.1", data_classification="internal",
            )
        self.assertEqual(selected.model_id, "gpt-4.1")
        self.assertEqual(selected.provider, "openai")

    def test_data_policy_falls_back_to_core(self):
        connections = [{
            "model_id": "gpt-4.1", "provider": "openai", "enabled": True,
            "objectives": ["*"], "data_classes": ["public"], "priority": 1,
        }]
        with patch("copilot.advisor_policy.get_policy", return_value={
            "default_mode": "automatic", "default_profile": "balanced", "allow_external": True,
        }), patch("copilot.advisor_policy.list_connections", return_value=connections):
            selected = select_advisor("tenant-1", data_classification="restricted")
        self.assertEqual(selected.mode, "core")
        self.assertIn("fallback", selected.source)

    def test_external_advisors_can_be_disabled_tenant_wide(self):
        with patch("copilot.advisor_policy.get_policy", return_value={
            "default_mode": "automatic", "default_profile": "balanced", "allow_external": False,
        }):
            selected = select_advisor("tenant-1")
        self.assertEqual(selected.mode, "core")


if __name__ == "__main__":
    unittest.main()
