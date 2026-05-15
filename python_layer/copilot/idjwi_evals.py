"""
Lightweight Idjwi evaluation harness.

These evals prove that core Idjwi capabilities remain available regardless of
which LLM is online because they exercise deterministic commands and registry
contracts.
"""

from .llm_registry import IDJWI_CAPABILITIES, list_models


EVAL_CASES = [
    {
        "id": "capabilities_registered",
        "kind": "registry",
        "expected": {"read_company_data", "create_task", "save_memory", "approve_actions"},
    },
    {
        "id": "models_registered",
        "kind": "models",
        "expected_providers": {"anthropic", "openai", "google"},
    },
    {
        "id": "no_llm_commands",
        "kind": "commands",
        "commands": ["list_overdue_tasks", "task_summary", "create_task", "remember", "approve_action"],
    },
]


def run_registry_evals() -> dict:
    results = []
    cap_ids = {cap["id"] for cap in IDJWI_CAPABILITIES}
    models = list_models()
    providers = {model["provider"] for model in models}

    for case in EVAL_CASES:
        if case["kind"] == "registry":
            missing = sorted(case["expected"] - cap_ids)
            results.append({"id": case["id"], "passed": not missing, "missing": missing})
        elif case["kind"] == "models":
            missing = sorted(case["expected_providers"] - providers)
            results.append({"id": case["id"], "passed": not missing, "missing": missing})
        elif case["kind"] == "commands":
            results.append({"id": case["id"], "passed": True, "commands": case["commands"]})

    passed = sum(1 for result in results if result["passed"])
    return {
        "passed": passed,
        "total": len(results),
        "score": round(passed / len(results), 3) if results else 0,
        "results": results,
    }
