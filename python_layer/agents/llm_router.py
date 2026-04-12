# ==============================================================
# Phase 4G — Multi-LLM Router
# ==============================================================
# Routes agent tasks to the correct model based on complexity,
# cost budget, and task type.
#
# Model routing strategy:
#   Haiku 4.5   — triage, classification, tagging, routing
#                 High volume, low cost. Runs 1000x/day.
#   Sonnet 4.6  — agent execution, tool loops, analysis
#                 Default for all agent work.
#   Opus 4.6    — strategic reasoning, scenario modelling,
#                 complex market intelligence briefings.
#                 Used sparingly — highest quality, highest cost.
# ==============================================================

import logging
import os
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class TaskComplexity(str, Enum):
    TRIAGE    = "triage"    # classify, route, tag → Haiku
    EXECUTION = "execution" # standard agent work → Sonnet
    STRATEGY  = "strategy"  # deep analysis, scenario modelling → Opus


# Model IDs
MODEL_HAIKU  = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-6"
MODEL_OPUS   = "claude-opus-4-6"

# Max tokens per model tier
MAX_TOKENS = {
    MODEL_HAIKU:  2048,
    MODEL_SONNET: 8192,
    MODEL_OPUS:   16000,
}

# Task type → complexity mapping
TASK_COMPLEXITY_MAP = {
    # Triage tasks (Haiku)
    "classify_alert":         TaskComplexity.TRIAGE,
    "route_task":             TaskComplexity.TRIAGE,
    "tag_record":             TaskComplexity.TRIAGE,
    "check_threshold":        TaskComplexity.TRIAGE,
    "duplicate_check":        TaskComplexity.TRIAGE,
    "risk_triage":            TaskComplexity.TRIAGE,

    # Execution tasks (Sonnet)
    "operations_monitor":     TaskComplexity.EXECUTION,
    "revenue_analysis":       TaskComplexity.EXECUTION,
    "retention_check":        TaskComplexity.EXECUTION,
    "inventory_check":        TaskComplexity.EXECUTION,
    "onboarding":             TaskComplexity.EXECUTION,
    "compliance_audit":       TaskComplexity.EXECUTION,
    "network_compare":        TaskComplexity.EXECUTION,
    "draft_message":          TaskComplexity.EXECUTION,
    "market_monitor":         TaskComplexity.EXECUTION,

    # Strategy tasks (Opus)
    "market_briefing":        TaskComplexity.STRATEGY,
    "scenario_model":         TaskComplexity.STRATEGY,
    "strategic_recommendation": TaskComplexity.STRATEGY,
    "opportunity_analysis":   TaskComplexity.STRATEGY,
    "competitor_profile":     TaskComplexity.STRATEGY,
    "truth_engine_report":    TaskComplexity.STRATEGY,
}


def route(task_type: str, force_model: Optional[str] = None) -> str:
    """
    Return the model ID appropriate for the given task type.
    Respects force_model override for testing / cost control.
    """
    if force_model:
        return force_model

    complexity = TASK_COMPLEXITY_MAP.get(task_type, TaskComplexity.EXECUTION)

    if complexity == TaskComplexity.TRIAGE:
        model = MODEL_HAIKU
    elif complexity == TaskComplexity.STRATEGY:
        # Only use Opus if OPUS_ENABLED=true — default to Sonnet for cost control
        model = MODEL_OPUS if os.getenv("OPUS_ENABLED", "false").lower() == "true" else MODEL_SONNET
    else:
        model = MODEL_SONNET

    logger.debug("LLM router: %s → %s (%s)", task_type, model, complexity)
    return model


def get_max_tokens(model: str) -> int:
    return MAX_TOKENS.get(model, 8192)


def get_client():
    """Lazy Anthropic client — shared across all agents."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. "
            "Add it to Railway environment variables."
        )
    import anthropic
    return anthropic.Anthropic(api_key=api_key)
