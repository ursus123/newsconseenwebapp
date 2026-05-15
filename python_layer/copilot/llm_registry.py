"""
Central model and capability registry for Idjwi.

Idjwi owns the tools, memory, approvals, and product behavior. LLM providers are
swappable reasoning engines behind that stable capability layer.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelSpec:
    id: str
    provider: str
    label: str
    tag: str
    description: str
    max_tokens: int
    task_tier: str
    env_key: str

    @property
    def available(self) -> bool:
        return bool(os.getenv(self.env_key, ""))

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "provider": self.provider,
            "label": self.label,
            "tag": self.tag,
            "description": self.description,
            "max_tokens": self.max_tokens,
            "task_tier": self.task_tier,
            "available": self.available,
        }


MODEL_HAIKU = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-6"
MODEL_OPUS = "claude-opus-4-7"
DEFAULT_MODEL = MODEL_SONNET

MODEL_REGISTRY: dict[str, ModelSpec] = {
    MODEL_HAIKU: ModelSpec(
        id=MODEL_HAIKU,
        provider="anthropic",
        label="Claude Haiku 4.5",
        tag="Fast",
        description="Quick answers, triage, tagging, and light querying.",
        max_tokens=2048,
        task_tier="triage",
        env_key="ANTHROPIC_API_KEY",
    ),
    MODEL_SONNET: ModelSpec(
        id=MODEL_SONNET,
        provider="anthropic",
        label="Claude Sonnet 4.6",
        tag="Balanced",
        description="Default reasoning, tool use, and operational analysis.",
        max_tokens=8192,
        task_tier="execution",
        env_key="ANTHROPIC_API_KEY",
    ),
    MODEL_OPUS: ModelSpec(
        id=MODEL_OPUS,
        provider="anthropic",
        label="Claude Opus 4.7",
        tag="Deep",
        description="Strategic analysis, scenario modeling, and complex briefings.",
        max_tokens=16000,
        task_tier="strategy",
        env_key="ANTHROPIC_API_KEY",
    ),
    "gpt-4.1": ModelSpec(
        id="gpt-4.1",
        provider="openai",
        label="ChatGPT GPT-4.1",
        tag="OpenAI",
        description="Registered provider slot for OpenAI-backed reasoning.",
        max_tokens=8192,
        task_tier="execution",
        env_key="OPENAI_API_KEY",
    ),
    "gemini-2.5-pro": ModelSpec(
        id="gemini-2.5-pro",
        provider="google",
        label="Gemini 2.5 Pro",
        tag="Gemini",
        description="Registered provider slot for Google-backed reasoning.",
        max_tokens=8192,
        task_tier="strategy",
        env_key="GOOGLE_API_KEY",
    ),
}

IDJWI_CAPABILITIES = [
    {
        "id": "read_company_data",
        "name": "Read Company Data",
        "description": "Query live operational, financial, people, product, and task data.",
        "requires_llm": False,
    },
    {
        "id": "create_task",
        "name": "Create Tasks",
        "description": "Create follow-up, review, and escalation tasks through governed tools.",
        "requires_llm": False,
    },
    {
        "id": "propose_record_update",
        "name": "Propose Record Updates",
        "description": "Suggest record corrections and route sensitive changes for approval.",
        "requires_llm": True,
    },
    {
        "id": "save_memory",
        "name": "Save Memory",
        "description": "Remember operator preferences and durable company context.",
        "requires_llm": False,
    },
    {
        "id": "search_intelligence",
        "name": "Search Intelligence",
        "description": "Retrieve saved insights, risks, opportunities, and recommendations.",
        "requires_llm": False,
    },
    {
        "id": "run_agents",
        "name": "Run Agents",
        "description": "Trigger operational agents and monitor their approval-gated actions.",
        "requires_llm": False,
    },
    {
        "id": "generate_report",
        "name": "Generate Reports",
        "description": "Produce grounded reports from Idjwi tools and company data.",
        "requires_llm": True,
    },
    {
        "id": "approve_actions",
        "name": "Approve Actions",
        "description": "Approve or reject proposed actions before execution.",
        "requires_llm": False,
    },
]


def list_models() -> list[dict]:
    return [spec.public_dict() for spec in MODEL_REGISTRY.values()]


def get_model(model_id: Optional[str]) -> ModelSpec:
    return MODEL_REGISTRY.get(model_id or "", MODEL_REGISTRY[DEFAULT_MODEL])


def resolve_model(model_id: Optional[str]) -> ModelSpec:
    spec = get_model(model_id)
    if spec.available:
        return spec

    default = MODEL_REGISTRY[DEFAULT_MODEL]
    if default.available:
        return default

    return spec


def get_max_tokens(model_id: str) -> int:
    return get_model(model_id).max_tokens


def provider_status() -> dict:
    providers = {}
    for spec in MODEL_REGISTRY.values():
        providers.setdefault(spec.provider, False)
        providers[spec.provider] = providers[spec.provider] or spec.available
    return providers

