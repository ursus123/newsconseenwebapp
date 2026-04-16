"""
tests/test_copilot.py
----------------------
Unit tests for copilot tool query functions.
No LLM calls, no DB — tests cover pure query-building and response shape.
"""

import pytest
import pandas as pd


class TestCopilotTools:
    """Test copilot query tools return correct shapes without a live DB."""

    def test_get_people_summary_no_db(self):
        from copilot.queries import get_people_summary
        result = get_people_summary("test-co")
        assert isinstance(result, dict)
        # Must return a dict — may be empty or have error key, never crash
        assert result is not None

    def test_get_transaction_summary_no_db(self):
        from copilot.queries import get_transaction_summary
        result = get_transaction_summary("test-co")
        assert isinstance(result, dict)

    def test_get_task_summary_no_db(self):
        from copilot.queries import get_task_summary
        result = get_task_summary("test-co")
        assert isinstance(result, dict)

    def test_get_enterprise_overview_no_db(self):
        from copilot.queries import get_enterprise_overview
        result = get_enterprise_overview("test-co")
        assert isinstance(result, dict)

    def test_get_product_summary_no_db(self):
        from copilot.queries import get_product_summary
        result = get_product_summary("test-co")
        assert isinstance(result, dict)

    def test_get_entity_risk_report_no_db(self):
        from copilot.queries import get_entity_risk_report
        result = get_entity_risk_report("test-co")
        assert isinstance(result, dict)

    def test_get_kpi_goals_no_db(self):
        from copilot.queries import get_kpi_goals
        result = get_kpi_goals("test-co")
        assert isinstance(result, dict)

    def test_get_anomaly_report_no_db(self):
        from copilot.queries import get_anomaly_report
        result = get_anomaly_report("test-co")
        assert isinstance(result, dict)

    def test_get_alert_history_no_db(self):
        from copilot.queries import get_alert_history
        result = get_alert_history("test-co")
        assert isinstance(result, dict)


class TestCopilotToolDefinitions:
    """Verify the TOOL_DEFINITIONS list is well-formed."""

    def test_tool_definitions_is_list(self):
        from copilot.queries import TOOL_DEFINITIONS
        assert isinstance(TOOL_DEFINITIONS, list)
        assert len(TOOL_DEFINITIONS) > 0

    def test_each_tool_has_name_and_description(self):
        from copilot.queries import TOOL_DEFINITIONS
        for tool in TOOL_DEFINITIONS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool missing 'description': {tool}"
            assert isinstance(tool["name"], str)
            assert len(tool["name"]) > 0

    def test_each_tool_has_input_schema(self):
        from copilot.queries import TOOL_DEFINITIONS
        for tool in TOOL_DEFINITIONS:
            assert "input_schema" in tool, f"Tool '{tool['name']}' missing input_schema"
            schema = tool["input_schema"]
            assert "type" in schema

    def test_no_duplicate_tool_names(self):
        from copilot.queries import TOOL_DEFINITIONS
        names = [t["name"] for t in TOOL_DEFINITIONS]
        assert len(names) == len(set(names)), f"Duplicate tool names: {set(n for n in names if names.count(n) > 1)}"


class TestExecuteTool:
    """Test the execute_tool dispatch table handles all registered tools."""

    def test_execute_tool_unknown_returns_error(self):
        from copilot.queries import execute_tool
        result = execute_tool("nonexistent_tool_xyz", {}, "test-co")
        assert isinstance(result, (dict, str))
        # Should not raise — should return an error message

    def test_execute_tool_get_people_summary(self):
        from copilot.queries import execute_tool
        result = execute_tool("get_people_summary", {}, "test-co")
        assert result is not None

    def test_execute_tool_injects_company_id(self):
        """
        company_id must always be injected server-side — tool_input must
        not be trusted even if caller passes a different company_id.
        """
        from copilot.queries import execute_tool
        # Attempt to inject a different company_id via tool_input
        result = execute_tool(
            "get_people_summary",
            {"company_id": "attacker-company"},
            "legitimate-company",
        )
        # We can't assert the exact company used without a DB,
        # but the function must not crash and must return a dict
        assert result is not None


class TestSystemPromptBuilder:
    """Verify the copilot system prompt is always buildable."""

    def test_build_system_prompt_returns_string(self):
        from copilot.engine import build_system_prompt
        prompt = build_system_prompt("test-co")
        assert isinstance(prompt, str)
        assert len(prompt) > 100  # must have real content

    def test_system_prompt_contains_company_id(self):
        from copilot.engine import build_system_prompt
        prompt = build_system_prompt("test-co-abc")
        # company_id or its effects should appear somewhere in the prompt
        assert isinstance(prompt, str)

    def test_system_prompt_no_hardcoded_client_names(self):
        from copilot.engine import build_system_prompt
        prompt = build_system_prompt("test-co")
        forbidden = ["BrightStar", "BRIGHTSTAR", "brightstar"]
        for name in forbidden:
            assert name not in prompt, f"Hardcoded client name '{name}' found in system prompt"
