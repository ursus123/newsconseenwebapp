# ==============================================================
# Multi-LLM Router
# ==============================================================
# Routes agent tasks to the correct registered model based on complexity,
# cost budget, and task type.
# ==============================================================

import logging
import os
from enum import Enum
from typing import Optional

from copilot.llm_registry import (
    DEFAULT_MODEL,
    MODEL_HAIKU,
    MODEL_OPUS,
    MODEL_SONNET,
    get_max_tokens as _registry_max_tokens,
    get_model,
)

logger = logging.getLogger(__name__)


class TaskComplexity(str, Enum):
    TRIAGE = "triage"
    EXECUTION = "execution"
    STRATEGY = "strategy"


TASK_COMPLEXITY_MAP = {
    "classify_alert": TaskComplexity.TRIAGE,
    "route_task": TaskComplexity.TRIAGE,
    "tag_record": TaskComplexity.TRIAGE,
    "check_threshold": TaskComplexity.TRIAGE,
    "duplicate_check": TaskComplexity.TRIAGE,
    "risk_triage": TaskComplexity.TRIAGE,
    "operations_monitor": TaskComplexity.EXECUTION,
    "revenue_analysis": TaskComplexity.EXECUTION,
    "retention_check": TaskComplexity.EXECUTION,
    "inventory_check": TaskComplexity.EXECUTION,
    "onboarding": TaskComplexity.EXECUTION,
    "compliance_audit": TaskComplexity.EXECUTION,
    "network_compare": TaskComplexity.EXECUTION,
    "draft_message": TaskComplexity.EXECUTION,
    "market_monitor": TaskComplexity.EXECUTION,
    "market_briefing": TaskComplexity.STRATEGY,
    "scenario_model": TaskComplexity.STRATEGY,
    "strategic_recommendation": TaskComplexity.STRATEGY,
    "opportunity_analysis": TaskComplexity.STRATEGY,
    "competitor_profile": TaskComplexity.STRATEGY,
    "truth_engine_report": TaskComplexity.STRATEGY,
}


def route(task_type: str, force_model: Optional[str] = None) -> str:
    """Return the registered model ID appropriate for the task type."""
    if force_model:
        return force_model

    complexity = TASK_COMPLEXITY_MAP.get(task_type, TaskComplexity.EXECUTION)

    if complexity == TaskComplexity.TRIAGE:
        model = MODEL_HAIKU
    elif complexity == TaskComplexity.STRATEGY:
        model = MODEL_OPUS if os.getenv("OPUS_ENABLED", "false").lower() == "true" else MODEL_SONNET
    else:
        model = MODEL_SONNET

    logger.debug("LLM router: %s -> %s (%s)", task_type, model, complexity)
    return model


def get_max_tokens(model: str) -> int:
    return _registry_max_tokens(model)


def get_client():
    """Lazy provider client shared across all agents.

    The agent loop currently speaks Anthropic's tool-call format. Other
    providers are registered in Idjwi's model registry but need adapters before
    agents can execute against them.
    """
    spec = get_model(DEFAULT_MODEL)
    if spec.provider != "anthropic":
        raise RuntimeError(f"Agent provider is not implemented yet: {spec.provider}")

    api_key = os.getenv(spec.env_key, "")
    if not api_key:
        raise RuntimeError(
            f"{spec.env_key} not set. "
            "Add it to Railway environment variables."
        )

    import anthropic
    return anthropic.Anthropic(api_key=api_key)
